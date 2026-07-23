import { useEffect, useState } from "react";
import {
  Receipt, X, Loader2, RefreshCw, AlertCircle, Search, ChevronRight,
  FileDown, Send, CircleDollarSign, Ban,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import {
  INVOICE_STATUS, getInvoiceStatus, formatCurrency, formatPeriod, formatProrationFactor,
  type InvoiceStatus,
} from "../lib/invoice-status";
import { generateInvoicePdf } from "../lib/invoice-pdf";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface InvoiceItem {
  id: string;
  iccid: string;
  plan_name: string;
  unit_price: number;
  proration_factor: number;
  activated_at: string;
  sim_status: string;
  amount: number;
}
interface Payment {
  id: string;
  amount: number;
  paid_at: string;
  method: string;
  note?: string | null;
  created_at: string;
}
interface Invoice {
  id: string;
  client_id: string;
  client_name: string;
  period_year: number;
  period_month: number;
  status: InvoiceStatus;
  currency: string;
  total: number;
  issued_at?: string | null;
  created_at: string;
  updated_at: string;
}

const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Cheque", "Otro"];

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Generate Invoices Panel ───────────────────────────────────────────────────
function GeneratePanel({ onGenerated }: { onGenerated: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateInvoices({ year, month });
      toast.success(`Facturación ${formatPeriod(year, month)}: ${res.created} generadas/actualizadas, ${res.skipped} omitidas`);
      setOpen(false);
      onGenerated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // Resincroniza los períodos de SIM contra el estado REAL de EMNIFY.
  // Corre primero en modo preview (dry run) y pide confirmación antes de aplicar,
  // porque borra períodos de facturación.
  const handleResync = async () => {
    setResyncing(true);
    try {
      const p: any = await api.resyncSimStates(true);
      const ok = window.confirm(
        `Resincronización contra EMNIFY\n\n` +
        `Períodos abiertos revisados: ${p.periodos_abiertos}\n` +
        `SIMs encontradas en EMNIFY: ${p.sims_en_emnify}\n\n` +
        `• ${p.a_borrar_nunca_activadas} nunca activadas → se borran\n` +
        `• ${p.a_cerrar_desactivadas} desactivadas → se cierran\n` +
        `• ${p.a_actualizar_estado} cambian de estado\n` +
        `• ${p.no_encontradas_en_emnify} no encontradas en EMNIFY (sin cambios)\n\n` +
        `¿Aplicar estos cambios?`
      );
      if (!ok) return;
      const r: any = await api.resyncSimStates(false);
      toast.success(
        `Resync aplicado: ${r.a_borrar_nunca_activadas} borradas, ${r.a_cerrar_desactivadas} cerradas, ${r.a_actualizar_estado} actualizadas`
      );
      onGenerated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResyncing(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button onClick={() => setOpen(true)} className="gap-2 text-black font-semibold" style={{ background: "#3ECF8E" }}>
          <Receipt className="w-4 h-4" />
          Generar Facturas
        </Button>
        <Button
          variant="outline" disabled={resyncing} onClick={handleResync} className="gap-2"
          title="Corrige los períodos de SIM contra el estado real de EMNIFY"
        >
          {resyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {resyncing ? "Resincronizando…" : "Resincronizar estados"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ borderColor: "rgba(62,207,142,0.3)", background: "rgba(62,207,142,0.05)" }}>
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <option key={i + 1} value={i + 1}>{formatPeriod(2000, i + 1).split(" ")[0]}</option>
        ))}
      </select>
      <Input
        type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
        className="w-24 bg-white" min={2020} max={2100}
      />
      <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button
        size="sm" disabled={generating} onClick={handleGenerate}
        className="gap-1.5 text-black font-semibold" style={{ background: "#3ECF8E" }}
      >
        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
        {generating ? "Generando…" : `Generar ${formatPeriod(year, month)}`}
      </Button>
    </div>
  );
}

// ─── Register payment form ──────────────────────────────────────────────────
function PaymentForm({
  invoice, balance, onCancel, onRegistered,
}: {
  invoice: Invoice;
  balance: number;
  onCancel: () => void;
  onRegistered: () => void;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) { toast.error("El monto del abono debe ser mayor a 0"); return; }
    if (amt > balance) { toast.error(`El abono no puede exceder el saldo pendiente (${formatCurrency(balance, invoice.currency)})`); return; }
    if (!paidAt) { toast.error("La fecha de pago es requerida"); return; }
    setSaving(true);
    try {
      await api.addPayment(invoice.id, { amount: amt, paid_at: paidAt, method, note: note.trim() || undefined });
      toast.success(`Abono de ${formatCurrency(amt, invoice.currency)} registrado`);
      onRegistered();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 rounded-xl border space-y-3" style={{ borderColor: "#d97706", background: "rgba(217,119,6,0.06)" }}>
      <p className="text-xs font-semibold" style={{ color: "#d97706" }}>
        Registrar abono (saldo: {formatCurrency(balance, invoice.currency)})
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-gray-600">Monto *</label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-white" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-gray-600">Fecha *</label>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="bg-white" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-600">Método *</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none"
        >
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-600">Nota (opcional)</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comentario interno..." className="bg-white" />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button
          type="button" size="sm" onClick={handleConfirm} disabled={saving}
          className="flex-1 text-black font-semibold" style={{ background: "#3ECF8E" }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
          {saving ? "Guardando…" : "Confirmar abono"}
        </Button>
      </div>
    </div>
  );
}

// ─── Invoice Detail Drawer ──────────────────────────────────────────────────────
function InvoiceDetailDrawer({
  invoice: initialInvoice, onClose, onUpdated,
}: {
  invoice: Invoice;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [invoice, setInvoice] = useState<Invoice>(initialInvoice);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.getInvoiceById(initialInvoice.id);
      setInvoice(res.invoice);
      setItems(res.items || []);
      setPayments(res.payments || []);
      setBalance(res.balance ?? 0);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDetail(); }, [initialInvoice.id]);

  const statusCfg = getInvoiceStatus(invoice.status);
  const StatusIcon = statusCfg.icon;

  const handleIssue = async () => {
    setBusy(true);
    try {
      await api.issueInvoice(invoice.id);
      toast.success("Factura emitida");
      onUpdated();
      loadDetail();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("¿Cancelar esta factura?")) return;
    setBusy(true);
    try {
      await api.cancelInvoice(invoice.id);
      toast.success("Factura cancelada");
      onUpdated();
      loadDetail();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePdf = () => {
    generateInvoicePdf(invoice, items, payments, balance);
  };

  const canIssue = invoice.status === "draft";
  const canPay = invoice.status === "issued" || invoice.status === "partially_paid";
  const canCancel = ["draft", "issued", "partially_paid"].includes(invoice.status);
  const canDownload = invoice.status !== "draft";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: statusCfg.bg }}>
            <StatusIcon className="w-5 h-5" style={{ color: statusCfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              Factura {formatPeriod(invoice.period_year, invoice.period_month)}
            </p>
            <p className="text-xs text-gray-400 truncate">{invoice.client_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 shrink-0">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Status + totals */}
              <div className="p-3 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estado</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: statusCfg.color, background: statusCfg.bg }}>
                    {statusCfg.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">SIMs facturadas</span>
                  <span className="text-sm font-semibold text-gray-700">{items.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Saldo pendiente</span>
                  <span className="text-sm font-semibold" style={{ color: balance > 0 ? "#d97706" : "#16a34a" }}>
                    {formatCurrency(balance, invoice.currency)}
                  </span>
                </div>
                {invoice.issued_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Emitida</span>
                    <span className="text-xs text-gray-600">{formatDate(invoice.issued_at)}</span>
                  </div>
                )}
              </div>

              {/* SIM breakdown */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Desglose por SIM ({items.length})</p>
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate font-mono">{item.iccid}</p>
                        <p className="text-xs text-gray-400">
                          {item.plan_name} · {formatCurrency(item.unit_price, invoice.currency)} · prorrateo {formatProrationFactor(item.proration_factor)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gray-700 shrink-0">{formatCurrency(item.amount, invoice.currency)}</p>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-3">Sin SIMs facturadas en este período</p>
                  )}
                </div>
              </div>

              {/* Payments history */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Abonos</p>
                <div className="space-y-2">
                  {payments.length === 0 ? (
                    <p className="text-xs text-gray-400">Sin abonos registrados</p>
                  ) : (
                    payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-gray-50">
                        <div>
                          <p className="text-gray-700 font-medium">{formatDate(p.paid_at)} · {p.method}</p>
                          {p.note && <p className="text-gray-400">{p.note}</p>}
                        </div>
                        <span className="font-semibold text-gray-800">{formatCurrency(p.amount, invoice.currency)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Acciones</p>
                <div className="flex flex-wrap gap-2">
                  {canDownload && (
                    <button
                      onClick={handlePdf}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all hover:opacity-80"
                      style={{ color: "#374151", borderColor: "#d1d5db" }}
                    >
                      <FileDown className="w-3.5 h-3.5" /> Descargar PDF
                    </button>
                  )}
                  {canIssue && (
                    <button
                      onClick={handleIssue}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ color: "#3b82f6", borderColor: "#3b82f6", background: "rgba(59,130,246,0.08)" }}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Emitir
                    </button>
                  )}
                  {canPay && !showPaymentForm && (
                    <button
                      onClick={() => setShowPaymentForm(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all hover:opacity-80"
                      style={{ color: "#d97706", borderColor: "#d97706", background: "rgba(217,119,6,0.08)" }}
                    >
                      <CircleDollarSign className="w-3.5 h-3.5" /> Registrar abono
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={handleCancel}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ color: "#dc2626", borderColor: "#dc2626", background: "rgba(220,38,38,0.08)" }}
                    >
                      <Ban className="w-3.5 h-3.5" /> Cancelar factura
                    </button>
                  )}
                </div>
                {canPay && showPaymentForm && (
                  <PaymentForm
                    invoice={invoice}
                    balance={balance}
                    onCancel={() => setShowPaymentForm(false)}
                    onRegistered={() => { setShowPaymentForm(false); onUpdated(); loadDetail(); }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [selected, setSelected] = useState<Invoice | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getInvoices(statusFilter ? { status: statusFilter } : undefined);
      setInvoices(res.invoices || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = invoices.filter(
    (inv) => !search || inv.client_name.toLowerCase().includes(search.toLowerCase()) || inv.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-teal-500" />
            Facturación
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {invoices.length} factura{invoices.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <GeneratePanel onGenerated={load} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o ID de factura..."
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "")}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((s) => (
            <option key={s} value={s}>{INVOICE_STATUS[s].label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
              {["Cliente", "Período", "Estado", "SIMs", "Total", ""].map((label) => (
                <th key={label} className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-gray-500 whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : filtered.map((invoice) => {
                  const cfg = getInvoiceStatus(invoice.status);
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelected(invoice)}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-800">{invoice.client_name}</p>
                        <p className="text-xs text-gray-400 font-mono">#{invoice.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-600">{formatPeriod(invoice.period_year, invoice.period_month)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-600">{invoice.sim_count ?? "—"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-700">{formatCurrency(invoice.total, invoice.currency)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">{search || statusFilter ? "Sin resultados" : "Aún no hay facturas generadas"}</p>
          </div>
        )}
      </div>

      {selected && (
        <InvoiceDetailDrawer
          invoice={selected}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
