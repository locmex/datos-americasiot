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
import { useTableColumns, type ColumnDef } from "../../components/table/useTableColumns";
import { TableCustomizer } from "../../components/table/TableCustomizer";
import { RowActionsMenu } from "../../components/table/RowActionsMenu";

// Colores de las dos series del gráfico de tráfico.
// Se eligen con contraste de tono Y de luminosidad para que sigan siendo
// distinguibles en daltonismo; además el gráfico siempre lleva leyenda.
const TX_COLOR = "#3ECF8E"; // verde de marca — enviado
const RX_COLOR = "#3b82f6"; // azul — recibido

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

// ─── Columnas de la tabla de dispositivos ────────────────────────────────────
// La clave es la etiqueta porque el comparador de orden ya trabaja con ella;
// cambiarla invalidaría la preferencia guardada de cada usuario sin necesidad.
type DeviceColKey =
  | "Dispositivo" | "Estado" | "Conexión" | "ICCID" | "IMEI"
  | "IMSI" | "Operador" | "IP" | "Red";

const DEVICE_COLUMNS: ColumnDef<DeviceColKey>[] = [
  { key: "Dispositivo", label: "Dispositivo", locked: true },
  { key: "Estado",      label: "Estado" },
  { key: "Conexión",    label: "Conexión" },
  { key: "ICCID",       label: "ICCID" },
  { key: "IMEI",        label: "IMEI" },
  // Estos datos ya venían del endpoint pero solo se veían en el modal de detalle.
  { key: "IMSI",     label: "IMSI",     hiddenByDefault: true },
  { key: "Operador", label: "Operador", hiddenByDefault: true },
  { key: "IP",       label: "IP",       hiddenByDefault: true },
  { key: "Red",      label: "Red",      hiddenByDefault: true },
];

function simOperator(sim: ClientSIM): string {
  const c = sim.connectivity as any;
  return c?.mno?.name || c?.operator?.name || "";
}
function simIp(sim: ClientSIM): string {
  const p = (sim.connectivity as any)?.pdp_context;
  return p?.ue_ip_address || p?.ip_address || "";
}
function simRat(sim: ClientSIM): string {
  const c = sim.connectivity as any;
  return resolveRat(c?.pdp_context?.rat_type ?? c?.rat_type ?? sim.rat_type);
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
      <div className="w-full sm:max-w-md sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-surface-container-lowest" style={{ height: "min(680px, 95dvh)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0 bg-primary">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-primary-container text-on-primary-container font-label-md text-label-md">
            IoT
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-primary font-label-md text-label-md leading-tight truncate">
              {sim.endpoint?.name || `SIM …${iccid.slice(-8)}`}
            </p>
            <p className="text-on-primary/70 font-body-sm text-[10px] font-mono truncate leading-tight">{iccid}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={loadHistory} disabled={loadingHistory}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors shrink-0 text-on-primary/80">
                <Icon name="refresh" className={`text-[18px] ${loadingHistory ? "animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Recargar historial</p>
            </TooltipContent>
          </Tooltip>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors shrink-0 text-on-primary/80">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        {/* Mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1 bg-surface-container-low">
          {loadingHistory ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="font-body-sm text-body-sm text-on-surface-variant">Cargando historial SMS…</p>
            </div>
          ) : historyError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
              <Icon name="error" className="text-[32px] text-error" />
              <p className="font-label-md text-label-md text-on-surface">Error al cargar historial</p>
              <p className="font-body-sm text-body-sm text-error break-words">{historyError}</p>
              <button onClick={loadHistory} className="mt-1 px-4 py-1.5 rounded-lg font-label-md text-label-md btn-primary transition-colors">
                Reintentar
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-primary-container/20">
                <Icon name="sms" className="text-[28px] text-primary" />
              </div>
              <p className="font-label-md text-label-md text-on-surface">Sin mensajes aún</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant -mt-2">
                Los SMS enviados y recibidos aparecerán aquí
              </p>
            </div>
          ) : (
            <>
              <div className="flex-1" />
              {messages.map((m, i) => {
                const isMT = m.direction === "MT";
                return (
                  <div key={m.id ?? i} className={`flex ${isMT ? "justify-end" : "justify-start"} mb-0.5`}>
                    <div style={{ maxWidth: "78%", minWidth: 80 }}>
                      <div
                        className={`px-3 pt-2 pb-1 font-body-md text-body-md leading-snug shadow-sm ${
                          isMT
                            ? m.status === "err"
                              ? "bg-error text-on-error"
                              : m.status === "pending"
                                ? "bg-outline-variant text-on-surface"
                                : "bg-primary-container text-on-primary-container"
                            : "bg-surface-container-lowest text-on-surface"
                        }`}
                        style={{
                          borderRadius: isMT ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                          wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap",
                        }}
                      >
                        {!isMT && (
                          <p className="font-label-xs text-label-xs text-primary mb-0.5">{m.src}</p>
                        )}
                        <span>{m.text}</span>
                        <span className="flex items-center gap-0.5 justify-end mt-0.5">
                          <span className={`text-[10px] leading-none select-none whitespace-nowrap ${isMT ? "opacity-70" : "text-on-surface-variant"}`}>
                            {m.time}
                          </span>
                          {isMT && (
                            <>
                              {m.status === "delivered" && <Icon name="done_all" className="text-[14px] shrink-0" />}
                              {m.status === "ok"        && <Icon name="done_all" className="text-[14px] shrink-0 opacity-70" />}
                              {m.status === "pending"   && <Icon name="schedule" className="text-[14px] shrink-0 opacity-70" />}
                              {m.status === "err"       && <Icon name="error" className="text-[14px] shrink-0" />}
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

        {/* Aviso de error */}
        {error && (
          <div className="mx-3 mb-1 font-body-sm text-body-sm text-on-error-container bg-error-container border border-error-container rounded-xl px-3 py-2 flex items-start gap-2 shrink-0">
            <Icon name="error" className="text-[16px] shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {/* Barra de envío */}
        <div className="shrink-0 bg-surface-container-lowest border-t border-hairline px-3 pt-2 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-body-sm text-body-sm text-on-surface-variant shrink-0">Origen:</span>
            <input
              type="text" value={source} onChange={(e) => setSource(e.target.value)} maxLength={17}
              className="flex-1 font-body-sm text-body-sm text-on-surface bg-surface border border-hairline rounded-lg px-2.5 py-1 focus:outline-none focus:border-primary min-w-0"
              placeholder="AmericasIoT"
            />
            <span className={`font-body-sm text-body-sm shrink-0 ${!sourceValid && source.length > 0 ? "text-error" : "text-on-surface-variant"}`}>
              {sourceHint}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textRef} value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1} maxLength={160} placeholder="Escribe un mensaje"
              className="flex-1 font-body-md text-body-md bg-surface border border-hairline rounded-2xl px-4 py-2.5 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none leading-snug"
              style={{ minHeight: 40, maxHeight: 96, overflowY: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "40px";
                el.style.height = Math.min(el.scrollHeight, 96) + "px";
              }}
            />
            <span className={`font-label-xs text-label-xs shrink-0 mb-1.5 ${
              message.length > 140 ? "text-error" : message.length > 110 ? "text-on-warning" : "text-on-surface-variant"
            }`}>
              {160 - message.length}
            </span>
            <button onClick={handleSend} disabled={!message.trim() || !sourceValid || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 btn-primary transition-all disabled:opacity-40 active:scale-95">
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Icon name="send" className="text-[18px]" />}
            </button>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 px-1">Shift+Enter para enviar</p>
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
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "80dvh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-card-padding py-4 border-b border-hairline shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-container-low text-primary">
              <Icon name="edit" className="text-[18px]" />
            </div>
            <div>
              <p className="font-label-md text-label-md text-on-surface">Renombrar dispositivos</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {devices.length} dispositivo{devices.length !== 1 ? "s" : ""} seleccionado{devices.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        {/* Lista de dispositivos */}
        <div className="flex-1 overflow-y-auto px-card-padding py-4 space-y-3">
          {devices.map((d) => {
            const iccid = d.iccid_with_luhn || d.iccid;
            return (
              <div key={d.iccid}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon name="router" className="text-[14px] text-tertiary shrink-0" />
                  <span className="font-mono font-body-sm text-body-sm text-on-surface-variant truncate">{iccid}</span>
                </div>
                <input
                  type="text"
                  value={names[d.iccid] ?? ""}
                  onChange={(e) => setNames((prev) => ({ ...prev, [d.iccid]: e.target.value }))}
                  maxLength={100}
                  placeholder="Nombre del dispositivo"
                  className="w-full font-body-md text-body-md text-on-surface bg-surface border border-hairline rounded-lg px-3 py-2.5 placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center gap-3 px-card-padding py-4 border-t border-hairline">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-hairline font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg btn-primary font-label-md text-label-md transition-colors active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon name="check_circle" className="text-[18px]" />}
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
  inline = false,
}: {
  sim: ClientSIM;
  onClose: () => void;
  /** `true` = panel fijo junto a la tabla (desktop). `false` = hoja superpuesta (móvil). */
  inline?: boolean;
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
      {!inline && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      )}
      <div
        className={inline
          ? "flex flex-col bg-surface-container-lowest border border-hairline rounded-xl shadow-sm overflow-hidden"
          : `fixed z-50 bg-white shadow-2xl flex flex-col
             bottom-0 left-0 right-0 rounded-t-3xl
             sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:rounded-none sm:rounded-l-2xl sm:w-96`}
        style={{ maxHeight: inline ? "calc(100dvh - 8rem)" : "92dvh" }}
      >
        {/* Drag handle (solo en la hoja móvil) */}
        {!inline && (
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-outline-variant" />
          </div>
        )}

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-card-padding pt-3 pb-4 sm:pt-5 border-b border-hairline">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: statusCfg.bg }}>
              <StatusIcon className="w-5 h-5" style={{ color: statusCfg.color }} />
            </div>
            <div className="min-w-0">
              <p className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">ICCID</p>
              <code className="font-mono font-body-sm text-body-sm text-on-surface block truncate">{iccid}</code>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span
              className="font-label-xs text-label-xs px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ background: statusCfg.bg, color: statusCfg.color }}
            >
              {statusCfg.label}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
              aria-label="Cerrar detalle"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>

        {/* Navegación de pestañas */}
        <div className="shrink-0 flex border-b border-hairline px-card-padding gap-4">
          {([
            { id: "info",  label: "Información", iconName: "info" },
            { id: "usage", label: "Consumo",     iconName: "bar_chart" },
          ] as const).map(({ id, label, iconName }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 py-3 font-label-md text-label-md border-b-2 transition-colors relative -mb-px ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name={iconName} className="text-[16px]" />
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
                {/* Dispositivo */}
                {sim.endpoint?.name && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low border border-hairline">
                    <Icon name="router" className="text-[18px] text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">Dispositivo</p>
                      <p className="font-label-md text-label-md text-on-surface truncate">{sim.endpoint.name}</p>
                    </div>
                  </div>
                )}

                {/* Conexión */}
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low border border-hairline">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${conn.online ? "pulse-dot" : ""}`}
                    style={{ background: conn.color }}
                  />
                  <div className="min-w-0">
                    <p className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">Conexión</p>
                    <p className="font-label-md text-label-md" style={{ color: conn.color }}>{conn.label}</p>
                  </div>
                </div>

                {/* Datos del SIM */}
                <div className="space-y-2">
                  <p className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">Datos del SIM</p>
                  <div className="divide-y divide-hairline rounded-xl border border-hairline overflow-hidden">
                    {[
                      { label: "ICCID", value: iccid, mono: true },
                      ...(sim.imsi ? [{ label: "IMSI", value: sim.imsi, mono: true }] : []),
                      { label: "ID SIM", value: String(sim.simId ?? "—"), mono: false },
                      { label: "Estado", value: statusCfg.label, mono: false },
                    ].map(({ label, value, mono }) => (
                      <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface-container-lowest">
                        <span className="font-body-sm text-body-sm text-on-surface-variant shrink-0">{label}</span>
                        <span className={`font-body-sm text-body-sm text-on-surface truncate text-right ${mono ? "font-mono" : ""}`}>
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
                {/* Totales del mes */}
                <div>
                  <p className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant mb-3">Consumo del mes</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Enviado (TX)",  value: usage.tx, iconName: "arrow_upward",   color: TX_COLOR },
                      { label: "Recibido (RX)", value: usage.rx, iconName: "arrow_downward", color: RX_COLOR },
                    ].map(({ label, value, iconName, color }) => (
                      <div key={label} className="p-3 rounded-xl border border-hairline bg-surface-container-low">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon name={iconName} className="text-[14px]" style={{ color }} />
                          <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
                        </div>
                        <p className="font-label-md text-label-md text-on-surface">
                          {value > 0 ? formatMB(value) : "0 MB"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 px-4 py-3 rounded-xl flex items-center justify-between bg-primary-container/10 border border-primary-container/30">
                    <span className="flex items-center gap-2 font-body-md text-body-md text-on-surface-variant">
                      <Icon name="analytics" className="text-[18px] text-primary" />
                      Total del mes
                    </span>
                    <span className="font-label-md text-label-md text-primary">
                      {usage.tx + usage.rx > 0 ? formatMB(usage.tx + usage.rx) : "Sin datos"}
                    </span>
                  </div>
                </div>

                {/* Gráfico de tráfico */}
                <div>
                  <p className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant mb-3">Tráfico reciente</p>
                  {loadingUsage ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  ) : hasChart ? (
                    <div className="bg-surface-container-low rounded-xl p-3">
                      <ResponsiveContainer width="100%" height={130}>
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#3d4a41" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#3d4a41" }} tickFormatter={(v) => formatBytes(v)} axisLine={false} tickLine={false} />
                          <RechartsTooltip
                            formatter={(v: any) => formatBytes(Number(v))}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e8e8ed" }}
                          />
                          <Bar key="bar-tx" dataKey="tx" name="TX" fill={TX_COLOR} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                          <Bar key="bar-rx" dataKey="rx" name="RX" fill={RX_COLOR} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                      {/* Leyenda: con 2 series la identidad nunca depende solo del color */}
                      <div className="flex items-center gap-4 mt-1 justify-center">
                        <span className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: TX_COLOR }} />
                          TX enviado
                        </span>
                        <span className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: RX_COLOR }} />
                          RX recibido
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-hairline bg-surface-container-low">
                      <Icon name="bar_chart" className="text-[32px] text-outline-variant mb-2" />
                      <p className="font-body-sm text-body-sm text-on-surface-variant">Sin tráfico reciente</p>
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

  // Columnas de la tabla de dispositivos, persistidas por usuario.
  const deviceCols = useTableColumns<DeviceColKey>("portal.devices.columns", DEVICE_COLUMNS);
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
      } else if (col === "IMSI") {
        va = a.imsi || ""; vb = b.imsi || "";
      } else if (col === "Operador") {
        va = simOperator(a); vb = simOperator(b);
      } else if (col === "IP") {
        va = simIp(a); vb = simIp(b);
      } else if (col === "Red") {
        va = simRat(a); vb = simRat(b);
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

            {/* Conteo + personalizar + actualizar */}
            <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              {activeView === "devices" && (
                <TableCustomizer
                  columns={deviceCols.columns}
                  isVisible={deviceCols.isVisible}
                  toggle={deviceCols.toggle}
                  reset={deviceCols.reset}
                  density={deviceCols.density}
                  setDensity={deviceCols.setDensity}
                  columnLines={deviceCols.columnLines}
                  setColumnLines={deviceCols.setColumnLines}
                />
              )}
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

      {/* Layout: contenido a la izquierda. En "Mis SIMs" se abre una segunda
          columna para el panel de detalle, que es un bloque independiente. */}
      <div className={activeView === "sims" ? "lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-4" : ""}>
      <div className="min-w-0">

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
                        { label: "ICCID",       key: "iccid"  as SortKey },
                        { label: "Dispositivo", key: null },
                        { label: "Estado",      key: "status" as SortKey },
                      ] as const).map(({ label, key }) => (
                        <th key={label} className="p-4 text-left whitespace-nowrap">
                          {key ? (
                            <button onClick={() => handleSort(key)} className="flex items-center gap-1 group">
                              <span className={`font-label-xs text-label-xs uppercase tracking-wider transition-colors ${sortKey === key ? "text-on-surface" : "text-on-surface-variant group-hover:text-on-surface"}`}>
                                {label}
                              </span>
                              <Icon
                                name={sortKey === key && sortDir === "desc" ? "arrow_downward" : "arrow_upward"}
                                className={`hover-reveal text-[14px] transition-opacity ${sortKey === key ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"}`}
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
                      {deviceCols.visibleColumns.map((c, i) => {
                        const active = deviceSort.col === c.key;
                        return (
                          <th
                            key={c.key}
                            className={`px-4 ${deviceCols.densityClass} text-left whitespace-nowrap ${
                              deviceCols.columnLines ? "border-r border-hairline last:border-r-0" : ""
                            } ${i === 0 ? "sticky left-0 z-10 bg-row-hover" : ""}`}
                          >
                            <button
                              onClick={() => setDeviceSort((prev) =>
                                prev.col === c.key
                                  ? { col: c.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                                  : { col: c.key, dir: "asc" }
                              )}
                              className="flex items-center gap-1 group"
                            >
                              <span className={`font-label-xs text-label-xs uppercase tracking-wider transition-colors ${active ? "text-on-surface" : "text-on-surface-variant group-hover:text-on-surface"}`}>
                                {c.label}
                              </span>
                              <Icon
                                name={active && deviceSort.dir === "desc" ? "arrow_downward" : "arrow_upward"}
                                className={`hover-reveal text-[14px] transition-opacity ${active ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"}`}
                              />
                            </button>
                          </th>
                        );
                      })}
                      {/* Fija a la derecha: con scroll horizontal, una acción que
                          se va del viewport es una acción inalcanzable. */}
                      <th className={`px-4 ${deviceCols.densityClass} sticky right-0 z-10 bg-row-hover text-right font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant whitespace-nowrap`}>
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

                          {/* Celdas — se renderizan según las columnas que el
                              usuario dejó visibles. */}
                          {deviceCols.visibleColumns.map((c, i) => {
                            const tdClass = `px-4 ${deviceCols.densityClass} ${
                              deviceCols.columnLines ? "border-r border-hairline last:border-r-0" : ""
                            } ${i === 0 ? "sticky left-0 z-10 bg-surface-container-lowest group-hover:bg-row-hover" : ""}`;
                            const mono = "font-mono font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap";
                            const naught = <span className="italic text-outline-variant">No disponible</span>;

                            switch (c.key) {
                              case "Dispositivo":
                                return (
                                  <td key={c.key} className={tdClass}>
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
                                );

                              case "Estado":
                                return (
                                  <td key={c.key} className={tdClass}>
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
                                );

                              case "Conexión":
                                return (
                                  <td key={c.key} className={tdClass}>
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
                                );

                              case "ICCID":
                                return <td key={c.key} className={`${tdClass} ${mono}`}>{sim.iccid_with_luhn || sim.iccid || "—"}</td>;

                              case "IMEI":
                                return (
                                  <td key={c.key} className={`${tdClass} ${mono}`}>
                                    {sim.endpoint?.imei_with_luhn || sim.endpoint?.imei || sim.imei || naught}
                                  </td>
                                );

                              case "IMSI":
                                return <td key={c.key} className={`${tdClass} ${mono}`}>{sim.imsi || naught}</td>;

                              case "Operador":
                                return (
                                  <td key={c.key} className={`${tdClass} font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap`}>
                                    {simOperator(sim) || naught}
                                  </td>
                                );

                              case "IP":
                                return <td key={c.key} className={`${tdClass} ${mono}`}>{simIp(sim) || naught}</td>;

                              case "Red":
                                return (
                                  <td key={c.key} className={`${tdClass} font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap`}>
                                    {simRat(sim) || naught}
                                  </td>
                                );

                              default:
                                return null;
                            }
                          })}

                          {/* Acciones tras un ⋮: en táctil no hay hover que
                              revele iconos sueltos, y así la columna queda fija
                              aunque la tabla scrollee en horizontal. */}
                          <td className={`px-4 ${deviceCols.densityClass} sticky right-0 z-10 bg-surface-container-lowest group-hover:bg-row-hover text-right`}>
                            <div className="flex justify-end">
                              {isResetting ? (
                                <span className="flex h-9 w-9 items-center justify-center">
                                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                </span>
                              ) : (
                                <RowActionsMenu
                                  label={`Acciones de ${sim.endpoint?.name || sim.iccid}`}
                                  actions={[
                                    {
                                      icon: "info",
                                      label: "Ver detalle",
                                      disabled: !hasEp,
                                      onSelect: () => handleOpenDevice(sim),
                                    },
                                    {
                                      icon: "sync",
                                      label: "Restablecer conexión",
                                      disabled: !hasEp,
                                      onSelect: (el) => el && handleResetConnectivity(sim, el),
                                    },
                                    {
                                      icon: "sms",
                                      label: "Abrir consola de SMS",
                                      disabled: !hasEp,
                                      onSelect: () => setSmsTarget(sim),
                                    },
                                    {
                                      icon: st.id === 1 ? "pause_circle" : "play_circle",
                                      label: st.id === 1 ? "Suspender dispositivo" : "Activar dispositivo",
                                      disabled: statusLoadingIds.has(sim.iccid),
                                      onSelect: (el) => el && toggleDeviceStatus(sim, el),
                                    },
                                  ]}
                                />
                              )}
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

      </div>{/* /columna de contenido */}

      {/* Panel de detalle de SIM — bloque independiente, solo desktop.
          `self-start` + `sticky` hacen que acompañe el scroll de la tabla. */}
      {activeView === "sims" && (
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            {selectedSim ? (
              <SimDetailSheet
                sim={selectedSim}
                onClose={() => setSelectedSim(null)}
                inline
              />
            ) : (
              <div className="bg-surface-container-lowest border border-hairline rounded-xl p-8 text-center">
                <Icon name="ads_click" className="text-[36px] text-outline-variant mb-2" />
                <p className="font-label-md text-label-md text-on-surface">Selecciona una SIM</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Haz clic en una fila para ver su información y consumo.
                </p>
              </div>
            )}
          </div>
        </aside>
      )}
      </div>{/* /grid */}

      {/* ── Detalle de SIM (hoja superpuesta) — solo móvil/tablet.
             En desktop el detalle vive en el panel lateral de la pestaña Mis SIMs. ── */}
      {selectedSim && (
        <div className="lg:hidden">
          <SimDetailSheet
            sim={selectedSim}
            onClose={() => setSelectedSim(null)}
          />
        </div>
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
          /* Nivel 2 de elevación: sombra difusa suave que separa del fondo */
          className="z-50 bg-surface-container-lowest rounded-xl border border-hairline p-4 w-64 shadow-lg"
        >
          {popoverConfirm.type === "status" ? (
            <>
              <p className="font-label-md text-label-md text-on-surface mb-1">
                {popoverConfirm.sim.status?.id === 1 ? "Suspender conexión" : "Activar conexión"}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                Dispositivo: "{popoverConfirm.sim.endpoint?.name || "Sin nombre"}"
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPopoverConfirm(null)}
                  className="px-3 py-1.5 rounded-lg font-label-md text-label-xs text-on-surface-variant hover:bg-surface-container-low transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmToggleStatus}
                  className={`px-3 py-1.5 rounded-lg font-label-md text-label-xs transition-colors ${
                    popoverConfirm.sim.status?.id === 1
                      ? "bg-error text-on-error hover:opacity-90"
                      : "btn-primary"
                  }`}
                >
                  {popoverConfirm.sim.status?.id === 1 ? "Suspender" : "Activar"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-label-md text-label-md text-on-surface mb-1">
                Refrescar SIM
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                El dispositivo "{popoverConfirm.sim.endpoint?.name || "Sin nombre"}" se desconectará y reconectará.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPopoverConfirm(null)}
                  className="px-3 py-1.5 rounded-lg font-label-md text-label-xs text-on-surface-variant hover:bg-surface-container-low transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmReset}
                  className="px-3 py-1.5 rounded-lg font-label-md text-label-xs bg-warning text-on-surface hover:brightness-95 transition-all"
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