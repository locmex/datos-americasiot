import { useEffect, useState } from "react";
import { Receipt, Loader2, RefreshCw, ChevronDown, ChevronUp, FileDown } from "lucide-react";
import { clientApi } from "../../lib/api";
import {
  getInvoiceStatus, formatCurrency, formatPeriod, formatProrationFactor,
  type InvoiceStatus,
} from "../../lib/invoice-status";
import { generateInvoicePdf } from "../../lib/invoice-pdf";
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
}
interface Invoice {
  id: string;
  client_name: string;
  period_year: number;
  period_month: number;
  status: InvoiceStatus;
  currency: string;
  total: number;
  issued_at?: string | null;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Invoice card (expandable, own invoice, read-only) ─────────────────────────
function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balance, setBalance] = useState(0);

  const cfg = getInvoiceStatus(invoice.status);
  const StatusIcon = cfg.icon;
  const canDownload = invoice.status !== "draft";

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await clientApi.getInvoiceById(invoice.id);
      setItems(res.items || []);
      setPayments(res.payments || []);
      setBalance(res.balance ?? 0);
      setLoaded(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) loadDetail();
  };

  const handlePdf = async () => {
    try {
      let currentItems = items, currentPayments = payments, currentBalance = balance;
      if (!loaded) {
        const res = await clientApi.getInvoiceById(invoice.id);
        currentItems = res.items || [];
        currentPayments = res.payments || [];
        currentBalance = res.balance ?? 0;
      }
      generateInvoicePdf(invoice, currentItems, currentPayments, currentBalance);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button onClick={handleToggle} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
            <StatusIcon className="w-4 h-4" style={{ color: cfg.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{formatPeriod(invoice.period_year, invoice.period_month)}</p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
              {cfg.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-sm font-bold text-gray-900">{formatCurrency(invoice.total, invoice.currency)}</p>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Saldo pendiente</span>
                <span className="font-semibold" style={{ color: balance > 0 ? "#d97706" : "#16a34a" }}>
                  {formatCurrency(balance, invoice.currency)}
                </span>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Desglose por SIM</p>
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="text-gray-700 truncate font-mono">{item.iccid}</p>
                        <p className="text-gray-400">
                          {item.plan_name} · prorrateo {formatProrationFactor(item.proration_factor)}
                        </p>
                      </div>
                      <span className="font-semibold text-gray-700 shrink-0">{formatCurrency(item.amount, invoice.currency)}</span>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Sin SIMs facturadas</p>}
                </div>
              </div>

              {payments.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Abonos</p>
                  <div className="space-y-1.5">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-gray-50">
                        <span className="text-gray-600">{formatDate(p.paid_at)} · {p.method}</span>
                        <span className="font-semibold text-gray-800">{formatCurrency(p.amount, invoice.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canDownload && (
                <button
                  onClick={handlePdf}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-all"
                  style={{ color: "#374151", borderColor: "#d1d5db" }}
                >
                  <FileDown className="w-3.5 h-3.5" /> Descargar PDF
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientApi.getInvoices();
      setInvoices(res.invoices || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5" style={{ color: "#3ECF8E" }} />
            Mis Facturas
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Historial de facturación mensual de tus SIMs</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-100">
          <Receipt className="w-10 h-10 text-gray-200 mb-2" />
          <p className="text-sm font-medium text-gray-400">Aún no tienes facturas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} />)}
        </div>
      )}
    </div>
  );
}
