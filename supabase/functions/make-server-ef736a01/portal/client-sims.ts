/* Filtro, búsqueda, orden, conteos y paginación de las SIMs del portal del
   cliente. Función pura (sin Deno ni emnify): el edge la importa como
   "./portal/client-sims.ts" y Vitest la prueba directamente. */

export type ClientSimRow = {
  iccid: string;
  iccid_with_luhn?: string | null;
  status?: { id?: number } | null;
  endpoint?: { name?: string | null } | null;
  endpointId?: number | string | null;
  imei?: string | null;
  imsi?: string | null;
  [k: string]: unknown;
};

export type ClientSimsOptions = {
  view: "devices" | "sims";
  status: number | null;
  q: string;
  sort: string;
  dir: 1 | -1;
  page: number;
  perPage: number;
  all: boolean;
};

export type ClientSimsCounts = {
  total: number;
  devices: number;
  status: Record<number, number>;
};

/** ICCID sin dígito de control: emnify guarda 19 dígitos, el KV puede tener 20. */
export const iccid19 = (v: unknown): string => {
  const raw = String(v ?? "").trim();
  return raw.length >= 20 ? raw.slice(0, 19) : raw;
};

const nameOf = (r: ClientSimRow) => String(r.endpoint?.name || "").toLowerCase();

export function queryClientSims(
  rows: ClientSimRow[],
  opts: ClientSimsOptions,
  normalizeImei: (raw: string | null | undefined) => string = (v) => String(v ?? ""),
): { sims: ClientSimRow[]; total: number; counts: ClientSimsCounts } {
  // Conteos sobre TODAS las SIMs del cliente (las tarjetas del portal)
  const counts: ClientSimsCounts = {
    total: rows.length,
    devices: rows.filter((r) => r.endpointId != null && r.endpointId !== "").length,
    status: { 0: 0, 1: 0, 2: 0, 3: 0 },
  };
  for (const r of rows) {
    const id = r.status?.id ?? 0;
    if (id in counts.status) counts.status[id]++;
  }

  let filtered = rows.filter((r) => {
    if (opts.view === "devices" && (r.endpointId == null || r.endpointId === "")) return false;
    if (opts.status !== null && (r.status?.id ?? 0) !== opts.status) return false;
    return true;
  });

  const q = opts.q.trim().toLowerCase();
  if (q) {
    // Relevancia: coincidencia exacta > empieza con > contiene
    const scored = filtered.map((r) => {
      const fields = [
        nameOf(r),
        String(r.iccid || "").toLowerCase(),
        String(r.iccid_with_luhn || "").toLowerCase(),
        String(r.imei || ""),
        normalizeImei(r.imei),
      ].filter(Boolean);
      const score = fields.some((f) => f === q) ? 100
        : fields.some((f) => f.startsWith(q)) ? 50
        : fields.some((f) => f.includes(q)) ? 10 : 0;
      return { r, score };
    }).filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score || nameOf(a.r).localeCompare(nameOf(b.r), "es"));
    filtered = scored.map((x) => x.r);
  } else {
    const key = (r: ClientSimRow): string | number => {
      switch (opts.sort) {
        case "status": return r.status?.id ?? 0;
        case "iccid":  return String(r.iccid_with_luhn || r.iccid || "");
        case "imei":   return normalizeImei(r.imei);
        case "imsi":   return String(r.imsi || "");
        default:       return nameOf(r);
      }
    };
    filtered = [...filtered].sort((a, b) => {
      const ka = key(a), kb = key(b);
      const cmp = typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb), "es");
      // Desempate estable por ICCID para que las páginas no se repitan
      return cmp * opts.dir || String(a.iccid).localeCompare(String(b.iccid));
    });
  }

  const total = filtered.length;
  const sims = opts.all
    ? filtered.slice(0, 5000)
    : filtered.slice((opts.page - 1) * opts.perPage, opts.page * opts.perPage);
  return { sims, total, counts };
}
