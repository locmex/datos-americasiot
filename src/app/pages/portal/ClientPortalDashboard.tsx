import { useState, useEffect, useCallback, useContext, useRef } from "react";
import {
  CreditCard, Wifi, WifiOff, PauseCircle, CheckCircle2, Circle, RefreshCw,
  Loader2, Send, BarChart2, X, MessageSquare, ZapOff, Zap,
  Download, Upload, Activity, Signal, ChevronRight, ChevronUp, ChevronDown,
  Cpu, AlertCircle, AlertTriangle, CheckCheck, RotateCcw, Pencil, Search,
  CheckSquare, Square, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../../components/ui/tooltip";
import { usePopper } from "react-popper";
import { clientApi } from "../../lib/api";
import { ClientAuthContext } from "../../lib/client-auth";
import { toast } from "sonner";
import { DeviceDetailModal, EmnifyEndpoint } from "../../components/DeviceDetailModal";
import { BRAND, STATUS_TOKENS, type Tone } from "../../lib/status-tokens";
import { Icon } from "../../components/ui/icon";

// Ventana de páginas con elipsis: 1 … 4 5 6 … 20
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ClientSIM {
  iccid: string;
  iccid_with_luhn?: string;
  simId: string | number | null;
  status: { id: number; description: string };
  endpoint: { id: number; name: string; imei?: string; imei_with_luhn?: string } | null;
  endpointId: number | null;
  imsi: string | null;
  imei?: string | null;
  usage: any;
  connectivity: any;
  rat_type: any;
  localData: any;
}

function resolveRat(raw: any): string {
  if (!raw) return "";
  const desc = typeof raw === "string" ? raw : (raw.description || "");
  const u = desc.toUpperCase();
  if (u === "LTE") return "4G";
  if (u === "UMTS") return "3G";
  if (u === "GSM") return "2G";
  return desc || u;
}

function getPortalConnBadge(sim: ClientSIM): { label: string; online: boolean; color: string; bg: string } {
  const conn = sim.connectivity as any;
  const statusId = conn?.status?.id ?? -1;
  const statusDesc = (conn?.status?.description ?? "").toLowerCase();
  const pdp = conn?.pdp_context;
  const hasPdp = !!(pdp?.start_time || pdp?.created || pdp?.ip_address || pdp?.ue_ip_address);
  const rat = resolveRat(sim.rat_type ?? pdp?.rat_type ?? conn?.rat_type);
  const online = hasPdp || statusId === 1 || statusDesc.includes("online");
  if (online) return { label: rat ? `${rat} Online` : "Online", online: true, color: "#059669", bg: "rgba(5,150,105,0.10)" };
  const attached = statusId === 2 || statusDesc.includes("attach");
  if (attached) return { label: "Registrado", online: false, color: "#d97706", bg: "rgba(217,119,6,0.10)" };
  return { label: "Sin conexión", online: false, color: "#94a3b8", bg: "rgba(148,163,184,0.10)" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS = {
  0: { label: "Sin estado",  color: "#94a3b8", bg: "rgba(148,163,184,0.12)", icon: Circle },
  1: { label: "Activa",      color: "#059669", bg: "rgba(5,150,105,0.12)",   icon: CheckCircle2 },
  2: { label: "Suspendida",  color: "#d97706", bg: "rgba(217,119,6,0.12)",   icon: PauseCircle },
  3: { label: "Desactivada", color: "#dc2626", bg: "rgba(220,38,38,0.12)",   icon: WifiOff },
} as const;

function getStatus(id: number) {
  return STATUS[id as keyof typeof STATUS] ?? STATUS[0];
}

// Metadatos de cada filtro de estado (chip "Filtro activo"). Categorías excluyentes.
const FILTER_META: Record<number, { label: string; tone: Tone }> = {
  0: { label: "Disponibles",  tone: STATUS_TOKENS.muted },
  1: { label: "Activas",      tone: STATUS_TOKENS.good },
  2: { label: "Suspendidas",  tone: STATUS_TOKENS.warning },
  3: { label: "Desactivadas", tone: STATUS_TOKENS.danger },
};

function formatMB(mb: number): string {
  if (!mb || mb === 0) return "0 MB";
  if (mb < 0.01) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(2)} MB`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getUsageMB(usage: any): { tx: number; rx: number } {
  const cm = usage?.current_month?.data;
  if (!cm) return { tx: 0, rx: 0 };
  return { tx: parseFloat(cm.volume_tx ?? "0"), rx: parseFloat(cm.volume_rx ?? "0") };
}

// ─── SMS Console (chat style) ─────────────────────────────────────────────────
interface SmsEntry {
  id?: number;
  text: string;
  src: string;
  time: string;
  direction: "MT" | "MO";
  status: "ok" | "err" | "pending" | "delivered";
  raw?: any;
}

function SmsConsoleModal({ sim, onClose }: { sim: ClientSIM; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("AmericasIoT");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsEntry[]>([]);
  const textRef  = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const iccid = sim.iccid_with_luhn || sim.iccid;

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 80);
  };

  const loadHistory = async () => {
    if (!sim.endpointId) { setLoadingHistory(false); return; }
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res: any = await clientApi.getSmsHistory(sim.endpointId, 1, 50);
      const raw: any[] = res.messages ?? (Array.isArray(res) ? res : []);
      const parsed: SmsEntry[] = raw
        .map((m: any) => {
          const typeId = m.sms_type?.id ?? m.type?.id ?? 1;
          const direction: "MT" | "MO" = typeId === 2 ? "MO" : "MT";
          const statusDesc = (m.status?.description ?? "").toLowerCase();
          const status: SmsEntry["status"] =
            statusDesc.includes("fail") || statusDesc.includes("error") ? "err"
            : statusDesc.includes("deliver") ? "delivered"
            : "ok";
          const ts = m.created_date ?? m.submit_date ?? m.last_updated ?? "";
          const timeStr = ts
            ? new Date(ts).toLocaleString("es-MX", {
                day: "2-digit", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })
            : "—";
          return { id: m.id, text: m.payload ?? m.message ?? "", src: m.source_address ?? m.sender ?? (direction === "MT" ? "Portal" : "Dispositivo"), time: timeStr, direction, status, raw: m };
        })
        .sort((a, b) => {
          const ta = new Date(a.raw?.created_date ?? a.raw?.submit_date ?? 0).getTime();
          const tb = new Date(b.raw?.created_date ?? b.raw?.submit_date ?? 0).getTime();
          return ta - tb;
        });
      setMessages(parsed);
      scrollToBottom();
    } catch (e: any) {
      setHistoryError(e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { loadHistory(); textRef.current?.focus(); }, [sim.endpointId]);
  useEffect(() => { scrollToBottom(); }, [messages.length]);

  const isNumeric = /^\d+$/.test(source);
  const sourceValid = source.trim().length > 0 && (isNumeric ? source.length <= 17 : source.length <= 11);
  const sourceHint = isNumeric ? `${source.length}/17 dígitos` : `${source.length}/11 caracteres`;

  const fmtNow = () => new Date().toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const handleSend = async () => {
    if (!message.trim() || !sourceValid || sending || !sim.endpointId) return;
    const text = message.trim();
    const src  = source.trim();
    setSending(true); setError(null); setMessage("");
    setMessages(prev => [...prev, { text, src, time: fmtNow(), direction: "MT", status: "pending" }]);
    try {
      await clientApi.sendSms(sim.endpointId, text, sim.iccid);
      await loadHistory();
    } catch (e: any) {
      setError(e.message);
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, status: "err" } : m));
    } finally {
      setSending(false);
      setTimeout(() => textRef.current?.focus(), 50);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ height: "min(680px, 95dvh)", background: "#fff" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#0f766e" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm" style={{ background: "#3ECF8E" }}>
            IoT
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate">
              {sim.endpoint?.name || `SIM …${iccid.slice(-8)}`}
            </p>
            <p className="text-white/60 text-[10px] font-mono truncate leading-tight">{iccid}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={loadHistory} disabled={loadingHistory}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors shrink-0">
                <RefreshCw className={`w-4 h-4 text-white/80 ${loadingHistory ? "animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Recargar historial</p>
            </TooltipContent>
          </Tooltip>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors shrink-0">
            <X className="w-4 h-4 text-white/80" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1" style={{ background: "#e8ede9" }}>
          {loadingHistory ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="w-7 h-7 animate-spin" style={{ color: "#3ECF8E" }} />
              <p className="text-xs text-gray-500">Cargando historial SMS…</p>
            </div>
          ) : historyError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
              <AlertTriangle className="w-8 h-8 text-red-300" />
              <p className="text-sm font-semibold text-gray-500">Error al cargar historial</p>
              <p className="text-xs text-red-400 break-words">{historyError}</p>
              <button onClick={loadHistory} className="mt-1 px-4 py-1.5 rounded-full text-xs font-semibold text-white" style={{ background: "#3ECF8E" }}>
                Reintentar
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(62,207,142,0.15)" }}>
                <MessageSquare className="w-7 h-7" style={{ color: "#3ECF8E" }} />
              </div>
              <p className="text-sm font-semibold text-gray-500">Sin mensajes aún</p>
              <p className="text-xs text-gray-400 -mt-2">Los SMS enviados y recibidos aparecerán aquí</p>
            </div>
          ) : (
            <>
              <div className="flex-1" />
              {messages.map((m, i) => {
                const isMT = m.direction === "MT";
                return (
                  <div key={m.id ?? i} className={`flex ${isMT ? "justify-end" : "justify-start"} mb-0.5`}>
                    <div style={{ maxWidth: "78%", minWidth: 80 }}>
                      <div className="px-3 pt-2 pb-1 text-sm leading-snug shadow-sm"
                        style={{
                          background: isMT ? (m.status === "err" ? "#ef4444" : m.status === "pending" ? "#a3b8a4" : "#3ECF8E") : "#ffffff",
                          color: isMT ? "#ffffff" : "#111827",
                          borderRadius: isMT ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                          wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap",
                        }}
                      >
                        {!isMT && <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#0f766e" }}>{m.src}</p>}
                        <span>{m.text}</span>
                        <span className="flex items-center gap-0.5 justify-end mt-0.5">
                          <span className="text-[10px] leading-none select-none" style={{ color: isMT ? "rgba(255,255,255,0.72)" : "#9ca3af", whiteSpace: "nowrap" }}>
                            {m.time}
                          </span>
                          {isMT && (
                            <>
                              {m.status === "delivered" && <CheckCheck className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.9)" }} />}
                              {m.status === "ok"        && <CheckCheck className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} />}
                              {m.status === "pending"   && <RefreshCw  className="w-3 h-3 shrink-0 animate-spin" style={{ color: "rgba(255,255,255,0.7)" }} />}
                              {m.status === "err"       && <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.9)" }} />}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="h-1 shrink-0" />
            </>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mb-1 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span className="break-words">{error}</span>
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-3 pt-2 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-gray-400 shrink-0 font-medium">Origen:</span>
            <input
              type="text" value={source} onChange={(e) => setSource(e.target.value)} maxLength={17}
              className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-300 min-w-0"
              placeholder="AmericasIoT"
            />
            <span className="text-[10px] shrink-0" style={{ color: !sourceValid && source.length > 0 ? "#ef4444" : "#9ca3af" }}>
              {sourceHint}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textRef} value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1} maxLength={160} placeholder="Escribe un mensaje"
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200 resize-none leading-snug"
              style={{ minHeight: 40, maxHeight: 96, overflowY: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "40px";
                el.style.height = Math.min(el.scrollHeight, 96) + "px";
              }}
            />
            <span className="text-[10px] font-bold shrink-0 mb-1.5"
              style={{ color: message.length > 140 ? "#ef4444" : message.length > 110 ? "#f59e0b" : "#9ca3af" }}>
              {160 - message.length}
            </span>
            <button onClick={handleSend} disabled={!message.trim() || !sourceValid || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40 active:scale-95"
              style={{ background: "#3ECF8E" }}>
              {sending ? <RefreshCw className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 px-1">Shift+Enter para enviar</p>
        </div>
      </div>
    </div>
  );
}

// ─── Rename Modal ─────────────────────────────────────────────────────────────
function RenameModal({
  devices,
  onClose,
  onSaved,
}: {
  devices: ClientSIM[];
  onClose: () => void;
  onSaved: (updates: { iccid: string; name: string }[]) => void;
}) {
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(devices.map((d) => [d.iccid, d.endpoint?.name || ""]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updates: { iccid: string; name: string }[] = [];
    try {
      await Promise.all(
        devices.map(async (d) => {
          const name = (names[d.iccid] ?? "").trim();
          if (!name || !d.endpointId) return;
          await clientApi.renameDevice(d.endpointId, name);
          updates.push({ iccid: d.iccid, name });
        })
      );
      toast.success(`${updates.length} dispositivo${updates.length !== 1 ? "s" : ""} renombrado${updates.length !== 1 ? "s" : ""}`);
      onSaved(updates);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "80dvh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(62,207,142,0.12)" }}>
              <Pencil className="w-4 h-4" style={{ color: "#059669" }} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Renombrar dispositivos</p>
              <p className="text-[10px] text-gray-400">{devices.length} dispositivo{devices.length !== 1 ? "s" : ""} seleccionado{devices.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Device list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {devices.map((d) => {
            const iccid = d.iccid_with_luhn || d.iccid;
            return (
              <div key={d.iccid}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Cpu className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-[10px] text-gray-400 font-mono truncate">…{iccid.slice(-12)}</span>
                </div>
                <input
                  type="text"
                  value={names[d.iccid] ?? ""}
                  onChange={(e) => setNames((prev) => ({ ...prev, [d.iccid]: e.target.value }))}
                  maxLength={100}
                  placeholder="Nombre del dispositivo"
                  className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "#059669" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SIM Detail Sheet ─────────────────────────────────────────────────────────
function SimDetailSheet({
  sim,
  onClose,
}: {
  sim: ClientSIM;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "usage">("info");
  const [usageDetail, setUsageDetail] = useState<any>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const iccid = sim.iccid_with_luhn || sim.iccid;
  const statusCfg = getStatus(sim.status?.id ?? 0);
  const StatusIcon = statusCfg.icon;
  const usage = getUsageMB(usageDetail?.stats ?? sim.usage);
  const conn = getPortalConnBadge(sim);

  useEffect(() => {
    if (!sim.endpointId) return;
    setLoadingUsage(true);
    clientApi.getSimUsage(sim.endpointId, sim.iccid)
      .then((res) => setUsageDetail(res))
      .catch(() => setUsageDetail(null))
      .finally(() => setLoadingUsage(false));
  }, [sim.endpointId, sim.iccid]);

  const buildChart = () => {
    const stats = usageDetail?.stats ?? sim.usage;
    if (!stats) return [];
    const lh = stats?.last_hour?.data;
    if (!lh) return [];
    const hours: Record<string, { tx: number; rx: number }> = {};
    for (const [t, v] of (lh.tx ?? [])) {
      const k = `${String(t).split(":")[0]}:00`;
      if (!hours[k]) hours[k] = { tx: 0, rx: 0 };
      hours[k].tx += parseFloat(v ?? 0);
    }
    for (const [t, v] of (lh.rx ?? [])) {
      const k = `${String(t).split(":")[0]}:00`;
      if (!hours[k]) hours[k] = { tx: 0, rx: 0 };
      hours[k].rx += parseFloat(v ?? 0);
    }
    return Object.entries(hours).sort().slice(-8).map(([label, val]) => ({
      label,
      tx: Math.round(val.tx * 1024 * 1024),
      rx: Math.round(val.rx * 1024 * 1024),
    }));
  };

  const chartData = buildChart();
  const hasChart = chartData.length > 0 && chartData.some((d) => d.tx > 0 || d.rx > 0);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed z-50 bg-white shadow-2xl flex flex-col
          bottom-0 left-0 right-0 rounded-t-3xl
          sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:rounded-none sm:rounded-l-2xl sm:w-96"
        style={{ maxHeight: "92dvh" }}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-4 sm:pt-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: statusCfg.bg }}>
              <StatusIcon className="w-5 h-5" style={{ color: statusCfg.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400 font-mono">ICCID</p>
              <code className="text-sm font-bold text-gray-800 block truncate">…{iccid.slice(-12)}</code>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: statusCfg.bg, color: statusCfg.color }}>
              {statusCfg.label}
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="shrink-0 flex border-b border-gray-100 px-5 gap-1">
          {([
            { id: "info",  label: "Información General del SIM", icon: Info },
            { id: "usage", label: "Consumo", icon: BarChart2 },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors relative -mb-px"
              style={{
                borderColor: activeTab === id ? "#3ECF8E" : "transparent",
                color: activeTab === id ? "#059669" : "#9ca3af",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* ── Información General tab ── */}
            {activeTab === "info" && (
              <>
                {/* Device name */}
                {sim.endpoint?.name && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <Wifi className="w-4 h-4 shrink-0" style={{ color: "#3ECF8E" }} />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Dispositivo</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{sim.endpoint.name}</p>
                    </div>
                  </div>
                )}

                {/* Connectivity */}
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: conn.color }} />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Conexión</p>
                    <p className="text-sm font-semibold" style={{ color: conn.color }}>{conn.label}</p>
                  </div>
                </div>

                {/* SIM info fields */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Datos del SIM</p>
                  <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                    {[
                      { label: "ICCID", value: iccid, mono: true },
                      ...(sim.imsi ? [{ label: "IMSI", value: sim.imsi, mono: true }] : []),
                      { label: "ID SIM", value: String(sim.simId ?? "—"), mono: false },
                      { label: "Estado", value: statusCfg.label, mono: false },
                    ].map(({ label, value, mono }) => (
                      <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                        <span className="text-xs text-gray-400 shrink-0">{label}</span>
                        <span className={`text-xs text-gray-700 truncate text-right ${mono ? "font-mono" : "font-medium"}`}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Consumo tab ── */}
            {activeTab === "usage" && (
              <div className="space-y-4">
                {/* Monthly totals */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Consumo del mes</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Enviado (TX)", value: usage.tx, icon: Upload, color: "#3ECF8E" },
                      { label: "Recibido (RX)", value: usage.rx, icon: Download, color: "#60a5fa" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon className="w-3.5 h-3.5" style={{ color }} />
                          <span className="text-[10px] text-gray-500">{label}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{value > 0 ? formatMB(value) : "0 MB"}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 px-4 py-3 rounded-xl flex items-center justify-between"
                    style={{ background: "rgba(62,207,142,0.07)", border: "1px solid rgba(62,207,142,0.2)" }}>
                    <span className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                      <Activity className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                      Total del mes
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#059669" }}>
                      {usage.tx + usage.rx > 0 ? formatMB(usage.tx + usage.rx) : "Sin datos"}
                    </span>
                  </div>
                </div>

                {/* Traffic chart */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Tráfico reciente</p>
                  {loadingUsage ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                    </div>
                  ) : hasChart ? (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <ResponsiveContainer width="100%" height={130}>
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} tickFormatter={(v) => formatBytes(v)} />
                          <RechartsTooltip
                            formatter={(v: any) => formatBytes(Number(v))}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                          />
                          <Bar key="bar-tx" dataKey="tx" name="TX" fill="#3ECF8E" radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                          <Bar key="bar-rx" dataKey="rx" name="RX" fill="#60a5fa" radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex items-center gap-4 mt-1 justify-center">
                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#3ECF8E" }} />TX
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#60a5fa" }} />RX
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-gray-200 bg-gray-50">
                      <BarChart2 className="w-8 h-8 text-gray-200 mb-2" />
                      <p className="text-xs text-gray-400 font-medium">Sin tráfico reciente</p>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
type SortKey = "iccid" | "status" | "usage";
type SortDir = "asc" | "desc";

export default function ClientPortalDashboard() {
  const ctx = useContext(ClientAuthContext)!;
  const [sims, setSims] = useState<ClientSIM[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectivityLoading, setConnectivityLoading] = useState(false);
  const [selectedSim, setSelectedSim] = useState<ClientSIM | null>(null);
  const [smsTarget, setSmsTarget] = useState<ClientSIM | null>(null);
  const [activeView, setActiveView] = useState<"sims" | "devices">("devices");
  const [selectedDevice, setSelectedDevice] = useState<{ ep: EmnifyEndpoint; sim: ClientSIM } | null>(null);

  // Mis SIMs — search + sort + filter
  const [simSearch, setSimSearch] = useState("");
  const [simPage, setSimPage] = useState(1);
  const [simPerPage, setSimPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>("iccid");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<number | null>(null); // null = all, 0 = disponible, 1 = activa, 2 = suspendida, 3 = desactivada

  // Dispositivos — search + sort + multi-select + rename + reset + status loading
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceSort, setDeviceSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "Dispositivo", dir: "asc" });
  const [devicePage, setDevicePage] = useState(1);
  const [devicePerPage, setDevicePerPage] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameTargets, setRenameTargets] = useState<ClientSIM[] | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [statusLoadingIds, setStatusLoadingIds] = useState<Set<string>>(new Set());

  // ── Popover State for confirm actions ──
  type PopoverAction = "status" | "reset";
  const [popoverConfirm, setPopoverConfirm] = useState<{ type: PopoverAction, sim: ClientSIM, el: HTMLElement } | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const { styles: popperStyles, attributes: popperAttributes } = usePopper(popoverConfirm?.el, popperElement, {
    placement: "bottom",
    strategy: "fixed",
    modifiers: [
      { name: "offset", options: { offset: [0, 8] } },
      { name: "preventOverflow", options: { padding: 16 } },
      { name: "flip", options: { fallbackPlacements: ["top", "left", "right"] } }
    ]
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popperElement && !popperElement.contains(e.target as Node)) {
        setPopoverConfirm(null);
      }
    };
    if (popoverConfirm) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverConfirm, popperElement]);

  const loadConnectivity = useCallback(async (currentSims: ClientSIM[]) => {
    if (currentSims.every((s) => !s.endpointId)) return;
    setConnectivityLoading(true);
    try {
      const res = await clientApi.getSimsConnectivity();
      const map: Record<string, any> = res.connectivity || {};
      setSims((prev) =>
        prev.map((s) => {
          if (!s.endpointId) return s;
          const conn = map[String(s.endpointId)];
          if (!conn) return s;
          return { ...s, connectivity: conn, rat_type: conn?.pdp_context?.rat_type ?? conn?.rat_type ?? s.rat_type };
        })
      );
    } catch (_) {
      // connectivity is best-effort, don't show error
    } finally {
      setConnectivityLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientApi.getMySims();
      const simsData: ClientSIM[] = res.sims || [];
      setSims(simsData);
      // Phase 2: load connectivity in background without blocking the UI
      loadConnectivity(simsData);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [loadConnectivity]);

  useEffect(() => { load(); }, [load]);

  // ── Computed SIMs for Mis SIMs tab ──
  const filteredSims = (() => {
    const byStatus = sims.filter((s) => {
      if (statusFilter !== null) {
        if ((s.status?.id ?? 0) !== statusFilter) return false;
      }
      return true;
    });

    if (simSearch.trim()) {
      const q = simSearch.toLowerCase().trim();
      const scored = byStatus.map((s) => {
        let score = 0;
        const name = (s.endpoint?.name || "").toLowerCase();
        const iccidLuhn = (s.iccid_with_luhn || "").toLowerCase();
        const iccid = (s.iccid || "").toLowerCase();

        if (name === q || iccid === q || iccidLuhn === q) score += 100;
        else if (name.startsWith(q) || iccid.startsWith(q)) score += 50;
        else if (name.includes(q) || iccid.includes(q) || iccidLuhn.includes(q)) score += 10;

        return { s, score };
      }).filter((item) => item.score > 0);

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 1).map((item) => item.s);
    }
    return byStatus;
  })();

  const sortedSims = [...filteredSims].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "iccid") {
      cmp = (a.iccid_with_luhn || a.iccid).localeCompare(b.iccid_with_luhn || b.iccid);
    } else if (sortKey === "status") {
      cmp = (a.status?.id ?? 0) - (b.status?.id ?? 0);
    } else if (sortKey === "usage") {
      const ua = getUsageMB(a.usage); const ub = getUsageMB(b.usage);
      cmp = (ua.tx + ua.rx) - (ub.tx + ub.rx);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // ── Paginación de Mis SIMs (mismo criterio que Dispositivos) ──
  const simTotalPages = Math.max(1, Math.ceil(sortedSims.length / simPerPage));
  const simFrom = sortedSims.length === 0 ? 0 : (simPage - 1) * simPerPage + 1;
  const simTo   = Math.min(simPage * simPerPage, sortedSims.length);
  const pagedSims = sortedSims.slice((simPage - 1) * simPerPage, simPage * simPerPage);

  useEffect(() => {
    setSimPage(1);
  }, [simSearch, sortKey, sortDir, statusFilter, simPerPage]);

  useEffect(() => {
    if (simPage > simTotalPages) setSimPage(simTotalPages);
  }, [simPage, simTotalPages]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" style={{ color: "#3ECF8E" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "#3ECF8E" }} />;
  };

  // ── Device actions ──
  const handleStatusChange = (sim: ClientSIM, newStatus: number) => {
    setSims((prev) => prev.map((s) => s.iccid === sim.iccid ? { ...s, status: { ...s.status, id: newStatus } } : s));
    setSelectedSim((prev) => prev?.iccid === sim.iccid ? { ...prev, status: { ...prev.status, id: newStatus } } : prev);
  };

  const confirmToggleStatus = async () => {
    if (!popoverConfirm || popoverConfirm.type !== "status") return;
    const sim = popoverConfirm.sim;
    if (!sim.simId) {
      toast.error("Esta SIM no tiene ID válido");
      setPopoverConfirm(null);
      return;
    }
    const currentStatus = sim.status?.id ?? 0;
    const isSuspended = currentStatus !== 1;
    const newStatusId = isSuspended ? 1 : 2;

    setStatusLoadingIds(prev => { const n = new Set(prev); n.add(sim.iccid); return n; });
    setPopoverConfirm(null);
    try {
      await clientApi.updateSimStatus(sim.simId, newStatusId, sim.iccid);
      setSims((prev) =>
        prev.map((s) => s.iccid === sim.iccid ? { ...s, status: { ...s.status, id: newStatusId, description: isSuspended ? "Activa" : "Suspendida" } } : s)
      );
      toast.success(`Dispositivo ${isSuspended ? "activado" : "suspendido"} correctamente`);
    } catch (e: any) {
      toast.error(e.message || "Error al actualizar estado");
    } finally {
      setStatusLoadingIds(prev => { const n = new Set(prev); n.delete(sim.iccid); return n; });
    }
  };

  const toggleDeviceStatus = (sim: ClientSIM, el: HTMLElement) => {
    setPopoverConfirm({ type: "status", sim, el });
  };

  const confirmReset = async () => {
    if (!popoverConfirm || popoverConfirm.type !== "reset") return;
    const sim = popoverConfirm.sim;
    if (!sim.endpointId) return;

    setResettingId(sim.endpointId);
    setPopoverConfirm(null);
    try {
      await clientApi.resetDeviceConnectivity(sim.endpointId);
      toast.success("Conexión restablecida");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResettingId(null);
    }
  };

  const handleResetConnectivity = (sim: ClientSIM, el: HTMLElement) => {
    setPopoverConfirm({ type: "reset", sim, el });
  };

  const handleToggleSelect = (iccid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(iccid)) next.delete(iccid); else next.add(iccid);
      return next;
    });
  };

  // Selecciona/deselecciona solo la PÁGINA visible: marcar 200 dispositivos
  // cuando en pantalla hay 25 es contraintuitivo (y "Renombrar" abriría 200 campos).
  const handleSelectAll = () => {
    const pageIccids = pagedDevices.map((s) => s.iccid);
    const allPageSelected = pageIccids.length > 0 && pageIccids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIccids.forEach((id) => next.delete(id));
      else pageIccids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleRenameSelected = () => {
    const targets = sims.filter((s) => selectedIds.has(s.iccid) && s.endpointId);
    if (targets.length === 0) return;
    setRenameTargets(targets);
  };

  const handleRenamesSaved = (updates: { iccid: string; name: string }[]) => {
    setSims((prev) =>
      prev.map((s) => {
        const upd = updates.find((u) => u.iccid === s.iccid);
        if (!upd) return s;
        return { ...s, endpoint: s.endpoint ? { ...s.endpoint, name: upd.name } : null };
      })
    );
    setSelectedIds(new Set());
    setRenameTargets(null);
  };

  const handleOpenDevice = (sim: ClientSIM) => {
    if (!sim.endpointId) { toast.error("Esta SIM no tiene dispositivo asociado"); return; }
    const ep: EmnifyEndpoint = {
      id: sim.endpointId,
      name: sim.endpoint?.name || sim.iccid,
      status: { id: sim.status.id, description: sim.status.description },
      sim: { id: sim.simId as number, iccid: sim.iccid, iccid_with_luhn: sim.iccid_with_luhn, imsi: sim.imsi || undefined },
    };
    setSelectedDevice({ ep, sim });
  };

  // ── Filtered devices for Dispositivos tab (only SIMs with a real endpoint) ──
  const devicesOnly = sims.filter((s) => !!s.endpointId);

  const filteredDevices = (() => {
    let filtered = devicesOnly;
    if (deviceSearch.trim()) {
      const q = deviceSearch.toLowerCase().trim();
      const scored = devicesOnly.map((s) => {
        let score = 0;
        const name = (s.endpoint?.name || "").toLowerCase();
        const imeiLuhn = (s.endpoint?.imei_with_luhn || "").toLowerCase();
        const imei = (s.endpoint?.imei || s.imei || "").toLowerCase();
        const iccidLuhn = (s.iccid_with_luhn || "").toLowerCase();
        const iccid = (s.iccid || "").toLowerCase();

        if (name === q || iccid === q || imei === q || iccidLuhn === q || imeiLuhn === q) score += 100;
        else if (name.startsWith(q) || iccid.startsWith(q) || imei.startsWith(q)) score += 50;
        else if (name.includes(q) || iccid.includes(q) || imei.includes(q) || iccidLuhn.includes(q) || imeiLuhn.includes(q)) score += 10;

        return { s, score };
      }).filter((item) => item.score > 0);

      scored.sort((a, b) => b.score - a.score);
      filtered = scored.slice(0, 1).map((item) => item.s);
      return filtered;
    }

    const { col, dir } = deviceSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let va = "", vb = "";
      if (col === "Dispositivo") {
        va = (a.endpoint?.name || "").toLowerCase();
        vb = (b.endpoint?.name || "").toLowerCase();
      } else if (col === "Estado") {
        va = getStatus(a.status?.id ?? 0).label;
        vb = getStatus(b.status?.id ?? 0).label;
      } else if (col === "Conexión") {
        va = getPortalConnBadge(a).label;
        vb = getPortalConnBadge(b).label;
      } else if (col === "ICCID") {
        va = a.iccid_with_luhn || a.iccid || "";
        vb = b.iccid_with_luhn || b.iccid || "";
      } else if (col === "IMEI") {
        va = a.endpoint?.imei_with_luhn || a.endpoint?.imei || a.imei || "";
        vb = b.endpoint?.imei_with_luhn || b.endpoint?.imei || b.imei || "";
      }
      return va < vb ? -mult : va > vb ? mult : 0;
    });
  })();

  // ── Paginación de Dispositivos ──
  // Solo se renderiza la página actual: con 200+ SIMs, montar todas las filas
  // en el DOM es lo que traba el scroll, el filtrado y el ordenamiento.
  const deviceTotalPages = Math.max(1, Math.ceil(filteredDevices.length / devicePerPage));
  const deviceFrom = filteredDevices.length === 0 ? 0 : (devicePage - 1) * devicePerPage + 1;
  const deviceTo   = Math.min(devicePage * devicePerPage, filteredDevices.length);
  const pagedDevices = filteredDevices.slice((devicePage - 1) * devicePerPage, devicePage * devicePerPage);

  // Al cambiar búsqueda, orden, filtro o tamaño de página, volver al inicio
  useEffect(() => {
    setDevicePage(1);
  }, [deviceSearch, deviceSort.col, deviceSort.dir, statusFilter, devicePerPage]);

  // Si la página actual queda fuera de rango (p. ej. tras filtrar), corregirla
  useEffect(() => {
    if (devicePage > deviceTotalPages) setDevicePage(deviceTotalPages);
  }, [devicePage, deviceTotalPages]);

  const exportDevicesToCSV = () => {
    const headers = ["Nombre", "Estado", "Conexión", "ICCID", "IMEI", "IMSI", "IP"];
    const rows = devicesOnly.map((s) => {
      const conn = getPortalConnBadge(s);
      const st = getStatus(s.status?.id ?? 0);
      return [
        s.endpoint?.name || "",
        st.label,
        conn.label,
        s.iccid_with_luhn || s.iccid,
        s.endpoint?.imei_with_luhn || s.endpoint?.imei || s.imei || "",
        s.imsi || "",
        (s.endpoint as any)?.ip_address || "",
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispositivos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const active      = sims.filter((s) => s.status?.id === 1).length;
  const suspended   = sims.filter((s) => s.status?.id === 2).length;
  const available   = sims.filter((s) => (s.status?.id ?? 0) === 0).length;
  const deactivated = sims.filter((s) => s.status?.id === 3).length;

  return (
    <TooltipProvider delayDuration={200}>
      <>
      {/* ── Barra de acciones (sticky en desktop) ──────────────────────────── */}
      <div className="bg-surface-container-lowest border-b border-hairline md:sticky md:top-0 z-30 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-container-margin py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Buscador */}
            <div className="relative flex-1 max-w-xl">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="text"
                value={activeView === "devices" ? deviceSearch : simSearch}
                onChange={(e) => activeView === "devices" ? setDeviceSearch(e.target.value) : setSimSearch(e.target.value)}
                placeholder={activeView === "devices" ? "Buscar dispositivo, ICCID o IMEI…" : "Buscar SIM (ICCID, MSISDN)…"}
                className="w-full pl-10 pr-10 py-2 border border-hairline rounded-lg bg-white font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {(activeView === "devices" ? deviceSearch : simSearch) && (
                <button
                  onClick={() => activeView === "devices" ? setDeviceSearch("") : setSimSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  aria-label="Limpiar búsqueda"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              )}
            </div>

            {/* Conteo + actualizar */}
            <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Icon name="sim_card" />
                <span className="font-label-md text-label-md whitespace-nowrap">
                  {loading ? "Cargando…" : `${sims.length} SIM${sims.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-hairline rounded-lg text-on-surface hover:bg-surface-container-low transition-colors font-label-md text-label-md disabled:opacity-50"
              >
                <Icon name="refresh" className={`text-[18px] ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-container-margin py-section-gap pb-10">
      {/* Tarjetas de resumen — clicables, filtran la lista */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total SIMs",   value: sims.length, filter: null, icon: null,            border: "border-hairline",            hover: "hover:bg-row-hover",            labelColor: "text-on-surface-variant", ring: "ring-primary" },
          { label: "Activas",      value: active,      filter: 1,    icon: "check_circle",  border: "border-primary-container/40", hover: "hover:bg-surface-container-low", labelColor: "text-primary",            ring: "ring-primary" },
          { label: "Suspendidas",  value: suspended,   filter: 2,    icon: "warning",       border: "border-warning/40",           hover: "hover:bg-amber-50/60",           labelColor: "text-on-warning",         ring: "ring-warning" },
          { label: "Disponibles",  value: available,   filter: 0,    icon: "inventory_2",   border: "border-hairline",             hover: "hover:bg-row-hover",             labelColor: "text-tertiary",           ring: "ring-tertiary" },
          { label: "Desactivadas", value: deactivated, filter: 3,    icon: "cancel",        border: "border-error-container",      hover: "hover:bg-error-container/20",    labelColor: "text-error",              ring: "ring-error" },
        ].map(({ label, value, filter, icon, border, hover, labelColor, ring }) => {
          const isSelected = statusFilter === filter;
          return (
            <button
              key={label}
              onClick={() => {
                setStatusFilter(filter);
                setActiveView("sims"); // al filtrar por estado, la vista útil es Mis SIMs
              }}
              className={`group relative overflow-hidden text-left bg-surface-container-lowest border ${border} ${hover} ${isSelected ? `ring-2 ${ring}` : ""} rounded-xl p-card-padding transition-colors`}
            >
              {/* Acento decorativo de la tarjeta destacada */}
              {filter === 1 && (
                <div className="absolute right-0 top-0 w-16 h-16 bg-primary-container opacity-10 rounded-bl-full" />
              )}
              <p className={`font-body-sm text-body-sm ${labelColor} uppercase tracking-wider mb-2 flex items-center gap-1`}>
                {icon && <Icon name={icon} className="text-[14px]" />}
                {label}
              </p>
              <p className="font-display-lg text-display-lg text-on-surface group-hover:text-primary transition-colors">
                {loading ? "—" : value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Tabs & Exportar — encabezado de la tarjeta de contenido */}
      <div className="bg-surface-container-lowest border border-hairline border-b-0 rounded-t-xl px-card-padding flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div className="flex gap-6">
          {[
            { id: "devices", label: "Dispositivos" },
            { id: "sims",    label: "Mis SIMs" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as any)}
              className={`py-3 font-label-md text-label-md transition-colors relative top-[1px] ${
                activeView === id
                  ? "text-primary border-b-2 border-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {!loading && devicesOnly.length > 0 && activeView === "devices" && (
          <button
            onClick={exportDevicesToCSV}
            className="flex items-center gap-2 px-4 py-2 mb-2 sm:mb-0 bg-white border border-hairline rounded-lg text-on-surface hover:bg-surface-container-low transition-colors font-label-md text-label-md shrink-0"
          >
            <Icon name="download" className="text-[18px]" />
            Exportar
          </button>
        )}
      </div>

      {/* ── Mis SIMs tab ── */}
      {activeView === "sims" && (
        <>
          {/* Filtro activo — franja dentro de la tarjeta */}
          {!loading && sims.length > 0 && statusFilter !== null && (
            <div className="bg-surface-container-lowest border-x border-hairline px-card-padding py-3 flex items-center gap-2">
              <span className="font-body-sm text-body-sm text-on-surface-variant">Filtro activo:</span>
              <button
                onClick={() => setStatusFilter(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label-xs text-label-xs transition-colors"
                style={{
                  background: FILTER_META[statusFilter]?.tone.tint,
                  color: FILTER_META[statusFilter]?.tone.text,
                }}
              >
                {FILTER_META[statusFilter]?.label ?? "Filtro"}
                <Icon name="close" className="text-[14px]" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="bg-surface-container-lowest border border-hairline border-t-0 rounded-b-xl overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border-b border-hairline last:border-0 animate-pulse">
                  <div className="h-3 bg-surface-container rounded w-44 shrink-0" />
                  <div className="h-3 bg-surface-container rounded w-32" />
                  <div className="ml-auto h-5 w-20 bg-surface-container rounded-full" />
                </div>
              ))}
            </div>
          ) : sims.length === 0 ? (
            <div className="bg-surface-container-lowest border border-hairline border-t-0 rounded-b-xl py-20 text-center">
              <Icon name="sim_card" className="text-[48px] text-outline-variant mb-3" />
              <p className="font-label-md text-label-md text-on-surface">Sin SIMs asignadas</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-xs mx-auto">
                Contacta a tu administrador para que te asigne SIMs a tu cuenta.
              </p>
            </div>
          ) : sortedSims.length === 0 ? (
            <div className="bg-surface-container-lowest border border-hairline border-t-0 rounded-b-xl py-12 text-center">
              <Icon name="search_off" className="text-[40px] text-outline-variant mb-3" />
              <p className="font-label-md text-label-md text-on-surface">Sin resultados</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                No se encontraron SIMs para "{simSearch}"
              </p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest border border-hairline border-t-0 rounded-b-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline bg-row-hover">
                      {([
                        { label: "ICCID",           key: "iccid"  as SortKey },
                        { label: "Dispositivo",     key: null },
                        { label: "Consumo del mes", key: "usage"  as SortKey },
                        { label: "Estado",          key: "status" as SortKey },
                      ] as const).map(({ label, key }) => (
                        <th key={label} className="p-4 text-left whitespace-nowrap">
                          {key ? (
                            <button onClick={() => handleSort(key)} className="flex items-center gap-1 group">
                              <span className={`font-label-xs text-label-xs uppercase tracking-wider transition-colors ${sortKey === key ? "text-on-surface" : "text-on-surface-variant group-hover:text-on-surface"}`}>
                                {label}
                              </span>
                              <Icon
                                name={sortKey === key && sortDir === "desc" ? "arrow_downward" : "arrow_upward"}
                                className={`text-[14px] transition-opacity ${sortKey === key ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"}`}
                              />
                            </button>
                          ) : (
                            <span className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">
                              {label}
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="p-4 w-12" />
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md">
                    {pagedSims.map((sim) => {
                      const iccid = sim.iccid_with_luhn || sim.iccid;
                      const st = getStatus(sim.status?.id ?? 0);
                      const u = getUsageMB(sim.usage);
                      const isSelected = selectedSim?.iccid === sim.iccid;

                      return (
                        <tr
                          key={sim.iccid}
                          onClick={() => setSelectedSim(sim)}
                          className={`table-row-hover group border-b border-hairline last:border-0 cursor-pointer ${isSelected ? "bg-primary-container/10" : ""}`}
                        >
                          {/* ICCID */}
                          <td className="p-4 font-mono font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                            {iccid}
                          </td>

                          {/* Dispositivo */}
                          <td className="p-4">
                            {sim.endpoint?.name ? (
                              <span className="flex items-center gap-2 text-on-surface">
                                <Icon name="router" className="text-[16px] text-tertiary shrink-0" />
                                <span className="truncate max-w-[180px]">{sim.endpoint.name}</span>
                              </span>
                            ) : (
                              <span className="italic font-body-sm text-body-sm text-outline-variant">Sin dispositivo</span>
                            )}
                          </td>

                          {/* Consumo del mes */}
                          <td className="p-4 whitespace-nowrap">
                            <span className="flex items-center gap-3 font-body-sm text-body-sm text-on-surface-variant">
                              <span className="flex items-center gap-1" title="Enviado (TX)">
                                <Icon name="arrow_upward" className="text-[14px]" />
                                {u.tx > 0 ? formatMB(u.tx) : "—"}
                              </span>
                              <span className="flex items-center gap-1" title="Recibido (RX)">
                                <Icon name="arrow_downward" className="text-[14px]" />
                                {u.rx > 0 ? formatMB(u.rx) : "—"}
                              </span>
                            </span>
                          </td>

                          {/* Estado — pastilla clicable */}
                          <td className="p-4">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleDeviceStatus(sim, e.currentTarget); }}
                                  disabled={statusLoadingIds.has(sim.iccid)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full whitespace-nowrap font-label-xs text-label-xs transition-all active:scale-95 disabled:opacity-60 disabled:scale-100 hover:brightness-95"
                                  style={{ background: st.bg, color: st.color }}
                                >
                                  {statusLoadingIds.has(sim.iccid)
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <st.icon className="w-3 h-3" />}
                                  {st.label}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{st.id === 1 ? "Click para suspender" : "Click para activar"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* Indicador de detalle */}
                          <td className="p-4 text-right">
                            <Icon
                              name="chevron_right"
                              className={`text-[20px] transition-colors ${isSelected ? "text-primary" : "text-outline-variant group-hover:text-on-surface-variant"}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="border-t border-hairline px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3">
                  <span className="font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                    Mostrando {simFrom}–{simTo} de {sortedSims.length}
                  </span>
                  <select
                    value={simPerPage}
                    onChange={(e) => setSimPerPage(Number(e.target.value))}
                    className="font-body-sm text-body-sm border border-hairline rounded-lg px-2 py-1 bg-white text-on-surface focus:outline-none focus:border-primary"
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n} por página</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSimPage((p) => Math.max(1, p - 1))}
                    disabled={simPage === 1}
                    className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors"
                    aria-label="Página anterior"
                  >
                    <Icon name="chevron_left" className="text-[20px]" />
                  </button>

                  {pageWindow(simPage, simTotalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`simgap-${i}`} className="px-1 text-on-surface-variant">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setSimPage(p)}
                        className={`w-8 h-8 rounded-lg font-label-md text-label-md flex items-center justify-center transition-colors ${
                          p === simPage
                            ? "bg-primary-container/20 text-primary"
                            : "text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setSimPage((p) => Math.min(simTotalPages, p + 1))}
                    disabled={simPage === simTotalPages}
                    className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors"
                    aria-label="Página siguiente"
                  >
                    <Icon name="chevron_right" className="text-[20px]" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Dispositivos tab ── */}
      {activeView === "devices" && (
        <>
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="bg-surface-container-high border-x border-hairline px-card-padding py-3 flex items-center justify-between gap-3">
              <span className="font-label-md text-label-md text-on-surface">
                {selectedIds.size} dispositivo{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRenameSelected}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-hairline rounded-lg text-primary hover:bg-surface transition-colors font-label-md text-label-xs"
                >
                  <Icon name="edit" className="text-[14px]" />
                  Renombrar
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-highest transition-colors font-label-md text-label-xs"
                >
                  <Icon name="close" className="text-[14px]" />
                  Limpiar
                </button>
              </div>
            </div>
          )}

          <div className="bg-surface-container-lowest border border-hairline border-t-0 rounded-b-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : devicesOnly.length === 0 ? (
              <div className="py-20 text-center">
                <Icon name="devices_off" className="text-[48px] text-outline-variant mb-3" />
                <p className="font-label-md text-label-md text-on-surface">Sin dispositivos</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-xs mx-auto">
                  Tus SIMs todavía no están vinculadas a un dispositivo.
                </p>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="py-12 text-center">
                <Icon name="search_off" className="text-[40px] text-outline-variant mb-3" />
                <p className="font-label-md text-label-md text-on-surface">Sin resultados</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  No se encontraron dispositivos para "{deviceSearch}"
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-row-hover">
                      <th className="p-4 w-12">
                        <button onClick={handleSelectAll} className="flex items-center justify-center">
                          <Icon
                            name={pagedDevices.length > 0 && pagedDevices.every((s) => selectedIds.has(s.iccid))
                              ? "check_box" : "check_box_outline_blank"}
                            filled
                            className={pagedDevices.length > 0 && pagedDevices.every((s) => selectedIds.has(s.iccid))
                              ? "text-[18px] text-primary" : "text-[18px] text-outline"}
                          />
                        </button>
                      </th>
                      {(["Dispositivo", "Estado", "Conexión", "ICCID", "IMEI"] as const).map((h) => {
                        const active = deviceSort.col === h;
                        return (
                          <th key={h} className="p-4 text-left whitespace-nowrap">
                            <button
                              onClick={() => setDeviceSort((prev) =>
                                prev.col === h
                                  ? { col: h, dir: prev.dir === "asc" ? "desc" : "asc" }
                                  : { col: h, dir: "asc" }
                              )}
                              className="flex items-center gap-1 group"
                            >
                              <span className={`font-label-xs text-label-xs uppercase tracking-wider transition-colors ${active ? "text-on-surface" : "text-on-surface-variant group-hover:text-on-surface"}`}>
                                {h}
                              </span>
                              <Icon
                                name={active && deviceSort.dir === "desc" ? "arrow_downward" : "arrow_upward"}
                                className={`text-[14px] transition-opacity ${active ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"}`}
                              />
                            </button>
                          </th>
                        );
                      })}
                      <th className="p-4 text-right font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDevices.map((sim) => {
                      const st = getStatus(sim.status?.id ?? 0);
                      const conn = getPortalConnBadge(sim);
                      const hasEp = !!sim.endpointId;
                      const isChecked = selectedIds.has(sim.iccid);
                      const isResetting = resettingId === sim.endpointId;

                      return (
                        <tr key={sim.iccid} className="table-row-hover group border-b border-hairline last:border-0">
                          {/* Checkbox */}
                          <td className="p-4 w-12">
                            {hasEp && (
                              <button
                                onClick={() => handleToggleSelect(sim.iccid)}
                                className="flex items-center justify-center"
                              >
                                <Icon
                                  name={isChecked ? "check_box" : "check_box_outline_blank"}
                                  filled
                                  className={isChecked ? "text-[18px] text-primary" : "text-[18px] text-outline"}
                                />
                              </button>
                            )}
                          </td>

                          {/* Dispositivo — abre el detalle */}
                          <td className="p-4">
                            <button
                              onClick={() => hasEp && handleOpenDevice(sim)}
                              disabled={!hasEp}
                              className="flex items-center gap-2 text-left disabled:opacity-60"
                            >
                              <Icon name="router" className="text-[16px] text-tertiary shrink-0" />
                              <span className="min-w-0">
                                <span className={`block font-label-md text-label-md truncate max-w-[180px] ${hasEp ? "text-primary hover:underline" : "text-on-surface-variant"}`}>
                                  {sim.endpoint?.name || `Endpoint #${sim.endpointId || "—"}`}
                                </span>
                                <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                                  SIM {sim.simId || "—"}
                                </span>
                              </span>
                            </button>
                          </td>

                          {/* Estado — pastilla clicable */}
                          <td className="p-4">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleDeviceStatus(sim, e.currentTarget); }}
                                  disabled={statusLoadingIds.has(sim.iccid)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full whitespace-nowrap font-label-xs text-label-xs transition-all active:scale-95 disabled:opacity-60 disabled:scale-100 hover:brightness-95"
                                  style={{ background: st.bg, color: st.color }}
                                >
                                  {statusLoadingIds.has(sim.iccid) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <st.icon className="w-3 h-3" />
                                  )}
                                  {st.label}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{st.id === 1 ? "Click para suspender" : "Click para activar"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* Conexión — pill; el dot late cuando está online para que resalte */}
                          <td className="p-4">
                            {connectivityLoading && !sim.connectivity ? (
                              <span className="inline-flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Cargando…
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${conn.online ? "pulse-dot" : ""}`}
                                  style={{ background: conn.color }}
                                />
                                <span className={conn.online ? "text-on-surface font-medium" : "text-on-surface-variant"}>
                                  {conn.label}
                                </span>
                              </span>
                            )}
                          </td>

                          {/* ICCID */}
                          <td className="p-4 font-mono font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                            {sim.iccid_with_luhn || sim.iccid || "—"}
                          </td>

                          {/* IMEI */}
                          <td className="p-4 font-mono font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                            {sim.endpoint?.imei_with_luhn || sim.endpoint?.imei || sim.imei
                              || <span className="italic text-outline-variant">No disponible</span>}
                          </td>

                          {/* Acciones — visibles al pasar el cursor (siempre visibles en táctil) */}
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => handleResetConnectivity(sim, e.currentTarget)}
                                    disabled={!hasEp || isResetting}
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors disabled:opacity-40"
                                  >
                                    {isResetting
                                      ? <Loader2 className="w-4 h-4 animate-spin" />
                                      : <Icon name="sync" className="text-[18px]" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent><p>Refrescar conexión</p></TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setSmsTarget(sim)}
                                    disabled={!hasEp}
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors disabled:opacity-40"
                                  >
                                    <Icon name="sms" className="text-[18px]" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent><p>Enviar SMS</p></TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginación */}
            {!loading && filteredDevices.length > 0 && (
              <div className="border-t border-hairline px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3">
                  <span className="font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                    Mostrando {deviceFrom}–{deviceTo} de {filteredDevices.length}
                  </span>
                  <select
                    value={devicePerPage}
                    onChange={(e) => setDevicePerPage(Number(e.target.value))}
                    className="font-body-sm text-body-sm border border-hairline rounded-lg px-2 py-1 bg-white text-on-surface focus:outline-none focus:border-primary"
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n} por página</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDevicePage((p) => Math.max(1, p - 1))}
                    disabled={devicePage === 1}
                    className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors"
                    aria-label="Página anterior"
                  >
                    <Icon name="chevron_left" className="text-[20px]" />
                  </button>

                  {pageWindow(devicePage, deviceTotalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`gap-${i}`} className="px-1 text-on-surface-variant">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setDevicePage(p)}
                        className={`w-8 h-8 rounded-lg font-label-md text-label-md flex items-center justify-center transition-colors ${
                          p === devicePage
                            ? "bg-primary-container/20 text-primary"
                            : "text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setDevicePage((p) => Math.min(deviceTotalPages, p + 1))}
                    disabled={devicePage === deviceTotalPages}
                    className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors"
                    aria-label="Página siguiente"
                  >
                    <Icon name="chevron_right" className="text-[20px]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── SIM Detail Sheet ── */}
      {selectedSim && (
        <SimDetailSheet
          sim={selectedSim}
          onClose={() => setSelectedSim(null)}
        />
      )}

      {/* ── SMS Modal (z-70, above sheet) ── */}
      {smsTarget && <SmsConsoleModal sim={smsTarget} onClose={() => setSmsTarget(null)} />}

      {/* ── Rename Modal ── */}
      {renameTargets && (
        <RenameModal
          devices={renameTargets}
          onClose={() => setRenameTargets(null)}
          onSaved={handleRenamesSaved}
        />
      )}

      {/* ── Device Detail Modal (legacy, from DevicesPage) ── */}
      {selectedDevice && (
        <DeviceDetailModal
          endpoint={selectedDevice.ep}
          onClose={() => setSelectedDevice(null)}
          isAdmin={false}
          fetchDetail={() => clientApi.getDeviceDetail(selectedDevice.ep.id) as Promise<EmnifyEndpoint>}
          fetchEvents={(page, perPage) => clientApi.getDeviceEvents(selectedDevice.ep.id, page, perPage) as Promise<any>}
          fetchStats={(period) => clientApi.getDeviceStats(selectedDevice.ep.id, period) as Promise<any>}
          onToggleStatus={async (_simId, newStatusId, iccid) => {
            if (!selectedDevice.sim.simId) return;
            await clientApi.updateSimStatus(selectedDevice.sim.simId, newStatusId, iccid);
            setSims((prev) =>
              prev.map((s) =>
                s.iccid === selectedDevice.sim.iccid ? { ...s, status: { ...s.status, id: newStatusId } } : s
              )
            );
          }}
        />
      )}

      {/* ── Confirm Popover ── */}
      {popoverConfirm && (
        <div
          ref={setPopperElement}
          style={popperStyles.popper}
          {...popperAttributes.popper}
          className="z-50 bg-white rounded-xl shadow-lg border border-gray-100 p-4 w-64"
        >
          {popoverConfirm.type === "status" ? (
            <>
              <p className="text-sm text-gray-800 font-medium mb-1">
                {popoverConfirm.sim.status?.id === 1 ? "Suspender conexión" : "Activar conexión"}
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Dispositivo: "{popoverConfirm.sim.endpoint?.name || "Sin nombre"}"
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPopoverConfirm(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmToggleStatus}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-colors"
                  style={{ background: popoverConfirm.sim.status?.id === 1 ? "#ef4444" : "#10b981" }}
                >
                  {popoverConfirm.sim.status?.id === 1 ? "Suspender" : "Activar"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-800 font-medium mb-1">
                Refrescar SIM
              </p>
              <p className="text-xs text-gray-500 mb-4">
                El dispositivo "{popoverConfirm.sim.endpoint?.name || "Sin nombre"}" se desconectará y reconectará.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPopoverConfirm(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmReset}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-colors bg-amber-500 hover:bg-amber-600"
                >
                  Refrescar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </>
    </TooltipProvider>
  );
}