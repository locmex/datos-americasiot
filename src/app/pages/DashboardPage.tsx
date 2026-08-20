import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Skeleton } from "../components/ui/skeleton";
import { Icon } from "../components/ui/icon";

// Mismos roles de color que el portal del cliente: TX verde de marca, RX azul.
const TX_COLOR = "#3ECF8E";
const RX_COLOR = "#3b82f6";

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

// ─── Tarjeta de métrica ───────────────────────────────────────────
function MetricCard({
  label, value, subtitle, icon, tone = "neutral", loading,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  icon: string;
  tone?: "neutral" | "success" | "warning";
  loading: boolean;
}) {
  const toneClasses = {
    neutral: { value: "text-on-surface",  note: "text-on-surface-variant", chip: "text-tertiary" },
    success: { value: "text-primary",     note: "text-primary",            chip: "bg-primary/10 text-primary rounded p-1" },
    warning: { value: "text-on-warning",  note: "text-on-warning",         chip: "bg-warning/10 text-on-warning rounded p-1" },
  }[tone];

  return (
    <div className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding transition-colors hover:bg-surface-bright">
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-body-sm tracking-wider text-on-surface-variant uppercase">
          {label}
        </p>
        <span className={toneClasses.chip}>
          <Icon name={icon} className="text-[16px]" />
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <div>
          <h3 className={`text-display-lg ${toneClasses.value}`}>{value}</h3>
          <p className={`mt-1 text-body-sm ${toneClasses.note}`}>{subtitle}</p>
        </div>
      )}
    </div>
  );
}

// ─── Dona TX / RX ─────────────────────────────────────────────────
function UsageDonut({ tx, rx, total }: { tx: number; rx: number; total: number }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const txFrac = total > 0 ? tx / total : 0;
  const rxFrac = total > 0 ? rx / total : 0;

  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 176 176" className="h-full w-full -rotate-90">
        <circle cx="88" cy="88" r={R} fill="none" strokeWidth="16" className="stroke-surface-container" />
        {total > 0 && (
          <>
            <circle
              cx="88" cy="88" r={R} fill="none" strokeWidth="16" stroke={TX_COLOR}
              strokeDasharray={`${txFrac * C} ${C}`} strokeLinecap="butt"
            />
            <circle
              cx="88" cy="88" r={R} fill="none" strokeWidth="16" stroke={RX_COLOR}
              strokeDasharray={`${rxFrac * C} ${C}`} strokeDashoffset={-txFrac * C} strokeLinecap="butt"
            />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {total > 0 ? (
          <>
            <span className="text-display-md leading-tight text-on-surface">
              {formatBytes(total).split(" ")[0]}
            </span>
            <span className="text-body-md text-on-surface-variant">
              {formatBytes(total).split(" ")[1]} totales
            </span>
          </>
        ) : (
          <span className="text-body-md text-on-surface-variant">Sin datos</span>
        )}
      </div>
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
    <div className="flex h-48 items-end justify-between gap-2 border-b border-outline-variant pb-2">
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

  return (
    <div className="p-container-margin">
      {/* ── Encabezado ────────────────────────────────────── */}
      <div className="mb-section-gap flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-display-md text-on-background">
            {greeting}, {user?.name?.split(" ")[0] || "Admin"} 👋
          </h1>
          <p className="text-body-lg text-on-surface-variant">
            Resumen de conectividad IoT
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg btn-primary px-4 py-2 text-label-md shadow-sm transition-colors disabled:opacity-50"
        >
          <Icon name="refresh" className={`text-[18px] ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── Banner de caché ───────────────────────────────── */}
      {usage?.stale && !usageLoading && (
        <div className="mb-section-gap flex flex-wrap items-center justify-between gap-4 rounded-lg border border-outline-variant bg-surface-variant p-4">
          <div className="flex items-center gap-3">
            <Icon name="info" className="text-outline" />
            <p className="text-body-md text-on-surface">
              Mostrando datos del caché ({cachedMins}m). El recálculo completo puede tardar ~30 segundos.
            </p>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="rounded border border-outline-variant bg-surface px-3 py-1.5 text-label-md whitespace-nowrap text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            {recalculating ? "Recalculando…" : "Recalcular ahora"}
          </button>
        </div>
      )}

      {/* ── Métricas ──────────────────────────────────────── */}
      <div className="mb-section-gap grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total SIMs" icon="sim_card"
          value={stats?.totalSims?.toLocaleString("es-MX") ?? "—"}
          subtitle="Chips en inventario" loading={statsLoading}
        />
        <MetricCard
          label="SIMs Activas" icon="check_circle" tone="success"
          value={displayActive?.toLocaleString("es-MX") ?? "—"}
          subtitle="Con datos activos" loading={kpiLoading}
        />
        <MetricCard
          label="SIMs Suspendidas" icon="pause_circle" tone="warning"
          value={displaySuspended?.toLocaleString("es-MX") ?? "—"}
          subtitle="Temporalmente inactivas" loading={kpiLoading}
        />
        <MetricCard
          label="Clientes Registrados" icon="groups"
          value={stats?.totalClients?.toLocaleString("es-MX") ?? "—"}
          subtitle="En este portal" loading={statsLoading}
        />
      </div>

      {/* ── Error de consumo ──────────────────────────────── */}
      {usageError ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-error bg-error-container p-card-padding">
          <div className="flex items-center gap-3">
            <Icon name="error" className="text-error" />
            <div>
              <p className="text-label-md text-on-error-container">
                Error cargando consumo de datos
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
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
          {/* Consumo de datos */}
          <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding lg:col-span-1">
            <h3 className="mb-6 text-headline-sm text-on-surface">Consumo de Datos</h3>

            {usageLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6">
                <Skeleton className="h-48 w-48 rounded-full" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center">
                <UsageDonut
                  tx={usage?.txBytes ?? 0}
                  rx={usage?.rxBytes ?? 0}
                  total={usage?.totalBytes ?? 0}
                />
                <div className="mt-6 flex justify-around rounded-lg bg-surface-container-low p-3">
                  <div className="flex items-center gap-2">
                    <Icon name="arrow_upward" style={{ color: TX_COLOR }} />
                    <div>
                      <p className="text-label-xs text-on-surface-variant uppercase">TX enviado</p>
                      <p className="text-label-md text-on-surface">{formatBytes(usage?.txBytes ?? 0)}</p>
                    </div>
                  </div>
                  <div className="w-px bg-outline-variant" />
                  <div className="flex items-center gap-2">
                    <Icon name="arrow_downward" style={{ color: RX_COLOR }} />
                    <div>
                      <p className="text-label-xs text-on-surface-variant uppercase">RX recibido</p>
                      <p className="text-label-md text-on-surface">{formatBytes(usage?.rxBytes ?? 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-outline-variant pt-4 text-center">
              <p className="text-body-sm text-on-surface-variant">
                Endpoints con datos:{" "}
                <strong className="text-on-surface">
                  {usage?.endpointsWithStats ?? "—"} / {usage?.totalEndpoints ?? "—"}
                </strong>
              </p>
            </div>
          </div>

          {/* Estado + tráfico */}
          <div className="flex flex-col gap-gutter lg:col-span-2">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
              <h3 className="mb-4 text-headline-sm text-on-surface">Estado de Dispositivos</h3>

              {usageLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full rounded-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : (
                <>
                  <div className="mb-3 flex h-4 w-full overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full bg-primary" style={{ width: `${(online / deviceTotal) * 100}%` }} />
                    <div className="h-full bg-warning" style={{ width: `${(disabled / deviceTotal) * 100}%` }} />
                    <div className="h-full bg-outline" style={{ width: `${(offline / deviceTotal) * 100}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-6">
                    {[
                      { label: "Online",        count: online,   dot: "bg-primary", icon: "check_circle" },
                      { label: "Deshabilitado", count: disabled, dot: "bg-warning", icon: "pause_circle" },
                      { label: "Offline",       count: offline,  dot: "bg-outline", icon: "circle" },
                    ].map(({ label, count, dot, icon }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${dot}`} />
                        <Icon name={icon} className="text-[16px] text-on-surface-variant" />
                        <span className="text-body-sm text-on-surface">
                          {label} ({count.toLocaleString("es-MX")})
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-1 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-headline-sm text-on-surface">Tráfico (últimas 6 h)</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: TX_COLOR }} />
                    <span className="text-body-sm text-on-surface-variant">TX</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: RX_COLOR }} />
                    <span className="text-body-sm text-on-surface-variant">RX</span>
                  </div>
                </div>
              </div>

              {usageLoading ? (
                <div className="flex h-48 items-end gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="flex-1 rounded" style={{ height: `${30 + i * 10}%` }} />
                  ))}
                </div>
              ) : (
                <TrafficChart data={usage?.trafficHourly ?? []} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
