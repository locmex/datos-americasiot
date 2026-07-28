import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { clientApi } from "../../lib/api";
import {
  getInvoiceStatus, formatCurrency, formatPeriod, formatProrationFactor,
  type InvoiceStatus,
} from "../../lib/invoice-status";
import { generateInvoicePdf } from "../../lib/invoice-pdf";
import { Icon } from "../../components/ui/icon";
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
  /** Calculados por el backend a partir de los abonos */
  paid?: number;
  balance?: number;
  last_payment_at?: string | null;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Agrupación de cargos ─────────────────────────────────────────────────────
// Una factura puede tener 150+ líneas idénticas ("$45.00 · Plan único · 100%").
// Eso es ruido: se agrupa por (plan, precio, prorrateo) y el detalle línea por
// línea queda disponible bajo demanda.
interface ChargeGroup {
  key: string;
  planName: string;
  unitPrice: number;
  prorationFactor: number;
  count: number;
  total: number;
}

function groupCharges(items: InvoiceItem[]): ChargeGroup[] {
  const map = new Map<string, ChargeGroup>();
  for (const it of items) {
    const key = `${it.plan_name}__${it.unit_price}__${it.proration_factor}`;
    const g = map.get(key);
    if (g) {
      g.count += 1;
      g.total += Number(it.amount);
    } else {
      map.set(key, {
        key,
        planName: it.plan_name,
        unitPrice: Number(it.unit_price),
        prorationFactor: Number(it.proration_factor),
        count: 1,
        total: Number(it.amount),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ─── Tarjeta de factura (expandible) ──────────────────────────────────────────
function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balance, setBalance] = useState(invoice.balance ?? 0);
  const [showAllSims, setShowAllSims] = useState(false);
  const [simSearch, setSimSearch] = useState("");

  const cfg = getInvoiceStatus(invoice.status);
  const canDownload = invoice.status !== "draft";
  const groups = useMemo(() => groupCharges(items), [items]);
  const filteredItems = useMemo(
    () => (simSearch ? items.filter((i) => i.iccid.includes(simSearch.trim())) : items),
    [items, simSearch],
  );

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

  const handlePdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let cItems = items, cPayments = payments, cBalance = balance;
      if (!loaded) {
        const res = await clientApi.getInvoiceById(invoice.id);
        cItems = res.items || [];
        cPayments = res.payments || [];
        cBalance = res.balance ?? 0;
      }
      generateInvoicePdf(invoice, cItems, cPayments, cBalance);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <article className="bg-surface-container-lowest border border-hairline rounded-xl overflow-hidden transition-colors">
      {/* Fila principal */}
      <div
        onClick={handleToggle}
        className="p-card-padding flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 cursor-pointer hover:bg-row-hover transition-colors"
      >
        <div className="flex items-center gap-4 w-full sm:w-1/3 min-w-0">
          <div className="bg-surface-container-high w-12 h-12 rounded-lg flex items-center justify-center text-on-surface shrink-0">
            <Icon name="description" />
          </div>
          <div className="min-w-0">
            <h3 className="font-label-md text-label-md text-on-surface capitalize">
              {formatPeriod(invoice.period_year, invoice.period_month)}
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant font-mono truncate">
              #{invoice.id.slice(0, 8)}
            </p>
          </div>
        </div>

        <div className="w-1/2 sm:w-1/4">
          <div className="font-body-md text-body-md font-semibold text-on-surface">
            {formatCurrency(invoice.total, invoice.currency)}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {(invoice.balance ?? 0) > 0
              ? `Saldo ${formatCurrency(invoice.balance!, invoice.currency)}`
              : invoice.status === "paid" ? "Pagada" : "Sin saldo"}
          </p>
        </div>

        <div className="w-1/2 sm:w-1/4 flex justify-end sm:justify-start">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-xs text-label-xs whitespace-nowrap"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            <cfg.icon className="w-3.5 h-3.5" />
            {cfg.label}
          </span>
        </div>

        <div className="w-full sm:w-auto flex justify-end gap-1 items-center">
          {canDownload && (
            <button
              onClick={handlePdf}
              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors"
              title="Descargar comprobante PDF"
            >
              <Icon name="download" className="text-[20px]" />
            </button>
          )}
          <Icon
            name="expand_more"
            className={`text-[20px] text-outline-variant transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Detalle */}
      {expanded && (
        <div className="bg-surface border-t border-hairline">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="p-card-padding">
              <h4 className="font-label-md text-label-md text-on-surface mb-4">Resumen de cargos</h4>

              <div className="space-y-1 mb-6">
                {groups.map((g) => (
                  <div key={g.key} className="flex justify-between items-center gap-3 py-2 border-b border-hairline/60">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-primary-container shrink-0" />
                      <div className="min-w-0">
                        <div className="font-body-md text-body-md text-on-surface truncate">{g.planName}</div>
                        <div className="font-body-sm text-body-sm text-on-surface-variant">
                          {g.count} SIM{g.count !== 1 ? "s" : ""} × {formatCurrency(g.unitPrice, invoice.currency)}
                          {g.prorationFactor !== 1 && ` · prorrateo ${formatProrationFactor(g.prorationFactor)}`}
                        </div>
                      </div>
                    </div>
                    <div className="font-body-md text-body-md text-on-surface font-medium shrink-0">
                      {formatCurrency(g.total, invoice.currency)}
                    </div>
                  </div>
                ))}
                {groups.length === 0 && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant py-2">Sin SIMs facturadas.</p>
                )}
              </div>

              {/* Detalle SIM por SIM, bajo demanda */}
              {items.length > 0 && (
                <div className="bg-surface-container-lowest border border-hairline rounded-xl p-4 mb-6">
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                    <p className="font-body-sm text-body-sm text-on-surface-variant text-center sm:text-left">
                      Esta factura incluye {items.length} SIM{items.length !== 1 ? "s" : ""}. Consulta el detalle línea por línea.
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAllSims((v) => !v); }}
                      className="w-full sm:w-auto bg-surface-container-lowest border border-hairline px-4 py-2 rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors whitespace-nowrap"
                    >
                      {showAllSims ? "Ocultar detalle" : "Ver detalle completo"}
                    </button>
                  </div>

                  {showAllSims && (
                    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                      <div className="relative mb-3">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]" />
                        <input
                          value={simSearch}
                          onChange={(e) => setSimSearch(e.target.value)}
                          placeholder="Buscar ICCID…"
                          className="w-full pl-10 pr-4 py-2 bg-surface border border-hairline rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="max-h-72 overflow-y-auto rounded-lg border border-hairline divide-y divide-hairline">
                        {filteredItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="font-mono font-body-sm text-body-sm text-on-surface truncate">{item.iccid}</p>
                              <p className="font-body-sm text-body-sm text-on-surface-variant">
                                {item.plan_name} · prorrateo {formatProrationFactor(item.proration_factor)}
                              </p>
                            </div>
                            <span className="font-label-md text-label-md text-on-surface shrink-0">
                              {formatCurrency(item.amount, invoice.currency)}
                            </span>
                          </div>
                        ))}
                        {filteredItems.length === 0 && (
                          <p className="font-body-sm text-body-sm text-on-surface-variant px-3 py-3">
                            Sin coincidencias para "{simSearch}"
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Totales */}
              <div className="flex items-center justify-between gap-3 py-2 border-t border-hairline">
                <span className="font-label-md text-label-md text-on-surface-variant">Saldo pendiente</span>
                <span
                  className="font-label-md text-label-md"
                  style={{ color: balance > 0 ? "#d97706" : "#059669" }}
                >
                  {formatCurrency(balance, invoice.currency)}
                </span>
              </div>

              {/* Abonos */}
              <div className="mt-6">
                <h4 className="font-label-md text-label-md text-on-surface mb-2">Abonos aplicados</h4>
                {payments.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No hay abonos registrados para esta factura.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-container-low">
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {formatDate(p.paid_at)} · {p.method}
                        </span>
                        <span className="font-label-md text-label-md text-on-surface">
                          {formatCurrency(p.amount, invoice.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  // Métricas de las tarjetas de resumen
  const pendientes = invoices.filter((i) => i.status === "issued" || i.status === "partially_paid");
  const saldoPendiente = pendientes.reduce((s, i) => s + (i.balance ?? 0), 0);
  const ultimoPago = invoices
    .filter((i) => i.last_payment_at)
    .sort((a, b) => (a.last_payment_at! < b.last_payment_at! ? 1 : -1))[0];

  const filtered = invoices.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      formatPeriod(i.period_year, i.period_month).toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[1200px] mx-auto px-container-margin py-section-gap">
      <header className="mb-section-gap">
        <h1 className="font-display-lg text-display-lg text-on-surface mb-2">Mis Facturas</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Consulta el historial de facturación de tu flota IoT.
        </p>
      </header>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter mb-section-gap">
        <div className="bg-surface-container-lowest border border-hairline rounded-xl p-card-padding">
          <div className="flex items-center gap-2 mb-2 text-on-surface-variant">
            <Icon name="account_balance_wallet" className="text-primary" />
            <span className="font-label-md text-label-md">Saldo pendiente</span>
          </div>
          <div className="font-display-md text-display-md text-on-surface">
            {loading ? "—" : formatCurrency(saldoPendiente)}
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            {loading
              ? "Cargando…"
              : pendientes.length === 0
                ? "No tienes facturas por pagar"
                : `${pendientes.length} factura${pendientes.length !== 1 ? "s" : ""} por pagar`}
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-hairline rounded-xl p-card-padding">
          <div className="flex items-center gap-2 mb-2 text-on-surface-variant">
            <Icon name="history" className="text-secondary" />
            <span className="font-label-md text-label-md">Último pago</span>
          </div>
          <div className="font-display-md text-display-md text-on-surface">
            {loading ? "—" : ultimoPago ? formatCurrency(ultimoPago.paid ?? 0) : "—"}
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            {loading
              ? "Cargando…"
              : ultimoPago
                ? `Registrado el ${formatDate(ultimoPago.last_payment_at!)}`
                : "Todavía no hay pagos registrados"}
          </div>
        </div>
      </div>

      {/* Historial */}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Historial de facturación</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por mes o N°…"
                className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-hairline rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>
            <button
              onClick={load}
              className="bg-surface-container-lowest border border-hairline px-4 py-2 rounded-lg font-label-md text-label-md text-on-surface flex items-center gap-2 hover:bg-surface-container-low transition-colors"
            >
              <Icon name="refresh" className="text-[18px]" />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-surface-container-lowest border border-hairline rounded-xl py-20 text-center">
            <Icon name="receipt_long" className="text-[44px] text-outline-variant mb-3" />
            <p className="font-label-md text-label-md text-on-surface">Aún no tienes facturas</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Aquí aparecerá tu historial de facturación mensual.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-container-lowest border border-hairline rounded-xl py-12 text-center">
            <Icon name="search_off" className="text-[40px] text-outline-variant mb-3" />
            <p className="font-label-md text-label-md text-on-surface">Sin resultados</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              No se encontraron facturas para "{search}"
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} />)}
          </div>
        )}
      </section>
    </div>
  );
}
