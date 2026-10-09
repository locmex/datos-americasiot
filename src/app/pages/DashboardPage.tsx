import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Skeleton } from "../components/ui/skeleton";
import { Icon } from "../components/ui/icon";

// Mismos roles de color que el portal del cliente.
const TX_COLOR = "#4a20c4"; // enviado: morado de marca
const RX_COLOR = "#22b8a3"; // recibido: cian de señal (tono legible sobre blanco)

// ─── Tipos ────────────────────────────────────────────────────────
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
  endpointsWithStats?: number;
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

// ─── Helpers ──────────────────────────────────────────────────────
function formatBytes(b: number): string {
  if (!b || b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ─── Celda de la tira de métricas ─────────────────────────────────
// Las cuatro cifras van en UNA tarjeta con divisores: se leen como un
// resumen, no como cuatro objetos que compiten entre sí.
function KpiCell({
  label, value, note, icon, tone = "neutral", loading,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: string;
  tone?: "neutral" | "success" | "warning";
  loading: boolean;
}) {
  const iconColor = { neutral: "text-on-surface-variant", success: "text-[#15803d]", warning: "text-on-warning" }[tone];
  return (
    <div className="flex flex-col gap-1.5 p-card-padding">
      <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
        <Icon name={icon} className={`text-[16px] ${iconColor}`} />
        {label}
      </p>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      ) : (
        <>
          <p className="text-[28px] leading-none font-semibold tracking-tight text-on-surface tabular-nums">{value}</p>
          <p className="text-body-sm text-on-surface-variant">{note}</p>
        </>
      )}
    </div>
  );
}

// ─── Gráfico de tráfico ───────────────────────────────────────────
function TrafficChart({ data }: { data: { label: string; tx: number; rx: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-body-sm text-on-surface-variant">
        Sin datos de tráfico disponibles
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.tx, d.rx)), 1);
  const allZero = data.every((d) => d.tx === 0 && d.rx === 0);

  return (
    <div className="flex h-44 items-end justify-between gap-2 border-b border-outline-variant pb-2">
      {data.map((d, i) => {
        const txPct = allZero ? 0 : Math.max(2, (d.tx / maxVal) * 100);
        const rxPct = allZero ? 0 : Math.max(2, (d.rx / maxVal) * 100);
        return (
          <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-3 rounded-t-sm transition-opacity group-hover:opacity-80"
                style={{ height: `${txPct}%`, background: TX_COLOR }}
                title={`TX ${formatBytes(d.tx)}`}
              />
              <div
                className="w-3 rounded-t-sm transition-opacity group-hover:opacity-80"
                style={{ height: `${rxPct}%`, background: RX_COLOR }}
                title={`RX ${formatBytes(d.rx)}`}
              />
            </div>
            <span className="mt-2 w-full truncate text-center text-label-xs text-on-surface-variant">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<DataUsage | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const load = async () => {
    setStatsLoading(true);
    try {
      const s = await api.getStats();
      setStats(s);
    } catch (e) {
      console.error("Error cargando estadísticas:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadUsage = async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      setUsage(await api.getDataUsage());
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

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api.cacheClear();
      await loadUsage();
    } catch (e) {
      console.error("Error al recalcular:", e);
    } finally {
      setRecalculating(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";

  // El escaneo completo (data-usage) da el conteo confiable; emnify no filtra
  // por ?status= de forma consistente para el total.
  const accurateActive = usage?.statusCount?.[1];
  const accurateSuspended = usage?.statusCount?.[2];
  const displayActive = !usageLoading && accurateActive != null ? accurateActive : stats?.activeSims;
  const displaySuspended = !usageLoading && accurateSuspended != null ? accurateSuspended : stats?.suspendedSims;
  const kpiLoading = statsLoading && usageLoading;

  const online = usage?.statusCount?.online ?? usage?.statusCount?.[1] ?? 0;
  const disabled = usage?.statusCount?.disabled ?? usage?.statusCount?.[2] ?? 0;
  const offline =
    usage?.statusCount?.offline ?? (usage?.statusCount?.[0] ?? 0) + (usage?.statusCount?.[3] ?? 0);
  const deviceTotal = online + disabled + offline || 1;

  const cachedMins = usage?.cachedAt
    ? Math.round((Date.now() - new Date(usage.cachedAt).getTime()) / 60000)
    : null;

  const pct = (n?: number) =>
    stats?.totalSims && n != null ? `${Math.round((n / stats.totalSims) * 100)}% del total` : "";

  return (
    <div className="p-container-margin">
      {/* ── Encabezado ────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-display-md text-on-background">
            {greeting}, {user?.name?.split(" ")[0] || "Admin"}
          </h1>
          <p className="text-body-md text-on-surface-variant">
            Conectividad de la red EMNIFY
            {cachedMins != null && !usageLoading ? ` · actualizado hace ${cachedMins} min` : ""}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
        >
          <Icon name="refresh" className={`text-[18px] ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── Métricas: una sola tira ───────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant lg:grid-cols-4 [&>*]:bg-surface-container-lowest">
        <KpiCell
          label="SIMs en EMNIFY" icon="sim_card"
          value={stats?.totalSims?.toLocaleString("es-MX") ?? "—"}
          note="Chips en inventario" loading={statsLoading}
        />
        <KpiCell
          label="Activas" icon="check_circle" tone="success"
          value={displayActive?.toLocaleString("es-MX") ?? "—"}
          note={pct(displayActive) || "Con datos activos"} loading={kpiLoading}
        />
        <KpiCell
          label="Suspendidas" icon="pause_circle" tone="warning"
          value={displaySuspended?.toLocaleString("es-MX") ?? "—"}
          note={pct(displaySuspended) || "Temporalmente inactivas"} loading={kpiLoading}
        />
        <KpiCell
          label="Clientes" icon="groups"
          value={stats?.totalClients?.toLocaleString("es-MX") ?? "—"}
          note="Registrados en el panel" loading={statsLoading}
        />
      </div>

      {/* ── Banner de caché ───────────────────────────────── */}
      {usage?.stale && !usageLoading && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg px-4 py-2.5 text-body-sm" style={{ background: "#fdf3e1", color: "#92400e" }}>
          <Icon name="schedule" className="text-[18px]" />
          <p className="flex-1">
            <strong className="font-semibold">Datos de hace {cachedMins} min.</strong> El recálculo completo tarda unos 30 segundos.
          </p>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="rounded-md border border-current px-3 py-1 text-label-md whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {recalculating ? "Recalculando…" : "Recalcular ahora"}
          </button>
        </div>
      )}

      {/* ── Error de consumo ──────────────────────────────── */}
      {usageError ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-error bg-error-container p-card-padding">
          <div className="flex items-center gap-3">
            <Icon name="error" className="text-error" />
            <div>
              <p className="text-label-md text-on-error-container">
                No se pudo cargar el consumo de datos
              </p>
              <p className="mt-0.5 text-body-sm text-on-error-container">{usageError}</p>
            </div>
          </div>
          <button
            onClick={loadUsage}
            disabled={usageLoading}
            className="flex items-center gap-2 rounded-lg bg-error px-3 py-2 text-label-md text-on-error transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="refresh" className={`text-[18px] ${usageLoading ? "animate-spin" : ""}`} />
            Reintentar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
          {/* Volumen del mes + tráfico */}
          <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-label-md text-on-surface">
                Volumen de datos{usage?.month ? ` · ${usage.month}` : ""}
              </h3>
              <span className="text-body-sm text-on-surface-variant">
                {usage?.endpointsWithStats ?? "—"} de {usage?.totalEndpoints?.toLocaleString("es-MX") ?? "—"} endpoints con tráfico
              </span>
            </div>

            {usageLoading ? (
              <Skeleton className="mb-6 h-12 w-64" />
            ) : (
              <div className="mb-6 flex flex-wrap items-end gap-x-8 gap-y-3">
                <p className="text-[40px] leading-none font-semibold tracking-tight text-on-surface tabular-nums">
                  {formatBytes(usage?.totalBytes ?? 0).split(" ")[0]}
                  <span className="ml-1.5 text-body-lg font-normal text-on-surface-variant">
                    {formatBytes(usage?.totalBytes ?? 0).split(" ")[1]}
                  </span>
                </p>
                <div className="flex gap-6 pb-1">
                  <div>
                    <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TX_COLOR }} />Enviado
                    </p>
                    <p className="text-label-md text-on-surface tabular-nums">{formatBytes(usage?.txBytes ?? 0)}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RX_COLOR }} />Recibido
                    </p>
                    <p className="text-label-md text-on-surface tabular-nums">{formatBytes(usage?.rxBytes ?? 0)}</p>
                  </div>
                </div>
              </div>
            )}

            <p className="mb-3 text-body-sm text-on-surface-variant">Tráfico de las últimas 6 horas</p>
            {usageLoading ? (
              <div className="flex h-44 items-end gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="flex-1 rounded" style={{ height: `${30 + i * 10}%` }} />
                ))}
              </div>
            ) : (
              <TrafficChart data={usage?.trafficHourly ?? []} />
            )}
          </div>

          {/* Estado de dispositivos */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="text-label-md text-on-surface">Estado de los dispositivos</h3>
                {!usageLoading && (
                  <span className="text-body-sm text-on-surface-variant">
                    {(online + disabled + offline).toLocaleString("es-MX")} en total
                  </span>
                )}
              </div>

              {usageLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-3 w-full rounded-full" />
                  <Skeleton className="h-10 w-2/3" />
                </div>
              ) : (
                <>
                  <div className="mb-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                    <div className="h-full" style={{ width: `${(online / deviceTotal) * 100}%`, background: "#16a34a" }} />
                    <div className="h-full bg-warning" style={{ width: `${(disabled / deviceTotal) * 100}%` }} />
                    <div className="h-full bg-surface-container-high" style={{ width: `${(offline / deviceTotal) * 100}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "En línea",       count: online,   icon: "check_circle", color: "#15803d" },
                      { label: "Deshabilitados", count: disabled, icon: "pause_circle", color: "#b45309" },
                      { label: "Sin conexión",   count: offline,  icon: "do_not_disturb_on", color: "#57536a" },
                    ].map(({ label, count, icon, color }) => (
                      <div key={label}>
                        <p className="flex items-center gap-1 text-body-sm" style={{ color }}>
                          <Icon name={icon} className="text-[15px]" />
                          {label}
                        </p>
                        <p className="text-[20px] leading-tight font-semibold text-on-surface tabular-nums">
                          {count.toLocaleString("es-MX")}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
              <h3 className="mb-1 text-label-md text-on-surface">Endpoints con tráfico este mes</h3>
              {usageLoading ? (
                <Skeleton className="h-10 w-40" />
              ) : (
                <>
                  <p className="text-[20px] font-semibold text-on-surface tabular-nums">
                    {usage?.endpointsWithStats ?? "—"}
                    <span className="text-body-md font-normal text-on-surface-variant">
                      {" "}de {usage?.totalEndpoints?.toLocaleString("es-MX") ?? "—"}
                    </span>
                  </p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${usage?.totalEndpoints ? ((usage.endpointsWithStats ?? 0) / usage.totalEndpoints) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
