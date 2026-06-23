import { useEffect, useState } from "react";
import {
  CreditCard, Users, Wifi, Activity, TrendingUp, CheckCircle2, PauseCircle, AlertCircle,
  RefreshCw, Clock, ArrowUp, ArrowDown, Database, Circle,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";

// ─── Types ────────────────────────────────────────────────────────
interface Stats {
  totalSims: number;
  activeSims: number;
  suspendedSims: number;
  offlineSims: number;
  totalClients: number;
  totalEndpoints: number;
}

interface DataUsage {
  txBytes: number;
  rxBytes: number;
  totalBytes: number;
  txMB: number;
  rxMB: number;
  totalMB: number;
  totalEndpoints: number;
  statusCount: Record<string | number, number> & {
    online?: number;
    disabled?: number;
    offline?: number;
  };
  trafficHourly: { label: string; tx: number; rx: number }[];
  month: string;
  dataSource: string;
  cachedAt: string;
  stale?: boolean;
}

interface Log {
  type: string;
  message: string;
  timestamp: string;
}

// ─── Helpers ────────────────��─────────────────────────────────────
function formatBytes(b: number): string {
  if (!b || b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

const typeConfig: Record<string, { icon: typeof Activity; color: string; bg: string; label: string }> = {
  login:           { icon: CheckCircle2, color: "#3ECF8E", bg: "rgba(62,207,142,0.1)",  label: "Login" },
  sim_status:      { icon: CreditCard,   color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  label: "SIM" },
  endpoint_update: { icon: Wifi,         color: "#a78bfa", bg: "rgba(167,139,250,0.1)", label: "Endpoint" },
  chip_assigned:   { icon: Users,        color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  label: "Asignación" },
  chips_added:     { icon: CreditCard,   color: "#3ECF8E", bg: "rgba(62,207,142,0.1)",  label: "Chips" },
  client_created:  { icon: Users,        color: "#34d399", bg: "rgba(52,211,153,0.1)",  label: "Cliente" },
  user_created:    { icon: Users,        color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  label: "Usuario" },
};

// ─── Sub-components ───────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, subtitle, color, loading }: {
  icon: typeof CreditCard; label: string; value: string | number;
  subtitle: string; color: string; loading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3 md:mb-4">
        <div className="flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl" style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4 md:w-5 md:h-5" style={{ color }} />
        </div>
        <TrendingUp className="w-4 h-4 text-gray-300" />
      </div>
      {loading ? (
        <div className="space-y-2"><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-28" /></div>
      ) : (
        <>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{label}</p>
          <p className="text-xs font-medium mt-1.5" style={{ color }}>{subtitle}</p>
        </>
      )}
    </div>
  );
}

// ─── Traffic Bar Chart (CSS flexbox, no SVG distorsión) ──────────
function TrafficBarChart({ data }: { data: { label: string; tx: number; rx: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-gray-400">
        Sin datos de tráfico disponibles
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.tx + d.rx), 1);
  const allZero = maxVal === 0 || data.every((d) => d.tx === 0 && d.rx === 0);

  return (
    <div className="flex items-end gap-1.5 h-28 w-full">
      {data.map((d, i) => {
        // Si todos son 0, mostrar barras decorativas mínimas
        const txPct = allZero ? 30 : Math.max(4, ((d.tx) / maxVal) * 100);
        const rxPct = allZero ? 20 : Math.max(4, ((d.rx) / maxVal) * 100);

        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            {/* Bars group */}
            <div className="flex items-end gap-0.5 w-full" style={{ height: 96 }}>
              {/* TX bar */}
              <div className="flex-1 rounded-t-sm transition-all" style={{
                height: `${txPct}%`,
                background: allZero ? "#e0e7ff" : "#6366f1",
                opacity: allZero ? 0.5 : 0.85,
                minHeight: 3,
              }} />
              {/* RX bar */}
              <div className="flex-1 rounded-t-sm transition-all" style={{
                height: `${rxPct}%`,
                background: allZero ? "#d1fae5" : "#3ECF8E",
                opacity: allZero ? 0.5 : 0.85,
                minHeight: 3,
              }} />
            </div>
            {/* Label */}
            <span className="text-[9px] md:text-[10px] text-gray-400 truncate w-full text-center leading-none">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Device State Stacked Bar ─────────────────────────────────────
function DeviceStateBar({ online, suspended, offline }: { online: number; suspended: number; offline: number }) {
  const total = online + suspended + offline || 1;
  const onlineP = (online / total) * 100;
  const suspP = (suspended / total) * 100;
  const offlineP = (offline / total) * 100;

  return (
    <div className="w-full h-5 rounded-full overflow-hidden flex">
      <div style={{ width: `${onlineP}%`, background: "#22c55e" }} className="transition-all" />
      <div style={{ width: `${suspP}%`, background: "#374151" }} className="transition-all" />
      <div style={{ width: `${offlineP}%`, background: "#d1d5db" }} className="transition-all" />
    </div>
  );
}

// ─── Data Usage Widget ────────────────────────────────────────────
function DataUsageWidget({ usage, loading, onRefresh }: { usage: DataUsage | null; loading: boolean; onRefresh: () => void }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("es-MX", { month: "long", year: "numeric" });
  const cachedMins = usage?.cachedAt
    ? Math.round((Date.now() - new Date(usage.cachedAt).getTime()) / 60000)
    : null;

  // Soporte para claves nombradas (nueva API) y numéricas (compatibilidad)
  const online    = usage?.statusCount?.online    ?? usage?.statusCount?.[1] ?? 0;
  const suspended = usage?.statusCount?.disabled  ?? usage?.statusCount?.[2] ?? 0;
  const offline   = usage?.statusCount?.offline   ?? (usage?.statusCount?.[0] ?? 0) + (usage?.statusCount?.[3] ?? 0);

  const hasData = (usage?.totalBytes ?? 0) > 0;
  const isStale = usage?.stale === true;

  const [refreshing, setRefreshing] = useState(false);

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await api.cacheClear();
      await onRefresh();
    } catch (e) {
      console.error("Error al refrescar:", e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Banner stale */}
      {isStale && !loading && (
        <div className="flex items-center justify-between bg-amber-50 border-b border-amber-100 px-5 py-2.5">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Mostrando datos del caché ({cachedMins}m). El recálculo completo puede tardar ~30 segundos.
          </p>
          <button
            onClick={handleForceRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Recalculando..." : "Recalcular ahora"}
          </button>
        </div>
      )}

      {/* Main data row */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Left: Volume */}
        <div className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Volumen de Datos · {monthLabel}
            </p>
            {cachedMins !== null && !isStale && (
              <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                cache {cachedMins}m
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2 mt-3">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <>
              <p className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 tracking-tight">
                {hasData ? formatBytes(usage?.totalBytes ?? 0) : (
                  <span className="text-gray-300">—</span>
                )}
              </p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
                    <ArrowUp className="w-3.5 h-3.5" style={{ color: "#6366f1" }} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 leading-none">TX Enviado</p>
                    <p className="text-sm font-semibold text-gray-800">{formatBytes(usage?.txBytes ?? 0)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(62,207,142,0.1)" }}>
                    <ArrowDown className="w-3.5 h-3.5" style={{ color: "#3ECF8E" }} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 leading-none">RX Recibido</p>
                    <p className="text-sm font-semibold text-gray-800">{formatBytes(usage?.rxBytes ?? 0)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">Endpoints con datos</span>
                </div>
                <span className="text-xs font-semibold text-gray-700">
                  {(usage as any)?.endpointsWithStats ?? usage?.totalEndpoints ?? "—"}
                  {" / "}
                  {usage?.totalEndpoints ?? "—"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: Device state */}
        <div className="p-5 md:p-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Estado de los Dispositivos
          </p>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-full rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <>
              <DeviceStateBar online={online} suspended={suspended} offline={offline} />
              <div className="mt-4 space-y-2.5">
                {[
                  { label: "Online",        count: online,    color: "#22c55e", icon: CheckCircle2 },
                  { label: "Deshabilitado", count: suspended, color: "#f59e0b", icon: PauseCircle },
                  { label: "Offline",       count: offline,   color: "#9ca3af", icon: Circle },
                ].map(({ label, count, color, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                      <span className="text-sm text-gray-600">{label}</span>
                    </div>
                    <span
                      className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: `${color}18`, color }}
                    >
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Traffic chart */}
      <div className="border-t border-gray-100 p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tráfico (últimas 6h)</p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#6366f1", opacity: 0.85 }} />
              TX enviado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#3ECF8E", opacity: 0.85 }} />
              RX recibido
            </span>
          </div>
        </div>
        {loading ? (
          <div className="flex items-end gap-2 h-28">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 rounded" style={{ height: `${40 + Math.random() * 60}%` }} />
            ))}
          </div>
        ) : (
          <TrafficBarChart data={usage?.trafficHourly ?? []} />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<DataUsage | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const load = async () => {
    setStatsLoading(true);
    setLogsLoading(true);
    try {
      const [s, a] = await Promise.allSettled([api.getStats(), api.getActivity()]);
      if (s.status === "fulfilled") setStats(s.value);
      if (a.status === "fulfilled") setLogs(a.value.logs || []);
    } finally {
      setStatsLoading(false);
      setLogsLoading(false);
    }
  };

  const loadUsage = async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const d = await api.getDataUsage();
      setUsage(d);
    } catch (e: any) {
      console.error("Error cargando consumo de datos:", e);
      setUsageError(e.message || "Error obteniendo consumo de datos");
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadUsage();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([load(), loadUsage()]);
    setRefreshing(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";

  // ── Usar statusCount del escaneo completo (data-usage) cuando esté disponible
  // ya que emnify no soporta filtro ?status= para el conteo total confiablemente
  const accurateActive    = usage?.statusCount?.[1];
  const accurateSuspended = usage?.statusCount?.[2];
  const displayActive    = (!usageLoading && accurateActive    != null) ? accurateActive    : stats?.activeSims;
  const displaySuspended = (!usageLoading && accurateSuspended != null) ? accurateSuspended : stats?.suspendedSims;
  const kpiLoading = statsLoading && usageLoading;

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {greeting}, {user?.name?.split(" ")[0] || "Admin"} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Resumen de conectividad IoT · {user?.organisation || "emnify"}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={CreditCard}   label="Total SIMs en emnify"   value={stats?.totalSims ?? "—"}      subtitle="Chips en inventario emnify"  color="#3ECF8E" loading={statsLoading} />
        <StatCard icon={CheckCircle2} label="SIMs Activas"           value={displayActive    ?? "—"}      subtitle="Con datos activos"           color="#10b981" loading={kpiLoading} />
        <StatCard icon={PauseCircle}  label="SIMs Suspendidas"       value={displaySuspended ?? "—"}      subtitle="Temporalmente inactivas"     color="#f59e0b" loading={kpiLoading} />
        <StatCard icon={Users}        label="Clientes Registrados"   value={stats?.totalClients ?? "—"}   subtitle="En este portal"              color="#60a5fa" loading={statsLoading} />
      </div>

      {/* ── DATA USAGE + DEVICE STATE ── */}
      <div className="grid grid-cols-1 gap-4 md:gap-6">
        {/* Data usage (full width) */}
        <div>
          {usageError ? (
            <div
              className="flex items-center justify-between gap-4 p-4 rounded-2xl border h-full"
              style={{ background: "#fff1f2", borderColor: "#fecdd3" }}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "#e11d48" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#e11d48" }}>
                    Error cargando consumo de datos
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#be123c" }}>{usageError}</p>
                </div>
              </div>
              <button
                onClick={loadUsage}
                disabled={usageLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all shrink-0"
                style={{ background: "#e11d48", color: "#fff", opacity: usageLoading ? 0.6 : 1 }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${usageLoading ? "animate-spin" : ""}`} />
                Reintentar
              </button>
            </div>
          ) : (
            <DataUsageWidget usage={usage} loading={usageLoading} onRefresh={loadUsage} />
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Connectivity SVG Area Chart ────────────────────────────────
function ConnectivityChart({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  // Generate realistic 14-day trend based on current stats
  const active = stats?.activeSims ?? 70;
  const suspended = stats?.suspendedSims ?? 8;

  const data = Array.from({ length: 14 }, (_, i) => {
    const variance = 0.05;
    return {
      day: `${i + 1}/${new Date().getMonth() + 1}`,
      active: Math.round(active * (1 + (Math.random() - 0.5) * variance)),
      suspended: Math.round(suspended * (1 + (Math.random() - 0.5) * variance * 2)),
    };
  });

  const W = 560, H = 170;
  const padL = 36, padR = 12, padT = 10, padB = 28;
  const iW = W - padL - padR;
  const iH = H - padT - padB;
  const maxVal = Math.max(...data.map((d) => d.active), 1);
  const xOf = (i: number) => padL + (i / (data.length - 1)) * iW;
  const yOf = (v: number) => padT + iH - (v / maxVal) * iH;
  const polyline = (key: "active" | "suspended") => data.map((d, i) => `${xOf(i)},${yOf(d[key])}`).join(" ");
  const area = (key: "active" | "suspended") => {
    const pts = data.map((d, i) => `${xOf(i)},${yOf(d[key])}`).join(" ");
    return `${padL},${padT + iH} ${pts} ${xOf(data.length - 1)},${padT + iH}`;
  };
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxVal));

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
      {yTicks.map((t) => (
        <line key={`grid-${t}`} x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="#f3f4f6" strokeWidth={1} />
      ))}
      {yTicks.map((t) => (
        <text key={`y-${t}`} x={padL - 6} y={yOf(t) + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{t}</text>
      ))}
      {data.filter((_, i) => i % 2 === 0).map((d, idx) => {
        const origIdx = data.findIndex((x) => x.day === d.day);
        return (
          <text key={`x-${idx}`} x={xOf(origIdx)} y={H - 6} textAnchor="middle" fontSize={10} fill="#9ca3af">{d.day}</text>
        );
      })}
      <polygon points={area("suspended")} fill="#f59e0b" fillOpacity={0.08} />
      <polygon points={area("active")} fill="#3ECF8E" fillOpacity={0.12} />
      <polyline points={polyline("suspended")} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" />
      <polyline points={polyline("active")} fill="none" stroke="#3ECF8E" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}