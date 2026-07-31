import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "../components/ui/skeleton";
import { Icon } from "../components/ui/icon";
import { api } from "../lib/api";
import {
  INVOICE_STATUS, getInvoiceStatus, formatCurrency, formatPeriod, formatProrationFactor,
  type InvoiceStatus,
} from "../lib/invoice-status";
import { groupCharges } from "../lib/invoice-charges";
import { generateInvoicePdf } from "../lib/invoice-pdf";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
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
  sim_count?: number;
  issued_at?: string | null;
  created_at: string;
  updated_at: string;
}

const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Cheque", "Otro"];

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Chip de estado ──────────────────────────────────────────────────────────
function StatusChip({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const cfg = getInvoiceStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full whitespace-nowrap ${
        size === "md" ? "px-2.5 py-1 text-label-md" : "px-2 py-0.5 text-label-xs"
      }`}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon name={cfg.symbol} className={size === "md" ? "text-[14px]" : "text-[12px]"} />
      {cfg.label}
    </span>
  );
}

// ─── Generar / resincronizar ─────────────────────────────────────────────────
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
      toast.success(
        `Facturación ${formatPeriod(year, month)}: ${res.created} generadas/actualizadas, ${res.skipped} omitidas`,
      );
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
          `¿Aplicar estos cambios?`,
      );
      if (!ok) return;
      const r: any = await api.resyncSimStates(false);
      toast.success(
        `Resync aplicado: ${r.a_borrar_nunca_activadas} borradas, ${r.a_cerrar_desactivadas} cerradas, ${r.a_actualizar_estado} actualizadas`,
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
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg btn-primary px-4 py-2 text-label-md shadow-sm transition-colors"
        >
          <Icon name="receipt_long" className="text-[18px]" />
          Generar Facturas
        </button>
        <button
          onClick={handleResync}
          disabled={resyncing}
          title="Corrige los períodos de SIM contra el estado real de EMNIFY"
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-label-md text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
        >
          <Icon name="sync" className={`text-[18px] ${resyncing ? "animate-spin" : ""}`} />
          {resyncing ? "Resincronizando…" : "Resincronizar estados"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-body-md outline-none focus:border-primary"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <option key={i + 1} value={i + 1}>
            {formatPeriod(2000, i + 1).split(" ")[0]}
          </option>
        ))}
      </select>
      <input
        type="number" min={2020} max={2100} value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="w-24 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-body-md outline-none focus:border-primary"
      />
      <button
        onClick={() => setOpen(false)}
        className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-label-md text-on-surface transition-colors hover:bg-surface-container"
      >
        Cancelar
      </button>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="flex items-center gap-1.5 rounded-lg btn-primary px-3 py-1.5 text-label-md transition-colors disabled:opacity-50"
      >
        <Icon name={generating ? "progress_activity" : "receipt_long"} className={`text-[16px] ${generating ? "animate-spin" : ""}`} />
        {generating ? "Generando…" : `Generar ${formatPeriod(year, month)}`}
      </button>
    </div>
  );
}

// ─── Formulario de abono ─────────────────────────────────────────────────────
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

  const field =
    "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  const handleConfirm = async () => {
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      toast.error("El monto del abono debe ser mayor a 0");
      return;
    }
    if (amt > balance) {
      toast.error(`El abono no puede exceder el saldo pendiente (${formatCurrency(balance, invoice.currency)})`);
      return;
    }
    if (!paidAt) {
      toast.error("La fecha de pago es requerida");
      return;
    }
    setSaving(true);
    try {
      await api.addPayment(invoice.id, {
        amount: amt, paid_at: paidAt, method, note: note.trim() || undefined,
      });
      toast.success(`Abono de ${formatCurrency(amt, invoice.currency)} registrado`);
      onRegistered();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-warning bg-warning/5 p-3">
      <p className="text-label-md text-on-warning">
        Registrar abono (saldo: {formatCurrency(balance, invoice.currency)})
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-label-xs text-on-surface-variant">MONTO *</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
        </div>
        <div className="space-y-1">
          <label className="text-label-xs text-on-surface-variant">FECHA *</label>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={field} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-label-xs text-on-surface-variant">MÉTODO *</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-label-xs text-on-surface-variant">NOTA (OPCIONAL)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comentario interno…" className={field} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-label-md text-on-surface transition-colors hover:bg-surface-container"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg btn-primary px-3 py-2 text-label-md transition-colors disabled:opacity-50"
        >
          {saving && <Icon name="progress_activity" className="animate-spin text-[16px]" />}
          {saving ? "Guardando…" : "Confirmar abono"}
        </button>
      </div>
    </div>
  );
}

// ─── Desglose agrupado ───────────────────────────────────────────────────────
function ChargeBreakdown({ items, currency }: { items: InvoiceItem[]; currency: string }) {
  const groups = useMemo(() => groupCharges(items), [items]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [simSearch, setSimSearch] = useState("");

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-body-sm text-on-surface-variant">
        Sin SIMs facturadas en este período
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = openKey === g.key;
        const lines = items.filter(
          (i) =>
            i.plan_name === g.planName &&
            Number(i.unit_price) === g.unitPrice &&
            Number(i.proration_factor) === g.prorationFactor,
        );
        const visible = simSearch ? lines.filter((l) => l.iccid.includes(simSearch.trim())) : lines;

        return (
          <div key={g.key} className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
            <button
              onClick={() => { setOpenKey(isOpen ? null : g.key); setSimSearch(""); }}
              className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-container-low"
            >
              <div className="min-w-0">
                <div className="truncate text-label-md text-on-surface">{g.planName}</div>
                <div className="mt-1 text-body-sm text-on-surface-variant">
                  {g.count} SIM{g.count !== 1 ? "s" : ""} × {formatCurrency(g.unitPrice, currency)} ·{" "}
                  {formatProrationFactor(g.prorationFactor)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-headline-sm text-on-surface">{formatCurrency(g.total, currency)}</span>
                <Icon
                  name="expand_more"
                  className={`text-on-surface-variant transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-outline-variant bg-surface p-3">
                <div className="relative mb-3">
                  <Icon name="search" className="absolute top-2 left-2.5 text-[16px] text-on-surface-variant" />
                  <input
                    value={simSearch}
                    onChange={(e) => setSimSearch(e.target.value)}
                    placeholder="Buscar ICCID…"
                    className="w-full rounded-md border border-outline-variant bg-surface-container-lowest py-1.5 pr-3 pl-9 text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {visible.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between rounded p-2 text-body-sm transition-colors hover:bg-surface-container-low"
                    >
                      <span className="font-mono tracking-tight text-on-surface">{l.iccid}</span>
                      <span className="text-on-surface-variant">{formatCurrency(l.amount, currency)}</span>
                    </div>
                  ))}
                  {visible.length === 0 && (
                    <p className="p-2 text-body-sm text-on-surface-variant">Ningún ICCID coincide</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Panel de detalle ────────────────────────────────────────────────────────
function InvoiceDetailPanel({
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

  useEffect(() => {
    setShowPaymentForm(false);
    loadDetail();
  }, [initialInvoice.id]);

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

  const canIssue = invoice.status === "draft";
  const canPay = invoice.status === "issued" || invoice.status === "partially_paid";
  const canCancel = ["draft", "issued", "partially_paid"].includes(invoice.status);
  const canDownload = invoice.status !== "draft";

  const actionBtn =
    "flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-label-xs transition-colors disabled:opacity-50";

  return (
    <div className="flex h-[700px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg">
      {/* Cabecera fija — resumen + acciones SIEMPRE visibles */}
      <div className="z-20 shrink-0 border-b border-outline-variant bg-surface-bright p-card-padding">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 text-label-xs tracking-wider text-on-surface-variant uppercase">
              Detalle de factura
            </div>
            <h3 className="truncate text-display-md leading-tight text-on-surface">
              {formatPeriod(invoice.period_year, invoice.period_month)}
            </h3>
            <p className="mt-1 truncate text-body-sm text-primary">{invoice.client_name}</p>
            <p className="mt-0.5 font-mono text-label-xs text-on-surface-variant">#{invoice.id.slice(0, 8)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusChip status={invoice.status} size="md" />
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
              aria-label="Cerrar detalle"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-outline-variant/50 bg-surface p-3">
            <div className="mb-1 text-label-xs text-on-surface-variant">Total</div>
            <div className="text-headline-sm text-on-surface">{formatCurrency(invoice.total, invoice.currency)}</div>
          </div>
          <div className="rounded-lg border border-outline-variant/50 bg-surface p-3">
            <div className="mb-1 text-label-xs text-on-surface-variant">SIMs</div>
            <div className="text-headline-sm text-on-surface">{loading ? "—" : items.length}</div>
          </div>
          <div className={`rounded-lg border p-3 ${balance > 0 ? "border-warning/30 bg-warning/5" : "border-primary/20 bg-surface-container-low"}`}>
            <div className={`mb-1 text-label-xs ${balance > 0 ? "text-on-warning" : "text-primary"}`}>Pendiente</div>
            <div className={`text-headline-sm ${balance > 0 ? "text-on-warning" : "text-primary"}`}>
              {formatCurrency(balance, invoice.currency)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {canIssue && (
            <button onClick={handleIssue} disabled={busy} className={`${actionBtn} btn-primary`}>
              <Icon name="send" className="text-[16px]" /> Emitir
            </button>
          )}
          {canPay && (
            <button
              onClick={() => setShowPaymentForm((v) => !v)}
              className={`${actionBtn} border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low`}
            >
              <Icon name="payments" className="text-[16px]" /> Abono
            </button>
          )}
          {canDownload && (
            <button
              onClick={() => generateInvoicePdf(invoice, items, payments, balance)}
              disabled={loading}
              className={`${actionBtn} border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low`}
            >
              <Icon name="picture_as_pdf" className="text-[16px]" /> PDF
            </button>
          )}
          {canCancel && (
            <button onClick={handleCancel} disabled={busy} className={`${actionBtn} bg-error-container text-on-error-container hover:bg-error/20`}>
              <Icon name="cancel" className="text-[16px]" /> Cancelar
            </button>
          )}
        </div>

        {canPay && showPaymentForm && (
          <div className="mt-3">
            <PaymentForm
              invoice={invoice}
              balance={balance}
              onCancel={() => setShowPaymentForm(false)}
              onRegistered={() => { setShowPaymentForm(false); onUpdated(); loadDetail(); }}
            />
          </div>
        )}
      </div>

      {/* Contenido desplazable */}
      <div className="flex-1 overflow-y-auto bg-surface p-card-padding">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            <h4 className="mb-4 flex items-center gap-2 text-label-md text-on-surface">
              <Icon name="dns" className="text-[18px] text-on-surface-variant" />
              Desglose de conceptos
            </h4>
            <ChargeBreakdown items={items} currency={invoice.currency} />

            <h4 className="mt-6 mb-3 flex items-center gap-2 text-label-md text-on-surface">
              <Icon name="payments" className="text-[18px] text-on-surface-variant" />
              Abonos
            </h4>
            {payments.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">Sin abonos registrados</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2 text-body-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-on-surface">{formatDate(p.paid_at)} · {p.method}</p>
                      {p.note && <p className="truncate text-on-surface-variant">{p.note}</p>}
                    </div>
                    <span className="shrink-0 text-label-md text-on-surface">
                      {formatCurrency(p.amount, invoice.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {invoice.issued_at && (
              <p className="mt-6 border-t border-outline-variant pt-4 text-body-sm text-on-surface-variant">
                Emitida el {formatDate(invoice.issued_at)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
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
    (inv) =>
      !search ||
      inv.client_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-container-margin">
      {/* Encabezado */}
      <div className="mb-gutter flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-display-md text-on-background">Facturación</h1>
          <p className="text-body-lg text-on-surface-variant">
            {invoices.length} factura{invoices.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={load}
            title="Recargar"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <Icon name="refresh" className="text-[18px]" />
          </button>
          <GeneratePanel onGenerated={load} />
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-gutter flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Icon name="search" className="absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o ID de factura…"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pr-3 pl-10 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "")}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md outline-none focus:border-primary"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((s) => (
            <option key={s} value={s}>{INVOICE_STATUS[s].label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-gutter flex items-center gap-3 rounded-lg border border-error bg-error-container p-4 text-body-md text-on-error-container">
          <Icon name="error" className="shrink-0 text-error" />
          {error}
        </div>
      )}

      {/* Maestro-detalle */}
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface-container-low">
                <tr className="border-b border-outline-variant">
                  {[
                    { label: "Cliente", align: "text-left" },
                    { label: "Período", align: "text-left" },
                    { label: "Estado", align: "text-left" },
                    { label: "SIMs", align: "text-right" },
                    { label: "Total", align: "text-right" },
                  ].map(({ label, align }) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-label-xs tracking-wider whitespace-nowrap text-on-surface-variant uppercase ${align}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50 text-body-sm text-on-surface">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : filtered.map((invoice) => (
                      <tr
                        key={invoice.id}
                        onClick={() => setSelected(invoice)}
                        className={`cursor-pointer transition-colors hover:bg-surface-container-low ${
                          selected?.id === invoice.id ? "bg-surface-container-highest/30" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="text-label-md text-on-surface">{invoice.client_name}</div>
                          <div className="font-mono text-label-xs text-on-surface-variant">
                            #{invoice.id.slice(0, 8)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">
                          {formatPeriod(invoice.period_year, invoice.period_month)}
                        </td>
                        <td className="px-4 py-3"><StatusChip status={invoice.status} /></td>
                        <td className="px-4 py-3 text-right">{invoice.sim_count ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-label-md">
                          {formatCurrency(invoice.total, invoice.currency)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="receipt_long" className="mb-3 text-[48px] text-outline-variant" />
              <p className="text-body-md text-on-surface-variant">
                {search || statusFilter ? "Sin resultados" : "Aún no hay facturas generadas"}
              </p>
            </div>
          )}
        </div>

        {/* Panel */}
        <div className="lg:col-span-1">
          {selected ? (
            <InvoiceDetailPanel invoice={selected} onClose={() => setSelected(null)} onUpdated={load} />
          ) : (
            <div className="hidden h-[700px] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest/50 text-center lg:flex">
              <Icon name="receipt_long" className="mb-3 text-[40px] text-outline-variant" />
              <p className="text-body-md text-on-surface-variant">Seleccioná una factura</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                El desglose y las acciones aparecen acá
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
