import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X, RefreshCw, ChevronLeft, ChevronRight, Download,
  Wifi, WifiOff, Signal, MapPin, Calendar, Globe,
  CheckCircle2, PauseCircle, Circle, AlertCircle,
  ArrowUp, ArrowDown, Cpu, Shield, Tag, Info,
  Radio, Building2, Navigation, CreditCard, Search,
  Database, Inbox,
} from "lucide-react";

// Small inline info icon wrapper
function InfoIcon() {
  return <Info className="w-4 h-4" />;
}
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "./ui/skeleton";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────

/**
 * Connectivity data from emnify GET /endpoint/{id}/connectivity
 * status.id: 0 = Offline, 1 = Online, 2 = Attached (signal, no data session)
 *
 * NOTE: emnify's /connectivity response uses 'mno' (not 'operator') for the
 * network operator, and 'last_updated' (not 'last_check') for the timestamp.
 */
export interface EmnifyConnectivity {
  status?: { id: number; description?: string };
  /** emnify /connectivity uses last_updated */
  last_updated?: string;
  last_check?: string;
  pdp_context?: {
    ip_address?: string;
    start_time?: string;
    duration?: number;
  };
  /** emnify /connectivity uses 'mno' for the network operator */
  mno?: { name?: string; id?: number; country?: string };
  /** fallback if some emnify versions use 'operator' */
  operator?: { name?: string; id?: number };
  /** Country info from connectivity response */
  country?: { name?: string; country_code?: string; mcc?: string };
  /** Radio Access Technology — can be a plain string or object { description } */
  rat_type?: string | { id?: number; description?: string };
}

export interface EmnifyEndpoint {
  id: number;
  name: string;
  status: { id: number; description: string };
  ip_address?: string;
  imei?: string;
  imei_lock?: boolean;
  tags?: string[];
  /** Operator from GET /endpoint/{id} — top-level field (name, country) */
  operator?: { id?: number; name?: string; country?: string };
  /** Radio Access Technology from GET /endpoint/{id} — top-level field */
  rat_type?: { id?: number; description?: string };
  sim?: {
    id: number;
    iccid?: string;
    iccid_with_luhn?: string;
    imsi?: string;
    msisdn?: string;
    /** SIM status from emnify: 1=Active, 2=Suspended, 0/3=Issued/Terminated */
    status?: { id: number; description?: string };
  };
  service_profile?: { id: number; name: string };
  tariff_profile?: { id: number; name: string };
  services?: {
    data?: { blocked?: boolean };
    sms_mt?: { blocked?: boolean };
    sms_mo?: { blocked?: boolean };
  };
  runtime_data?: {
    last_updated?: string;
    pdp_context?: { start_time?: string; ip_address?: string };
    connectivity_status?: { id?: number; description?: string };
    mno?: { name?: string };
    network?: { radio?: string; mcc?: string; mnc?: string };
    country?: { name?: string; country_code?: string };
    location?: { lat?: number; lng?: number; lon?: number; last_updated?: string };
  };
  /** Enriched from GET /endpoint/{id}/connectivity — authoritative connectivity state */
  _connectivity?: EmnifyConnectivity | null;
}

interface Props {
  endpoint: EmnifyEndpoint;
  onClose: () => void;
  isAdmin?: boolean;
  fetchEvents: (page: number, perPage: number) => Promise<{ items: any[]; total_count: number }>;
  fetchStats: (period: string) => Promise<{ items: any[] }>;
  fetchDetail?: () => Promise<EmnifyEndpoint>;
  onToggleStatus?: (simId: number, currentStatusId: number, iccid: string) => Promise<void>;
  onResetConnectivity?: (endpointId: number) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatMB(mb: number): string {
  if (!mb || mb === 0) return "0 B";
  const kb = mb * 1000;
  if (kb < 1) return `${(mb * 1000 * 1000).toFixed(0)} B`;
  if (kb < 1000) return `${kb.toFixed(3)} KB`;
  if (mb < 1000) return `${mb.toFixed(3)} MB`;
  return `${(mb / 1000).toFixed(3)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

function getStatusColor(id: number) {
  // Uses SIM status IDs: 1=Active/Habilitado, 2=Suspended, 0/3=Issued/Terminated
  if (id === 1) return { color: "#16a34a", bg: "rgba(22,163,74,0.10)",   label: "Habilitado" };
  if (id === 2) return { color: "#d97706", bg: "rgba(217,119,6,0.10)",   label: "Suspendido" };
  return         { color: "#94a3b8", bg: "rgba(148,163,184,0.10)", label: "Deshabilitado" };
}

/**
 * Resolves connectivity state from the enriched _connectivity field.
 * Uses the official emnify /endpoint/{id}/connectivity response:
 *   status.id: 0 = Offline, 1 = Online, 2 = Attached (signal, no active data session)
 *
 * Falls back to runtime_data fields when _connectivity is not available.
 */
function resolveConn(ep: EmnifyEndpoint): {
  statusId: number;        // 0=Offline, 1=Online, 2=Attached
  label: string;
  color: string;
  net: string;             // technology: "4G", "LTE-M", etc.
  operator: string;
  operatorCountry: string;
  ipAddress: string;
  lastCheck: string;
} {
  const conn = ep._connectivity;

  // Helper: normalise rat_type which can be a plain string (from /connectivity)
  // or an object { description } (from /endpoint detail)
  const resolveRat = (raw: string | { id?: number; description?: string } | undefined): string => {
    if (!raw) return "";
    if (typeof raw === "string") return raw.toUpperCase();
    return (raw.description || "").toUpperCase();
  };

  // Canonical operator country from endpoint.operator.country OR runtime_data
  const epOperatorCountry =
    ep.operator?.country ||
    ep.runtime_data?.country?.name || "";

  // ── Primary: _connectivity from /endpoint/{id}/connectivity ──────────────
  if (conn) {
    const sid = conn.status?.id ?? -1;

    const rat = resolveRat(conn.rat_type)
             || resolveRat(ep.rat_type)
             || (ep.runtime_data?.network?.radio || "").toUpperCase();

    // emnify /connectivity returns operator in 'mno' field (NOT 'operator')
    const operator = conn.mno?.name
                  || conn.operator?.name
                  || ep.operator?.name
                  || ep.runtime_data?.mno?.name || "";

    // Country: emnify /connectivity has a top-level 'country' object
    const connCountry = conn.country?.name || conn.mno?.country || "";
    const opCountry   = connCountry || epOperatorCountry;

    // IP: prefer PDP session IP (only when truly online), then static endpoint IP
    const ip = conn.pdp_context?.ip_address
            || ep.ip_address
            || ep.runtime_data?.pdp_context?.ip_address || "";

    // emnify /connectivity uses 'last_updated' (NOT 'last_check')
    const lc = conn.last_updated
            || conn.last_check
            || ep.runtime_data?.last_updated || "";

    // PDP context presence = device has an ACTIVE data session → truly Online
    // This is more authoritative than status.id which can be stale/cached
    const hasPdp = !!(conn.pdp_context?.start_time || conn.pdp_context?.ip_address);
    const effectiveSid = hasPdp && sid !== 2 ? 1 : sid;

    if (effectiveSid === 1 || sid === 1) {
      return { statusId: 1, label: rat || "Online", color: "#16a34a", net: rat, operator, operatorCountry: opCountry, ipAddress: ip, lastCheck: lc };
    }
    if (effectiveSid === 2 || sid === 2) {
      return { statusId: 2, label: "Señal (sin datos)", color: "#d97706", net: rat, operator, operatorCountry: opCountry, ipAddress: ip, lastCheck: lc };
    }
    // Offline — still surface last-known operator/RAT/IP
    return { statusId: 0, label: "Sin conexión", color: "#94a3b8", net: rat, operator, operatorCountry: opCountry, ipAddress: ip, lastCheck: lc };
  }

  // ── Fallback: runtime_data fields ────────────────────────────────────────
  const cs     = ep.runtime_data?.connectivity_status?.description?.toLowerCase() || "";
  const csId   = ep.runtime_data?.connectivity_status?.id;
  const net    = resolveRat(ep.rat_type) || (ep.runtime_data?.network?.radio || "").toUpperCase();
  const ip     = ep.ip_address || ep.runtime_data?.pdp_context?.ip_address || "";
  const lc     = ep.runtime_data?.last_updated || "";
  const op     = ep.operator?.name || ep.runtime_data?.mno?.name || "";

  const online = cs.includes("online") || cs.includes("attached") || cs.includes("connected") ||
                 csId === 0 ||
                 !!ep.runtime_data?.pdp_context?.start_time || !!ip;

  if (online) {
    return { statusId: 1, label: net || "Online", color: "#16a34a", net, operator: op, operatorCountry: epOperatorCountry, ipAddress: ip, lastCheck: lc };
  }
  return { statusId: 0, label: "Sin conexión", color: "#94a3b8", net, operator: op, operatorCountry: epOperatorCountry, ipAddress: "", lastCheck: lc };
}

function getConnStatus(ep: EmnifyEndpoint): { label: string; color: string; net: string } {
  const { label, color, net } = resolveConn(ep);
  return { label, color, net };
}

const SEVERITY_COLOR: Record<string, string> = {
  info:    "#60a5fa",
  warn:    "#f59e0b",
  warning: "#f59e0b",
  error:   "#ef4444",
  critical:"#dc2626",
};

function severityBadge(severity: any) {
  const label = typeof severity === "string" ? severity : (severity?.description || "Info");
  const color = SEVERITY_COLOR[label.toLowerCase()] || SEVERITY_COLOR.info;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, color }}
    >
      <AlertCircle className="w-3 h-3" /> {label}
    </span>
  );
}

const PERIOD_LABELS: Record<string, string> = {
  week:       "Esta semana",
  last_week:  "Semana pasada",
  month:      "Este mes",
  last_month: "Mes pasado",
};

// ─── Location Tab — real cell tower data from emnify ─────────────
interface LocationData {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  country: string;
  operator: string;
  mcc: string | null;
  mnc: string | null;
  lac: string | null;
  cell_id: string | null;
  location_source: string; // "cell_tower" | "country_centroid" | "none"
  last_updated: string;
}

function LocationMap({ endpoint }: { endpoint: EmnifyEndpoint }) {
  const [data, setData]       = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.getDeviceLocation(endpoint.id);
      setData(res);
    } catch (e: any) {
      console.error("Error cargando ubicación:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLocation(); }, [endpoint.id]);

  const hasCellData = data && (data.mcc || data.mnc || data.lac || data.cell_id);
  const hasCoords   = data && data.lat && data.lng;

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="w-full rounded-xl" style={{ height: 340 }} />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-100 bg-red-50 py-16 text-center px-6">
        <AlertCircle className="w-10 h-10 text-red-300" />
        <div>
          <p className="text-sm font-semibold text-gray-600">Error al obtener ubicación</p>
          <p className="text-xs text-red-500 mt-1 break-words">{error}</p>
        </div>
        <button
          onClick={fetchLocation}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#3ECF8E" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  // ── No data at all ───────────────────────────────────────────────
  if (!data || (!hasCoords && !hasCellData && !data.country)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-gray-50 py-16 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-teal-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-600">Sin información de ubicación</p>
          <p className="text-xs text-gray-400 mt-1">
            El dispositivo no ha reportado datos de red celular aún.
          </p>
        </div>
        <button
          onClick={fetchLocation}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
    );
  }

  const zoom     = data.location_source === "cell_tower" ? 14 : 6;
  const accuracy = data.accuracy ?? null;

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: data.location_source === "cell_tower"
                ? "rgba(62,207,142,0.12)" : "rgba(234,179,8,0.12)",
              color: data.location_source === "cell_tower" ? "#0d9488" : "#a16207",
            }}
          >
            {data.location_source === "cell_tower"
              ? <><Radio className="w-3.5 h-3.5" /> Ubicación Celular</>
              : <><Globe className="w-3.5 h-3.5" /> Centroide de País</>
            }
          </div>
          {data.last_updated && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(data.last_updated)}
            </span>
          )}
        </div>
        <button
          onClick={fetchLocation}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Actualizar ubicación
        </button>
      </div>

      {/* ── Map ─────────────────────────────────────────────── */}
      {hasCoords ? (
        <div className="relative w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 360 }}>
          <iframe
            key={`${data.lat}-${data.lng}`}
            title="Última ubicación del dispositivo"
            src={(() => {
              const lat = data.lat!;
              const lon = data.lng!;
              const delta = data.location_source === "cell_tower" ? 0.025 : 3;
              const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
              return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
            })()}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
          />
          {/* Open in OSM overlay button */}
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <a
              href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lng}#map=${zoom}/${data.lat}/${data.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 shadow text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              <Navigation className="w-3.5 h-3.5 text-teal-500" />
              Ver en mapa
            </a>
            {accuracy && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-200 shadow text-gray-600 whitespace-nowrap">
                <Radio className="w-3 h-3 text-amber-500" />
                ±{accuracy >= 1000
                  ? `${(accuracy / 1000).toFixed(1)} km`
                  : `${accuracy} m`} aprox.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-100 bg-amber-50 py-10">
          <Globe className="w-10 h-10 text-amber-300" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-600">Datos de torre celular disponibles</p>
            <p className="text-xs text-gray-500 mt-1">No se pudo resolver la posición exacta de la celda.</p>
          </div>
        </div>
      )}

      {/* ── Info cards grid ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <Globe className="w-4 h-4 text-teal-500" />,
            label: "País",
            value: data.country || "—",
          },
          {
            icon: <Building2 className="w-4 h-4 text-blue-500" />,
            label: "Operador",
            value: data.operator || "—",
          },
          {
            icon: <Radio className="w-4 h-4 text-purple-500" />,
            label: "MCC / MNC",
            value: (data.mcc && data.mnc) ? `${data.mcc} / ${data.mnc}` : "—",
          },
          {
            icon: <Signal className="w-4 h-4 text-indigo-500" />,
            label: "LAC / Cell ID",
            value: (data.lac && data.cell_id) ? `${data.lac} / ${data.cell_id}` : "—",
          },
        ].map(({ icon, label, value }) => (
          <div
            key={label}
            className="flex flex-col gap-1.5 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3"
          >
            <div className="flex items-center gap-1.5">
              {icon}
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
            </div>
            <span className="text-sm font-semibold text-gray-800 font-mono break-all">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Coordinates row ─────────��───────────────────────── */}
      {hasCoords && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
          <MapPin className="w-4 h-4 text-teal-500 shrink-0" />
          <span className="text-gray-500 text-xs">Coordenadas:</span>
          <span className="font-mono text-sm font-semibold text-gray-800">
            {data.lat!.toFixed(6)}, {data.lng!.toFixed(6)}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            {data.location_source === "cell_tower"
              ? "Torre celular (emnify)"
              : "Centroide estimado del país"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Usage Mini Chart ─────────────────────────────────────────────
function UsageMiniChart({ data }: { data: { date: string; label?: string; tx?: number; rx?: number; volume_tx?: number; volume_rx?: number }[] }) {

  const fmt = (mb: number) => mb < 1 ? `${(mb * 1000).toFixed(0)}K` : `${mb.toFixed(1)}M`;

  // Normalise + deduplicate by YYYY-MM-DD
  const seen = new Map<string, { uid: string; date: string; tx: number; rx: number }>();
  let uidCounter = 0;
  for (const d of data) {
    const key = (d.date ?? "").toString().slice(0, 10);
    if (!key || key.length < 10) continue;
    const tx = Number(d.tx ?? d.volume_tx ?? 0) || 0;
    const rx = Number(d.rx ?? d.volume_rx ?? 0) || 0;
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      existing.tx += tx;
      existing.rx += rx;
    } else {
      seen.set(key, { uid: `${key}-${uidCounter++}`, date: key, tx, rx });
    }
  }
  const deduped = Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalActivity = deduped.reduce((s, d) => s + d.tx + d.rx, 0);

  // ── Empty state: no rows OR all-zeros ──
  if (!data.length || !deduped.length || totalActivity === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 h-[110px] rounded-xl border border-dashed border-gray-200 bg-gray-50/70">
        <div className="w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center">
          <Database className="w-4 h-4 text-gray-300" />
        </div>
        <div className="text-center leading-tight">
          <p className="text-xs font-semibold text-gray-400">Sin datos registrados</p>
          <p className="text-[10px] text-gray-300 mt-0.5">No hay tráfico en este período</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={deduped} barCategoryGap="25%" barGap={2}>
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => (v || "").slice(5)}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          formatter={(val: number) => [fmt(Number(val) || 0)]}
          labelFormatter={(v: string) => (v || "").slice(5)}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Bar key="bar-tx" dataKey="tx" name="TX" fill="#6366f1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar key="bar-rx" dataKey="rx" name="RX" fill="#3ECF8E" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Country flag emoji from ISO 3166-1 alpha-2 code ─────────────
function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return "";
  return code.toUpperCase().split("").map(c =>
    String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1F1E6)
  ).join("");
}

// ─── PDP session duration ─────────────────────────────────────────
function pdpDuration(startTime?: string): string {
  if (!startTime) return "";
  const diffMs = Date.now() - new Date(startTime).getTime();
  if (diffMs <= 0) return "";
  const totalSec = Math.floor(diffMs / 1000);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600).toString().padStart(2, "0");
  const mins  = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
  const secs  = (totalSec % 60).toString().padStart(2, "0");
  return days > 0 ? `${days} días ${hours}:${mins}:${secs}` : `${hours}:${mins}:${secs}`;
}

// ─── Tab: General ────────────────────────────────────────────────
function TabGeneral({
  endpoint, loading, weekStats, weekLoading, onToggleStatus, onResetConnectivity,
}: {
  endpoint: EmnifyEndpoint;
  loading: boolean;
  weekStats: any[];
  weekLoading: boolean;
  onToggleStatus?: Props["onToggleStatus"];
  onResetConnectivity?: Props["onResetConnectivity"];
}) {
  // Use SIM status (id=1→Active, id=2→Suspended) — NOT endpoint status
  const simStatusId = endpoint.sim?.status?.id ?? endpoint.status?.id ?? 0;
  const st   = getStatusColor(simStatusId);
  const connResolved = resolveConn(endpoint);
  const conn = connResolved;
  const [toggling, setToggling]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetOk, setResetOk]     = useState(false);
  const [resetErr, setResetErr]   = useState<string | null>(null);

  const handleToggle = async () => {
    if (!onToggleStatus || !endpoint.sim?.id) return;
    // Toggle between SIM Active (1) and Suspended (2)
    const newId = simStatusId === 1 ? 2 : 1;
    setToggling(true);
    try {
      await onToggleStatus(endpoint.sim.id, newId, endpoint.sim?.iccid || "");
    } finally {
      setToggling(false);
    }
  };

  const handleResetConnectivity = async () => {
    if (!onResetConnectivity) return;
    setResetting(true);
    setResetOk(false);
    setResetErr(null);
    try {
      await onResetConnectivity(endpoint.id);
      setResetOk(true);
      setTimeout(() => setResetOk(false), 3000);
    } catch (e: any) {
      // emnify returns 404 when the device has no active PDP context to drop
      const msg: string = e?.message || "Error al resetear";
      setResetErr(msg.includes("404") ? "Sin sesión PDP activa para resetear" : msg);
      setTimeout(() => setResetErr(null), 4000);
    } finally {
      setResetting(false);
    }
  };

  // PDP start_time from connectivity or runtime_data
  const pdpStart = endpoint._connectivity?.pdp_context?.start_time
    || endpoint.runtime_data?.pdp_context?.start_time;

  // Country code for flag — prefer connectivity country (most current), then runtime_data
  const countryCode =
    endpoint._connectivity?.country?.country_code ||
    endpoint.runtime_data?.country?.country_code || "";

  const svc = endpoint.services;
  const services = [
    { label: "Datos",   active: !svc?.data?.blocked },
    { label: "SMS MT",  active: !svc?.sms_mt?.blocked },
    { label: "SMS MO",  active: !svc?.sms_mo?.blocked },
  ];

  const totalTx = weekStats.reduce((s, r) => s + (r.volume_tx || 0), 0);
  const totalRx = weekStats.reduce((s, r) => s + (r.volume_rx || 0), 0);

  if (loading) return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1,2,3].map(i => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
      {/* ── Col 1: Estado + Servicios + Conexión ── */}
      <div className="space-y-5">
        {/* Estado */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Estado</p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggle}
              disabled={toggling || !onToggleStatus}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50"
              style={{ background: simStatusId === 1 ? "#3ECF8E" : "#d1d5db" }}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200"
                style={{ transform: simStatusId === 1 ? "translateX(20px)" : "translateX(0px)" }}
              />
            </button>
            <span className="text-sm font-semibold" style={{ color: st.color }}>
              {toggling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : st.label}
            </span>
          </div>
        </div>

        {/* Servicios */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Servicios</p>
          <div className="space-y-2">
            {services.map(({ label, active }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{label}</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: active ? "rgba(22,163,74,0.10)" : "rgba(148,163,184,0.10)",
                    color: active ? "#16a34a" : "#94a3b8",
                  }}
                >
                  {active ? "Activo" : "Inactivo"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Conexión */}
        <div>
          {/* Header: title + reset button */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Conexión</p>
            {onResetConnectivity && (
              <button
                onClick={handleResetConnectivity}
                disabled={resetting}
                className="flex items-center gap-1 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ color: resetOk ? "#16a34a" : "#6366f1" }}
                title="Resetear conectividad (elimina el contexto PDP activo)"
              >
                {resetting
                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                {resetOk ? "¡Reseteado!" : "Resetear conectividad"}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {/* Main status — large, like emnify portal */}
            <div className="flex items-center gap-2">
              {conn.statusId === 1 ? (
                <Signal className="w-5 h-5" style={{ color: conn.color }} />
              ) : conn.statusId === 2 ? (
                <Wifi className="w-5 h-5" style={{ color: conn.color }} />
              ) : (
                <WifiOff className="w-5 h-5 text-gray-400" />
              )}
              <span className="text-lg font-bold" style={{ color: conn.statusId === 0 ? "#94a3b8" : "#111827" }}>
                {conn.statusId === 1
                  ? `Online${conn.net ? ` (${conn.net})` : ""}`
                  : conn.statusId === 2
                  ? `Señal${conn.net ? ` (${conn.net})` : ""}`
                  : "Sin conexión"}
              </span>
              {/* Info tooltip anchor */}
              <span
                title={`Estado de conectividad emnify\n0 = Offline\n1 = Online (sesión PDP activa)\n2 = Attached (sin sesión de datos)\n\nÚltima verificación: ${conn.lastCheck ? formatDate(conn.lastCheck) : "—"}`}
                className="cursor-help text-gray-300 hover:text-gray-400 transition-colors"
              >
                <InfoIcon />
              </span>
            </div>

            {/* Operator + country flag */}
            {conn.operator && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{conn.operator}</span>
                {(endpoint.runtime_data?.country?.name || conn.operatorCountry) && (
                  <span className="text-gray-500">
                    {endpoint.runtime_data?.country?.name || conn.operatorCountry}
                  </span>
                )}
                {countryCode && (
                  <span className="text-base leading-none" title={countryCode}>
                    {countryFlag(countryCode)}
                  </span>
                )}
              </div>
            )}

            {/* RAT technology badge — shows even when offline (last-known) */}
            {conn.net && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{
                  background: conn.statusId === 0 ? "rgba(148,163,184,0.10)" : "rgba(62,207,142,0.10)",
                  color: conn.statusId === 0 ? "#94a3b8" : "#0d9488",
                }}
              >
                <Signal className="w-3 h-3" />
                {conn.net}
                {conn.statusId === 0 && (
                  <span className="font-normal opacity-70"> (última red)</span>
                )}
              </span>
            )}

            {/* Last location update */}
            {conn.lastCheck && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Último location update: {formatDate(conn.lastCheck)}
              </p>
            )}

            {/* IP address */}
            {conn.ipAddress && (
              <p className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                {conn.ipAddress}
              </p>
            )}

            {/* PDP session duration badge — real elapsed time */}
            {pdpStart && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-teal-50 text-teal-700 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                Contexto PDP active: {pdpDuration(pdpStart)}
              </span>
            )}

            {/* Reset error feedback */}
            {resetErr && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {resetErr}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Col 2: Dispositivo info ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Dispositivo</p>
        <div className="space-y-3">
          {[
            { label: "ID del dispositivo", value: endpoint.id },
            { label: "Dirección IP",       value: endpoint.ip_address || endpoint.runtime_data?.pdp_context?.ip_address || "—" },
            { label: "IMEI",               value: endpoint.imei || "—" },
            { label: "Bloqueo de IMEI",    value: endpoint.imei_lock ? "Activo" : "Inactivo" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-800 font-mono truncate">{String(value)}</p>
            </div>
          ))}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Políticas</p>
            {[
              { label: "Política de servicio",  value: endpoint.service_profile?.name  || "Default Policy" },
              { label: "Política de cobertura", value: endpoint.tariff_profile?.name   || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="mb-2">
                <p className="text-[10px] text-gray-400">{label}</p>
                <p className="text-sm text-gray-700">{value}</p>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">SIM</p>
            {endpoint.sim?.id ? (
              [
                { label: "ICCID",  value: endpoint.sim?.iccid_with_luhn || endpoint.sim?.iccid || "—" },
                { label: "IMSI",   value: endpoint.sim?.imsi || "—" },
                { label: "MSISDN", value: endpoint.sim?.msisdn || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="mb-2">
                  <p className="text-[10px] text-gray-400">{label}</p>
                  <p className="text-xs font-mono text-teal-600 break-all">{value}</p>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-start gap-1.5">
                <p className="text-xs text-gray-400 italic">Sin SIM asignada</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-full">
                  <CreditCard className="w-3 h-3" /> Asigna una SIM desde el tab correspondiente
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {(endpoint.tags || []).length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Etiquetas
              </p>
              <div className="flex flex-wrap gap-1">
                {(endpoint.tags || []).map((t: string) => (
                  <span key={t} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Col 3: Uso ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Uso — Esta semana</p>
        {weekLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" /><Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5 text-xs">
                <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-semibold text-gray-700">{formatMB(totalTx)}</span>
                <span className="text-gray-400">TX</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <ArrowDown className="w-3.5 h-3.5 text-teal-500" />
                <span className="font-semibold text-gray-700">{formatMB(totalRx)}</span>
                <span className="text-gray-400">RX</span>
              </div>
            </div>
            <UsageMiniChart data={weekStats} />
            {(totalTx > 0 || totalRx > 0) && (
              <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> TX</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-teal-400 inline-block" /> RX</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Events ──────────────────────────────────────────────────
function TabEvents({ fetchEvents }: { fetchEvents: Props["fetchEvents"] }) {
  const [items, setItems]     = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [perPage]             = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    try {
      const res = await fetchEvents(p, perPage);
      setItems(res.items || []);
      setTotal(res.total_count || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchEvents, perPage]);

  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["Fecha", "Severidad", "Tipo de evento", "Operador", "País"].map(h => (
                <th key={h} className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr><td colSpan={5} className="py-6 px-4 text-center text-sm text-red-500">{error}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-10 px-4">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Inbox className="w-6 h-6 text-gray-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500">Sin eventos registrados</p>
                    <p className="text-xs text-gray-400 mt-0.5">Este dispositivo no tiene eventos aún</p>
                  </div>
                </div>
              </td></tr>
            ) : items.map((ev, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(ev.timestamp || ev.created_at)}
                </td>
                <td className="py-3 px-4">{severityBadge(ev.severity || ev.alert_severity)}</td>
                <td className="py-3 px-4 text-xs text-gray-700">
                  {ev.type?.description || ev.event_type?.description || ev.description || "—"}
                </td>
                <td className="py-3 px-4 text-xs text-gray-600">
                  {ev.detail?.mnc?.mnc_name || ev.mno_name || ev.network?.description || "—"}
                </td>
                <td className="py-3 px-4 text-xs text-gray-600">
                  {ev.detail?.country?.name || ev.country?.name || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Mostrando {items.length ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)}` : "0"} de {total}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className="w-7 h-7 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: p === page ? "#3ECF8E" : "transparent",
                color: p === page ? "#fff" : "#6b7280",
                border: p === page ? "none" : "1px solid #e5e7eb",
              }}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Estadísticas ───────────────────────────────────────────
function TabStats({ fetchStats }: { fetchStats: Props["fetchStats"] }) {
  const [items, setItems]     = useState<any[]>([]);
  const [period, setPeriod]   = useState("week");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetchStats(p);
      setItems(res.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchStats]);

  useEffect(() => { load(period); }, [period]);

  // Totals
  const totals = items.reduce(
    (acc, r) => ({
      tx: acc.tx + (r.volume_tx || 0),
      rx: acc.rx + (r.volume_rx || 0),
      sms_mt: acc.sms_mt + (r.sms_mt || 0),
      sms_mo: acc.sms_mo + (r.sms_mo || 0),
    }),
    { tx: 0, rx: 0, sms_mt: 0, sms_mo: 0 }
  );

  // All-zeros check: rows exist but no data was recorded
  const hasActivity = totals.tx > 0 || totals.rx > 0 || totals.sms_mt > 0 || totals.sms_mo > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-end gap-2">
        <span className="text-xs text-gray-500">Filtrar por:</span>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
        >
          {Object.entries(PERIOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["FECHA (UTC)", "SUBIDA", "DESCARGA", "TOTAL", "SMS MT", "SMS MO"].map(h => (
                <th key={h} className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr><td colSpan={6} className="py-6 px-4 text-center text-sm text-red-500">{error}</td></tr>
            ) : items.length === 0 || !hasActivity ? (
              <tr><td colSpan={6} className="py-12 px-4">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                    <Database className="w-7 h-7 text-gray-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500">Sin datos registrados</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {items.length === 0
                        ? "No hay estadísticas para este período"
                        : "Este dispositivo no ha generado tráfico aún"}
                    </p>
                  </div>
                </div>
              </td></tr>
            ) : items.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-xs text-gray-600 whitespace-nowrap">{r.date}</td>
                <td className="py-3 px-4 text-xs font-medium text-gray-700">{formatMB(r.volume_tx || 0)}</td>
                <td className="py-3 px-4 text-xs font-medium text-gray-700">{formatMB(r.volume_rx || 0)}</td>
                <td className="py-3 px-4 text-xs font-semibold text-gray-800">{formatMB((r.volume_tx || 0) + (r.volume_rx || 0))}</td>
                <td className="py-3 px-4 text-xs text-gray-600">{r.sms_mt || 0} SMS</td>
                <td className="py-3 px-4 text-xs text-gray-600">{r.sms_mo || 0} SMS</td>
              </tr>
            ))}

            {/* Total row */}
            {!loading && !error && items.length > 0 && (
              <tr className="bg-gray-50">
                <td className="py-3 px-4 text-xs font-bold text-gray-700">Total</td>
                <td className="py-3 px-4 text-xs font-bold text-gray-700">{formatMB(totals.tx)}</td>
                <td className="py-3 px-4 text-xs font-bold text-gray-700">{formatMB(totals.rx)}</td>
                <td className="py-3 px-4 text-xs font-bold text-gray-800">{formatMB(totals.tx + totals.rx)}</td>
                <td className="py-3 px-4 text-xs font-bold text-gray-700">{totals.sms_mt} SMS</td>
                <td className="py-3 px-4 text-xs font-bold text-gray-700">{totals.sms_mo} SMS</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SIM Status helpers ───────────────────────────────────────────
const SIM_STATUSES = [
  { id: "all", label: "Todos",      color: "#6b7280" },
  { id: "1",   label: "Activa",     color: "#16a34a" },
  { id: "2",   label: "Suspendida", color: "#d97706" },
  { id: "0",   label: "Emitida",    color: "#6366f1" },
] as const;

function simStatusInfo(s: any): { label: string; color: string } {
  const id = s.status?.id ?? 0;
  if (id === 1) return { label: "Activa",     color: "#16a34a" };
  if (id === 2) return { label: "Suspendida", color: "#d97706" };
  return              { label: "Emitida",     color: "#6366f1" };
}

// ─── Confirmation Dialog ──────────────────────────────────────────
function ConfirmAssignDialog({
  sim, onConfirm, onCancel, assigning, error,
}: {
  sim: any; onConfirm: () => void; onCancel: () => void;
  assigning: boolean; error: string | null;
}) {
  const iccid  = sim?.iccid_with_luhn || sim?.iccid || "—";
  const msisdn = sim?.msisdn || "—";
  const st     = simStatusInfo(sim);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.50)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg,#3ECF8E,#6366f1)" }} />
        <div className="p-6">
          <div className="flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.10)" }}>
              <CreditCard className="w-7 h-7" style={{ color: "#6366f1" }} />
            </div>
          </div>
          <h3 className="text-base font-bold text-gray-900 text-center mb-1">
            ¿Confirmar asignación de SIM?
          </h3>
          <p className="text-xs text-gray-500 text-center mb-5">
            Esta acción vinculará la SIM al dispositivo en emnify.<br />
            Podrás desasignarla más tarde si es necesario.
          </p>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ICCID</span>
              <span className="text-xs font-mono font-semibold text-gray-700 break-all text-right max-w-[65%]">{iccid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">MSISDN</span>
              <span className="text-xs font-mono text-gray-600">{msisdn}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estado SIM</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: `${st.color}18`, color: st.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                {st.label}
              </span>
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={assigning}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={assigning}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#3ECF8E,#6366f1)" }}>
              {assigning
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Asignando...</>
                : <><CheckCircle2 className="w-3.5 h-3.5" /> Confirmar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Asignar SIM ────────────────────────────────────────────
function TabAssignSim({
  endpointId,
  onAssigned,
}: {
  endpointId: number;
  onAssigned: (simData: any) => void;
}) {
  const [sims, setSims]                 = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected]         = useState<number | null>(null);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [assigning, setAssigning]       = useState(false);
  const [assignErr, setAssignErr]       = useState<string | null>(null);
  const [page, setPage]                 = useState(0);
  const PER = 5;

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const res: any = await api.getSims(0, 100, "");
        const all: any[] = res.items ?? (Array.isArray(res) ? res : []);
        setSims(all.filter((s: any) => !s.endpoint?.id));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  // Apply search + status filter
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sims.filter(s => {
      const matchSearch = !q ||
        (s.iccid || "").toLowerCase().includes(q) ||
        (s.iccid_with_luhn || "").toLowerCase().includes(q) ||
        (s.msisdn || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || String(s.status?.id ?? 0) === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, sims]);

  // Per-status counts for pills
  const counts = React.useMemo(() => ({
    all: sims.length,
    "1": sims.filter(s => (s.status?.id ?? 0) === 1).length,
    "2": sims.filter(s => (s.status?.id ?? 0) === 2).length,
    "0": sims.filter(s => (s.status?.id ?? 0) === 0).length,
  }), [sims]);

  const selectedSim = sims.find(s => s.id === selected);
  const pageItems   = filtered.slice(page * PER, (page + 1) * PER);
  const totalPages  = Math.ceil(filtered.length / PER);

  const handleConfirmAssign = async () => {
    if (!selected) return;
    setAssigning(true); setAssignErr(null);
    try {
      await api.assignSimToEndpoint(endpointId, selected);
      setShowConfirm(false);
      onAssigned(selectedSim);
    } catch (e: any) {
      setAssignErr(e.message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header: title + search + status filter pills ── */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Asignar SIM al dispositivo</h3>
            <p className="text-xs text-gray-400">
              {sims.length} SIM{sims.length !== 1 ? "s" : ""} sin asignar en tu inventario
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ICCID o MSISDN…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {SIM_STATUSES.map(opt => {
            const count  = counts[opt.id as keyof typeof counts] ?? 0;
            const active = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setStatusFilter(opt.id)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
                style={{
                  borderColor: active ? opt.color : "#e5e7eb",
                  background:  active ? `${opt.color}15` : "white",
                  color:       active ? opt.color : "#9ca3af",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: active ? opt.color : "#d1d5db" }} />
                {opt.label}
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                  style={{
                    background: active ? `${opt.color}25` : "#f3f4f6",
                    color:      active ? opt.color : "#9ca3af",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SIM table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertCircle className="w-10 h-10 text-red-300" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <CreditCard className="w-7 h-7 text-gray-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-500">Sin SIMs disponibles</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {search || statusFilter !== "all"
                  ? "Ninguna SIM coincide con los filtros aplicados"
                  : "Todas las SIMs ya están asignadas a un dispositivo"}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
                <th className="py-3 px-4 w-8" />
                {["ICCID", "MSISDN", "Estado", "SIM ID"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(sim => {
                const st = simStatusInfo(sim);
                const isSelected = selected === sim.id;
                return (
                  <tr
                    key={sim.id}
                    onClick={() => setSelected(isSelected ? null : sim.id)}
                    className="border-b border-gray-50 hover:bg-indigo-50/20 cursor-pointer transition-colors"
                    style={{ background: isSelected ? "rgba(99,102,241,0.05)" : undefined }}
                  >
                    <td className="py-3.5 px-4">
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                        style={{
                          borderColor: isSelected ? "#6366f1" : "#d1d5db",
                          background:  isSelected ? "#6366f1" : "white",
                        }}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-mono text-gray-700">
                        {sim.iccid_with_luhn || sim.iccid || "—"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600 font-mono">{sim.msisdn || "—"}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ background: `${st.color}18`, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                        {st.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-400 font-mono">#{sim.id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-gray-100 px-5 py-3.5 flex items-center justify-between gap-4 bg-gray-50/60">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-400">
            {filtered.length > 0
              ? `${page * PER + 1}–${Math.min((page + 1) * PER, filtered.length)} de ${filtered.length}`
              : "0 SIMs"}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <span className="text-xs text-gray-400 px-1">{page + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {selected && selectedSim && (
            <p className="text-xs text-indigo-600 font-medium hidden sm:block max-w-[200px] truncate">
              Seleccionada: <span className="font-mono">{(selectedSim.iccid_with_luhn || selectedSim.iccid || "").slice(-8)}</span>
            </p>
          )}
          <button
            onClick={() => { setAssignErr(null); setShowConfirm(true); }}
            disabled={!selected}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{ background: selected ? "linear-gradient(135deg,#3ECF8E,#6366f1)" : "#d1d5db" }}
          >
            <CreditCard className="w-3.5 h-3.5" /> Asignar SIM
          </button>
        </div>
      </div>

      {/* ── Confirmation dialog ── */}
      {showConfirm && selectedSim && (
        <ConfirmAssignDialog
          sim={selectedSim}
          onConfirm={handleConfirmAssign}
          onCancel={() => { setShowConfirm(false); setAssignErr(null); }}
          assigning={assigning}
          error={assignErr}
        />
      )}
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────
export function DeviceDetailModal({
  endpoint: initialEndpoint,
  onClose,
  isAdmin = false,
  fetchEvents,
  fetchStats,
  fetchDetail,
  onToggleStatus,
  onResetConnectivity,
}: Props) {
  const [activeTab, setActiveTab] = useState<"general" | "events" | "stats" | "location" | "assign-sim">("general");
  const [endpoint, setEndpoint]   = useState<EmnifyEndpoint>(initialEndpoint);
  const [loading, setLoading]     = useState(true);
  const [weekStats, setWeekStats] = useState<any[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Load full detail
    if (fetchDetail) {
      fetchDetail().then(ep => { if (mounted) { setEndpoint(ep); setLoading(false); } })
        .catch(() => { if (mounted) setLoading(false); });
    } else {
      setLoading(false);
    }

    // Load week stats for General tab
    fetchStats("week").then(res => {
      if (mounted) setWeekStats(res.items || []);
    }).catch(() => {}).finally(() => { if (mounted) setWeekLoading(false); });

    return () => { mounted = false; };
  }, []);

  // Show "Asignar SIM" tab only when device has no SIM
  const hasSim = !!(endpoint.sim?.id || endpoint.sim?.iccid);

  const allTabs = [
    { id: "general",    label: "General" },
    { id: "events",     label: "Events" },
    { id: "stats",      label: "Estadísticas" },
    { id: "location",   label: "Ubicación" },
    ...(!hasSim ? [{ id: "assign-sim", label: "Asignar SIM" }] : []),
  ] as const;

  const handleStatusToggle = async (simId: number, newStatusId: number, iccid: string) => {
    if (!onToggleStatus) return;
    await onToggleStatus(simId, newStatusId, iccid);
    setEndpoint(prev => ({ ...prev, status: { ...prev.status, id: newStatusId, description: newStatusId === 1 ? "Enabled" : "Disabled" } }));
  };

  const handleSimAssigned = (simData: any) => {
    // Refresh the endpoint detail to reflect the newly assigned SIM
    if (fetchDetail) {
      fetchDetail().then(ep => setEndpoint(ep)).catch(() => {});
    } else if (simData) {
      setEndpoint(prev => ({
        ...prev,
        sim: {
          id:   simData.id,
          iccid: simData.iccid,
          iccid_with_luhn: simData.iccid_with_luhn,
          imsi:  simData.imsi,
          status: simData.status,
        },
      }));
    }
    setActiveTab("general");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full overflow-hidden"
        style={{ maxWidth: 960, maxHeight: "92vh", minHeight: 520 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="w-5 h-5 text-teal-500 shrink-0" />
            <h2 className="text-base font-bold text-gray-900 truncate">{endpoint.name || endpoint.imei || `Endpoint #${endpoint.id}`}</h2>
            {endpoint.status?.id === 1 ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            ) : endpoint.status?.id === 2 ? (
              <PauseCircle className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-gray-400 shrink-0" />
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 border-b border-gray-100 shrink-0 overflow-x-auto">
          {allTabs.map(tab => {
            const isAssignSim = tab.id === "assign-sim";
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className="px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap shrink-0 flex items-center gap-1.5"
                style={{ color: isActive ? "#3ECF8E" : isAssignSim ? "#6366f1" : "#6b7280" }}
              >
                {isAssignSim && <CreditCard className="w-3.5 h-3.5" />}
                {tab.label}
                {/* Accent badge on assign-sim tab */}
                {isAssignSim && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                    style={{ background: isAssignSim ? "#6366f1" : "#3ECF8E" }} />
                )}
              </button>
            );
          })}
          {isAdmin && (
            <div className="ml-auto shrink-0">
              <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors">
                <Download className="w-3.5 h-3.5" />
                Exportar
              </button>
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "general" && (
            <TabGeneral
              endpoint={endpoint}
              loading={loading}
              weekStats={weekStats}
              weekLoading={weekLoading}
              onToggleStatus={onToggleStatus ? handleStatusToggle : undefined}
              onResetConnectivity={onResetConnectivity}
            />
          )}
          {activeTab === "events" && (
            <TabEvents fetchEvents={fetchEvents} />
          )}
          {activeTab === "stats" && (
            <TabStats fetchStats={fetchStats} />
          )}
          {activeTab === "location" && (
            <div className="p-5 overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
              <LocationMap endpoint={endpoint} />
            </div>
          )}
          {activeTab === "assign-sim" && !hasSim && (
            <TabAssignSim
              endpointId={endpoint.id}
              onAssigned={handleSimAssigned}
            />
          )}
        </div>
      </div>
    </div>
  );
}