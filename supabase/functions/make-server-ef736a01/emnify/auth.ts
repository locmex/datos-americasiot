// emnify application-token authentication with a shared token cache.
//
// emnify rate-limits POST /authenticate. Each edge-function isolate used to
// authenticate on its own, concurrent calls in a cold isolate authenticated in
// parallel, and a 429 was retried right away, which kept the account locked
// out. This module:
//   - shares one in-flight /authenticate call between concurrent callers,
//   - stores the JWT in the shared store (KV) so cold isolates reuse it,
//   - on 429 records a shared cooldown and fails fast until it ends.

const TOKEN_KEY = "emnify:auth_token";
const COOLDOWN_KEY = "emnify:auth_cooldown";
const TOKEN_TTL_MS = 50 * 60 * 1000;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_MS = 10 * 60 * 1000;

export interface EmnifyAuthStore {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
}

export interface EmnifyAuthOptions {
  baseUrl: string;
  getAppToken: () => string | undefined | null;
  fetchFn?: typeof fetch;
  store: EmnifyAuthStore;
  now?: () => number;
}

export class EmnifyAuthError extends Error {
  readonly emnifyAuthError = true;
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmnifyAuthError";
  }
}

export function isEmnifyAuthError(e: unknown): e is EmnifyAuthError {
  return !!e && typeof e === "object" && (e as any).emnifyAuthError === true;
}

function rateLimitedError(): EmnifyAuthError {
  return new EmnifyAuthError(
    "emnify limitó los inicios de sesión (429). Intenta de nuevo en un minuto.",
    429,
  );
}

function cooldownFromRetryAfter(header: string | null): number {
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
  }
  return DEFAULT_COOLDOWN_MS;
}

export function createEmnifyAuth(opts: EmnifyAuthOptions) {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  let memToken: { token: string; expiresAt: number } | null = null;
  let memCooldownUntil = 0;
  let inFlight: Promise<string> | null = null;

  const isFresh = (t: any): t is { token: string; expiresAt: number } =>
    !!t && typeof t.token === "string" && typeof t.expiresAt === "number" &&
    t.expiresAt > now() + TOKEN_SAFETY_MARGIN_MS;

  const safeGet = async (key: string) => {
    try { return await opts.store.get(key); } catch { return null; }
  };
  const safeSet = async (key: string, value: any) => {
    try { await opts.store.set(key, value); } catch { /* the in-memory cache still works */ }
  };

  async function authenticate(): Promise<string> {
    const shared = await safeGet(TOKEN_KEY);
    if (isFresh(shared)) {
      memToken = shared;
      return shared.token;
    }

    const cooldown = await safeGet(COOLDOWN_KEY);
    const sharedUntil = typeof cooldown?.until === "number" ? cooldown.until : 0;
    memCooldownUntil = Math.max(memCooldownUntil, sharedUntil);
    if (memCooldownUntil > now()) throw rateLimitedError();

    const appToken = (opts.getAppToken() || "").trim();
    if (!appToken) {
      throw new EmnifyAuthError("EMNIFY_API_TOKEN no configurado en los secrets de Supabase", 0);
    }

    const res = await fetchFn(`${opts.baseUrl}/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_token: appToken }),
    });

    if (res.status === 429) {
      memCooldownUntil = now() + cooldownFromRetryAfter(res.headers.get("Retry-After"));
      await safeSet(COOLDOWN_KEY, { until: memCooldownUntil });
      console.log(`emnify auth: 429, en espera hasta ${new Date(memCooldownUntil).toISOString()}`);
      throw rateLimitedError();
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.log(`emnify auth falló: status=${res.status}, body=${txt}`);
      throw new EmnifyAuthError(
        `Token de emnify inválido (${res.status}). Ve a emnify Portal → Integrations → Application Tokens y verifica que el token sea correcto y esté activo.`,
        res.status,
      );
    }

    const { auth_token } = await res.json();
    if (!auth_token) throw new EmnifyAuthError("emnify no devolvió auth_token", res.status);

    memToken = { token: auth_token, expiresAt: now() + TOKEN_TTL_MS };
    await safeSet(TOKEN_KEY, memToken);
    console.log("emnify JWT cacheado OK");
    return auth_token;
  }

  async function getToken(): Promise<string> {
    if (isFresh(memToken)) return memToken.token;
    if (memCooldownUntil > now()) throw rateLimitedError();
    if (!inFlight) {
      inFlight = authenticate().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  return { getToken };
}
