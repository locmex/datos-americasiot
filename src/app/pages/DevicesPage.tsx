import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Cpu, Search, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle2, PauseCircle, Circle, Signal, WifiOff,
  Filter, Plus, Globe, Shield,
  RotateCcw, PowerOff, MessageSquare, MoreVertical,
  Lock, Unlock, Unlink, Trash2, Send, CheckCheck,
  AlertTriangle, Power, X, ChevronsUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui/skeleton";
import { DeviceDetailModal, EmnifyEndpoint } from "../components/DeviceDetailModal";
import { AddDeviceModal } from "../components/AddDeviceModal";

// ─── Helpers ─────────────────────────────────────────────────────
function getStatusBadge(statusId: number) {
  if (statusId === 1) return { label: "Habilitado",    color: "#16a34a", bg: "rgba(22,163,74,0.10)",   Icon: CheckCircle2 };
  if (statusId === 2) return { label: "Suspendido",    color: "#d97706", bg: "rgba(217,119,6,0.10)",   Icon: PauseCircle };
  if (statusId === 0) return { label: "Deshabilitado", color: "#94a3b8", bg: "rgba(148,163,184,0.10)", Icon: Circle };
  return                     { label: "Inactivo",      color: "#94a3b8", bg: "rgba(148,163,184,0.10)", Icon: Circle };
}

function getConnBadge(ep: EmnifyEndpoint) {
  const conn = ep._connectivity;
  const resolveRat = (raw: any): string => {
    if (!raw) return "";
    if (typeof raw === "string") return raw.toUpperCase();
    return (raw.description || "").toUpperCase();
  };
  const epOperator = ep.operator?.name || ep.runtime_data?.mno?.name || "";
  const epIp       = ep.ip_address || ep.runtime_data?.pdp_context?.ip_address || "";
  const epCountry  = ep.operator?.country || ep.runtime_data?.country?.name || "";

  if (conn) {
    const sid      = conn.status?.id ?? -1;
    const statusDesc = (conn.status?.description ?? "").toLowerCase();
    const pdp      = conn.pdp_context;
    const rat      = resolveRat(pdp?.rat_type ?? conn.rat_type) || resolveRat(ep.rat_type) || (ep.runtime_data?.network?.radio || "").toUpperCase();
    const operator = (conn as any).mno?.name || conn.operator?.name || epOperator;
    const ip       = pdp?.ue_ip_address || pdp?.ip_address || epIp;
    const hasPdp   = !!(pdp?.created || pdp?.start_time || pdp?.ue_ip_address || pdp?.ip_address);
    const online   = hasPdp || sid === 1 || statusDesc.includes("online");
    const effectiveSid = online ? 1 : sid;

    if (effectiveSid === 1) return { label: rat ? `${rat} Online` : "Online", online: true,  attached: false, color: "#16a34a", operator, ip, country: epCountry };
    if (effectiveSid === 2 || sid === 2) return { label: "Registrado",  online: false, attached: true,  color: "#d97706", operator, ip, country: epCountry };
    return { label: "Sin conexión", online: false, attached: false, color: "#94a3b8", operator: epOperator, ip: "", country: epCountry };
  }

  const cs   = ep.runtime_data?.connectivity_status?.description?.toLowerCase() || "";
  const csId = ep.runtime_data?.connectivity_status?.id;
  const net  = resolveRat(ep.rat_type) || (ep.runtime_data?.network?.radio || "").toUpperCase();
  const fallOnline =
    cs.includes("online") || cs.includes("attached") ||
    csId === 0 || !!(ep.runtime_data?.pdp_context?.start_time) ||
    !!(ep.runtime_data?.pdp_context?.ip_address);

  return fallOnline
    ? { label: net ? `${net} Online` : "Online", online: true, attached: false, color: "#16a34a", operator: epOperator, ip: epIp, country: epCountry }
    : { label: "Sin conexión",  online: false, attached: false, color: "#94a3b8", operator: epOperator, ip: "",  country: epCountry };
}

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

// ─── Toast ────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-sm font-medium text-white animate-slide-up"
      style={{ background: type === "ok" ? "#16a34a" : "#dc2626", minWidth: 240 }}
    >
      {type === "ok" ? <CheckCheck className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────
function ConfirmDialog({
  title, message, confirmLabel = "Confirmar", danger = false,
  confirmColor, loading = false, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  confirmColor?: string; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const btnColor = confirmColor ?? (danger ? "#dc2626" : "#d97706");
  const iconColor = danger ? "#dc2626" : confirmColor ?? "#d97706";
  const iconBg    = danger ? "rgba(220,38,38,0.10)" : confirmColor ? `${confirmColor}1a` : "rgba(217,119,6,0.10)";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: iconBg }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: iconColor }} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
            <p className="text-xs text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-xl font-semibold text-white transition-colors disabled:opacity-50"
            style={{ background: btnColor }}
          >
            {loading ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SMS Console Modal ────────────────────────────────────────────
interface SmsEntry {
  id?: number;
  text: string;
  src: string;
  time: string;
  direction: "MT" | "MO";
  status: "ok" | "err" | "pending" | "delivered";
  raw?: any;
}

function SmsConsoleModal({
  device, onClose, onSend,
}: {
  device: EmnifyEndpoint;
  onClose: () => void;
  onSend: (msg: string, source: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("AmericasIoT");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsEntry[]>([]);
  const textRef   = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 80);
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res: any = await api.getSmsHistory(device.id, 1, 50);
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
          return {
            id: m.id,
            text: m.payload ?? m.message ?? "",
            src: m.source_address ?? m.sender ?? (direction === "MT" ? "Portal" : "Dispositivo"),
            time: timeStr,
            direction,
            status,
            raw: m,
          };
        })
        .sort((a, b) => {
          const ta = new Date(a.raw?.created_date ?? a.raw?.submit_date ?? 0).getTime();
          const tb = new Date(b.raw?.created_date ?? b.raw?.submit_date ?? 0).getTime();
          return ta - tb; // ascendente: más antiguo primero → más reciente al final (abajo)
        });
      setMessages(parsed);
      scrollToBottom();
    } catch (e: any) {
      console.error("Error cargando historial SMS:", e);
      setHistoryError(e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { loadHistory(); textRef.current?.focus(); }, [device.id]);
  useEffect(() => { scrollToBottom(); }, [messages.length]);

  const isNumeric = /^\d+$/.test(source);
  const sourceValid = source.trim().length > 0 && (
    isNumeric ? source.length <= 17 : source.length <= 11
  );
  const sourceHint = isNumeric
    ? `${source.length}/17 dígitos`
    : `${source.length}/11 caracteres`;

  const fmtNow = () => new Date().toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const handleSend = async () => {
    if (!message.trim() || !sourceValid || sending) return;
    const text = message.trim();
    const src  = source.trim();
    setSending(true); setError(null); setMessage("");
    setMessages(prev => [...prev, { text, src, time: fmtNow(), direction: "MT", status: "pending" }]);
    try {
      await onSend(text, src);
      await loadHistory();
    } catch (e: any) {
      setError(e.message);
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, status: "err" } : m
      ));
    } finally {
      setSending(false);
      setTimeout(() => textRef.current?.focus(), 50);
    }
  };

  const iccid    = device.sim?.iccid_with_luhn || device.sim?.iccid || "—";
  const charPct  = (message.length / 160) * 100;
  const charColor = message.length > 140 ? "#ef4444" : message.length > 110 ? "#f59e0b" : "#3ECF8E";

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ height: "min(680px, 95dvh)", background: "#fff" }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: "#0f766e" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm" style={{ background: "#3ECF8E" }}>
            IoT
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate">{device.name || device.imei || `Endpoint #${device.id}`}</p>
            <p className="text-white/60 text-[10px] font-mono truncate leading-tight">{iccid}</p>
          </div>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            title="Recargar historial"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-white/80 ${loadingHistory ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-white/80" />
          </button>
        </div>

        {/* ── Messages area ─────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1"
          style={{ background: "#e8ede9" }}
        >
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
              <button
                onClick={loadHistory}
                className="mt-1 px-4 py-1.5 rounded-full text-xs font-semibold text-white"
                style={{ background: "#3ECF8E" }}
              >
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
              {/* Spacer que empuja los mensajes hacia abajo, como WhatsApp */}
              <div className="flex-1" />
              {messages.map((m, i) => {
                const isMT = m.direction === "MT";
                return (
                  <div key={m.id ?? i} className={`flex ${isMT ? "justify-end" : "justify-start"} mb-0.5`}>
                    <div style={{ maxWidth: "78%", minWidth: 80 }}>
                      <div
                        className="px-3 pt-2 pb-1 text-sm leading-snug shadow-sm"
                        style={{
                          background: isMT
                            ? m.status === "err"      ? "#ef4444"
                              : m.status === "pending" ? "#a3b8a4"
                              : "#3ECF8E"
                            : "#ffffff",
                          color: isMT ? "#ffffff" : "#111827",
                          borderRadius: isMT ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {!isMT && (
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#0f766e" }}>
                            {m.src}
                          </p>
                        )}
                        <span>{m.text}</span>
                        {/* Time + ticks inline like WhatsApp */}
                        <span className="flex items-center gap-0.5 justify-end mt-0.5">
                          <span
                            className="text-[10px] leading-none select-none"
                            style={{ color: isMT ? "rgba(255,255,255,0.72)" : "#9ca3af", whiteSpace: "nowrap" }}
                          >
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

        {/* ── Error banner ─────────────────────────────────────── */}
        {error && (
          <div className="mx-3 mb-1 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {/* ── Input bar — estilo WhatsApp ─────────────────────── */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-3 pt-2 pb-3">

          {/* Origen row */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-gray-400 shrink-0 font-medium">Origen:</span>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              maxLength={17}
              className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-300 min-w-0"
              placeholder="AmericasIoT"
            />
            <span
              className="text-[10px] shrink-0"
              style={{ color: !sourceValid && source.length > 0 ? "#ef4444" : "#9ca3af" }}
            >
              {sourceHint}
            </span>
          </div>

          {/* Message + send */}
          <div className="flex items-end gap-2">
            <textarea
              ref={textRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1}
              maxLength={160}
              placeholder="Escribe un mensaje"
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200 resize-none leading-snug"
              style={{ minHeight: 40, maxHeight: 96, overflowY: "auto" }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "40px";
                el.style.height = Math.min(el.scrollHeight, 96) + "px";
              }}
            />
            <span
              className="text-[10px] font-bold shrink-0 mb-1.5"
              style={{ color: message.length > 140 ? "#ef4444" : message.length > 110 ? "#f59e0b" : "#9ca3af" }}
            >
              {160 - message.length}
            </span>
            <button
              onClick={handleSend}
              disabled={!message.trim() || !sourceValid || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40 active:scale-95"
              style={{ background: "#3ECF8E" }}
            >
              {sending
                ? <RefreshCw className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 px-1">Shift+Enter para enviar</p>
        </div>
      </div>
    </div>
  );
}

// ─── Row Actions (inline + dropdown) ─────────────────────────────
function RowActions({
  ep,
  onResetConn,
  onToggleStatus,
  onOpenSms,
  onToggleImei,
  onDetachSim,
  onDelete,
  loadingKey,
}: {
  ep: EmnifyEndpoint;
  onResetConn: () => void;
  onToggleStatus: () => void;
  onOpenSms: () => void;
  onToggleImei: () => void;
  onDetachSim: () => void;
  onDelete: () => void;
  loadingKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const simStatusId = (ep.sim as any)?.status?.id ?? ep.status?.id ?? 0;
  const isActive = simStatusId === 1;
  const hasImeiLock = !!(ep as any).imei_lock;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById("row-actions-portal");
      if (
        (btnRef.current && btnRef.current.contains(e.target as Node)) ||
        (portal && portal.contains(e.target as Node))
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const busy = (key: string) => loadingKey === key;

  const iconBtn = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    color: string,
    loading: boolean,
  ) => (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      disabled={loading}
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
      style={{ color: loading ? "#9ca3af" : color }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}18`)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : icon}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 justify-end" onClick={e => e.stopPropagation()}>
      {/* Quick action: reset connectivity */}
      {iconBtn(
        "Restablecer conexión",
        <RotateCcw className="w-3.5 h-3.5" />,
        onResetConn,
        "#6366f1",
        busy("reset"),
      )}

      {/* Quick action: toggle device status */}
      {iconBtn(
        isActive ? "Desactivar dispositivo" : "Activar dispositivo",
        isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />,
        onToggleStatus,
        isActive ? "#d97706" : "#16a34a",
        busy("status"),
      )}

      {/* Quick action: SMS console */}
      {iconBtn(
        "Abrir consola de SMS",
        <MessageSquare className="w-3.5 h-3.5" />,
        onOpenSms,
        "#3ECF8E",
        false,
      )}

      {/* Dropdown ⋮ */}
      <div className="relative">
        <button
          ref={btnRef}
          onClick={handleToggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {open && rect && createPortal(
          <div
            id="row-actions-portal"
            ref={dropRef}
            className="bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 min-w-[210px]"
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.right - 210,
              zIndex: 9999,
            }}
          >
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onToggleImei(); }}
              disabled={busy("imei")}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {hasImeiLock
                ? <Unlock className="w-4 h-4 text-gray-400 shrink-0" />
                : <Lock   className="w-4 h-4 text-gray-400 shrink-0" />}
              {hasImeiLock ? "Habilitar bloqueo IMEI" : "Deshabilitar bloqueo IMEI"}
              {busy("imei") && <RefreshCw className="w-3 h-3 animate-spin ml-auto text-gray-400" />}
            </button>

            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onDetachSim(); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Unlink className="w-4 h-4 text-gray-400 shrink-0" />
              Desvincular SIM
            </button>

            <div className="my-1 border-t border-gray-100" />

            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              Eliminar
            </button>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

// ─── Row skeleton ─────────────────────────────────────────────────
function RowSkeleton() {
  return (
    <tr className="border-b border-gray-50">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} className="py-4 px-4"><Skeleton className="h-4 w-full" /></td>
      ))}
    </tr>
  );
}

// ─── Confirm action type ─────────────────────────────────────────
type ConfirmType = "delete" | "detach-sim" | "reset-conn";

// ─── Main Page ────────────────────────────────────────────────────
export default function DevicesPage() {
  const [items, setItems]       = useState<EmnifyEndpoint[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [perPage, setPerPage]   = useState(10);
  const [search, setSearch]     = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<EmnifyEndpoint | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [smsDevice, setSmsDevice] = useState<EmnifyEndpoint | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: ConfirmType; device: EmnifyEndpoint } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => setToast({ msg, type });

  const setLoading_ = (key: string, val: boolean) =>
    setActionLoading(prev => ({ ...prev, [key]: val }));

  const load = useCallback(async (p = 0, pp = perPage, q = search) => {
    setLoading(true); setError(null);
    try {
      const res = await api.getEndpoints(p, pp, q) as any;
      setItems(res.items || []);
      setTotal(res.total_count || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [perPage, search]);

  useEffect(() => { load(page, perPage, search); }, [page, perPage, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(page, perPage, search);
    setRefreshing(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput);
  };

  // ── Row actions ───────────────────────────────────────────────
  const handleResetConn = async (ep: EmnifyEndpoint) => {
    const key = `reset-${ep.id}`;
    setLoading_(key, true);
    try {
      await api.resetEndpointConnectivity(ep.id);
      showToast("Conectividad restablecida correctamente");
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setLoading_(key, false);
    }
  };

  const handleToggleStatus = async (ep: EmnifyEndpoint) => {
    const key = `status-${ep.id}`;
    const simStatusId = (ep.sim as any)?.status?.id ?? ep.status?.id ?? 0;
    const newStatusId = simStatusId === 1 ? 2 : 1;
    setLoading_(key, true);
    try {
      await api.updateSimStatus(ep.sim!.id, newStatusId, ep.sim?.iccid || "");
      setItems(prev => prev.map(item =>
        item.id === ep.id
          ? {
              ...item,
              sim: item.sim ? { ...item.sim, status: { id: newStatusId, description: newStatusId === 1 ? "Active" : "Suspended" } } : item.sim,
              status: { id: newStatusId, description: newStatusId === 1 ? "Enabled" : "Disabled" },
            }
          : item
      ));
      showToast(newStatusId === 1 ? "Dispositivo activado" : "Dispositivo desactivado");
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setLoading_(key, false);
    }
  };

  const handleToggleImei = async (ep: EmnifyEndpoint) => {
    const key = `imei-${ep.id}`;
    const currentLock = !!(ep as any).imei_lock;
    setLoading_(key, true);
    try {
      await api.setImeiLock(ep.id, !currentLock);
      setItems(prev => prev.map(item =>
        item.id === ep.id ? { ...item, imei_lock: !currentLock } as any : item
      ));
      showToast(!currentLock ? "Bloqueo IMEI habilitado" : "Bloqueo IMEI deshabilitado");
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setLoading_(key, false);
    }
  };

  const handleDetachSimConfirmed = async (ep: EmnifyEndpoint) => {
    setConfirmLoading(true);
    try {
      await api.detachSim(ep.id);
      setItems(prev => prev.map(item =>
        item.id === ep.id ? { ...item, sim: undefined } as any : item
      ));
      showToast("SIM desvinculada del dispositivo");
      setConfirmAction(null);
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDeleteConfirmed = async (ep: EmnifyEndpoint) => {
    setConfirmLoading(true);
    try {
      await api.deleteEndpoint(ep.id);
      setItems(prev => prev.filter(item => item.id !== ep.id));
      setTotal(t => Math.max(0, t - 1));
      showToast("Dispositivo eliminado");
      setConfirmAction(null);
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setConfirmLoading(false);
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

  // ── Sorting ───────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (sortKey === "name")   { aVal = a.name || a.imei || ""; bVal = b.name || b.imei || ""; }
      if (sortKey === "status") { aVal = String((a.sim as any)?.status?.id ?? a.status?.id ?? 0); bVal = String((b.sim as any)?.status?.id ?? b.status?.id ?? 0); }
      if (sortKey === "iccid")  { aVal = a.sim?.iccid || ""; bVal = b.sim?.iccid || ""; }
      if (sortKey === "tags")   { aVal = (a.tags || []).join(","); bVal = (b.tags || []).join(","); }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 inline-block ml-0.5" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 inline-block ml-0.5" style={{ color: "#3ECF8E" }} />
      : <ArrowDown className="w-3 h-3 inline-block ml-0.5" style={{ color: "#3ECF8E" }} />;
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-teal-500" />
            Dispositivos conectados
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Endpoints registrados en emnify · {total > 0 ? `${total.toLocaleString()} en total` : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
          <button
            onClick={() => setShowAddDevice(true)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: "#3ECF8E" }}
          >
            Agregar dispositivo
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre, ICCID..."
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
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }}
            className="px-3 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
          >
            Limpiar
          </button>
        )}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Nombre · ICCID · Etiqueta</span>
        </div>
      </form>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <button onClick={handleRefresh} className="text-xs text-teal-600 hover:underline">Reintentar</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-t-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-10">
                      <input type="checkbox" className="rounded border-gray-300" disabled />
                    </th>
                    {([
                      { label: "Nombre",    key: "name",   sortable: true },
                      { label: "Etiquetas", key: "tags",   sortable: true },
                      { label: "Estado",    key: "status", sortable: true },
                      { label: "Conexión",  key: "conn",   sortable: false },
                      { label: "ICCID",     key: "iccid",  sortable: true },
                    ] as const).map(({ label, key, sortable }) => (
                      <th key={label}
                        onClick={sortable ? () => handleSort(key) : undefined}
                        className={`text-left py-3 px-4 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${sortable ? "cursor-pointer select-none hover:bg-gray-100" : ""} transition-colors`}
                        style={{ color: sortKey === key ? "#0d8f5c" : "#9ca3af" }}>
                        {label}{sortable && <SortIcon col={key} />}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap w-36">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: perPage > 10 ? 10 : perPage }).map((_, i) => <RowSkeleton key={i} />)
                    : items.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center">
                          <Cpu className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                          <p className="text-sm text-gray-400">No se encontraron dispositivos</p>
                        </td>
                      </tr>
                    )
                    : sortedItems.map(ep => {
                        const simStatusId = (ep.sim as any)?.status?.id ?? ep.status?.id ?? 0;
                        const st   = getStatusBadge(simStatusId);
                        const conn = getConnBadge(ep);
                        const iccid = ep.sim?.iccid_with_luhn || ep.sim?.iccid || "—";
                        const currentLoadingKey =
                          actionLoading[`reset-${ep.id}`]  ? "reset"  :
                          actionLoading[`status-${ep.id}`] ? "status" :
                          actionLoading[`imei-${ep.id}`]   ? "imei"   : null;

                        const ratDisplay = (label: string) => {
                          const u = label.toUpperCase();
                          if (u === "LTE") return "4G";
                          if (u === "UMTS") return "3G";
                          if (u === "GSM") return "2G";
                          return label || "—";
                        };

                        return (
                          <tr
                            key={ep.id}
                            className="border-b border-gray-50 hover:bg-teal-50/30 cursor-pointer transition-colors group"
                            onClick={() => setSelected(ep)}
                          >
                            <td className="py-4 px-4" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" className="rounded border-gray-300" />
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-medium text-gray-800 hover:text-teal-600 transition-colors">
                                {ep.name || ep.imei || `Endpoint #${ep.id}`}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              {(ep.tags || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {(ep.tags || []).map(t => (
                                    <span key={t} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t}</span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                                style={{ background: st.bg, color: st.color }}
                              >
                                <st.Icon className="w-3 h-3" />
                                {st.label}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: conn.color }}
                                />
                                <span style={{ color: conn.color }}>
                                  {conn.label}
                                </span>
                              </span>
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-gray-500 max-w-[180px] truncate">
                              {iccid}
                            </td>
                            <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                              <RowActions
                                ep={ep}
                                onResetConn={() => setConfirmAction({ type: "reset-conn", device: ep })}
                                onToggleStatus={() => handleToggleStatus(ep)}
                                onOpenSms={() => setSmsDevice(ep)}
                                onToggleImei={() => handleToggleImei(ep)}
                                onDetachSim={() => setConfirmAction({ type: "detach-sim", device: ep })}
                                onDelete={() => setConfirmAction({ type: "delete", device: ep })}
                                loadingKey={currentLoadingKey}
                              />
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && total > 0 && (
              <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Mostrando {(page * perPage) + 1}–{Math.min((page + 1) * perPage, total)} de {total.toLocaleString()}
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  {visiblePages().map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: p === page ? "#3ECF8E" : "transparent", color: p === page ? "#fff" : "#6b7280", border: p === page ? "none" : "1px solid #e5e7eb" }}
                    >
                      {p + 1}
                    </button>
                  ))}
                  {totalPages > 5 && page < totalPages - 3 && <span className="text-gray-400 text-xs px-1">…{totalPages}</span>}
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Dispositivos por página</span>
                  <select
                    value={perPage}
                    onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
                  >
                    {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── SMS Console Modal ─────────────────────────────────── */}
      {smsDevice && (
        <SmsConsoleModal
          device={smsDevice}
          onClose={() => setSmsDevice(null)}
          onSend={async (msg, src) => {
            await api.sendDeviceSms(smsDevice.id, msg, src);
            showToast(`SMS enviado a ${smsDevice.name || `Endpoint #${smsDevice.id}`}`);
          }}
        />
      )}

      {/* ── Confirm Dialogs ───────────────────────────────────── */}
      {confirmAction?.type === "reset-conn" && (
        <ConfirmDialog
          title="¿Restablecer la conectividad del dispositivo?"
          message="La red desconectará su dispositivo y esperará a que el modem se conecte de nuevo."
          confirmLabel="Resetear"
          danger={false}
          confirmColor="#4f46e5"
          loading={confirmLoading}
          onConfirm={async () => {
            setConfirmLoading(true);
            try {
              await api.resetEndpointConnectivity(confirmAction.device.id);
              showToast("Conectividad restablecida correctamente");
              setConfirmAction(null);
            } catch (e: any) {
              showToast(e.message, "err");
            } finally {
              setConfirmLoading(false);
            }
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction?.type === "detach-sim" && (
        <ConfirmDialog
          title="Desvincular SIM"
          message={`¿Desvincular la SIM del dispositivo "${confirmAction.device.name || `Endpoint #${confirmAction.device.id}`}"? Esta acción puede interrumpir la conectividad.`}
          confirmLabel="Desvincular"
          danger={false}
          loading={confirmLoading}
          onConfirm={() => handleDetachSimConfirmed(confirmAction.device)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction?.type === "delete" && (
        <ConfirmDialog
          title="Eliminar dispositivo"
          message={`¿Eliminar permanentemente "${confirmAction.device.name || `Endpoint #${confirmAction.device.id}`}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger={true}
          loading={confirmLoading}
          onConfirm={() => handleDeleteConfirmed(confirmAction.device)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* ── Device Detail Modal ──────────────────────────────── */}
      {selected && (
        <DeviceDetailModal
          endpoint={selected}
          onClose={() => setSelected(null)}
          isAdmin={true}
          fetchDetail={() => api.getEndpointById(selected.id) as Promise<EmnifyEndpoint>}
          fetchEvents={(page, perPage) =>
            api.getSimEvents(selected.sim?.id || 0, page, perPage) as Promise<any>
          }
          fetchStats={(period) =>
            api.getSimDailyStats(selected.sim?.id || 0, selected.id, period as any) as Promise<any>
          }
          onToggleStatus={async (simId, newStatusId, iccid) => {
            await api.updateSimStatus(simId, newStatusId, iccid);
            setItems(prev =>
              prev.map(ep =>
                ep.id === selected.id
                  ? {
                      ...ep,
                      sim: ep.sim ? { ...ep.sim, status: { id: newStatusId, description: newStatusId === 1 ? "Active" : "Suspended" } } : ep.sim,
                      status: { id: newStatusId, description: newStatusId === 1 ? "Enabled" : "Disabled" },
                    }
                  : ep
              )
            );
          }}
          onResetConnectivity={async (endpointId) => {
            await api.resetEndpointConnectivity(endpointId);
          }}
        />
      )}

      {/* ── Toast notification ────────────────────────────────── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Add Device Modal ──────────────────────────────────── */}
      {showAddDevice && (
        <AddDeviceModal
          onClose={() => setShowAddDevice(false)}
          onCreated={(device) => {
            showToast(`Dispositivo "${device?.name || "nuevo"}" creado correctamente`);
            setShowAddDevice(false);
            load(0, perPage, search);
          }}
        />
      )}
    </div>
  );
}