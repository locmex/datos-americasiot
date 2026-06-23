import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();
app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "X-IoT-Session"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

const EMNIFY_BASE = "https://cdn.emnify.net/api/v1";
// El endpoint de registro en lote (batch) no está disponible en la CDN;
// usa el portal API directamente para operaciones de escritura masiva.
const EMNIFY_PORTAL_BASE = "https://portal.emnify.com/api/v1";

// ────────────────────────────────────────────────
// LUHN helpers (ICCID & IMEI)
// ────────────────────────────────────────────────
function luhnCheckDigit(base: string): number {
  // Reverse the string, double every digit at even index (0-based from right)
  const reversed = base.split("").reverse().map(Number);
  const sum = reversed.reduce((acc, d, i) => {
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    return acc + d;
  }, 0);
  return (10 - (sum % 10)) % 10;
}

// emnify devuelve iccid sin el dígito de control (19 dígitos)
// Este helper lo calcula y devuelve el ICCID completo (20 dígitos)
function addLuhnDigit(iccid: string): string {
  if (!iccid || iccid.length >= 20) return iccid;
  return iccid + luhnCheckDigit(iccid);
}

// ────────────────────────────────────────────────
// IMEISV → IMEI conversion
// La API REST de emnify devuelve `imei` como IMEISV de 16 dígitos
// (TAC 8 + SNR 6 + SVN 2), pero el portal de emnify lo muestra como
// el IMEI de 15 dígitos (TAC 8 + SNR 6 + dígito de control Luhn).
// Ej: 8626670873071201 → base14=86266708730712 → check=3 → 862667087307123
// ────────────────────────────────────────────────
function normalizeImei(raw: string | number | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim().replace(/\D/g, "");
  if (s.length === 16) {
    const base14 = s.slice(0, 14);
    return base14 + luhnCheckDigit(base14);
  }
  return s; // ya es IMEI de 15 dígitos u otro formato
}

// ────────────────────────────────────────────────
// PASSWORD HASHING (Web Crypto �� Deno compatible)
// ────────────────────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ":iot_salt_ef736a01");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ──────────────────────────────────────────────
// EMNIFY APPLICATION TOKEN AUTH (server-side)
// Uses EMNIFY_API_TOKEN env var — never asks user for emnify credentials
// ────────────────────────────────────────────────
let cachedEmnifyJWT: { token: string; expiresAt: number } | null = null;

async function getEmnifyToken(): Promise<string> {
  if (cachedEmnifyJWT && cachedEmnifyJWT.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedEmnifyJWT.token;
  }
  const rawToken = Deno.env.get("EMNIFY_API_TOKEN");
  if (!rawToken) throw new Error("EMNIFY_API_TOKEN no configurado en los secrets de Supabase");

  const appToken = rawToken.trim();
  console.log(`emnify: intentando autenticar con token (longitud: ${appToken.length})`);

  const res = await fetch(`${EMNIFY_BASE}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application_token: appToken }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.log(`emnify auth falló: status=${res.status}, body=${txt}`);
    throw new Error(`Token de emnify inválido (${res.status}). Ve a emnify Portal → Integrations → Application Tokens y verifica que el token sea correcto y esté activo.`);
  }
  const { auth_token } = await res.json();
  if (!auth_token) throw new Error("emnify no devolvió auth_token");

  cachedEmnifyJWT = { token: auth_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  console.log("emnify JWT cacheado OK");
  return auth_token;
}

async function emnifyFetch(path: string, options: RequestInit = {}, baseUrl = EMNIFY_BASE) {
  const token = await getEmnifyToken();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`emnify ${res.status}: ${text}`);
  }
  if (res.status === 204) return { data: null, totalCount: 0 };
  const ct = res.headers.get("content-type") || "";
  // Intentar todos los nombres posibles del header de total
  const xTotal =
    res.headers.get("X-Total-Count") ||
    res.headers.get("x-total-count") ||
    res.headers.get("X-Record-Count") ||
    res.headers.get("x-record-count") ||
    res.headers.get("Total-Count") ||
    res.headers.get("total-count") ||
    res.headers.get("X-Pagination-Total-Count") ||
    res.headers.get("x-pagination-total-count");

  if (ct.includes("application/json")) {
    // ── Safe large-integer parsing ────────────────────────────────────────────
    // emnify returns IMEI (15 digits) and other large IDs as raw JSON numbers.
    // JavaScript's JSON.parse maps all numbers to float64, which silently loses
    // precision on integers with ≥15 significant digits — causing the last 1-2
    // digits of an IMEI to display incorrectly.
    // Fix: read raw text, quote every standalone integer value ≥15 digits so it
    // is parsed as a string (full precision) instead of a lossy float.
    const rawText = await res.text();
    if (!rawText.trim()) return { data: null, totalCount: 0 };
    const safeText = rawText.replace(
      /([:\[,][ \t]*)(\d{15,})(?=[ \t]*[,\}\]])/g,
      (_match, prefix, digits) => `${prefix}"${digits}"`
    );
    const data = JSON.parse(safeText);
    const parsedTotal = xTotal ? parseInt(xTotal, 10) : null;
    return { data, totalCount: parsedTotal };
  }
  return { data: null, totalCount: 0 };
}


async function requireAuth(c: any): Promise<any | null> {
  // Session ID travels in X-IoT-Session header (Authorization is used by Supabase gateway)
  const sessionId = c.req.header("X-IoT-Session");
  if (!sessionId) return null;
  const session = await kv.get(`session:${sessionId}`);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await kv.del(`session:${sessionId}`);
    return null;
  }
  return session;
}

function logActivity(type: string, message: string, extra: Record<string, any> = {}) {
  const key = `activity:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return kv.set(key, { type, message, ...extra, timestamp: new Date().toISOString() });
}

// ────────────────────────────────────────────────
// HEALTH
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

// ────────────────────────────────────────────────
// AUTH — Setup: crear primer admin (credenciales en KV)
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/auth/setup", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return c.json({ error: "Email y contraseña son requeridos" }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
    }

    // Check if an admin already exists in KV
    const existing = await kv.getByPrefix("admin:");
    if (existing && existing.length > 0) {
      return c.json({ error: "Ya existe un administrador configurado. Inicia sesión con tus credenciales." }, 409);
    }

    // Store admin in KV with hashed password — no Supabase Auth required
    const hashed = await hashPassword(password);
    const adminId = `adm_${Date.now()}`;
    await kv.set(`admin:${email.toLowerCase()}`, {
      id: adminId,
      email: email.toLowerCase(),
      name: name || "Administrador",
      role: "admin",
      passwordHash: hashed,
      createdAt: new Date().toISOString(),
    });

    await logActivity("setup", `Admin inicial creado: ${email}`, { adminId });
    console.log("Admin created in KV:", email);

    return c.json({ success: true, email: email.toLowerCase() });
  } catch (e) {
    console.log("Setup error:", e);
    return c.json({ error: `Error inesperado: ${String(e)}` }, 500);
  }
});

// ────────────────────────────────────────────────
// AUTH — Login unificado: Admin + Cliente
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email y contraseña requeridos" }, 400);
    }

    const normalEmail = email.trim().toLowerCase();
    const hashed      = await hashPassword(password);

    // ── 1. Intentar login de Administrador ────────────────────────────────────
    const admin = await kv.get(`admin:${normalEmail}`);
    if (admin) {
      if (hashed !== admin.passwordHash) {
        return c.json({ error: "Contraseña incorrecta" }, 401);
      }

      let emnifyOk = false;
      try { await getEmnifyToken(); emnifyOk = true; } catch (_) {}

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
      const session = {
        sessionId,
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: "admin",
        organisation: "",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      await kv.set(`session:${sessionId}`, session);
      await logActivity("login", `Admin ${admin.email} inició sesión`, { userId: admin.id, emnifyOk });

      return c.json({
        sessionId,
        user: {
          id: session.userId, email: session.email, name: session.name,
          role: session.role, organisation: session.organisation, emnifyConnected: emnifyOk,
        },
      });
    }

    // ── 2. Fallback: login de Cliente ─────────────────────────────────────────
    const allClients  = await kv.getByPrefix("client:");
    const realClients = allClients.filter((cl: any) => cl.id && cl.email);
    const matchingClient = realClients.find(
      (cl: any) => (cl.email || "").trim().toLowerCase() === normalEmail
    );

    if (!matchingClient) {
      return c.json({ error: "Credenciales incorrectas. Verifica tu correo y contraseña." }, 401);
    }

    const cid         = matchingClient.id;
    const authById    = await kv.get(`portal-auth:${cid}`);
    const authByEmail = await kv.get(`client-auth:${normalEmail}`);
    const clientAuth  = authById || authByEmail;

    if (!clientAuth || !clientAuth.portalEnabled) {
      return c.json({ error: "Tu acceso al portal no está habilitado. Contacta al administrador." }, 401);
    }
    if (hashed !== clientAuth.passwordHash) {
      return c.json({ error: "Contraseña incorrecta." }, 401);
    }

    const sessionId = `csess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const sessionData = {
      sessionId,
      userId: cid,
      clientId: cid,
      email: normalEmail,
      name: clientAuth.name || matchingClient.name,
      role: "client",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };
    await kv.set(`session:${sessionId}`, sessionData);
    await logActivity("client_login", `Cliente ${normalEmail} inició sesión`, { clientId: cid });
    console.log(`login: cliente ${normalEmail} OK (sessionId=${sessionId})`);

    return c.json({
      sessionId,
      user: {
        id: cid, email: normalEmail, name: sessionData.name,
        role: "client", organisation: "",
      },
    });
  } catch (e) {
    console.log("Login error:", e);
    return c.json({ error: `Error de autenticación: ${String(e)}` }, 500);
  }
});

app.post("/make-server-ef736a01/auth/logout", async (c) => {
  const sessionId = c.req.header("X-IoT-Session");
  if (sessionId) await kv.del(`session:${sessionId}`);
  return c.json({ success: true });
});

app.get("/make-server-ef736a01/auth/me", async (c) => {
  const session = await requireAuth(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      organisation: session.organisation,
    },
  });
});

// ───────────────────────────────────────────────
// EMNIFY — SIMs
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/sims", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const page    = parseInt(c.req.query("page")     || "0",  10);
    const perPage = Math.min(parseInt(c.req.query("per_page") || "50", 10), 100);
    const q       = c.req.query("q") || "";
    const statusParam = c.req.query("status") || ""; // "0" | "1" | "2" | "5" | ""
    const statusFilterId = statusParam !== "" ? parseInt(statusParam, 10) : null;

    // ── Helpers ────────────────────────────────────────────────────────────────
    const extractSims = (data: any): any[] => {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      if (data) {
        const k = Object.keys(data).find((k) => Array.isArray(data[k]));
        return k ? data[k] : [];
      }
      return [];
    };

    const applyTextFilter = (sims: any[], qRaw: string): any[] => {
      if (!qRaw || !qRaw.trim()) return sims;
      const qLow  = qRaw.trim().toLowerCase();
      const qBase = (qLow.length === 20 && /^\d+$/.test(qLow)) ? qLow.slice(0, 19) : null;
      return sims.filter((sim: any) => {
        const i19 = (sim.iccid || "").toLowerCase();
        const i20 = addLuhnDigit(sim.iccid || "").toLowerCase();
        return (
          i19.includes(qLow) || i20.includes(qLow) ||
          (qBase && (i19.includes(qBase) || i20.includes(qBase))) ||
          (sim.msisdn || "").toLowerCase().includes(qLow) ||
          (sim.imsi   || "").toLowerCase().includes(qLow) ||
          (sim.endpoint?.name || "").toLowerCase().includes(qLow) ||
          String(sim.id || "").includes(qLow)
        );
      });
    };

    const enrich = async (sims: any[]) => Promise.all(sims.map(async (sim: any) => {
      const local = await kv.get(`chip:${sim.iccid}`);
      return {
        ...sim,
        iccid_with_luhn: sim.iccid_with_luhn || addLuhnDigit(sim.iccid || ""),
        localData: local || null,
      };
    }));

    // ── Case A: Status filter active ───────────────────────────────────────────
    // emnify ignores ?status= — we fetch ALL pages and filter server-side.
    // Termination: empty page OR safety cap. We do NOT rely on X-Total-Count
    // because emnify sometimes returns the page count, not the global total.
    if (statusFilterId !== null) {
      const REQUESTED_BATCH = 100; // what we ask for
      const SAFETY_CAP      = 2000;
      let allSims: any[]    = [];
      let emnifyPg          = 1;
      let effectivePageSize = REQUESTED_BATCH; // updated after first real response

      while (allSims.length < SAFETY_CAP) {
        let batchUrl = `/sim?page=${emnifyPg}&per_page=${REQUESTED_BATCH}`;
        if (q) {
          const qTrim = q.trim();
          if (/^\d+$/.test(qTrim) && qTrim.length >= 10) {
            const iccidQ = qTrim.length === 20 ? qTrim.slice(0, 19) : qTrim;
            batchUrl += `&q=iccid:${encodeURIComponent(iccidQ)}`;
          }
        }
        console.log(`emnify sims status-filter page ${emnifyPg}: ${batchUrl}`);
        const { data: bData } = await emnifyFetch(batchUrl);
        const batch = extractSims(bData);

        console.log(`  → page ${emnifyPg}: ${batch.length} SIMs (total accumulated: ${allSims.length + batch.length})`);

        if (batch.length === 0) break; // no more pages

        // Learn emnify's actual per-page cap on the first fetch
        if (emnifyPg === 1) effectivePageSize = batch.length;

        allSims = [...allSims, ...batch];

        // If we got fewer items than emnify's effective page size → last page
        if (batch.length < effectivePageSize) break;

        emnifyPg++;
      }

      console.log(`emnify sims status-filter: fetched ${allSims.length} total SIMs across ${emnifyPg} pages`);

      // Apply text search then status filter
      let filtered = applyTextFilter(allSims, q);
      filtered = filtered.filter((sim: any) => (sim.status?.id ?? -1) === statusFilterId);

      const filteredTotal = filtered.length;
      const start         = page * perPage;
      const pageSlice     = filtered.slice(start, start + perPage);
      const enriched      = await enrich(pageSlice);

      console.log(`emnify sims status=${statusFilterId}: ${filteredTotal} matched → page ${page} (${enriched.length} items)`);
      return c.json({ items: enriched, total_count: filteredTotal });
    }

    // ── Case B-name: Device name query → search by endpoint/device name ──────────
    // emnify's /sim API only supports numeric (ICCID/MSISDN) queries.
    // emnify's /endpoint?q= does NOT reliably filter by name — it returns all endpoints.
    // Solution: fetch ALL endpoint pages in parallel, filter locally by name, then
    // look up the SIM records for the matching endpoints' ICCIDs.
    const isDeviceNameQuery = q.trim().startsWith("device:") || (q.trim() && !/^\d+$/.test(q.trim()));
    if (isDeviceNameQuery) {
      const qTrim = q.trim().startsWith("device:") ? q.trim().slice(7).trim() : q.trim();
      const qLow  = qTrim.toLowerCase();
      console.log(`emnify sims device-name search: "${qTrim}"`);

      // Fetch page 1 to learn the total endpoint count
      const first = await emnifyFetch(`/endpoint?page=1&per_page=100`);
      const firstItems: any[] = Array.isArray(first.data) ? first.data : (first.data?.items || []);
      const epTotal = first.totalCount ?? firstItems.length;
      const totalEpPages = Math.ceil(epTotal / 100);
      console.log(`  total endpoints: ${epTotal} across ${totalEpPages} pages`);

      // Fetch remaining pages in parallel
      let allEndpoints = [...firstItems];
      if (totalEpPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalEpPages - 1 }, (_, i) =>
            emnifyFetch(`/endpoint?page=${i + 2}&per_page=100`)
              .then(r => Array.isArray(r.data) ? r.data : (r.data?.items || []))
              .catch(() => [] as any[])
          )
        );
        allEndpoints = [...allEndpoints, ...rest.flat()];
      }

      // Filter endpoints by name locally
      const matched = allEndpoints.filter((ep: any) =>
        (ep.name || "").toLowerCase().includes(qLow)
      );
      console.log(`  ${matched.length} endpoints match "${qTrim}"`);

      if (matched.length === 0) {
        return c.json({ items: [], total_count: 0 });
      }

      // Collect ICCIDs from matching endpoints
      const iccids = matched.map((ep: any) => ep.sim?.iccid).filter(Boolean) as string[];

      // Fetch SIM records for those ICCIDs in parallel
      const simResults = await Promise.allSettled(
        iccids.map(async (iccid: string) => {
          try {
            const { data: sd } = await emnifyFetch(
              `/sim?q=iccid:${encodeURIComponent(iccid)}&page=1&per_page=5`
            );
            const list = extractSims(sd);
            return list.find((s: any) => s.iccid === iccid) ?? list[0] ?? null;
          } catch (_) { return null; }
        })
      );

      const validSims = simResults
        .map((r: any) => (r.status === "fulfilled" ? r.value : null))
        .filter(Boolean);

      const enriched = await enrich(validSims);
      const start     = page * perPage;
      const pageSlice = enriched.slice(start, start + perPage);

      console.log(`  device-name search: ${enriched.length} SIMs found, page ${page} → ${pageSlice.length} items`);
      return c.json({ items: pageSlice, total_count: enriched.length });
    }

    // ── Case B: Normal paginated fetch (no status filter, numeric/empty query) ─────
    const emnifyPage = page + 1;
    let url = `/sim?page=${emnifyPage}&per_page=${perPage}`;

    if (q) {
      const qTrim = q.trim();
      if (/^\d+$/.test(qTrim) && qTrim.length >= 10) {
        const iccidQuery = qTrim.length === 20 ? qTrim.slice(0, 19) : qTrim;
        url += `&q=iccid:${encodeURIComponent(iccidQuery)}`;
      }
    }

    console.log(`emnify sims request: ${url}`);
    const { data, totalCount: headerTotal } = await emnifyFetch(url);
    console.log(`emnify raw type: ${Array.isArray(data) ? "array" : typeof data}, headerTotal: ${headerTotal}`);

    let sims = extractSims(data);
    let totalCount: number | null = headerTotal ?? ((!Array.isArray(data) && data?.total_count) ? data.total_count : null);

    // Get total via lightweight call if missing
    if (totalCount === null && page === 0 && !q) {
      try {
        const { totalCount: t, data: td } = await emnifyFetch(`/sim?page=1&per_page=1`);
        if (t !== null) totalCount = t;
        else if (td && !Array.isArray(td) && td.total_count) totalCount = td.total_count;
        console.log(`Total via secondary call: ${totalCount}`);
      } catch (_) {}
    }

    // Text filter (handles 20-digit ICCID and remaining local passes)
    sims = applyTextFilter(sims, q);

    const finalTotal = totalCount ?? sims.length;
    console.log(`emnify sims: ${sims.length} items on page ${page}, total: ${finalTotal}`);

    const enriched = await enrich(sims);

    // Cleanup UNASSIGNED local-only chips in background (page 0, no filters).
    // IMPORTANT: Never delete chips that have a clientId — those are intentional
    // assignments that must persist even if the SIM is on a different emnify page.
    // Only delete unassigned phantom chips whose ICCID isn't in the current page
    // AND whose ICCID is clearly invalid (non-numeric or very short).
    if (page === 0 && !q) {
      (async () => {
        try {
          const allChips  = await kv.getByPrefix("chip:");
          const emnifySet = new Set(enriched.map((s: any) => (s.iccid || "").toLowerCase()));
          for (const chip of allChips) {
            // Never delete assigned chips — assignment must persist across pages
            if (chip.clientId) continue;
            const ci = (chip.iccid || "").toLowerCase();
            // Only delete clearly phantom entries (non-numeric or implausibly short)
            if (ci && !emnifySet.has(ci) && (!/^\d+$/.test(ci) || ci.length < 15)) {
              await kv.del(`chip:${chip.iccid}`);
              console.log(`sims: chip phantom eliminado: ${chip.iccid}`);
            }
          }
        } catch (e: any) {
          console.log(`sims: cleanup error: ${e.message}`);
        }
      })();
    }

    return c.json({ items: enriched, total_count: finalTotal });
  } catch (e: any) {
    console.log("Error getting SIMs:", e);
    return c.json({ error: `Error obteniendo SIMs: ${e.message}` }, 500);
  }
});

app.get("/make-server-ef736a01/emnify/sims/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { data } = await emnifyFetch(`/sim/${c.req.param("id")}`);
    return c.json(data);
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

app.patch("/make-server-ef736a01/emnify/sims/:id/status", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { statusId, iccid } = await c.req.json();
    await emnifyFetch(`/sim/${c.req.param("id")}`, {
      method: "PATCH",
      body: JSON.stringify({ status: { id: statusId } }),
    });
    const label = statusId === 1 ? "activado" : statusId === 2 ? "suspendido" : "actualizado";
    await logActivity("sim_status", `SIM ${iccid || c.req.param("id")} ${label}`, { iccid, userId: session.userId });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Error updating SIM:", e);
    return c.json({ error: `Error actualizando SIM: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — SIM EVENTS
// GET /emnify/sims/:id/events?page=0&per_page=5
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/sims/:id/events", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const simId   = c.req.param("id");
    const page    = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const perPage = Math.min(parseInt(c.req.query("per_page") || "5", 10), 50);

    const { data, totalCount } = await emnifyFetch(
      `/sim/${simId}/event?page=${page}&per_page=${perPage}`
    );

    const events: any[] = Array.isArray(data) ? data : [];
    return c.json({ items: events, total_count: totalCount ?? events.length, page, per_page: perPage });
  } catch (e: any) {
    console.log("Error getting SIM events:", e);
    return c.json({ error: `Error obteniendo eventos: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — SIM DAILY STATS
// GET /emnify/sims/:id/stats?period=week|month&endpoint_id=X
// Uses /endpoint/{endpoint_id}/stats/daily if endpoint available,
// else falls back to /sim/{id}/stats/daily
// ──────────────────────────────��─────────────────
app.get("/make-server-ef736a01/emnify/sims/:id/stats", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const simId      = c.req.param("id");
    const period     = c.req.query("period") || "week";
    const endpointId = c.req.query("endpoint_id") || "";

    // ── Calcular rango de fechas (UTC puro) ─────────────────────────────────
    // AMBOS fromStr y toStr se calculan aquí para que el fetch principal los use.
    const now = new Date();
    const y = now.getUTCFullYear(), mo = now.getUTCMonth(), dd = now.getUTCDate();
    let fromStr: string;
    let toStr: string = new Date(Date.UTC(y, mo, dd)).toISOString().slice(0, 10); // hoy

    if (period === "week") {
      // Últimos 7 días incluyendo hoy
      fromStr = new Date(Date.UTC(y, mo, dd - 6)).toISOString().slice(0, 10);
    } else if (period === "last_week") {
      // Lunes–Domingo de la semana pasada (UTC)
      const dow = now.getUTCDay();                      // 0=Dom … 6=Sáb
      const lastSunDay = dd - (dow === 0 ? 7 : dow);   // retroceder al domingo pasado
      toStr   = new Date(Date.UTC(y, mo, lastSunDay)).toISOString().slice(0, 10);
      fromStr = new Date(Date.UTC(y, mo, lastSunDay - 6)).toISOString().slice(0, 10);
    } else if (period === "month") {
      // Del día 1 del mes actual hasta hoy
      fromStr = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
    } else if (period === "last_month") {
      // Del día 1 al último día del mes anterior
      toStr   = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);     // último día del mes ant.
      fromStr = new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10); // día 1 del mes ant.
    } else if (period === "two_months") {
      // Del día 1 de hace 2 meses hasta hoy
      fromStr = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 10);
    } else {
      // fallback
      fromStr = new Date(Date.UTC(y, mo, dd - 6)).toISOString().slice(0, 10);
    }

    console.log(`sim daily stats: simId=${simId} period=${period} from=${fromStr} to=${toStr}`);

    let rawData: any = null;
    let usedPath = "";

    // ── 1. Try endpoint daily stats (primary — has cost fields) ──────────────
    if (endpointId) {
      const candidatePaths = [
        `/endpoint/${endpointId}/stats/daily?from=${fromStr}&to=${toStr}`,
        `/endpoint/${endpointId}/stats/daily`,
      ];
      for (const path of candidatePaths) {
        try {
          const res = await emnifyFetch(path);
          const d = res.data;
          if (d && (Array.isArray(d) ? d.length > 0 : Object.keys(d).length > 0)) {
            rawData  = d;
            usedPath = path;
            console.log(`sim stats OK via endpoint (${path}): ${JSON.stringify(d).slice(0, 300)}`);
            break;
          }
        } catch (e: any) {
          console.log(`endpoint stats path failed (${path}): ${e.message}`);
        }
      }
    }

    // ── 2. Fallback: SIM daily stats ──────────────────────────────────────────
    if (!rawData || (Array.isArray(rawData) && rawData.length === 0)) {
      const candidatePaths = [
        `/sim/${simId}/stats/daily?from=${fromStr}&to=${toStr}`,
        `/sim/${simId}/stats/daily`,
      ];
      for (const path of candidatePaths) {
        try {
          const res = await emnifyFetch(path);
          if (res.data) {
            rawData  = res.data;
            usedPath = path;
            console.log(`sim stats OK via sim (${path}): ${JSON.stringify(res.data).slice(0, 300)}`);
            break;
          }
        } catch (e: any) {
          console.log(`sim stats path failed (${path}): ${e.message}`);
        }
      }
    }

    const rows: any[] = Array.isArray(rawData) ? rawData : [];

    // Log FULL raw first row to diagnose field names in Supabase logs
    if (rows.length > 0) {
      console.log(`stats raw[0] keys: ${Object.keys(rows[0]).join(", ")}`);
      console.log(`stats raw[0] FULL: ${JSON.stringify(rows[0])}`);
    } else {
      console.log(`stats: 0 rows (simId=${simId}, endpointId=${endpointId}, path=${usedPath})`);
    }

    // Helper: coerce any value (string/number/null/undefined) → number or NaN
    const num = (v: any): number => {
      if (v === null || v === undefined) return NaN;
      const n = typeof v === "string" ? parseFloat(v) : Number(v);
      return isFinite(n) ? n : NaN;
    };

    // Helper: first candidate that resolves to a real finite number, else 0
    const pick = (...candidates: any[]): number => {
      for (const cand of candidates) {
        const n = num(cand);
        if (!isNaN(n)) return n;
      }
      return 0;
    };

    // ── Normalize ─────────────────────────────────────────────────────────────
    // Real emnify /endpoint/{id}/stats/daily shape (confirmed 2026-05-08):
    //   {
    //     date: "YYYY-MM-DD",
    //     data: { volume_tx: <MB decimal>, volume_rx: <MB decimal>, volume, cost, ... },
    //     sms:  { volume_tx: <MO count>,   volume_rx: <MT count>,   volume, cost, ... }
    //   }
    // IMPORTANT: volume_tx/volume_rx are DECIMAL megabytes (1 MB = 1 000 KB).
    // We send raw MB floats to the frontend — it formats as KB/MB/GB using ×1000 (decimal).

    // Filter out aggregate/total rows that emnify injects without a valid date
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const dailyRows = rows.filter((r: any) =>
      dateRe.test(r.date || r.day || r.timestamp || "")
    );

    const normalized = dailyRows.map((r: any) => {
      // ── Data volume (decimal MB — pass through unchanged) ────────────────
      const vol_tx_mb = pick(
        r.data?.volume_tx,          // ✅ confirmed real field
        r.data?.tx,
        r.volume?.tx, r.volume_tx, r.tx,
      );
      const vol_rx_mb = pick(
        r.data?.volume_rx,          // ✅ confirmed real field
        r.data?.rx,
        r.volume?.rx, r.volume_rx, r.rx,
      );

      // ── SMS counts ──────────────────────────────────────────────────────
      // sms.volume_tx = MO (sent by device), sms.volume_rx = MT (received by device)
      const sms_mo = pick(
        r.sms?.volume_tx,           // ✅ confirmed real field (MO)
        r.sms?.sent, r.sms?.mo_sms, r.sms_mo, r.mo_sms,
      );
      const sms_mt = pick(
        r.sms?.volume_rx,           // ✅ confirmed real field (MT)
        r.sms?.received, r.sms?.mt_sms, r.sms_mt, r.mt_sms,
      );

      return {
        date:      r.date || r.day || r.timestamp || "",
        volume_tx: vol_tx_mb,  // decimal MB — frontend uses ×1000 for KB display
        volume_rx: vol_rx_mb,  // decimal MB
        sms_mt,
        sms_mo,
      };
    });

    // Newest first
    normalized.sort((a, b) => (a.date > b.date ? -1 : 1));

    return c.json({
      items:       normalized,
      period,
      from:        fromStr,
      to:          toStr,
      _debug_path: usedPath,
    });
  } catch (e: any) {
    console.log("Error getting SIM stats:", e);
    return c.json({ error: `Error obteniendo estadísticas: ${e.message}` }, 500);
  }
});

// ─────────────���──────────────────────────────────
// EMNIFY — SERVICE PROFILES
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/service-profiles", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { data } = await emnifyFetch("/service_profile");
    return c.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    console.log("Error fetching service profiles:", e);
    return c.json({ error: `Error obteniendo perfiles de servicio: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — TARIFF PROFILES (Coverage Policies)
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/tariff-profiles", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { data } = await emnifyFetch("/tariff_profile");
    return c.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    console.log("Error fetching tariff profiles:", e);
    return c.json({ error: `Error obteniendo perfiles de tarifas: ${e.message}` }, 500);
  }
});

// ─────��──────────────────────────────────────────
// EMNIFY — CREATE ENDPOINT (new device)
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/emnify/endpoints", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();

    const { name, service_profile_id, tariff_profile_id, imei_lock, imei, tags, initial_status, sim_iccid } = body;
    if (!name?.trim())       return c.json({ error: "El nombre del dispositivo es requerido" }, 400);
    if (!service_profile_id) return c.json({ error: "El perfil de servicio es requerido" }, 400);
    if (!tariff_profile_id)  return c.json({ error: "El perfil de cobertura es requerido" }, 400);

    const payload: any = {
      name:            name.trim(),
      service_profile: { id: Number(service_profile_id) },
      tariff_profile:  { id: Number(tariff_profile_id)  },
      status:          { id: (initial_status === 1) ? 1 : 0 }, // requerido por emnify; 0=Disabled, 1=Enabled
    };
    if (imei_lock)         payload.imei_lock = true;
    if (imei_lock && imei) payload.imei      = String(imei).trim();
    if (Array.isArray(tags) && tags.length > 0) payload.tags = tags;
    if (sim_iccid?.trim()) payload.sim = { iccid: String(sim_iccid).trim() };

    console.log(`[create endpoint] payload: ${JSON.stringify(payload)}`);
    const { data: created } = await emnifyFetch("/endpoint", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`[create endpoint] created id=${created?.id}`);

    await logActivity("endpoint_create", `Nuevo dispositivo creado: ${name}`, {
      endpointId: created?.id,
      userId: session.userId,
    });

    return c.json(created, 201);
  } catch (e: any) {
    console.log("Error creando endpoint:", e);
    return c.json({ error: `Error creando dispositivo: ${e.message}` }, 500);
  }
});

// ───────────────────────────────────────────────
// EMNIFY — ENDPOINTS (list with search + total)
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/endpoints", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const page    = parseInt(c.req.query("page")     || "0",  10);
    const perPage = parseInt(c.req.query("per_page") || "10", 10);
    const q       = (c.req.query("q") || "").trim();

    // ── Classify the search term ──────────────────────────────────────────────
    const isNumeric = q ? /^\d+$/.test(q) : false;
    const isImei    = isNumeric && q.length >= 14 && q.length <= 16;
    const isIccid   = isNumeric && q.length >= 17;

    // Local match predicate — checks all searchable fields on an endpoint object
    // normalizeImei converts 16-digit IMEISV → 15-digit IMEI so search works
    // with the user-visible IMEI (same as emnify portal display).
    const localMatch = (ep: any, qLow: string): boolean => {
      const name   = (ep.name || "").toLowerCase();
      const iccid  = (ep.sim?.iccid || "").toLowerCase();
      const iccidL = addLuhnDigit(ep.sim?.iccid || "").toLowerCase();
      const imei   = normalizeImei(ep.imei).toLowerCase();
      const imeiRaw = String(ep.imei || "").toLowerCase(); // also match raw IMEISV
      const tags   = (ep.tags || []).join(" ").toLowerCase();
      const id     = String(ep.id || "");
      return (
        name.includes(qLow)    ||
        iccid.includes(qLow)   ||
        iccidL.includes(qLow)  ||
        imei.includes(qLow)    ||
        imeiRaw.includes(qLow) ||
        tags.includes(qLow)    ||
        id.includes(qLow)
      );
    };

    // Fetch ALL endpoints across all pages (for full-fleet local scan)
    const fetchAllEndpoints = async (): Promise<{ items: any[]; total: number }> => {
      const first = await emnifyFetch(`/endpoint?page=1&per_page=100`);
      const firstItems: any[] = Array.isArray(first.data) ? first.data : (first.data?.items || []);
      const total = first.totalCount ?? firstItems.length;
      if (total <= 100) return { items: firstItems, total };
      const totalPages = Math.ceil(total / 100);
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          emnifyFetch(`/endpoint?page=${i + 2}&per_page=100`).catch(() => ({ data: [], totalCount: 0 }))
        )
      );
      return {
        items: [...firstItems, ...rest.flatMap(r => Array.isArray(r.data) ? r.data : (r.data?.items || []))],
        total,
      };
    };

    console.log(`emnify endpoints: page=${page + 1} per_page=${perPage} q="${q}" isImei=${isImei} isIccid=${isIccid}`);

    let items: any[]       = [];
    let totalCount: number = 0;

    if (!q) {
      // ── No search — normal paginated list ──────────────────────────────────
      const res = await emnifyFetch(`/endpoint?page=${page + 1}&per_page=${perPage}`);
      items      = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      totalCount = res.totalCount ?? items.length;

    } else if (isImei) {
      // ── IMEI search — 3-strategy cascade ───────────────────────────────────
      // Strategy 1: native emnify q=imei:VALUE
      let found = false;
      try {
        const r1 = await emnifyFetch(`/endpoint?page=1&per_page=100&q=${encodeURIComponent("imei:" + q)}`);
        const r1i: any[] = Array.isArray(r1.data) ? r1.data : (r1.data?.items || []);
        console.log(`IMEI strat1 (imei:${q}): ${r1i.length} results`);
        if (r1i.length > 0) { items = r1i; totalCount = r1.totalCount ?? r1i.length; found = true; }
      } catch (e1: any) { console.log(`imei: prefix failed: ${e1.message}`); }

      // Strategy 2: raw numeric value (some emnify tenants support this)
      if (!found) {
        try {
          const r2 = await emnifyFetch(`/endpoint?page=1&per_page=100&q=${encodeURIComponent(q)}`);
          const r2i: any[] = Array.isArray(r2.data) ? r2.data : (r2.data?.items || []);
          console.log(`IMEI strat2 (raw ${q}): ${r2i.length} results`);
          if (r2i.length > 0) { items = r2i; totalCount = r2.totalCount ?? r2i.length; found = true; }
        } catch (e2: any) { console.log(`raw numeric failed: ${e2.message}`); }
      }

      // Strategy 3: full-fleet scan with local IMEI filter
      if (!found) {
        console.log(`IMEI not found via emnify filter — full fleet scan...`);
        const { items: all, total } = await fetchAllEndpoints();
        const qLow = q.toLowerCase();
        const matched = all.filter(ep => localMatch(ep, qLow));
        console.log(`Full scan: ${all.length} endpoints, ${matched.length} match IMEI "${q}"`);
        items = matched; totalCount = matched.length;
      }

      // Final local refinement pass
      if (items.length > 0) {
        const qLow    = q.toLowerCase();
        const refined = items.filter(ep => localMatch(ep, qLow));
        if (refined.length > 0) { items = refined; totalCount = refined.length; }
      }

    } else if (isIccid) {
      // ── ICCID search ────────────────────────────────────────────────────────
      try {
        const res = await emnifyFetch(`/endpoint?page=${page + 1}&per_page=${perPage}&q=${encodeURIComponent("iccid:" + q)}`);
        items      = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        totalCount = res.totalCount ?? items.length;
      } catch (e: any) {
        console.log(`iccid: query failed: ${e.message} — full scan fallback`);
        const { items: all } = await fetchAllEndpoints();
        const qLow = q.toLowerCase();
        items = all.filter(ep => localMatch(ep, qLow)); totalCount = items.length;
      }

    } else {
      // ── Name / text search ────────────���────────────────────────────────────
      try {
        const res = await emnifyFetch(`/endpoint?page=${page + 1}&per_page=${perPage}&q=${encodeURIComponent(q)}`);
        items      = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        totalCount = res.totalCount ?? items.length;
      } catch (e: any) {
        console.log(`Name query failed: ${e.message} — full scan fallback`);
        const { items: all } = await fetchAllEndpoints();
        const qLow = q.toLowerCase();
        items = all.filter(ep => localMatch(ep, qLow)); totalCount = items.length;
      }
    }

    console.log(`emnify endpoints result: ${items.length} items, total=${totalCount}`);

    // ── Normalize IMEI: IMEISV (16 digits) → IMEI (15 digits) ───────────────
    // emnify REST API returns `imei` as 16-digit IMEISV; we convert to the
    // 15-digit IMEI (TAC+SNR+Luhn) so it matches the emnify portal display.
    items = items.map((ep: any) => ({ ...ep, imei: normalizeImei(ep.imei) }));

    // ── Enrich each endpoint with /endpoint/{id}/connectivity ─────────────────
    // The emnify list endpoint (/endpoint) does NOT include connectivity data.
    // The dedicated connectivity endpoint (GET /endpoint/{id}/connectivity) returns:
    //   { status: { id: 0|1|2, description: "Offline"|"Online"|"Attached" },
    //     last_check, pdp_context: { ip_address, start_time, ... },
    //     operator: { name }, rat_type, ... }
    // Status IDs (official emnify spec):
    //   0 = Offline
    //   1 = Online  (active data session / PDP context active)
    //   2 = Attached (registered on network, no data session)
    // All calls run IN PARALLEL → total latency ≈ 1 request time, not N × latency.
    if (items.length > 0) {
      console.log(`fetching /connectivity for ${items.length} endpoints in parallel...`);
      const enriched = await Promise.all(
        items.map(async (item: any) => {
          try {
            const { data: conn } = await emnifyFetch(`/endpoint/${item.id}/connectivity`);
            if (conn) {
              console.log(`[conn] id=${item.id} status=${JSON.stringify(conn.status)} rat=${conn.rat_type} op=${conn.operator?.name}`);
              return { ...item, _connectivity: conn };
            }
          } catch (err: any) {
            console.log(`connectivity fetch failed for endpoint ${item.id}: ${err.message}`);
          }
          return item;
        })
      );
      items = enriched;
    }

    return c.json({ items, total_count: totalCount ?? items.length, page, per_page: perPage });
  } catch (e: any) {
    console.log("Error getting endpoints:", e);
    return c.json({ error: `Error obteniendo endpoints: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — ENDPOINT DETAIL (by ID) + enriched with /connectivity
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/endpoints/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");

    // Fetch endpoint detail and dedicated connectivity in parallel
    const [detailRes, connRes] = await Promise.allSettled([
      emnifyFetch(`/endpoint/${epId}`),
      emnifyFetch(`/endpoint/${epId}/connectivity`),
    ]);

    const data = detailRes.status === "fulfilled" ? detailRes.value.data : null;
    if (!data) throw new Error("No se pudo obtener el endpoint");

    const conn = connRes.status === "fulfilled" ? connRes.value.data : null;
    if (conn) {
      // emnify /connectivity uses 'mno' (not 'operator') and 'last_updated' (not 'last_check')
      console.log(`[conn] id=${epId} status=${JSON.stringify(conn.status)} rat=${JSON.stringify(conn.rat_type)} mno=${JSON.stringify(conn.mno)} op=${JSON.stringify(conn.operator)} country=${JSON.stringify(conn.country)} pdp=${JSON.stringify(conn.pdp_context)} last_updated=${conn.last_updated}`);
    }

    // Normalize IMEISV → IMEI also in detail view
    return c.json({ ...data, imei: normalizeImei(data.imei), _connectivity: conn ?? null });
  } catch (e: any) {
    console.log("Error getting endpoint detail:", e);
    return c.json({ error: `Error obteniendo endpoint: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — LOCATION (cell tower → lat/lng)
// GET /endpoint/{id}/location
// Uses mylnikov.org (free, no API key) to convert
// cell tower data (mcc/mnc/lac/cell_id) → coordinates
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/endpoints/:id/location", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");

    const [epRes, connRes] = await Promise.allSettled([
      emnifyFetch(`/endpoint/${epId}`),
      emnifyFetch(`/endpoint/${epId}/connectivity`),
    ]);

    const ep   = epRes.status   === "fulfilled" ? epRes.value.data   : null;
    const conn = connRes.status === "fulfilled" ? connRes.value.data : null;

    console.log(`[location] ep.location=${JSON.stringify(ep?.location)} conn.location=${JSON.stringify(conn?.location)} conn.country=${JSON.stringify(conn?.country)}`);

    // Cell tower data lives in conn.location
    const cell    = conn?.location ?? null;
    const mcc     = cell?.mcc     ?? null;
    const mnc     = cell?.mnc     ?? null;
    const lac     = cell?.lac     ?? null;
    const cell_id = cell?.cell_id ?? null;

    const country     = conn?.country?.name      ?? ep?.location?.name ?? "";
    const operator    = conn?.mno?.name ?? conn?.operator?.name ?? ep?.operator?.name ?? "";
    const lastUpdated = conn?.last_updated ?? ep?.last_updated ?? "";

    let lat: number | null = null;
    let lng: number | null = null;
    let accuracy: number | null = null;
    let locationSource = "none";

    // Step 1: cell tower geolocation via mylnikov.org (free, no key required)
    if (mcc && mnc && lac && cell_id) {
      try {
        console.log(`[location] mylnikov mcc=${mcc} mnc=${mnc} lac=${lac} cell_id=${cell_id}`);
        const geoRes = await fetch(
          `https://www.mylnikov.org/api/v1/cell?mcc=${mcc}&mnc=${mnc}&lac=${lac}&cellid=${cell_id}`,
          { headers: { "Accept": "application/json" } }
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          console.log(`[location] mylnikov response: ${JSON.stringify(geo)}`);
          if (geo.result === 1 && geo.lat && geo.lon) {
            lat = geo.lat;
            lng = geo.lon;
            accuracy = geo.range ?? null;
            locationSource = "cell_tower";
          }
        }
      } catch (geoErr: any) {
        console.log(`[location] mylnikov error: ${geoErr.message}`);
      }
    }

    // Step 2: fallback — country centroid via OpenStreetMap Nominatim
    if (!lat && (conn?.country?.country_code || ep?.location?.country_code)) {
      const cc = conn?.country?.country_code ?? ep?.location?.country_code;
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?country=${cc}&format=json&limit=1`,
          { headers: { "User-Agent": "AmericasIoT-Portal/1.0" } }
        );
        if (nomRes.ok) {
          const nom = await nomRes.json();
          if (nom?.[0]?.lat && nom?.[0]?.lon) {
            lat = parseFloat(nom[0].lat);
            lng = parseFloat(nom[0].lon);
            accuracy = null;
            locationSource = "country_centroid";
          }
        }
      } catch (nomErr: any) {
        console.log(`[location] nominatim error: ${nomErr.message}`);
      }
    }

    return c.json({
      lat, lng, accuracy,
      country, operator,
      mcc, mnc, lac, cell_id,
      location_source: locationSource,
      last_updated: lastUpdated,
    });
  } catch (e: any) {
    console.log("Error getting endpoint location:", e);
    return c.json({ error: `Error obteniendo ubicación: ${e.message}` }, 500);
  }
});

app.patch("/make-server-ef736a01/emnify/endpoints/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    await emnifyFetch(`/endpoint/${c.req.param("id")}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const action = body.status?.id === 1 ? "activado" : body.status?.id === 2 ? "suspendido" : "actualizado";
    await logActivity("endpoint_update", `Endpoint ${c.req.param("id")} ${action}`, { endpointId: c.req.param("id"), userId: session.userId });
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: `Error actualizando endpoint: ${e.message}` }, 500);
  }
});

// ───────────────���────────────────────────────────
// EMNIFY — RESET CONNECTIVITY (drop PDP context)
// DELETE /endpoint/{id}/connectivity via emnify API
// ────────────────────────────────────────────────
app.delete("/make-server-ef736a01/emnify/endpoints/:id/connectivity", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");
    await emnifyFetch(`/endpoint/${epId}/connectivity`, { method: "DELETE" });
    await logActivity("endpoint_reset_connectivity", `Connectivity reset for endpoint ${epId}`, { endpointId: epId, userId: session.userId });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Error resetting connectivity:", e);
    return c.json({ error: `Error reseteando conectividad: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — SEND SMS (Mobile Terminated) — admin
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/emnify/endpoints/:id/sms", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");
    const { message, source } = await c.req.json();
    if (!message?.trim()) return c.json({ error: "Mensaje vacío" }, 400);
    const sourceAddress = (source || "AmericasIoT").slice(0, 17);
    await emnifyFetch(`/endpoint/${epId}/sms`, {
      method: "POST",
      body: JSON.stringify({ source_address: sourceAddress, payload: message }),
    });
    await logActivity("sms_sent", `SMS enviado a endpoint ${epId}`, { endpointId: epId, userId: session.userId });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Error sending SMS:", e);
    return c.json({ error: `Error enviando SMS: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — GET SMS HISTORY — admin
// GET /endpoint/{id}/sms → list of MT + MO messages
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/endpoints/:id/sms", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");
    const page    = parseInt(c.req.query("page")    || "1");
    const perPage = parseInt(c.req.query("per_page") || "50");
    const res = await emnifyFetch(`/endpoint/${epId}/sms?page=${page}&per_page=${perPage}`);
    // emnify returns the list either as an array directly or inside .data
    const messages = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res)
        ? res
        : [];
    console.log(`SMS history endpoint ${epId}: ${messages.length} messages`);
    return c.json({ messages, total: res.totalCount ?? messages.length });
  } catch (e: any) {
    console.log("Error fetching SMS history:", e);
    return c.json({ error: `Error obteniendo historial SMS: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — ASSIGN SIM to endpoint
// POST /emnify/endpoints/:id/assign-sim  { sim_id }
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/emnify/endpoints/:id/assign-sim", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const endpointId = c.req.param("id");
    const { sim_id } = await c.req.json();
    if (!sim_id) return c.json({ error: "sim_id es requerido" }, 400);
    console.log(`[assign-sim] endpoint=${endpointId} sim=${sim_id}`);
    const { data } = await emnifyFetch(`/endpoint/${endpointId}`, {
      method: "PATCH",
      body: JSON.stringify({ sim: { id: Number(sim_id) } }),
    });
    await logActivity("sim_assign", `SIM ${sim_id} asignada al endpoint ${endpointId}`, {
      endpointId, simId: sim_id, userId: session.userId,
    });
    return c.json(data || { success: true });
  } catch (e: any) {
    console.log("Error asignando SIM al endpoint:", e);
    return c.json({ error: `Error asignando SIM: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — DETACH SIM from endpoint
// ────────────────────────────────────────────────
app.delete("/make-server-ef736a01/emnify/endpoints/:id/sim", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");
    await emnifyFetch(`/endpoint/${epId}`, {
      method: "PATCH",
      body: JSON.stringify({ sim: null }),
    });
    await logActivity("sim_detached", `SIM desvinculada de endpoint ${epId}`, { endpointId: epId, userId: session.userId });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Error detaching SIM:", e);
    return c.json({ error: `Error desvinculando SIM: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — DELETE ENDPOINT
// ────────────────────────────────────────────────
app.delete("/make-server-ef736a01/emnify/endpoints/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const epId = c.req.param("id");
    await emnifyFetch(`/endpoint/${epId}`, { method: "DELETE" });
    await logActivity("endpoint_deleted", `Endpoint ${epId} eliminado`, { endpointId: epId, userId: session.userId });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Error deleting endpoint:", e);
    return c.json({ error: `Error eliminando endpoint: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — STATS
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/stats", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    // Intentar leer del caché de data-usage (fuente más confiable para status counts)
    // ya que emnify no siempre soporta ?status= como filtro de conteo
    const usageCache = await kv.get("cache:data_usage_v6");
    const hasFreshCache = usageCache && usageCache.expiresAt > Date.now();

    // Siempre necesitamos clientes y total de SIMs / endpoints frescos
    const [simsAll, clients, endpoints] = await Promise.allSettled([
      emnifyFetch("/sim?page=1&per_page=1"),
      kv.getByPrefix("client:"),
      emnifyFetch("/endpoint?page=1&per_page=1"),
    ]);

    const totalSims = simsAll.status === "fulfilled"
      ? (simsAll.value.totalCount ?? (Array.isArray(simsAll.value.data) ? simsAll.value.data.length : 0))
      : 0;
    const totalClients = clients.status === "fulfilled" ? clients.value.length : 0;
    const totalEndpoints = endpoints.status === "fulfilled" ? (endpoints.value.totalCount ?? 0) : 0;

    if (hasFreshCache) {
      // ✅ Usar conteos exactos del escaneo completo de endpoints
      const sc = usageCache.data.statusCount ?? {};
      const activeSims    = sc.online  ?? sc[1] ?? 0;
      const suspendedSims = sc.disabled ?? sc[2] ?? 0;
      const offlineSims   = sc.offline  ?? ((sc[0] ?? 0) + (sc[3] ?? 0));
      console.log(`stats (desde caché): total=${totalSims} active=${activeSims} suspended=${suspendedSims} offline=${offlineSims}`);
      return c.json({ totalSims, activeSims, suspendedSims, offlineSims, totalClients, totalEndpoints });
    }

    // Sin caché: escanear primeras 2 páginas para estimar proporciones
    console.log("stats: sin caché, escaneando páginas para estimar status...");
    const [p1, p2] = await Promise.allSettled([
      emnifyFetch("/sim?page=1&per_page=100"),
      emnifyFetch("/sim?page=2&per_page=100"),
    ]);

    const statusCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let scanned = 0;
    for (const r of [p1, p2]) {
      if (r.status === "fulfilled") {
        const pageSims: any[] = Array.isArray(r.value.data) ? r.value.data : (r.value.data?.items || []);
        for (const sim of pageSims) {
          const sid = sim.status?.id ?? 0;
          statusCount[sid] = (statusCount[sid] || 0) + 1;
          scanned++;
        }
      }
    }

    // Extrapolar al total real si escaneamos menos SIMs que el total
    const factor = scanned > 0 && totalSims > scanned ? totalSims / scanned : 1;
    const activeSims    = Math.round((statusCount[1] ?? 0) * factor);
    const suspendedSims = Math.round((statusCount[2] ?? 0) * factor);
    const offlineSims   = Math.round(((statusCount[0] ?? 0) + (statusCount[3] ?? 0)) * factor);
    console.log(`stats (estimado): scanned=${scanned} factor=${factor.toFixed(2)} active=${activeSims} suspended=${suspendedSims}`);

    return c.json({ totalSims, activeSims, suspendedSims, offlineSims, totalClients, totalEndpoints });
  } catch (e: any) {
    console.log("Error getting stats:", e);
    return c.json({ error: `Error obteniendo estadísticas: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — DEBUG (diagnóstico de campos de volumen)
// ──────���─────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/debug-volume", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const results: Record<string, any> = {};

    // 1. Buscar un endpoint activo y mostrar runtime_data completo
    try {
      const { data: epList } = await emnifyFetch("/endpoint?page=1&per_page=5");
      const endpoints: any[] = Array.isArray(epList) ? epList : [];
      results.endpoint_list_keys = Object.keys(endpoints[0] || {});

      // Endpoint activo para inspección
      const activeEp = endpoints.find((e) => e.status?.id === 1) ?? endpoints[0];
      if (activeEp) {
        const { data: epDetail } = await emnifyFetch(`/endpoint/${activeEp.id}`);
        results.endpoint_full = {
          id: epDetail?.id,
          status: epDetail?.status,
          runtime_data: epDetail?.runtime_data,           // <-- aquí está el volumen
          runtime_data_keys: Object.keys(epDetail?.runtime_data || {}),
        };

        // Intentar /endpoint/{id}/quota
        try {
          const { data: quota } = await emnifyFetch(`/endpoint/${activeEp.id}/quota`);
          results.endpoint_quota = quota;
        } catch (e) { results.endpoint_quota = { error: (e as Error).message }; }

        // Intentar /endpoint/{id}/stats
        try {
          const { data: st } = await emnifyFetch(`/endpoint/${activeEp.id}/stats`);
          results.endpoint_stats = st;
        } catch (e) { results.endpoint_stats = { error: (e as Error).message }; }
      }
    } catch (e) {
      results.endpoint_error = (e as Error).message;
    }

    return c.json(results, 200);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — DATA USAGE (consumo agregado mensual)
// Fuente: GET /endpoint/{id}/stats → current_month.data.volume_tx/rx (MB)
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/data-usage", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    // v6: fuerza recomputo limpio (v5 tenía datos incorrectos de sampling)
    const cacheKey = "cache:data_usage_v6";
    const cached = await kv.get(cacheKey);

    // Serve-stale-while-revalidate: si existe caché devolver inmediatamente
    if (cached) {
      const fresh = cached.expiresAt > Date.now();
      console.log(`data-usage: cache ${fresh ? "FRESH" : "STALE"} → devolviendo inmediato`);
      return c.json({ ...cached.data, stale: !fresh });
    }

    const now = new Date();
    console.log("data-usage: sin caché v6, iniciando cómputo completo...");

    let timedOut = false;
    const timeoutHandle = setTimeout(() => { timedOut = true; }, 28000);

    try {
      // ── Paso 1: Obtener TODOS los endpoint IDs + TODAS las SIMs en PARALELO ──
      const [epListRes, simListRes] = await Promise.allSettled([
        emnifyFetch("/endpoint?page=1&per_page=100"),
        emnifyFetch("/sim?page=1&per_page=100"),
      ]);

      // Endpoints
      const ep1 = epListRes.status === "fulfilled" ? epListRes.value : { data: [], totalCount: 0 };
      const allEp1: any[] = Array.isArray(ep1.data) ? ep1.data : [];
      const totalEps = ep1.totalCount ?? allEp1.length;
      const epPages  = Math.min(Math.ceil(totalEps / 100), 15);

      // SIMs
      const sim1 = simListRes.status === "fulfilled" ? simListRes.value : { data: [], totalCount: 0 };
      const allSim1: any[] = Array.isArray(sim1.data) ? sim1.data : [];
      const totalSims = sim1.totalCount ?? allSim1.length;
      const simPages  = Math.min(Math.ceil(totalSims / 100), 15);

      console.log(`data-usage: ${totalEps} endpoints (${epPages}p), ${totalSims} SIMs (${simPages}p)`);

      // ── Paso 2: Paginar resto de endpoints Y SIMs en paralelo ─────────────
      const extraPages: Promise<any>[] = [];
      for (let p = 2; p <= epPages;  p++) extraPages.push(emnifyFetch(`/endpoint?page=${p}&per_page=100`).catch(() => ({ data: [] })));
      for (let p = 2; p <= simPages; p++) extraPages.push(emnifyFetch(`/sim?page=${p}&per_page=100`).catch(() => ({ data: [] })));

      const pagesRes = await Promise.allSettled(extraPages);

      let allEndpoints: any[] = [...allEp1];
      let allSimsFull: any[] = [...allSim1];
      let epIdx = 0;
      for (const r of pagesRes) {
        if (r.status !== "fulfilled") { epIdx++; continue; }
        const d: any[] = Array.isArray(r.value.data) ? r.value.data : [];
        if (epIdx < epPages - 1) allEndpoints = allEndpoints.concat(d);
        else allSimsFull = allSimsFull.concat(d);
        epIdx++;
      }

      // ── Paso 3: Estado de dispositivos desde STATUS DE SIM ────────────────
      // SIM status 1 = Active (Online), 2 = Suspended (Deshabilitado), 0/3 = Offline
      let simOnline = 0, simDisabled = 0, simOffline = 0;
      for (const sim of allSimsFull) {
        const sid = sim.status?.id;
        if (sid === 1)        simOnline++;
        else if (sid === 2)   simDisabled++;
        else                  simOffline++;  // 0, 3, undefined
      }
      console.log(`data-usage sims: online=${simOnline} disabled=${simDisabled} offline=${simOffline} total=${allSimsFull.length}`);

      if (timedOut) throw new Error("timeout_after_pagination");

      // ── Paso 4: Stats de TODOS los endpoints (lotes de 50 paralelos) ──────
      const enabledIds = allEndpoints.map((e) => e.id).filter(Boolean);
      const BATCH = 50;
      let totalTxMB = 0, totalRxMB = 0, statsOk = 0;
      const hourlyAccum: Record<string, { tx: number; rx: number }> = {};
      let hourlyCount = 0;

      for (let i = 0; i < enabledIds.length; i += BATCH) {
        if (timedOut) break;
        const batchRes = await Promise.allSettled(
          enabledIds.slice(i, i + BATCH).map((id) =>
            emnifyFetch(`/endpoint/${id}/stats`).catch(() => null)
          )
        );
        for (const r of batchRes) {
          if (r.status !== "fulfilled" || !r.value) continue;
          const stats = r.value?.data ?? r.value;
          const cm = stats?.current_month?.data;
          if (cm) {
            totalTxMB += parseFloat(cm.volume_tx ?? "0");
            totalRxMB += parseFloat(cm.volume_rx ?? "0");
            statsOk++;
          }
          if (hourlyCount < 10) {
            const lh = stats?.last_hour?.data;
            if (lh) {
              for (const [t, v] of (lh.tx ?? [])) {
                const k = `${String(t).split(":")[0]}:00`;
                if (!hourlyAccum[k]) hourlyAccum[k] = { tx: 0, rx: 0 };
                hourlyAccum[k].tx += parseFloat(v ?? 0);
              }
              for (const [t, v] of (lh.rx ?? [])) {
                const k = `${String(t).split(":")[0]}:00`;
                if (!hourlyAccum[k]) hourlyAccum[k] = { tx: 0, rx: 0 };
                hourlyAccum[k].rx += parseFloat(v ?? 0);
              }
              hourlyCount++;
            }
          }
        }
      }

      // Extrapolar si se cortó el tiempo
      const fraction = statsOk / Math.max(enabledIds.length, 1);
      if (timedOut && statsOk > 0 && fraction < 0.95) {
        totalTxMB /= fraction;
        totalRxMB /= fraction;
        console.log(`data-usage: timeout, extrapolado desde ${statsOk}/${enabledIds.length} (${(fraction*100).toFixed(0)}%)`);
      }

      console.log(`data-usage FINAL: TX=${totalTxMB.toFixed(2)} RX=${totalRxMB.toFixed(2)} MB (${statsOk}/${enabledIds.length} endpoints)`);

      const txBytes    = Math.round(totalTxMB * 1024 * 1024);
      const rxBytes    = Math.round(totalRxMB * 1024 * 1024);
      const totalBytes = txBytes + rxBytes;
      const dataSource = timedOut ? `partial_${statsOk}/${enabledIds.length}` : `full_${statsOk}`;

      // ── Gráfica horaria ───────────────────────���──────────────────────────
      const hourlyKeys = Object.keys(hourlyAccum).sort();
      let trafficHourly: { label: string; tx: number; rx: number }[];
      if (hourlyKeys.length >= 2) {
        const sampledTx = Object.values(hourlyAccum).reduce((s, h) => s + h.tx, 0);
        const scale = sampledTx > 0 && totalTxMB > 0 ? totalTxMB / sampledTx : 1;
        trafficHourly = hourlyKeys.slice(-7).map((label) => ({
          label,
          tx: Math.round((hourlyAccum[label]?.tx ?? 0) * scale * 1024 * 1024),
          rx: Math.round((hourlyAccum[label]?.rx ?? 0) * scale * 1024 * 1024),
        }));
      } else {
        trafficHourly = Array.from({ length: 7 }, (_, i) => {
          const h  = new Date(now.getTime() - (6 - i) * 3600000);
          const hr = h.getHours();
          const w  = hr >= 8 && hr <= 18 ? 0.10 + Math.sin(((hr - 8) / 10) * Math.PI) * 0.09 : 0.03;
          return {
            label: `${String(hr).padStart(2, "0")}:00`,
            tx: Math.round(totalBytes * w * 0.63),
            rx: Math.round(totalBytes * w * 0.37),
          };
        });
      }

      const result = {
        txBytes, rxBytes, totalBytes,
        txMB: parseFloat(totalTxMB.toFixed(2)),
        rxMB: parseFloat(totalRxMB.toFixed(2)),
        totalMB: parseFloat((totalTxMB + totalRxMB).toFixed(2)),
        totalEndpoints: totalEps,
        totalSims,
        endpointsWithStats: statsOk,
        statusCount: {
          // Claves nombradas (fuente correcta: SIM status)
          online:   simOnline,
          disabled: simDisabled,
          offline:  simOffline,
          // Alias numéricos para compatibilidad con el resto del código
          1: simOnline,
          2: simDisabled,
          0: simOffline,
        },
        trafficHourly,
        month: now.toLocaleString("es-MX", { month: "long", year: "numeric" }),
        dataSource,
        stale: false,
        cachedAt: now.toISOString(),
      };

      const ttl = timedOut ? 5 * 60 * 1000 : 30 * 60 * 1000;
      await kv.set(cacheKey, { data: result, expiresAt: Date.now() + ttl });
      return c.json(result);

    } finally {
      clearTimeout(timeoutHandle);
    }
  } catch (e) {
    console.log("Error en data-usage:", e);
    try {
      const stale = await kv.get("cache:data_usage_v6");
      if (stale) return c.json({ ...stale.data, stale: true });
    } catch (_) {}
    return c.json({ error: `Error obteniendo consumo: ${(e as Error).message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// EMNIFY — LIMPIAR CACHÉ (para forzar recálculo)
// ─────────────��──────────────────────────────────
app.post("/make-server-ef736a01/emnify/cache-clear", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await kv.del("cache:data_usage_v5");
    await kv.del("cache:data_usage_v6");
    console.log("Cache data-usage borrado manualmente por", session.email);
    return c.json({ success: true, message: "Caché borrado. El próximo acceso recalculará los datos." });
  } catch (e) {
    return c.json({ error: `Error: ${(e as Error).message}` }, 500);
  }
});

// ─��──────────────────────────────────────────────
// EMNIFY — DEBUG SIM STATS (raw response inspector)
// GET /emnify/debug-sim-stats?sim_id=X&endpoint_id=Y
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/emnify/debug-sim-stats", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const simId      = c.req.query("sim_id") || "";
    const endpointId = c.req.query("endpoint_id") || "";

    const now      = new Date();
    const toStr    = now.toISOString().slice(0, 10);
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 6);
    const fromStr  = fromDate.toISOString().slice(0, 10);

    const results: Record<string, any> = { from: fromStr, to: toStr };

    // Probe all possible paths
    const paths = [
      endpointId ? `/endpoint/${endpointId}/stats/daily?from=${fromStr}&to=${toStr}` : null,
      endpointId ? `/endpoint/${endpointId}/stats/daily` : null,
      endpointId ? `/endpoint/${endpointId}/stats` : null,
      simId      ? `/sim/${simId}/stats/daily?from=${fromStr}&to=${toStr}` : null,
      simId      ? `/sim/${simId}/stats/daily` : null,
      simId      ? `/sim/${simId}/stats` : null,
    ].filter(Boolean) as string[];

    for (const path of paths) {
      try {
        const { data, totalCount } = await emnifyFetch(path);
        results[path] = {
          totalCount,
          isArray: Array.isArray(data),
          length: Array.isArray(data) ? data.length : undefined,
          first_item: Array.isArray(data) ? data[0] : data,
          keys_first: Array.isArray(data) && data[0] ? Object.keys(data[0]) : (data ? Object.keys(data) : []),
        };
      } catch (e: any) {
        results[path] = { error: e.message };
      }
    }

    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────
// SIM REGISTRATION via BIC (emnify)
// ────────────────────────────────────────────────

// POST /sims/register-bic1 — registra una SIM individual por código BIC1
app.post("/make-server-ef736a01/sims/register-bic1", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { bic } = await c.req.json();
    if (!bic || typeof bic !== "string" || !bic.trim()) {
      return c.json({ error: "Código BIC1 requerido" }, 400);
    }
    const bic1 = bic.trim().toUpperCase();

    // Registrar SIM en emnify con status 1 (Activada)
    const token = await getEmnifyToken();
    const res = await fetch(`${EMNIFY_BASE}/sim`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bic: bic1, status: { id: 1 } }),
    });
    const resText = await res.text();
    if (!res.ok) {
      console.log(`emnify BIC1 error: ${res.status} ${resText}`);
      let msg = `Error emnify (${res.status})`;
      try { const j = JSON.parse(resText); msg = j.message || j.error || msg; } catch {}
      return c.json({ error: msg }, 400);
    }

    let simData: any = null;
    try { simData = JSON.parse(resText); } catch {}

    // Registrar localmente en KV si tenemos el ICCID
    const iccid = simData?.iccid ? String(simData.iccid).trim() : null;
    if (iccid) {
      const existing = await kv.get(`chip:${iccid}`);
      if (!existing) {
        await kv.set(`chip:${iccid}`, {
          iccid,
          clientId: null, clientName: null,
          addedAt: new Date().toISOString(), addedBy: session.userId, notes: "",
          emnifyId: simData?.id ?? null,
          emnifyStatus: simData?.status?.description ?? null,
          registeredViaBic: "bic1",
        });
      }
    }

    await logActivity("sim_registered_bic1", `SIM registrada por BIC1: ${bic1}${iccid ? ` (ICCID: ${iccid})` : ""}`, { userId: session.userId });
    return c.json({ success: true, sim: simData, iccid });
  } catch (e: any) {
    console.log("Error registrando SIM por BIC1:", e);
    return c.json({ error: `Error registrando SIM: ${e.message}` }, 500);
  }
});

// POST /sims/register-bic2 — registra un lote de SIMs por código BIC2
app.post("/make-server-ef736a01/sims/register-bic2", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { bic2 } = await c.req.json();
    if (!bic2 || typeof bic2 !== "string" || !bic2.trim()) {
      return c.json({ error: "Código BIC2 requerido" }, 400);
    }
    const bic2code = bic2.trim().toUpperCase();

    const token = await getEmnifyToken();

    // Intentar primero con el portal API (la CDN no enruta POST /sim/batch).
    // Si falla con 404/405, intentar con la CDN como fallback.
    const urlsToTry = [
      `${EMNIFY_PORTAL_BASE}/sim/batch`,
      `${EMNIFY_BASE}/sim/batch`,
    ];

    let lastStatus = 0;
    let lastBody = "";
    let batchData: any = null;

    for (const url of urlsToTry) {
      console.log(`emnify BIC2: intentando POST ${url}`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bic2: bic2code }),
      });
      lastStatus = res.status;
      lastBody = await res.text();
      console.log(`emnify BIC2 ${url}: status=${res.status} body=${lastBody.slice(0, 300)}`);

      if (res.ok) {
        try { batchData = JSON.parse(lastBody); } catch {}
        break;
      }

      // Si es 404/405/"Cannot POST" → intentar siguiente URL
      const isRoutingError = res.status === 404 || res.status === 405
        || lastBody.includes("Cannot POST") || lastBody.includes("not found");
      if (!isRoutingError) {
        // Error real de emnify (4xx distinto de routing) → no reintentar
        let msg = `Error emnify (${res.status})`;
        try { const j = JSON.parse(lastBody); msg = j.message || j.error || msg; } catch {}
        return c.json({ error: msg }, 400);
      }
    }

    // Si ninguna URL funcionó
    if (!batchData && lastStatus !== 200 && lastStatus !== 201) {
      let msg = `emnify no reconoció el endpoint de registro en lote (status ${lastStatus}). Verifica que el BIC2 sea correcto y que tu cuenta emnify tenga permiso de registro en lote.`;
      try { const j = JSON.parse(lastBody); msg = j.message || j.error || msg; } catch {}
      console.log(`emnify BIC2 falló en todos los endpoints. Último body: ${lastBody}`);
      return c.json({ error: msg }, 400);
    }

    // Registrar en KV local todas las SIMs devueltas
    const sims: any[] = Array.isArray(batchData) ? batchData : (batchData?.sims ?? batchData?.items ?? []);
    let localAdded = 0;
    for (const sim of sims) {
      const iccid = sim?.iccid ? String(sim.iccid).trim() : null;
      if (!iccid) continue;
      const existing = await kv.get(`chip:${iccid}`);
      if (!existing) {
        await kv.set(`chip:${iccid}`, {
          iccid,
          clientId: null, clientName: null,
          addedAt: new Date().toISOString(), addedBy: session.userId, notes: "",
          emnifyId: sim?.id ?? null,
          emnifyStatus: sim?.status?.description ?? null,
          registeredViaBic: "bic2",
        });
        localAdded++;
      }
    }

    const count = sims.length;
    await logActivity("sim_registered_bic2", `Lote de SIMs registrado por BIC2: ${bic2code} (${count} SIMs)`, { userId: session.userId });
    return c.json({ success: true, batch: batchData, count, localAdded });
  } catch (e: any) {
    console.log("Error registrando lote por BIC2:", e);
    return c.json({ error: `Error registrando lote: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CHIPS (Local Inventory)
// ──────────────────────────────────────────��─────
app.get("/make-server-ef736a01/chips", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const chips = await kv.getByPrefix("chip:");
    return c.json({ chips });
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

app.post("/make-server-ef736a01/chips", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { iccids } = await c.req.json();
    if (!Array.isArray(iccids) || iccids.length === 0) return c.json({ error: "Lista de ICCIDs requerida" }, 400);

    const results: any[] = [];
    for (const raw of iccids) {
      const iccid = String(raw).trim().replace(/\D/g, "");
      if (!iccid) continue;

      // Check local duplicate first
      const existing = await kv.get(`chip:${iccid}`);
      if (existing) { results.push({ iccid, status: "duplicate" }); continue; }

      // Opción A: validate against emnify before registering locally
      // emnify stores ICCIDs without Luhn digit (19 digits); strip last if 20 provided
      const emnifyIccid = iccid.length === 20 ? iccid.slice(0, 19) : iccid;
      try {
        const { data } = await emnifyFetch(`/sim?q=iccid:${encodeURIComponent(emnifyIccid)}&per_page=1`);
        const sims: any[] = Array.isArray(data) ? data : (data?.items || []);
        // Match by ICCID (strip Luhn from result if needed)
        const found = sims.find((s: any) => {
          const simIccid = String(s.iccid || "").trim();
          return simIccid === emnifyIccid || simIccid === iccid;
        });

        if (!found) {
          results.push({ iccid, status: "not_found", message: "No encontrado en emnify" });
          continue;
        }

        // Register locally with real emnify data
        await kv.set(`chip:${iccid}`, {
          iccid,
          clientId: null, clientName: null,
          addedAt: new Date().toISOString(), addedBy: session.userId, notes: "",
          emnifyId: found.id ?? null,
          emnifyStatus: found.status?.description ?? null,
        });
        results.push({ iccid, status: "added", emnifyId: found.id });
      } catch (emnifyErr: any) {
        results.push({ iccid, status: "error", message: `Error consultando emnify: ${emnifyErr.message}` });
      }
    }

    const added = results.filter((r) => r.status === "added").length;
    if (added > 0) {
      await logActivity("chips_added", `${added} chip(s) añadidos (validados en emnify)`, { userId: session.userId });
    }
    return c.json({ results });
  } catch (e: any) {
    return c.json({ error: `Error añadiendo chips: ${e.message}` }, 500);
  }
});

app.post("/make-server-ef736a01/chips/:iccid/assign", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const iccid = c.req.param("iccid");
    const { clientId, clientName } = await c.req.json();
    let chip = await kv.get(`chip:${iccid}`);
    if (!chip) chip = { iccid, addedAt: new Date().toISOString(), addedBy: session.userId, notes: "" };
    const updated = { ...chip, clientId, clientName, assignedAt: new Date().toISOString(), assignedBy: session.userId };
    await kv.set(`chip:${iccid}`, updated);
    await logActivity("chip_assigned", `Chip ${iccid} asignado a ${clientName}`, { iccid, clientId, userId: session.userId });
    return c.json({ chip: updated });
  } catch (e: any) {
    return c.json({ error: `Error asignando chip: ${e.message}` }, 500);
  }
});

app.post("/make-server-ef736a01/chips/:iccid/unassign", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const iccid = c.req.param("iccid");
    const chip = await kv.get(`chip:${iccid}`);
    if (!chip) return c.json({ error: "Chip no encontrado" }, 404);
    const updated = { ...chip, clientId: null, clientName: null, assignedAt: null };
    await kv.set(`chip:${iccid}`, updated);
    await logActivity("chip_unassigned", `Chip ${iccid} desasignado`, { iccid, userId: session.userId });
    return c.json({ chip: updated });
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CHIPS — Asignación masiva
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/chips/bulk-assign", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { iccids, clientId, clientName } = await c.req.json();
    if (!Array.isArray(iccids) || iccids.length === 0) return c.json({ error: "Lista de ICCIDs requerida" }, 400);
    if (!clientId || !clientName) return c.json({ error: "Cliente requerido" }, 400);

    const now = new Date().toISOString();
    const results: { iccid: string; status: "ok" | "error"; error?: string }[] = [];

    await Promise.allSettled(
      iccids.map(async (iccid: string) => {
        try {
          let chip = await kv.get(`chip:${iccid}`);
          if (!chip) chip = { iccid, addedAt: now, addedBy: session.userId, notes: "" };
          await kv.set(`chip:${iccid}`, {
            ...chip, clientId, clientName,
            assignedAt: now, assignedBy: session.userId,
          });
          results.push({ iccid, status: "ok" });
        } catch (e: any) {
          results.push({ iccid, status: "error", error: e.message });
        }
      })
    );

    const ok = results.filter((r) => r.status === "ok").length;
    await logActivity("bulk_assign", `${ok} SIMs asignadas a ${clientName}`, {
      clientId, clientName, count: ok, userId: session.userId,
    });
    return c.json({ results, assigned: ok, failed: results.length - ok });
  } catch (e) {
    return c.json({ error: `Error en asignación masiva: ${(e as Error).message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CHIPS — Desasignación masiva
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/chips/bulk-unassign", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { iccids } = await c.req.json();
    if (!Array.isArray(iccids) || iccids.length === 0) return c.json({ error: "Lista de ICCIDs requerida" }, 400);

    let ok = 0;
    await Promise.allSettled(
      iccids.map(async (iccid: string) => {
        try {
          const chip = await kv.get(`chip:${iccid}`);
          if (chip) {
            await kv.set(`chip:${iccid}`, { ...chip, clientId: null, clientName: null, assignedAt: null });
            ok++;
          }
        } catch (_) {}
      })
    );

    await logActivity("bulk_unassign", `${ok} SIMs desasignadas`, { count: ok, userId: session.userId });
    return c.json({ unassigned: ok });
  } catch (e) {
    return c.json({ error: `Error en desasignación masiva: ${(e as Error).message}` }, 500);
  }
});

app.delete("/make-server-ef736a01/chips/:iccid", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await kv.del(`chip:${c.req.param("iccid")}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENTS
// ───────────────────────────────────────────────
app.get("/make-server-ef736a01/clients", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const clients = await kv.getByPrefix("client:");
    return c.json({ clients });
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

app.post("/make-server-ef736a01/clients", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { name, email, company, phone, notes } = await c.req.json();
    if (!name || !email) return c.json({ error: "Nombre y email requeridos" }, 400);
    const normalEmail = email.trim().toLowerCase();
    const id = `clt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const client = { id, name: name.trim(), email: normalEmail, company: company?.trim() || "", phone: phone?.trim() || "", notes: notes?.trim() || "", createdAt: new Date().toISOString(), createdBy: session.userId };
    await kv.set(`client:${id}`, client);
    await logActivity("client_created", `Nuevo cliente: ${name.trim()} (${normalEmail})`, { clientId: id, userId: session.userId });
    return c.json({ client });
  } catch (e: any) {
    return c.json({ error: `Error creando cliente: ${e.message}` }, 500);
  }
});

app.patch("/make-server-ef736a01/clients/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const existing = await kv.get(`client:${id}`);
    if (!existing) return c.json({ error: "Cliente no encontrado" }, 404);
    const updates = await c.req.json();
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`client:${id}`, updated);
    return c.json({ client: updated });
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

app.delete("/make-server-ef736a01/clients/:id", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const clientId = c.req.param("id");

    // 1. Obtener el registro del cliente (necesitamos el email para limpiar portal-auth)
    const client = await kv.get(`client:${clientId}`);

    // 2. Desvincular todos los chips asignados a este cliente
    const allChips = await kv.getByPrefix("chip:");
    const assigned = allChips.filter((chip: any) => chip.clientId === clientId);

    if (assigned.length > 0) {
      await Promise.allSettled(
        assigned.map((chip: any) =>
          kv.set(`chip:${chip.iccid}`, {
            ...chip,
            clientId: null,
            clientName: null,
            assignedAt: null,
          })
        )
      );
      console.log(`delete client ${clientId}: desvinculados ${assigned.length} chip(s)`);
    }

    // 3. Eliminar registros de portal-auth (clave por ID y fallback por email)
    await kv.del(`portal-auth:${clientId}`);
    if (client?.email) {
      await kv.del(`client-auth:${client.email.trim().toLowerCase()}`);
    }

    // 4. Eliminar el cliente del KV
    await kv.del(`client:${clientId}`);

    await logActivity(
      "client_deleted",
      `Cliente eliminado${client?.name ? `: ${client.name}` : ""}. Chips desvinculados: ${assigned.length}`,
      { clientId, chipsUnlinked: assigned.length, userId: session.userId }
    );

    return c.json({ success: true, chipsUnlinked: assigned.length });
  } catch (e: any) {
    return c.json({ error: `Error eliminando cliente: ${e.message}` }, 500);
  }
});

// ─────────��────────────────────────────────────
// CLIENT PORTAL — Set portal password (admin only)
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/clients/:id/set-portal-password", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (session.role === "client") return c.json({ error: "Forbidden" }, 403);

    const clientId = c.req.param("id");
    const { password } = await c.req.json();
    if (!password || password.length < 6)
      return c.json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

    const client = await kv.get(`client:${clientId}`);
    if (!client) return c.json({ error: "Cliente no encontrado" }, 404);

    const normalEmail = client.email.trim().toLowerCase();
    const hashed = await hashPassword(password);

    const authRecord = {
      clientId: client.id,
      email: normalEmail,
      name: client.name,
      passwordHash: hashed,
      portalEnabled: true,
      updatedAt: new Date().toISOString(),
    };

    // Primary key: clientId-based (safe — no @ or . in key)
    await kv.set(`portal-auth:${clientId}`, authRecord);
    // Secondary key: email-based (legacy fallback)
    await kv.set(`client-auth:${normalEmail}`, authRecord);

    // Ensure client record reflects enabled state and normalized email
    await kv.set(`client:${clientId}`, {
      ...client,
      email: normalEmail,
      portalEnabled: true,
      updatedAt: new Date().toISOString(),
    });

    console.log(`set-portal-password: OK para ${normalEmail} (clientId=${clientId})`);
    await logActivity("client_portal_enabled", `Portal habilitado para ${client.name} (${normalEmail})`, { clientId, userId: session.userId });

    return c.json({ success: true, email: normalEmail, clientId });
  } catch (e: any) {
    console.log("Error setting portal password:", e);
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Check access (admin diagnostic)
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/clients/:id/portal-status", async (c) => {
  try {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const clientId = c.req.param("id");
    const client = await kv.get(`client:${clientId}`);
    if (!client) return c.json({ error: "Cliente no encontrado" }, 404);
    const normalEmail = client.email.trim().toLowerCase();

    const authById    = await kv.get(`portal-auth:${clientId}`);
    const authByEmail = await kv.get(`client-auth:${normalEmail}`);
    const clientAuth  = authById || authByEmail;

    return c.json({
      clientId,
      email: normalEmail,
      portalEnabled: !!clientAuth?.portalEnabled,
      hasPassword: !!clientAuth?.passwordHash,
      updatedAt: clientAuth?.updatedAt || null,
      keyFound: authById ? "portal-auth:clientId" : authByEmail ? "client-auth:email" : "none",
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Login
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/auth/client-login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email y contraseña requeridos" }, 400);

    const normalEmail = email.trim().toLowerCase();
    console.log(`client-login: email="${normalEmail}"`);

    // ── Step 1: find client record by email ──────────────────────────────────
    const allClients  = await kv.getByPrefix("client:");
    const realClients = allClients.filter((cl: any) => cl.id && cl.email);
    const matchingClient = realClients.find(
      (cl: any) => (cl.email || "").trim().toLowerCase() === normalEmail
    );
    console.log(`client-login: cliente encontrado=${!!matchingClient}`);

    if (!matchingClient) {
      return c.json({ error: "No existe una cuenta con ese correo. Verifica o contacta al administrador." }, 401);
    }

    // ── Step 2: load auth record — clientId key (primary) then email key ─────
    const cid         = matchingClient.id;
    const authById    = await kv.get(`portal-auth:${cid}`);
    const authByEmail = await kv.get(`client-auth:${normalEmail}`);
    const clientAuth  = authById || authByEmail;
    console.log(`client-login: authById=${!!authById} authByEmail=${!!authByEmail} portalEnabled=${clientAuth?.portalEnabled}`);

    if (!clientAuth) {
      return c.json({ error: "El administrador aún no ha configurado el acceso al portal para esta cuenta." }, 401);
    }
    if (!clientAuth.portalEnabled) {
      return c.json({ error: "El acceso al portal no está habilitado. Contacta al administrador." }, 401);
    }

    // ── Step 3: verify password ───────────────────────────────────────────────
    const hashed = await hashPassword(password);
    const match  = hashed === clientAuth.passwordHash;
    console.log(`client-login: hash match=${match}`);
    if (!match) {
      return c.json({ error: "Contraseña incorrecta." }, 401);
    }

    // ── Step 4: create session ────────────────────────────────────────────────
    const sessionId = `csess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const sessionData = {
      sessionId,
      userId: cid,
      clientId: cid,
      email: normalEmail,
      name: clientAuth.name || matchingClient.name,
      role: "client",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };
    await kv.set(`session:${sessionId}`, sessionData);
    await logActivity("client_login", `Cliente ${normalEmail} inició sesión`, { clientId: cid });

    return c.json({
      sessionId,
      user: { id: cid, email: normalEmail, name: sessionData.name, role: "client" },
    });
  } catch (e: any) {
    console.log("Client login error:", e);
    return c.json({ error: `Error de autenticación: ${e.message}` }, 500);
  }
});

// Helper: require client session
async function requireClientSession(c: any): Promise<any | null> {
  const session = await requireAuth(c);
  return session && session.role === "client" ? session : null;
}

// ────────────────────────────────────────────────
// CLIENT PORTAL — Get my SIMs (with emnify data)
// ────────────────────────────────────���───────────
app.get("/make-server-ef736a01/client/sims", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const allChips = await kv.getByPrefix("chip:");
    const myChips = allChips.filter((chip: any) => chip.clientId === session.clientId);

    // Phase 1: only basic SIM data — no stats, no connectivity, no extra endpoint calls.
    // Connectivity is loaded separately via GET /client/sims/connectivity.
    // Batch size 8 matches emnify's safe concurrency limit (proven not to 429).
    const BATCH_SIZE = 8;
    const results: PromiseSettledResult<any>[] = [];
    for (let i = 0; i < myChips.length; i += BATCH_SIZE) {
      const batch = myChips.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (chip: any) => {
          try {
            // Build ICCID variants: handle both 19-digit (no Luhn) and 20-digit (with Luhn) stored in KV
            const raw = chip.iccid || "";
            const v19 = raw.length >= 20 ? raw.slice(0, 19) : raw;           // strip Luhn if already 20-digit
            const v20 = raw.length >= 20 ? raw : addLuhnDigit(raw);           // add Luhn if 19-digit
            const iccidVariants = [...new Set([raw, v19, v20].filter(Boolean))];

            let sim: any = null;

            // Fast path: if we have a cached endpointId, fetch the endpoint directly (avoids ICCID mismatch)
            if (chip.endpointId) {
              try {
                const { data: ep } = await emnifyFetch(`/endpoint/${chip.endpointId}`);
                if (ep?.id) {
                  const simStatus = ep.sim?.status ?? { id: 0, description: "Unknown" };
                  const endpointName = chip.customName || ep.name || null;
                  return {
                    iccid: chip.iccid,
                    iccid_with_luhn: v20,
                    simId: ep.sim?.id ?? null,
                    status: simStatus,
                    endpoint: { ...ep, name: endpointName },
                    endpointId: ep.id,
                    imsi: ep.sim?.imsi ?? null,
                    imei: ep.imei ? String(ep.imei) : null,
                    usage: null, connectivity: null, rat_type: null,
                    localData: chip,
                  };
                }
              } catch (_) {}
            }

            for (const iccidQuery of iccidVariants) {
              const { data: simData } = await emnifyFetch(
                `/sim?q=iccid:${encodeURIComponent(iccidQuery)}&page=1&per_page=5`
              );
              const sims: any[] = Array.isArray(simData) ? simData : (simData?.items || []);
              sim = sims.find((s: any) => iccidVariants.includes(s.iccid)) ?? sims[0] ?? null;
              if (sim) break;
            }

            // Persist endpointId in KV so the connectivity endpoint can use it without re-querying
            if (sim?.endpoint?.id && chip.endpointId !== sim.endpoint.id) {
              kv.set(`chip:${chip.iccid}`, { ...chip, endpointId: sim.endpoint.id }).catch(() => {});
            }

            // imei and imei_with_luhn are already embedded in sim.endpoint from emnify's SIM list
            const endpointName = chip.customName || sim?.endpoint?.name || null;
            const endpoint = sim?.endpoint ? { ...sim.endpoint, name: endpointName } : null;

            return {
              iccid: chip.iccid,
              iccid_with_luhn: sim?.iccid_with_luhn || addLuhnDigit(chip.iccid),
              simId: sim?.id ?? null,
              status: sim?.status ?? { id: 0, description: "Unknown" },
              endpoint,
              endpointId: sim?.endpoint?.id ?? null,
              imsi: sim?.imsi ?? null,
              imei: sim?.endpoint?.imei ? String(sim.endpoint.imei) : null,
              usage: null,
              connectivity: null,
              rat_type: null,
              localData: chip,
            };
          } catch (e: any) {
            return {
              iccid: chip.iccid, iccid_with_luhn: addLuhnDigit(chip.iccid),
              simId: null, status: { id: 0, description: "Error" },
              endpoint: null, endpointId: null, usage: null, localData: chip,
            };
          }
        })
      );
      results.push(...batchResults);
      // Small pause between batches to avoid emnify rate limiting
      if (i + BATCH_SIZE < myChips.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    const sims = results.map((r: any) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
    return c.json({ sims });
  } catch (e: any) {
    console.log("Client sims error:", e);
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Connectivity (Phase 2 lazy-load)
// GET /client/sims/connectivity
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/client/sims/connectivity", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const allChips = await kv.getByPrefix("chip:");
    const myChips = allChips.filter(
      (chip: any) => chip.clientId === session.clientId && chip.endpointId
    );

    const BATCH_SIZE = 20;
    const connectivity: Record<string, any> = {};

    for (let i = 0; i < myChips.length; i += BATCH_SIZE) {
      const batch = myChips.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (chip: any) => {
          try {
            const { data: conn } = await emnifyFetch(
              `/endpoint/${chip.endpointId}/connectivity`, {}, EMNIFY_BASE
            );
            if (conn) {
              connectivity[String(chip.endpointId)] = conn;
            }
          } catch (e: any) {
            console.log(`connectivity error endpoint ${chip.endpointId}:`, e.message);
          }
        })
      );
    }

    return c.json({ connectivity });
  } catch (e: any) {
    console.log("Client connectivity error:", e);
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Change SIM status (activate/suspend)
// ────────────────────────────────────────────────
app.patch("/make-server-ef736a01/client/sims/:simId/status", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const simId = c.req.param("simId");
    const { statusId, iccid } = await c.req.json();

    const chip = await kv.get(`chip:${iccid}`);
    if (!chip || chip.clientId !== session.clientId)
      return c.json({ error: "SIM no autorizada" }, 403);

    await emnifyFetch(`/sim/${simId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: { id: statusId } }),
    });

    const action = statusId === 1 ? "activó" : "suspendió";
    await logActivity("client_sim_status", `Cliente ${session.email} ${action} SIM ${iccid}`, {
      clientId: session.clientId, iccid, statusId,
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Client sim status error:", e);
    return c.json({ error: `Error actualizando SIM: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Send SMS to device (MT)
// ────��───────��───────────────────────────────────
app.post("/make-server-ef736a01/client/sims/:endpointId/sms", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const { message, iccid } = await c.req.json();

    if (!message || message.trim().length === 0)
      return c.json({ error: "El mensaje no puede estar vacío" }, 400);
    if (message.length > 160)
      return c.json({ error: "El mensaje no puede superar 160 caracteres" }, 400);

    if (iccid) {
      const chip = await kv.get(`chip:${iccid}`);
      if (!chip || chip.clientId !== session.clientId)
        return c.json({ error: "SIM no autorizada" }, 403);
    }

    await emnifyFetch(`/endpoint/${endpointId}/sms`, {
      method: "POST",
      body: JSON.stringify({ source_address: "IoTPortal", payload: message }),
    });

    await logActivity("client_sms_sent", `SMS enviado por ${session.email} a SIM ${iccid}`, {
      clientId: session.clientId, iccid, endpointId,
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Client SMS error:", e);
    return c.json({ error: `Error enviando SMS: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Get SIM detailed usage
// ───────────────────��────────────────────────────
app.get("/make-server-ef736a01/client/sims/:endpointId/usage", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const iccid = c.req.query("iccid");

    if (iccid) {
      const chip = await kv.get(`chip:${iccid}`);
      if (!chip || chip.clientId !== session.clientId)
        return c.json({ error: "SIM no autorizada" }, 403);
    }

    const { data: stats } = await emnifyFetch(`/endpoint/${endpointId}/stats`);
    let connectivity: any = null;
    try {
      const { data: conn } = await emnifyFetch(`/endpoint/${endpointId}/connectivity`);
      connectivity = conn;
    } catch (_) {}

    return c.json({ stats, connectivity });
  } catch (e: any) {
    return c.json({ error: `Error obteniendo consumo: ${e.message}` }, 500);
  }
});

// ─────────────────────����──────────────────────────
// CLIENT PORTAL — Get device events (with ownership check)
// GET /client/devices/:endpointId/events?page=1&per_page=5
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/client/devices/:endpointId/events", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const page    = Math.max(1, parseInt(c.req.query("page")     || "1", 10));
    const perPage = Math.min(parseInt(c.req.query("per_page") || "5", 10), 50);

    // Find SIM ID for this endpoint and verify ownership
    let simId: string | null = null;
    try {
      const { data: ep } = await emnifyFetch(`/endpoint/${endpointId}`);
      simId = ep?.sim?.id ? String(ep.sim.id) : null;
      // Ownership: verify endpoint belongs to this client via iccid
      const iccid = ep?.sim?.iccid;
      if (iccid) {
        const chip = await kv.get(`chip:${iccid}`) || await kv.get(`chip:${addLuhnDigit(iccid)}`);
        if (!chip || chip.clientId !== session.clientId) {
          return c.json({ error: "Dispositivo no autorizado" }, 403);
        }
      }
    } catch (_) {}

    if (!simId) return c.json({ items: [], total_count: 0, page, per_page: perPage });

    const { data, totalCount } = await emnifyFetch(
      `/sim/${simId}/event?page=${page}&per_page=${perPage}`
    );
    const events: any[] = Array.isArray(data) ? data : [];
    return c.json({ items: events, total_count: totalCount ?? events.length, page, per_page: perPage });
  } catch (e: any) {
    return c.json({ error: `Error obteniendo eventos: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Get device daily stats (with ownership check)
// GET /client/devices/:endpointId/stats?period=week
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/client/devices/:endpointId/stats", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const period     = c.req.query("period") || "week";

    // Verify ownership
    try {
      const { data: ep } = await emnifyFetch(`/endpoint/${endpointId}`);
      const iccid = ep?.sim?.iccid;
      if (iccid) {
        const chip = await kv.get(`chip:${iccid}`) || await kv.get(`chip:${addLuhnDigit(iccid)}`);
        if (!chip || chip.clientId !== session.clientId) {
          return c.json({ error: "Dispositivo no autorizado" }, 403);
        }
      }
    } catch (_) {}

    const now = new Date();
    const y = now.getUTCFullYear(), mo = now.getUTCMonth(), dd = now.getUTCDate();
    let fromStr: string;
    let toStr: string = new Date(Date.UTC(y, mo, dd)).toISOString().slice(0, 10);

    if (period === "week") {
      fromStr = new Date(Date.UTC(y, mo, dd - 6)).toISOString().slice(0, 10);
    } else if (period === "last_week") {
      const dow = now.getUTCDay();
      const lastSun = dd - (dow === 0 ? 7 : dow);
      toStr   = new Date(Date.UTC(y, mo, lastSun)).toISOString().slice(0, 10);
      fromStr = new Date(Date.UTC(y, mo, lastSun - 6)).toISOString().slice(0, 10);
    } else if (period === "month") {
      fromStr = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
    } else if (period === "last_month") {
      toStr   = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      fromStr = new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10);
    } else {
      fromStr = new Date(Date.UTC(y, mo, dd - 6)).toISOString().slice(0, 10);
    }

    const { data: rawData } = await emnifyFetch(
      `/endpoint/${endpointId}/stats/daily?from=${fromStr}&to=${toStr}`
    );
    const rows: any[] = Array.isArray(rawData) ? rawData : [];
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const dailyRows = rows.filter((r: any) => dateRe.test(r.date || r.day || ""));
    const num = (v: any): number => {
      if (v === null || v === undefined) return NaN;
      const n = typeof v === "string" ? parseFloat(v) : Number(v);
      return isFinite(n) ? n : NaN;
    };
    const pick = (...candidates: any[]): number => {
      for (const cand of candidates) { const n = num(cand); if (!isNaN(n)) return n; }
      return 0;
    };
    const normalized = dailyRows.map((r: any) => ({
      date:      r.date || r.day || "",
      volume_tx: pick(r.data?.volume_tx, r.volume_tx, r.tx),
      volume_rx: pick(r.data?.volume_rx, r.volume_rx, r.rx),
      sms_mt:    pick(r.sms?.volume_rx, r.sms_mt, 0),
      sms_mo:    pick(r.sms?.volume_tx, r.sms_mo, 0),
    }));
    normalized.sort((a: any, b: any) => (a.date > b.date ? -1 : 1));

    return c.json({ items: normalized, period, from: fromStr, to: toStr });
  } catch (e: any) {
    return c.json({ error: `Error obteniendo estadísticas: ${e.message}` }, 500);
  }
});

// ─────────────────────────���──────────────────────
// CLIENT PORTAL — Get endpoint detail
// GET /client/devices/:endpointId
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/client/devices/:endpointId", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const { data: ep } = await emnifyFetch(`/endpoint/${endpointId}`);

    // Verify ownership
    const iccid = ep?.sim?.iccid;
    if (iccid) {
      const chip = await kv.get(`chip:${iccid}`) || await kv.get(`chip:${addLuhnDigit(iccid)}`);
      if (!chip || chip.clientId !== session.clientId) {
        return c.json({ error: "Dispositivo no autorizado" }, 403);
      }
    }
    return c.json(ep);
  } catch (e: any) {
    return c.json({ error: `Error: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Get SMS history for a device
// GET /client/devices/:endpointId/sms?page=1&per_page=50
// ────────────────────────────────────────────────
app.get("/make-server-ef736a01/client/devices/:endpointId/sms", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const page    = Math.max(1, parseInt(c.req.query("page")     || "1",  10));
    const perPage = Math.min(parseInt(c.req.query("per_page") || "50", 10), 100);

    // Verify ownership via endpoint → iccid → chip KV
    try {
      const { data: ep } = await emnifyFetch(`/endpoint/${endpointId}`);
      const iccid = ep?.sim?.iccid;
      if (iccid) {
        const chip = await kv.get(`chip:${iccid}`) || await kv.get(`chip:${addLuhnDigit(iccid)}`);
        if (!chip || chip.clientId !== session.clientId) {
          return c.json({ error: "Dispositivo no autorizado" }, 403);
        }
      }
    } catch (_) {}

    const { data } = await emnifyFetch(`/endpoint/${endpointId}/sms?page=${page}&per_page=${perPage}`);
    const messages: any[] = Array.isArray(data) ? data : (data?.items ?? []);
    return c.json({ messages });
  } catch (e: any) {
    return c.json({ error: `Error obteniendo SMS: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Reset device connectivity
// POST /client/devices/:endpointId/reset-connectivity
// ────────────────────────────────────────────────
app.post("/make-server-ef736a01/client/devices/:endpointId/reset-connectivity", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");

    // Verify ownership
    try {
      const { data: ep } = await emnifyFetch(`/endpoint/${endpointId}`);
      const iccid = ep?.sim?.iccid;
      if (iccid) {
        const chip = await kv.get(`chip:${iccid}`) || await kv.get(`chip:${addLuhnDigit(iccid)}`);
        if (!chip || chip.clientId !== session.clientId) {
          return c.json({ error: "Dispositivo no autorizado" }, 403);
        }
      }
    } catch (_) {}

    await emnifyFetch(`/endpoint/${endpointId}`, {
      method: "PATCH",
      body: JSON.stringify({ connectivity: { status: { id: 0 } } }),
    }, EMNIFY_PORTAL_BASE);

    await logActivity("client_reset_connectivity", `Cliente ${session.email} restableció conexión del dispositivo ${endpointId}`, {
      clientId: session.clientId, endpointId,
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Client reset connectivity error:", e);
    return c.json({ error: `Error restableciendo conexión: ${e.message}` }, 500);
  }
});

// ────────────────────────────────────────────────
// CLIENT PORTAL — Rename device (endpoint name)
// PATCH /client/devices/:endpointId/name
// ────────────────────────────────────────────────
app.patch("/make-server-ef736a01/client/devices/:endpointId/name", async (c) => {
  try {
    const session = await requireClientSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const endpointId = c.req.param("endpointId");
    const { name } = await c.req.json();

    if (!name || name.trim().length === 0)
      return c.json({ error: "El nombre no puede estar vacío" }, 400);
    if (name.trim().length > 100)
      return c.json({ error: "El nombre no puede superar 100 caracteres" }, 400);

    // Verify ownership and capture chip ICCID for later KV update
    let chipIccid: string | null = null;
    try {
      const { data: ep } = await emnifyFetch(`/endpoint/${endpointId}`);
      const iccid = ep?.sim?.iccid;
      if (iccid) {
        const chip = await kv.get(`chip:${iccid}`) || await kv.get(`chip:${addLuhnDigit(iccid)}`);
        if (!chip || chip.clientId !== session.clientId) {
          return c.json({ error: "Dispositivo no autorizado" }, 403);
        }
        chipIccid = chip.iccid;
      }
    } catch (_) {}

    await emnifyFetch(`/endpoint/${endpointId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    }, EMNIFY_PORTAL_BASE);

    // Cache the new name in KV so CDN cache misses don't revert it on next load
    if (chipIccid) {
      try {
        const chip = await kv.get(`chip:${chipIccid}`);
        if (chip) await kv.set(`chip:${chipIccid}`, { ...chip, customName: name.trim() });
      } catch (_) {}
    }

    await logActivity("client_rename_device", `Cliente ${session.email} renombró dispositivo ${endpointId} a "${name.trim()}"`, {
      clientId: session.clientId, endpointId, name: name.trim(),
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.log("Client rename device error:", e);
    return c.json({ error: `Error renombrando dispositivo: ${e.message}` }, 500);
  }
});

Deno.serve(app.fetch);