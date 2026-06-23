import { useEffect, useState, useCallback, useRef, Fragment, useMemo } from "react";
import {
  Search, Plus, RefreshCw, X, Loader2,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  PauseCircle, Circle, CreditCard, Wifi, WifiOff,
  ChevronDown, ChevronUp, Filter, AlertCircle, Download,
  UserCheck, Users, Link2, ChevronsUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────
interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
}

interface SIM {
  id?: number;
  iccid: string;
  iccid_with_luhn?: string;
  imsi?: string;
  msisdn?: string;
  status?: { id: number; description: string };
  endpoint?: { id: number; name: string } | null;
  sim_type?: { id: number; name: string };
  model?: { id: number; name: string };
  form_factor?: string;
  volume_tx?: number;
  volume_rx?: number;
  localData?: { clientId?: string; clientName?: string; assignedAt?: string } | null;
  [key: string]: any;
}

// ── Status config ─────────────────────────────────────────────────
const STATUS_CFG: Record<number, { label: string; color: string; icon: React.FC<any> }> = {
  0: { label: "Emitida",      color: "#94a3b8", icon: Circle },
  1: { label: "Activada",     color: "#22c55e", icon: CheckCircle2 },
  2: { label: "Suspendida",   color: "#f59e0b", icon: PauseCircle },
  3: { label: "Desactivada",  color: "#ef4444", icon: XCircle },
  5: { label: "Modo Prueba",  color: "#8b5cf6", icon: AlertCircle },
};

// Status filter options shown as pills
const STATUS_FILTERS = [
  { id: null,  label: "Todos" },
  { id: 0,     label: "Emitida" },
  { id: 1,     label: "Activada" },
  { id: 2,     label: "Suspendida" },
  { id: 5,     label: "Modo Prueba" },
];

function StatusBadge({ statusId }: { statusId: number }) {
  const cfg = STATUS_CFG[statusId] ?? STATUS_CFG[0];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: cfg.color }}>
      <Icon className="w-4 h-4" />
      {cfg.label}
    </span>
  );
}

function formatBytes(b?: number) {
  if (!b || b === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// fmtMB: format a decimal-MB value exactly like the emnify portal
// emnify uses SI/decimal: 1 MB = 1 000 KB, 1 KB = 1 000 B
function fmtMB(mb?: number): string {
  if (mb === null || mb === undefined || mb === 0 || isNaN(mb)) return "0 KB";
  const bytes = mb * 1_000_000;          // decimal bytes
  if (bytes < 1_000)       return `${bytes.toFixed(0)} B`;
  if (bytes < 1_000_000)   return `${(bytes / 1_000).toFixed(3)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(3)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(3)} GB`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try {
    // Parse YYYY-MM-DD as LOCAL date (not UTC) to avoid timezone-shift:
    // new Date("2026-05-07") = UTC midnight → in UTC-6 = May 6 at 18:00 → shows "6 mayo" ❌
    // new Date(2026, 4, 7)   = local midnight → always shows "7 mayo" ✅
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return iso; }
}

function fmtDateShort(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// ── Events Tab ────────────────────────────────────────────────────
function EventsTab({ simId }: { simId: string | number }) {
  const [events,  setEvents]  = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const load = useCallback(async (p: number, pp: number) => {
    setLoading(true); setError("");
    try {
      const res = await api.getSimEvents(simId, p, pp);
      setEvents(res.items || []);
      setTotal(res.total_count || 0);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [simId]);

  useEffect(() => { load(1, perPage); }, [load, perPage]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const SEV_STYLE: Record<string, { bg: string; color: string }> = {
    informational: { bg: "rgba(59,130,246,0.10)", color: "#3b82f6" },
    info:          { bg: "rgba(59,130,246,0.10)", color: "#3b82f6" },
    warning:       { bg: "rgba(245,158,11,0.10)", color: "#f59e0b" },
    error:         { bg: "rgba(239,68,68,0.10)",  color: "#ef4444" },
    critical:      { bg: "rgba(239,68,68,0.12)",  color: "#dc2626" },
  };
  const getSev = (s: string) => SEV_STYLE[(s || "").toLowerCase()] || SEV_STYLE["info"];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-medium" style={{ color: "#6b6b80" }}>Actualización en tiempo real</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#3ECF8E" }} />
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && <span className="text-xs" style={{ color: "#adadb8" }}>{total.toLocaleString()} eventos</span>}
          <button onClick={() => load(page, perPage)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#f5f5f7", color: "#3ECF8E", border: "1px solid #e8e8ed" }}>
            <Download className="w-3 h-3" />Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {["Nombre del evento", "Fecha", "Severidad"].map((f) => (
          <button key={f} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", color: "#6b6b80" }}>
            {f}<ChevronDown className="w-3 h-3" />
          </button>
        ))}
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(62,207,142,0.10)", border: "1px solid rgba(62,207,142,0.25)", color: "#0d8f5c" }}>
          + Añadir filtro
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: "#fff1f2", color: "#e11d48" }}>
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      {!error && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e8e8ed" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e8e8ed" }}>
                {["Fecha", "Severidad", "Tipo de evento", "Operador"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider"
                    style={{ color: "#8e8ea0", fontSize: "10px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: perPage }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f5f7" }}>
                      {[140, 90, 160, 120].map((w, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded animate-pulse" style={{ background: "#f0f0f5", width: `${w}px` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : events.length === 0
                ? <tr><td colSpan={4} className="px-4 py-8 text-center text-xs" style={{ color: "#adadb8" }}>No se encontraron eventos</td></tr>
                : events.map((ev, i) => {
                    const sevName = ev.severity?.description || ev.severity?.name || "info";
                    const sStyle  = getSev(sevName);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f5f5f7" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fafafa"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                        <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: "#6b6b80" }}>
                          {fmtDateShort(ev.timestamp || ev.created_at || "")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: sStyle.bg, color: sStyle.color }}>
                            <AlertCircle className="w-2.5 h-2.5" />
                            {sevName.charAt(0).toUpperCase() + sevName.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "#1a1a1a" }}>
                          {ev.event_type?.description || ev.event_type?.name || ev.description || "—"}
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate" style={{ color: "#6b6b80" }}>
                          {ev.organisation?.name || ev.operator || "—"}
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs" style={{ color: "#adadb8" }}>
            Mostrando {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} de {total}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "#6b6b80" }}>Eventos por página</span>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="text-xs rounded-lg px-2 py-1 outline-none"
              style={{ background: "#f5f5f7", border: "1px solid #e8e8ed", color: "#1a1a1a" }}>
              {[5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => { const p = page - 1; setPage(p); load(p, perPage); }} disabled={page <= 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30"
                style={{ border: "1px solid #e8e8ed", background: "#fff" }}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => { setPage(p); load(p, perPage); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium"
                  style={{ background: p === page ? "#3ECF8E" : "#fff", color: p === page ? "#fff" : "#6b6b80",
                    border: `1px solid ${p === page ? "#3ECF8E" : "#e8e8ed"}`, fontWeight: p === page ? 700 : 400 }}>
                  {p}
                </button>
              ))}
              {totalPages > 7 && <>
                <span className="text-xs px-1" style={{ color: "#adadb8" }}>...</span>
                <button onClick={() => { setPage(totalPages); load(totalPages, perPage); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium"
                  style={{ background: page === totalPages ? "#3ECF8E" : "#fff", color: page === totalPages ? "#fff" : "#6b6b80", border: "1px solid #e8e8ed" }}>
                  {totalPages}
                </button>
              </>}
              <button onClick={() => { const p = page + 1; setPage(p); load(p, perPage); }} disabled={page >= totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30"
                style={{ border: "1px solid #e8e8ed", background: "#fff" }}>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Period options ─────────────────────────────────────────────────
type PeriodKey = "week" | "last_week" | "month" | "last_month" | "two_months";
const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "week",       label: "Esta semana"      },
  { value: "last_week",  label: "La semana pasada" },
  { value: "month",      label: "Este mes"         },
  { value: "last_month", label: "Último mes"       },
  { value: "two_months", label: "Últimos dos meses"},
];

// ── Stats Tab ─────────────────────────────��───────────────────────
function StatsTab({ sim }: { sim: any }) {
  const [rows,       setRows]       = useState<any[]>([]);
  const [period,     setPeriod]     = useState<PeriodKey>("week");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [debugPath,  setDebugPath]  = useState("");
  const [dropOpen,   setDropOpen]   = useState(false);

  const load = useCallback(async (p: PeriodKey) => {
    if (!sim.id) return;
    setLoading(true); setError("");
    try {
      const res = await api.getSimDailyStats(sim.id, sim.endpoint?.id, p);
      setRows(res.items || []);
      if (res._debug_path) setDebugPath(res._debug_path);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [sim.id, sim.endpoint?.id]);

  useEffect(() => { load("week"); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = () => setDropOpen(false);
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [dropOpen]);

  const totals = rows.reduce((acc, r) => ({
    volume_tx: acc.volume_tx + (r.volume_tx || 0),
    volume_rx: acc.volume_rx + (r.volume_rx || 0),
    sms_mt:    acc.sms_mt   + (r.sms_mt    || 0),
    sms_mo:    acc.sms_mo   + (r.sms_mo    || 0),
  }), { volume_tx: 0, volume_rx: 0, sms_mt: 0, sms_mo: 0 });

  const COLS = [
    { key: "date",      label: "FECHA (UTC)",  w: "140px" },
    { key: "volume_tx", label: "SUBIDA",        w: "130px" },
    { key: "volume_rx", label: "DESCARGA",      w: "130px" },
    { key: "total",     label: "TOTAL",         w: "130px" },
    { key: "sms_mt",    label: "SMS MT",        w: "100px" },
    { key: "sms_mo",    label: "SMS MO",        w: "100px" },
    { key: "sms_total", label: "TOTAL SMS",     w: "100px" },
  ];

  const cellVal = (r: any, key: string, bold = false) => {
    const s: React.CSSProperties = bold ? { fontWeight: 700 } : {};
    switch (key) {
      case "date":      return <span style={s}>{bold ? "Total" : fmtDate(r.date)}</span>;
      case "volume_tx": return <span style={s}>{fmtMB(r.volume_tx)}</span>;
      case "volume_rx": return <span style={s}>{fmtMB(r.volume_rx)}</span>;
      case "total":     return <span style={s}>{fmtMB((r.volume_tx || 0) + (r.volume_rx || 0))}</span>;
      case "sms_mt":    return <span style={s}>{r.sms_mt ?? 0}</span>;
      case "sms_mo":    return <span style={s}>{r.sms_mo ?? 0}</span>;
      case "sms_total": return <span style={s}>{(r.sms_mt ?? 0) + (r.sms_mo ?? 0)}</span>;
      default: return null;
    }
  };

  const selectedLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? "Esta semana";

  return (
    <div className="space-y-3">
      {/* ── Period picker ── */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs" style={{ color: "#6b6b80" }}>Filtrar por:</span>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          {/* Trigger */}
          <button
            onClick={() => setDropOpen(o => !o)}
            className="flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: "#fff",
              border: "1.5px solid #e8e8ed",
              color: "#1a1a1a",
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              minWidth: "180px",
            }}
          >
            <span className="flex-1 text-left">{selectedLabel}</span>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transition: "transform .2s", transform: dropOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M2 4L6 8L10 4" stroke="#6b6b80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Dropdown panel */}
          {dropOpen && (
            <div
              className="absolute right-0 mt-1 rounded-2xl overflow-hidden z-50"
              style={{
                background: "#fff",
                border: "1px solid #e8e8ed",
                boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
                minWidth: "220px",
                top: "calc(100% + 4px)",
              }}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setPeriod(opt.value); load(opt.value); setDropOpen(false); }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left transition-colors"
                  style={{
                    background: opt.value === period ? "#f5f5f7" : "transparent",
                    color: "#1a1a1a",
                    fontWeight: opt.value === period ? 500 : 400,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f5f5f7"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = opt.value === period ? "#f5f5f7" : "transparent"; }}
                >
                  {/* Checkmark — visible only for selected */}
                  <span className="w-5 flex items-center justify-center shrink-0">
                    {opt.value === period && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: "#fff1f2", color: "#e11d48" }}>
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #e8e8ed" }}>
        <table className="w-full text-xs" style={{ minWidth: "720px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e8e8ed" }}>
              {COLS.map((col) => (
                <th key={col.key} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "#8e8ea0", fontSize: "10px", width: col.w }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f5f5f7" }}>
                    {COLS.map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 rounded animate-pulse" style={{ background: "#f0f0f5", width: "60px" }} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0 && !error
              ? <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-xs" style={{ color: "#adadb8" }}>
                  Sin datos para este período
                  {debugPath && <div className="mt-1 font-mono opacity-60">{debugPath}</div>}
                </td></tr>
              : <>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f5f7" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fafafa"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                      {COLS.map((col) => (
                        <td key={col.key} className="px-4 py-3 whitespace-nowrap"
                          style={{ color: col.key === "date" ? "#1a1a1a" : "#6b6b80" }}>
                          {cellVal(r, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length > 0 && (
                    <tr style={{ borderTop: "2px solid #e8e8ed", background: "#f8fafc" }}>
                      {COLS.map((col) => (
                        <td key={col.key} className="px-4 py-3 whitespace-nowrap" style={{ color: "#1a1a1a" }}>
                          {cellVal(totals, col.key, true)}
                        </td>
                      ))}
                    </tr>
                  )}
                </>
            }
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────
type DetailTab = "detalles" | "events" | "estadisticas";

// ── SIM card SVG ─────────────────────────────────────────────────
function SimCardSvg() {
  return (
    <svg width="72" height="90" viewBox="0 0 72 90" fill="none" className="opacity-60">
      <rect x="1" y="1" width="70" height="88" rx="8" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5"/>
      <path d="M1 16 L16 1 H70 V89 H1 V16Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
      <rect x="18" y="28" width="36" height="28" rx="4" fill="#94a3b8"/>
      <rect x="22" y="32" width="28" height="20" rx="2" fill="#cbd5e1"/>
      <text x="36" y="46" textAnchor="middle" fontSize="5" fill="#475569" fontFamily="monospace">2FF</text>
      <text x="36" y="54" textAnchor="middle" fontSize="5" fill="#475569" fontFamily="monospace">3FF</text>
      <text x="36" y="62" textAnchor="middle" fontSize="5" fill="#475569" fontFamily="monospace">4FF</text>
    </svg>
  );
}

function DetailPanel({
  sim,
  onClose,
  onStatusChange,
  actionLoading,
}: {
  sim: SIM;
  onClose: () => void;
  onStatusChange: (sim: SIM, status: number) => void;
  actionLoading: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("detalles");

  const simTypeName = sim.sim_type?.name || sim.model?.name || sim.form_factor || sim["sim_type_name"] || "SIM estándar";
  const modelName   = sim.model?.name || sim["model_name"] || "Triple corte: Mini (2FF), Micro (3FF), Nano (4FF)";

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "detalles",     label: "Detalles" },
    { id: "events",       label: "Events" },
    { id: "estadisticas", label: "Estadísticas" },
  ];

  return (
    <tr>
      <td colSpan={8} className="p-0" style={{ background: "#fafafa", borderBottom: "1px solid #e8e8ed" }}>
        <div className="px-6 py-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <h3 className="text-sm font-bold" style={{ color: "#1a1a1a" }}>
                {sim.endpoint?.name || simTypeName}
              </h3>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#adadb8" }}>{sim.iccid}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {sim.status?.id === 1 && (
                <button onClick={() => onStatusChange(sim, 2)} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ color: "#d97706", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
                  Suspender
                </button>
              )}
              {sim.status?.id === 2 && (
                <button onClick={() => onStatusChange(sim, 1)} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ color: "#16a34a", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)" }}>
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                  Activar
                </button>
              )}
              <button onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: "#f5f5f7", color: "#adadb8" }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mb-5" style={{ borderBottom: "2px solid #f0f0f5" }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-[2px]"
                style={{
                  borderColor: tab === t.id ? "#3ECF8E" : "transparent",
                  color:       tab === t.id ? "#0d8f5c" : "#8e8ea0",
                  fontWeight:  tab === t.id ? 600 : 400,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Detalles ── */}
          {tab === "detalles" && (
            <div className="flex gap-6 flex-wrap lg:flex-nowrap">
              <div className="flex-1 grid grid-cols-2 gap-x-12 gap-y-4 min-w-0">
                {[
                  { label: "ICCID con Luhn",    value: displayIccid(sim) },
                  { label: "ID de SIM",          value: sim.id ?? "—" },
                  { label: "MSISDN",             value: sim.msisdn || "—" },
                  { label: "Dispositivo",        value: sim.endpoint?.name || "—", link: !!sim.endpoint?.name },
                  { label: "ID de dispositivo",  value: sim.endpoint?.id ?? "—" },
                  { label: "IMSI",               value: sim.imsi || "—" },
                  { label: "Tecnología",         value: simTypeName },
                  { label: "Factor de forma",    value: modelName },
                  { label: "Cliente asignado",   value: sim.localData?.clientName || "Sin asignar", highlight: !!sim.localData?.clientName },
                ].map(({ label, value, link, highlight }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "#c7c7cc" }}>{label}</p>
                    <p className={`text-xs font-mono break-all ${link ? "underline cursor-pointer" : ""}`}
                      style={{ color: link ? "#3b82f6" : highlight ? "#3ECF8E" : "#1a1a1a", fontWeight: highlight ? 600 : 400 }}>
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="shrink-0 w-48">
                <div className="rounded-xl p-4 flex flex-col items-center gap-3 shadow-sm"
                  style={{ background: "#fff", border: "1px solid #e8e8ed" }}>
                  <div className="flex items-center gap-1.5 text-xs font-medium self-start" style={{ color: "#6b6b80" }}>
                    <Wifi className="w-3.5 h-3.5" />Solo celular
                  </div>
                  <SimCardSvg />
                  <div className="text-xs space-y-0.5 self-start w-full" style={{ color: "#adadb8" }}>
                    <p className="font-medium mb-1" style={{ color: "#6b6b80" }}>Uso</p>
                    <p>• Mini (2FF)</p><p>• Micro (3FF)</p><p>• Nano (4FF)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Events ── */}
          {tab === "events" && <EventsTab simId={sim.id!} />}

          {/* ── Estadísticas ── */}
          {tab === "estadisticas" && <StatsTab sim={sim} />}
        </div>
      </td>
    </tr>
  );
}

// ── Register SIM Modal (BIC1 / BIC2) ─────────────────────────────
function AddSimModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode]     = useState<"choose" | "bic1" | "bic2">("choose");
  const [bic, setBic]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const reset = () => { setMode("choose"); setBic(""); setResult(null); };
  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;

  const handleBic1 = async () => {
    const code = bic.trim();
    if (!code) { toast.error("Introduce el código BIC1"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.registerSimBic1(code);
      const iccid = res.iccid ? `ICCID: ${res.iccid}` : "";
      setResult({ success: true, message: `SIM registrada correctamente.${iccid ? ` ${iccid}` : ""}` });
      onAdded();
    } catch (e: any) {
      setResult({ success: false, message: e.message });
    } finally { setLoading(false); }
  };

  const handleBic2 = async () => {
    const code = bic.trim();
    if (!code) { toast.error("Introduce el código BIC2"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.registerSimBic2(code);
      const cnt = res.count > 0 ? ` (${res.count} SIMs)` : "";
      setResult({ success: true, message: `Lote registrado correctamente.${cnt}` });
      onAdded();
    } catch (e: any) {
      const raw = e.message ?? "";
      // Detectar error de routing de emnify y dar mensaje accionable
      const isRouting = raw.includes("Cannot POST") || raw.includes("no reconoció el endpoint");
      const msg = isRouting
        ? "emnify no encontró el endpoint de registro en lote. Verifica que el código BIC2 sea correcto y que tu cuenta emnify tenga habilitado el registro por lote."
        : raw;
      setResult({ success: false, message: msg });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {mode !== "choose" && (
              <button onClick={() => { setMode("choose"); setBic(""); setResult(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1 shrink-0">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <div>
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                {mode === "choose" ? "Registrar SIM"
                  : mode === "bic1" ? "Registrar SIM Individual"
                  : "Registrar Lote de SIMs"}
              </h3>
              {mode === "choose" && (
                <p className="text-xs text-gray-400 mt-0.5">Selecciona el tipo de registro</p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Choose mode */}
        {mode === "choose" && (
          <div className="p-5 flex flex-col gap-3">
            <button onClick={() => setMode("bic1")}
              className="flex items-start gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-green-300 hover:bg-green-50/50 transition-all text-left group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform"
                style={{ background: "rgba(62,207,142,0.12)" }}>
                <CreditCard className="w-5 h-5" style={{ color: "#3ECF8E" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">SIM Individual</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">Registra una sola SIM usando su código <span className="font-mono font-semibold text-gray-700">BIC1</span> impreso en la tarjeta física.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-400 shrink-0 mt-1 transition-colors" />
            </button>

            <button onClick={() => setMode("bic2")}
              className="flex items-start gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-green-300 hover:bg-green-50/50 transition-all text-left group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform"
                style={{ background: "rgba(62,207,142,0.12)" }}>
                <Download className="w-5 h-5" style={{ color: "#3ECF8E" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Lote de SIMs</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">Registra todo un paquete de SIMs usando el código <span className="font-mono font-semibold text-gray-700">BIC2</span> del empaque (hasta 25 SIMs a la vez).</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-400 shrink-0 mt-1 transition-colors" />
            </button>

            <button onClick={handleClose} className="mt-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1">
              Cancelar
            </button>
          </div>
        )}

        {/* BIC1 / BIC2 form */}
        {(mode === "bic1" || mode === "bic2") && (
          <div className="p-5 flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                {mode === "bic1" ? "Código BIC1" : "Código BIC2"}
              </label>
              <input
                type="text"
                value={bic}
                onChange={(e) => { setBic(e.target.value); setResult(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { mode === "bic1" ? handleBic1() : handleBic2(); } }}
                placeholder={mode === "bic1" ? "Ej: ABC1-DEF2-GHI3-JKL4" : "Ej: 8CNU-7PKB-RXQ3-RG7Q"}
                autoFocus
                className="w-full px-4 py-3 text-sm font-mono rounded-xl border-2 border-gray-200 focus:outline-none focus:border-green-400 bg-gray-50 tracking-widest uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
              />
              <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                {mode === "bic1"
                  ? "El código BIC1 se encuentra impreso en la tarjeta SIM física."
                  : "El código BIC2 se encuentra en la etiqueta del empaque del lote de SIMs."}
              </p>
            </div>

            {/* Result banner */}
            {result && (
              <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-snug ${result.success ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {result.success
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-500" />
                  : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />}
                <span>{result.message}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1 text-sm">
                {result?.success ? "Cerrar" : "Cancelar"}
              </Button>
              {!result?.success && (
                <Button
                  onClick={mode === "bic1" ? handleBic1 : handleBic2}
                  disabled={loading || !bic.trim()}
                  className="flex-1 text-sm font-semibold text-black"
                  style={{ background: "#3ECF8E" }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                  Registrar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────
function displayIccid(sim: SIM) {
  return sim.iccid_with_luhn || sim.iccid;
}

// ── Mini Assign Client Modal ──────────────────────────────────────
function AssignClientModal({
  sim,
  clients,
  onConfirm,
  onClose,
}: {
  sim: SIM;
  clients: Client[];
  onConfirm: (clientId: string, clientName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [clientId, setClientId]     = useState("");
  const [clientName, setClientName] = useState("");
  const [loading, setLoading]       = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 100); }, []);

  const filteredClients = clients.filter(
    (c) =>
      !clientSearch ||
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.company || "").toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!clientId) { toast.error("Selecciona un cliente"); return; }
    setLoading(true);
    try {
      await onConfirm(clientId, clientName);
      onClose();
    } catch {
      // Error already shown via toast.error in handleAssignClient
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(62,207,142,0.12)" }}>
              <UserCheck className="w-5 h-5" style={{ color: "#3ECF8E" }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Asignar cliente</h3>
              <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[180px]">
                {displayIccid(sim)}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
        </div>

        {/* Client list */}
        <div className="overflow-y-auto px-3 pb-1" style={{ maxHeight: "240px" }}>
          {clients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No hay clientes registrados</p>
              <p className="text-xs text-gray-400 mt-1">Ve al módulo de Clientes para agregar uno</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <p className="text-center py-6 text-sm text-gray-400">Sin resultados</p>
          ) : (
            filteredClients.map((c) => {
              const isSelected = c.id === clientId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setClientId(c.id); setClientName(c.name); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-all"
                  style={{
                    background: isSelected ? "rgba(62,207,142,0.10)" : "transparent",
                    border: isSelected ? "1px solid rgba(62,207,142,0.3)" : "1px solid transparent",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: "rgba(62,207,142,0.18)", color: "#059669" }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.company || c.email}</p>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#3ECF8E" }} />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!clientId || loading || clients.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            style={{ background: "#3ECF8E", color: "#000" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {loading ? "Asignando…" : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default function InventoryPage() {
  const [sims, setSims] = useState<SIM[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [expandedIccid, setExpandedIccid] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [clients, setClients]     = useState<Client[]>([]);
  const [assignSim, setAssignSim] = useState<SIM | null>(null);

  const load = useCallback(async (p = 0, pp = perPage, q = "", sf: number | null = null) => {
    setLoading(true);
    try {
      const res = await api.getSims(p, pp, q, sf);
      setSims(res.items || []);
      setTotal(res.total_count || 0);
    } catch (e: any) {
      toast.error(`Error cargando SIMs: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [perPage]);

  useEffect(() => { load(0, perPage, "", null); }, [load]);

  // Load client list once (for the assign modal)
  useEffect(() => {
    api.getClients()
      .then((res: any) => setClients(res.clients || []))
      .catch(() => {});
  }, []);

  const handleAssignClient = async (clientId: string, clientName: string) => {
    if (!assignSim) return;
    try {
      await api.assignChip(assignSim.iccid, clientId, clientName);
      toast.success(`✓ SIM asignada a ${clientName}`);
      // Reload from server to guarantee KV data is fresh
      await load(page, search);
    } catch (e: any) {
      toast.error(`Error al asignar: ${e.message}`);
      throw e; // Re-throw so the modal shows it failed
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setExpandedIccid(null);
    load(0, perPage, search, statusFilter);
  };

  const handleClear = () => {
    setSearch("");
    setStatusFilter(null);
    setPage(0);
    setExpandedIccid(null);
    load(0, perPage, "", null);
  };

  const handleStatusPill = (sf: number | null) => {
    setStatusFilter(sf);
    setPage(0);
    setExpandedIccid(null);
    load(0, perPage, search, sf);
  };

  const goToPage = (p: number) => {
    setPage(p);
    setExpandedIccid(null);
    load(p, perPage, search, statusFilter);
  };

  const handlePerPageChange = (pp: number) => {
    setPerPage(pp);
    setPage(0);
    setExpandedIccid(null);
    load(0, pp, search, statusFilter);
  };

  const handleRowClick = (iccid: string) => {
    setExpandedIccid((prev) => (prev === iccid ? null : iccid));
  };

  const handleStatusChange = async (sim: SIM, targetStatus: number) => {
    if (!sim.id) { toast.error("SIM sin ID de emnify"); return; }
    setActionLoading(sim.iccid);
    try {
      await api.updateSimStatus(sim.id, targetStatus, sim.iccid);
      const label = targetStatus === 1 ? "activada" : "suspendida";
      toast.success(`SIM ${sim.iccid.slice(-8)} ${label}`);
      setSims((prev) =>
        prev.map((s) =>
          s.iccid === sim.iccid
            ? { ...s, status: { id: targetStatus, description: STATUS_CFG[targetStatus]?.label || "" } }
            : s
        )
      );
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  const visiblePages = () => {
    const pages: number[] = [];
    const start = Math.max(0, page - 2);
    const end   = Math.min(totalPages - 1, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedSims = useMemo(() => {
    if (!sortKey) return sims;
    return [...sims].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (sortKey === "iccid")    { aVal = a.iccid || ""; bVal = b.iccid || ""; }
      if (sortKey === "msisdn")   { aVal = a.msisdn || ""; bVal = b.msisdn || ""; }
      if (sortKey === "status")   { aVal = String(a.status?.id ?? 0); bVal = String(b.status?.id ?? 0); }
      if (sortKey === "endpoint") { aVal = a.endpoint?.name || ""; bVal = b.endpoint?.name || ""; }
      if (sortKey === "client")   { aVal = a.localData?.clientName || ""; bVal = b.localData?.clientName || ""; }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [sims, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 inline-block ml-0.5" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 inline-block ml-0.5" style={{ color: "#3ECF8E" }} />
      : <ArrowDown className="w-3 h-3 inline-block ml-0.5" style={{ color: "#3ECF8E" }} />;
  };

  const COLS: { label: string; key: string | null }[] = [
    { label: "ICCID",                key: "iccid" },
    { label: "MSISDN",               key: "msisdn" },
    { label: "Estado de la SIM",     key: "status" },
    { label: "Nombre del dispositivo", key: "endpoint" },
    { label: "Cliente asignado",     key: "client" },
    { label: "",                     key: null },
  ];

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-teal-500" />
            Inventario de SIM
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            SIMs emnify + inventario local · {total > 0 ? `${total.toLocaleString()} en total` : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => load(page, search)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: "#3ECF8E" }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar SIMs</span>
            <span className="sm:hidden">Agregar</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="space-y-2">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ICCID, MSISDN..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: "#3ECF8E" }}
          >
            Buscar
          </button>
          {(search || statusFilter !== null) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
            >
              Limpiar
            </button>
          )}
        </form>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Estado:
          </span>
          {STATUS_FILTERS.map((sf) => {
            const isActive = statusFilter === sf.id;
            const cfg = sf.id != null ? STATUS_CFG[sf.id] : null;
            return (
              <button
                key={String(sf.id)}
                type="button"
                onClick={() => handleStatusPill(sf.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all"
                style={{
                  background: isActive ? (cfg?.color ?? "#3ECF8E") + "20" : "white",
                  borderColor: isActive ? (cfg?.color ?? "#3ECF8E") : "#e5e7eb",
                  color: isActive ? (cfg?.color ?? "#059669") : "#6b7280",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {cfg && <cfg.icon className="w-3 h-3" />}
                {sf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MOBILE: Card list ─────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          : sims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <CreditCard className="w-12 h-12 text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">No se encontraron SIMs</p>
                <p className="text-sm text-gray-400 mt-1">
                  {search ? "Intenta con otro término de búsqueda" : "Verifica tu conexión con emnify"}
                </p>
              </div>
            )
          : sims.map((sim) => {
              const isExpanded = expandedIccid === sim.iccid;
              const statusId = sim.status?.id ?? 0;
              const cfg = STATUS_CFG[statusId] ?? STATUS_CFG[0];
              const StatusIcon = cfg.icon;
              const simTypeName = sim.sim_type?.name || sim.model?.name || sim.form_factor || "SIM estándar";

              return (
                <div key={sim.iccid} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Card header */}
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left"
                    onClick={() => handleRowClick(sim.iccid)}
                    style={{ background: isExpanded ? "#f0fdf4" : undefined }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${cfg.color}15` }}
                    >
                      <StatusIcon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-mono text-gray-800 truncate block">{displayIccid(sim)}</code>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                        {sim.endpoint?.name && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-blue-500 truncate">{sim.endpoint.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </button>

                  {/* Expanded detail on mobile */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 space-y-3" style={{ background: "#f8fafc" }}>
                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {sim.status?.id === 1 && (
                          <button
                            onClick={() => handleStatusChange(sim, 2)}
                            disabled={actionLoading === sim.iccid}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-amber-200 transition-all"
                            style={{ color: "#d97706", background: "rgba(245,158,11,0.05)" }}
                          >
                            {actionLoading === sim.iccid ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
                            Suspender
                          </button>
                        )}
                        {sim.status?.id === 2 && (
                          <button
                            onClick={() => handleStatusChange(sim, 1)}
                            disabled={actionLoading === sim.iccid}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-green-200 transition-all"
                            style={{ color: "#16a34a", background: "rgba(22,163,74,0.05)" }}
                          >
                            {actionLoading === sim.iccid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                            Activar
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedIccid(null)}
                          className="px-3 py-2 rounded-lg text-xs text-gray-400 border border-gray-200"
                        >
                          Cerrar
                        </button>
                      </div>
                      {/* Fields grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "ICCID completo", value: displayIccid(sim) },
                          { label: "ID SIM", value: sim.id ?? "—" },
                          { label: "MSISDN", value: sim.msisdn || "—" },
                          { label: "IMSI", value: sim.imsi || "—" },
                          { label: "Tecnología", value: simTypeName },
                          { label: "Cliente", value: sim.localData?.clientName || "Sin asignar" },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                            <p className="text-xs font-mono text-gray-800 break-all mt-0.5">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* ── DESKTOP: Table ─────────────────────────────────────────────���──── */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" className="rounded" />
                </th>
                {COLS.map((col) => (
                  <th
                    key={col.label}
                    onClick={col.key ? () => handleSort(col.key!) : undefined}
                    className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${col.key ? "cursor-pointer select-none hover:bg-gray-100 transition-colors" : ""}`}
                    style={{ color: sortKey === col.key ? "#0d8f5c" : "#6b7280" }}
                  >
                    {col.label}
                    {col.key && <SortIcon col={col.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                      {COLS.map((col, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : sortedSims.map((sim) => {
                    const isExpanded = expandedIccid === sim.iccid;
                    const statusId = sim.status?.id ?? 0;
                    const simTypeName =
                      sim.sim_type?.name || sim.model?.name || sim.form_factor || "SIM estándar";

                    return (
                      <Fragment key={sim.iccid}>
                        <tr
                          onClick={() => handleRowClick(sim.iccid)}
                          className="border-b border-gray-50 cursor-pointer transition-colors"
                          style={{ background: isExpanded ? "#f0fdf4" : undefined }}
                          onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isExpanded ? "#f0fdf4" : ""; }}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="rounded" />
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs font-mono text-gray-800 tracking-wide">{displayIccid(sim)}</code>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{sim.msisdn || "—"}</td>
                          <td className="px-4 py-3">
                            <StatusBadge statusId={statusId} />
                          </td>
                          <td className="px-4 py-3">
                            {sim.endpoint?.name ? (
                              <span className="text-blue-500 text-xs font-mono hover:underline">{sim.endpoint.name}</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {sim.localData?.clientName ? (
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                  style={{ background: "rgba(62,207,142,0.15)", color: "#059669" }}>
                                  {sim.localData.clientName.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">
                                  {sim.localData.clientName}
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAssignSim(sim)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:opacity-80"
                                style={{ background: "rgba(62,207,142,0.08)", color: "#059669", borderColor: "rgba(62,207,142,0.3)" }}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                Asignar cliente
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-400">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                        </tr>

                        {isExpanded && (
                          <DetailPanel
                            sim={sim}
                            onClose={() => setExpandedIccid(null)}
                            onStatusChange={handleStatusChange}
                            actionLoading={actionLoading === sim.iccid}
                          />
                        )}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!loading && sims.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CreditCard className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No se encontraron SIMs</p>
            <p className="text-sm text-gray-400 mt-1">
              {search ? "Intenta con otro término de búsqueda" : "Verifica tu conexión con emnify"}
            </p>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Mostrando {(page * perPage + 1).toLocaleString()}–{Math.min((page + 1) * perPage, total).toLocaleString()} de {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => goToPage(page - 1)} disabled={page === 0} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {visiblePages().map(p => (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: p === page ? "#3ECF8E" : "transparent", color: p === page ? "#fff" : "#6b7280", border: p === page ? "none" : "1px solid #e5e7eb" }}
                >
                  {p + 1}
                </button>
              ))}
              {totalPages > 5 && page < totalPages - 3 && <span className="text-gray-400 text-xs px-1">…{totalPages}</span>}
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">SIMs por página</span>
              <select
                value={perPage}
                onChange={e => handlePerPageChange(Number(e.target.value))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              >
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Shared mobile pagination */}
      {!loading && totalPages > 1 && (
        <div className="md:hidden flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">
            {(page * perPage + 1).toLocaleString()}–{Math.min((page + 1) * perPage, total).toLocaleString()} de{" "}
            <span className="font-semibold">{total.toLocaleString()}</span>
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(page - 1)} disabled={page === 0}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-600 px-2 font-medium">{page + 1} / {totalPages}</span>
            <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <AddSimModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={() => load(0, perPage, "")} />

      {assignSim && (
        <AssignClientModal
          sim={assignSim}
          clients={clients}
          onConfirm={handleAssignClient}
          onClose={() => setAssignSim(null)}
        />
      )}
    </div>
  );
}