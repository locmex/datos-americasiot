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
  if (online) return { label: rat ? `${rat} Online` : "Online", online: true, color: "#16a34a", bg: "rgba(22,163,74,0.10)" };
  const attached = statusId === 2 || statusDesc.includes("attach");
  if (attached) return { label: "Registrado", online: false, color: "#d97706", bg: "rgba(217,119,6,0.10)" };
  return { label: "Sin conexión", online: false, color: "#94a3b8", bg: "rgba(148,163,184,0.10)" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS = {
  0: { label: "Sin estado",  color: "#94a3b8", bg: "rgba(148,163,184,0.12)", icon: Circle },
  1: { label: "Activa",      color: "#16a34a", bg: "rgba(22,163,74,0.12)",   icon: CheckCircle2 },
  2: { label: "Suspendida",  color: "#d97706", bg: "rgba(217,119,6,0.12)",   icon: PauseCircle },
  3: { label: "Desactivada", color: "#dc2626", bg: "rgba(220,38,38,0.12)",   icon: WifiOff },
} as const;

function getStatus(id: number) {
  return STATUS[id as keyof typeof STATUS] ?? STATUS[0];
}

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
  const [sortKey, setSortKey] = useState<SortKey>("iccid");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<number | null>(null); // null = all, 1 = active, 2 = suspended, 3 = offline

  // Dispositivos — search + sort + multi-select + rename + reset + status loading
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceSort, setDeviceSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "Dispositivo", dir: "asc" });
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
        if (statusFilter === 3) {
          if (s.status?.id === 1 || s.status?.id === 2) return false;
        } else {
          if (s.status?.id !== statusFilter) return false;
        }
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

  const handleSelectAll = () => {
    const withEp = sims.filter((s) => !!s.endpointId);
    if (selectedIds.size === withEp.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(withEp.map((s) => s.iccid)));
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

  const active    = sims.filter((s) => s.status?.id === 1).length;
  const suspended = sims.filter((s) => s.status?.id === 2).length;
  const offline   = sims.filter((s) => s.status?.id !== 1 && s.status?.id !== 2).length;

  const devicesWithEp = devicesOnly;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-10">
      {/* Header/Controls */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex-1 w-full sm:max-w-md flex items-center gap-2">
          {/* Search bar is more visual here */}
          {!loading && (
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={activeView === "devices" ? deviceSearch : simSearch}
                onChange={(e) => activeView === "devices" ? setDeviceSearch(e.target.value) : setSimSearch(e.target.value)}
                placeholder={activeView === "devices" ? "Buscar dispositivo, ICCID o IMEI…" : "Buscar SIM (ICCID, MSISDN)…"}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              {(activeView === "devices" ? deviceSearch : simSearch) && (
                <button 
                  onClick={() => activeView === "devices" ? setDeviceSearch("") : setSimSearch("")} 
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          
          <button
            onClick={load}
            disabled={loading}
            className="sm:hidden flex items-center justify-center w-11 h-11 shrink-0 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0">
          <p className="text-xs font-semibold text-gray-500 mr-2">
            {loading ? "Cargando..." : `${sims.length} SIM${sims.length !== 1 ? "s" : ""}`}
          </p>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total SIMs",  value: sims.length, color: "#6366f1", icon: CreditCard, filter: null },
          { label: "Activas",     value: active,       color: "#16a34a", icon: CheckCircle2, filter: 1 },
          { label: "Suspendidas", value: suspended,    color: "#d97706", icon: PauseCircle, filter: 2 },
          { label: "Offline",     value: offline,      color: "#94a3b8", icon: WifiOff, filter: 3 },
        ].map(({ label, value, color, icon: Icon, filter }) => {
          const isActive = statusFilter === filter;
          return (
            <button
              key={label}
              onClick={() => {
                setStatusFilter(filter);
                setActiveView("sims"); // Switch to SIMs tab when clicking a filter
              }}
              className="bg-white rounded-xl p-4 shadow-sm border-2 transition-all hover:shadow-md active:scale-95 flex items-center gap-3 text-left"
              style={{
                borderColor: isActive ? color : "#e5e7eb",
                background: isActive ? `${color}08` : "#ffffff",
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900 leading-tight">{loading ? "—" : value}</p>
                <p className="text-[10px] text-gray-500 truncate">{label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tabs & Export */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-1">
          {[
            { id: "devices", label: "Dispositivos", icon: Cpu },
            { id: "sims",    label: "Mis SIMs",    icon: CreditCard },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as any)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors relative"
              style={{ color: activeView === id ? "#3ECF8E" : "#6b7280" }}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {label}
              {activeView === id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ background: "#3ECF8E" }} />
              )}
            </button>
          ))}
        </div>
        {!loading && devicesOnly.length > 0 && activeView === "devices" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={exportDevicesToCSV}
                className="flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 mb-1 rounded-lg border border-gray-200 bg-white text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: "#059669" }} />
                <span className="hidden sm:inline sm:ml-2">Exportar</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Exportar a Excel</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ── Mis SIMs tab ── */}
      {activeView === "sims" && (
        <>
          {/* Active filters */}
          {!loading && sims.length > 0 && (
            <div className="space-y-3">
              {/* Active filter badge */}
              {statusFilter !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Filtro activo:</span>
                  <button
                    onClick={() => setStatusFilter(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                    style={{
                      background: statusFilter === 1 ? "rgba(22,163,74,0.12)" : statusFilter === 2 ? "rgba(217,119,6,0.12)" : "rgba(148,163,184,0.12)",
                      color: statusFilter === 1 ? "#16a34a" : statusFilter === 2 ? "#d97706" : "#64748b"
                    }}
                  >
                    {statusFilter === 1 ? "Activas" : statusFilter === 2 ? "Suspendidas" : "Offline"}
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                  </div>
                  <div className="h-5 w-16 bg-gray-100 rounded-full" />
                  <div className="w-4 h-4 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : sims.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
              <CreditCard className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">Sin SIMs asignadas</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Contacta a tu administrador para que te asigne SIMs a tu cuenta.</p>
            </div>
          ) : sortedSims.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center">
              <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">Sin resultados</p>
              <p className="text-sm text-gray-400 mt-1">No se encontraron SIMs para "{simSearch}"</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Table header with sort */}
              <div className="grid items-center px-4 py-2.5 bg-gray-50/80 border-b border-gray-100"
                style={{ gridTemplateColumns: "1fr auto auto auto" }}>
                <button
                  onClick={() => handleSort("iccid")}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                >
                  SIM / ICCID <SortIcon k="iccid" />
                </button>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right mr-6 hidden sm:block">TX / RX</span>
                <button
                  onClick={() => handleSort("status")}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 mr-3 transition-colors"
                >
                  Estado <SortIcon k="status" />
                </button>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-50">
                {sortedSims.map((sim) => {
                  const iccid = sim.iccid_with_luhn || sim.iccid;
                  const st = getStatus(sim.status?.id ?? 0);
                  const StIcon = st.icon;
                  const u = getUsageMB(sim.usage);
                  const isSelected = selectedSim?.iccid === sim.iccid;

                  return (
                    <button
                      key={sim.iccid}
                      onClick={() => setSelectedSim(sim)}
                      className="w-full grid items-center px-4 py-3.5 text-left transition-all hover:bg-gray-50/80 active:bg-gray-100"
                      style={{
                        gridTemplateColumns: "1fr auto auto auto",
                        background: isSelected ? "rgba(62,207,142,0.04)" : undefined,
                        borderLeft: isSelected ? "3px solid #3ECF8E" : "3px solid transparent",
                      }}
                    >
                      {/* ICCID + device */}
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: st.bg }}>
                          <StIcon className="w-4 h-4" style={{ color: st.color }} />
                        </div>
                        <div className="min-w-0">
                          <code className="text-xs font-mono font-semibold text-gray-800 block truncate">
                            …{iccid.slice(-12)}
                          </code>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {sim.endpoint?.name || "Sin dispositivo"}
                          </p>
                        </div>
                      </div>

                      {/* TX / RX */}
                      <div className="hidden sm:flex flex-col items-end mr-6 shrink-0">
                        <span className="text-[10px] text-gray-400">{u.tx > 0 ? `↑ ${formatMB(u.tx)}` : "↑ —"}</span>
                        <span className="text-[10px] text-gray-400">{u.rx > 0 ? `↓ ${formatMB(u.rx)}` : "↓ —"}</span>
                      </div>

                      {/* Status pill */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleDeviceStatus(sim, e.currentTarget); }}
                            disabled={statusLoadingIds.has(sim.iccid)}
                            className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap mr-3 shrink-0 transition-transform active:scale-95 disabled:opacity-60 disabled:scale-100 hover:brightness-95"
                            style={{ background: st.bg, color: st.color }}
                          >
                            {statusLoadingIds.has(sim.iccid) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : null}
                            {st.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{st.id === 1 ? "Click para suspender" : "Click para activar"}</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Arrow */}
                      <ChevronRight className="w-4 h-4 shrink-0 transition-colors" style={{ color: isSelected ? "#3ECF8E" : "#d1d5db" }} />
                    </button>
                  );
                })}
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
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-teal-200 bg-teal-50">
              <span className="text-sm font-semibold text-teal-700">
                {selectedIds.size} dispositivo{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRenameSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-95"
                  style={{ background: "#059669" }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Renombrar
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-teal-600 hover:bg-teal-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpiar
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : devicesOnly.length === 0 ? (
              <div className="py-20 text-center">
                <Cpu className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">Sin dispositivos</p>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="py-12 text-center">
                <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">Sin resultados</p>
                <p className="text-sm text-gray-400 mt-1">No se encontraron dispositivos para "{deviceSearch}"</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="py-3 px-4 w-10">
                        <button onClick={handleSelectAll} className="flex items-center justify-center">
                          {selectedIds.size === devicesWithEp.length && devicesWithEp.length > 0
                            ? <CheckSquare className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                            : <Square className="w-4 h-4 text-gray-300" />}
                        </button>
                      </th>
                      {(["Dispositivo", "Estado"] as const).map((h) => {
                        const active = deviceSort.col === h;
                        return (
                          <th key={h} className="text-left py-3 px-4 whitespace-nowrap">
                            <button
                              onClick={() => setDeviceSort((prev) =>
                                prev.col === h
                                  ? { col: h, dir: prev.dir === "asc" ? "desc" : "asc" }
                                  : { col: h, dir: "asc" }
                              )}
                              className="flex items-center gap-1 group"
                            >
                              <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${active ? "text-gray-600" : "text-gray-400 group-hover:text-gray-500"}`}>
                                {h}
                              </span>
                              <span className="flex flex-col -space-y-0.5">
                                <ChevronUp className={`w-2.5 h-2.5 transition-colors ${active && deviceSort.dir === "asc" ? "text-teal-500" : "text-gray-300 group-hover:text-gray-400"}`} />
                                <ChevronDown className={`w-2.5 h-2.5 transition-colors ${active && deviceSort.dir === "desc" ? "text-teal-500" : "text-gray-300 group-hover:text-gray-400"}`} />
                              </span>
                            </button>
                          </th>
                        );
                      })}
                      <th className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                        Acciones
                      </th>
                      {(["Conexión", "ICCID", "IMEI"] as const).map((h) => {
                        const active = deviceSort.col === h;
                        return (
                          <th key={h} className="text-left py-3 px-4 whitespace-nowrap">
                            <button
                              onClick={() => setDeviceSort((prev) =>
                                prev.col === h
                                  ? { col: h, dir: prev.dir === "asc" ? "desc" : "asc" }
                                  : { col: h, dir: "asc" }
                              )}
                              className="flex items-center gap-1 group"
                            >
                              <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${active ? "text-gray-600" : "text-gray-400 group-hover:text-gray-500"}`}>
                                {h}
                              </span>
                              <span className="flex flex-col -space-y-0.5">
                                <ChevronUp className={`w-2.5 h-2.5 transition-colors ${active && deviceSort.dir === "asc" ? "text-teal-500" : "text-gray-300 group-hover:text-gray-400"}`} />
                                <ChevronDown className={`w-2.5 h-2.5 transition-colors ${active && deviceSort.dir === "desc" ? "text-teal-500" : "text-gray-300 group-hover:text-gray-400"}`} />
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevices.map((sim) => {
                      const st = getStatus(sim.status?.id ?? 0);
                      const conn = getPortalConnBadge(sim);
                      const hasEp = !!sim.endpointId;
                      const isChecked = selectedIds.has(sim.iccid);
                      const isResetting = resettingId === sim.endpointId;

                      return (
                        <tr key={sim.iccid} className="border-b border-gray-50 transition-colors hover:bg-gray-50/60">
                          {/* Checkbox */}
                          <td className="py-3 px-4 w-10">
                            {hasEp && (
                              <button
                                onClick={() => handleToggleSelect(sim.iccid)}
                                className="flex items-center justify-center"
                              >
                                {isChecked
                                  ? <CheckSquare className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                                  : <Square className="w-4 h-4 text-gray-300" />}
                              </button>
                            )}
                          </td>

                          {/* Dispositivo — clickable to open detail */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => hasEp && handleOpenDevice(sim)}
                              disabled={!hasEp}
                              className="flex items-center gap-2 text-left group disabled:opacity-60"
                            >
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors group-hover:bg-teal-100" style={{ background: "rgba(62,207,142,0.10)" }}>
                                <Cpu className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-xs truncate max-w-[140px] group-hover:underline" style={{ color: hasEp ? "#059669" : "#374151" }}>
                                  {sim.endpoint?.name || `Endpoint #${sim.endpointId || "—"}`}
                                </p>
                                <p className="text-[10px] text-gray-400">SIM ID: {sim.simId || "—"}</p>
                              </div>
                            </button>
                          </td>

                          {/* Estado */}
                          <td className="py-3 px-4">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleDeviceStatus(sim, e.currentTarget); }}
                                  disabled={statusLoadingIds.has(sim.iccid)}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-transform active:scale-95 disabled:opacity-60 disabled:scale-100 hover:brightness-95"
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

                          {/* Acciones */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {/* Refrescar SIM */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => handleResetConnectivity(sim, e.currentTarget)}
                                    disabled={!hasEp || isResetting}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-orange-50 disabled:opacity-40 active:scale-95"
                                    style={{ color: "#d97706" }}
                                  >
                                    {isResetting
                                      ? <Loader2 className="w-4 h-4 animate-spin" />
                                      : <RotateCcw className="w-4 h-4" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>REFRESCAR SIM</p>
                                </TooltipContent>
                              </Tooltip>

                              {/* Enviar SMS */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setSmsTarget(sim)}
                                    disabled={!hasEp}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-indigo-50 disabled:opacity-40 active:scale-95"
                                    style={{ color: "#6366f1" }}
                                  >
                                    <MessageSquare className="w-4 h-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Enviar SMS</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>

                          {/* Conexión */}
                          <td className="py-3 px-4">
                            {connectivityLoading && !sim.connectivity ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Cargando…</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: conn.color }} />
                                <span style={{ color: conn.color }}>{conn.label}</span>
                              </span>
                            )}
                          </td>

                          {/* ICCID */}
                          <td className="py-3 px-4 font-mono text-xs text-gray-900 whitespace-nowrap">{sim.iccid_with_luhn || sim.iccid || "—"}</td>

                          {/* IMEI */}
                          <td className="py-3 px-4 font-mono text-xs text-gray-900 whitespace-nowrap">{sim.endpoint?.imei_with_luhn || sim.endpoint?.imei || sim.imei || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
    </TooltipProvider>
  );
}