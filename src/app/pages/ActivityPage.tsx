import { useEffect, useState } from "react";
import { Activity, RefreshCw, Filter, CreditCard, Users, Wifi, CheckCircle2, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";

interface Log {
  type: string;
  message: string;
  timestamp: string;
  iccid?: string;
  userId?: string;
  clientId?: string;
}

const TYPE_MAP: Record<string, { icon: typeof Activity; color: string; bg: string; label: string }> = {
  login: { icon: CheckCircle2, color: "#3ECF8E", bg: "rgba(62,207,142,0.1)", label: "Autenticación" },
  sim_status: { icon: CreditCard, color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "Estado SIM" },
  endpoint_update: { icon: Wifi, color: "#a78bfa", bg: "rgba(167,139,250,0.1)", label: "Endpoint" },
  chip_assigned: { icon: Users, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "Asignación" },
  chip_unassigned: { icon: Users, color: "#94a3b8", bg: "rgba(148,163,184,0.1)", label: "Desasignación" },
  chips_added: { icon: CreditCard, color: "#3ECF8E", bg: "rgba(62,207,142,0.1)", label: "SIM Añadida" },
  client_created: { icon: Users, color: "#34d399", bg: "rgba(52,211,153,0.1)", label: "Cliente" },
  user_created: { icon: CheckCircle2, color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "Usuario" },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)} días`;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getActivity();
      setLogs(res.logs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const types = ["all", ...Object.keys(TYPE_MAP)];
  const filtered = filter === "all" ? logs : logs.filter((l) => l.type === filter);

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Log de Actividad</h1>
          <p className="text-sm text-gray-500 mt-1">{logs.length} eventos registrados</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </Button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => {
          const cfg = TYPE_MAP[t];
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-all border"
              style={{
                background: filter === t ? (cfg?.bg || "#f3f4f6") : "#ffffff",
                color: filter === t ? (cfg?.color || "#111827") : "#6b7280",
                borderColor: filter === t ? (cfg?.color || "#d1d5db") : "#e5e7eb",
              }}
            >
              {t === "all" ? "Todos" : cfg?.label || t}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4">
                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Clock className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">Sin actividad registrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((log, i) => {
              const cfg = TYPE_MAP[log.type] || { icon: Activity, color: "#9ca3af", bg: "#f3f4f6", label: log.type };
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex items-start gap-4 p-5 hover:bg-gray-50/50 transition-colors">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                    style={{ background: cfg.bg }}
                  >
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-gray-800 leading-relaxed">{log.message}</p>
                      <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(log.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: cfg.color, background: cfg.bg }}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(log.timestamp).toLocaleString("es-MX", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}