// Client-side PDF receipt generation (comprobante interno) for a billing invoice.
// No server endpoint — built entirely from the already-authorized JSON returned
// by GET /invoices/:id or GET /client/invoices/:id.
import jsPDF from "jspdf";
import { formatCurrency, formatPeriod, formatProrationFactor, getInvoiceStatus } from "./invoice-status";

interface InvoiceItem {
  iccid: string;
  plan_name: string;
  unit_price: number;
  proration_factor: number;
  amount: number;
}
interface Payment {
  amount: number;
  paid_at: string;
  method: string;
}
interface Invoice {
  id: string;
  client_name: string;
  period_year: number;
  period_month: number;
  status: string;
  currency: string;
  total: number;
  issued_at?: string | null;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function generateInvoicePdf(invoice: Invoice, items: InvoiceItem[], payments: Payment[], balance: number) {
  const doc = new jsPDF();
  const statusCfg = getInvoiceStatus(invoice.status);
  let y = 18;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Americas IoT — Comprobante de Facturación", 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Factura: ${invoice.id}`, 14, y); y += 5;
  doc.text(`Cliente: ${invoice.client_name}`, 14, y); y += 5;
  doc.text(`Período: ${formatPeriod(invoice.period_year, invoice.period_month)}`, 14, y); y += 5;
  doc.text(`Estado: ${statusCfg.label}`, 14, y); y += 5;
  if (invoice.issued_at) { doc.text(`Fecha de emisión: ${formatDate(invoice.issued_at)}`, 14, y); y += 5; }
  y += 4;

  // Item breakdown header
  doc.setFont("helvetica", "bold");
  doc.text("ICCID", 14, y);
  doc.text("Plan", 65, y);
  doc.text("Prorrateo", 118, y);
  doc.text("Precio unit.", 148, y);
  doc.text("Monto", 180, y);
  y += 2;
  doc.setDrawColor(200);
  doc.line(14, y, 196, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  for (const item of items) {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.text(item.iccid, 14, y);
    doc.text(item.plan_name, 65, y, { maxWidth: 50 });
    doc.text(formatProrationFactor(item.proration_factor), 118, y);
    doc.text(formatCurrency(item.unit_price, invoice.currency), 148, y);
    doc.text(formatCurrency(item.amount, invoice.currency), 180, y);
    y += 6;
  }

  y += 2;
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatCurrency(invoice.total, invoice.currency)}`, 140, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("El precio del plan ya incluye IVA.", 14, y);
  doc.setFontSize(10);
  y += 8;

  if (payments.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("Abonos registrados", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const p of payments) {
      if (y > 270) { doc.addPage(); y = 18; }
      doc.text(`${formatDate(p.paid_at)} · ${p.method} · ${formatCurrency(p.amount, invoice.currency)}`, 14, y);
      y += 5;
    }
    y += 3;
  }

  doc.setFont("helvetica", "bold");
  doc.text(`Saldo pendiente: ${formatCurrency(balance, invoice.currency)}`, 14, y);

  doc.save(`factura-${formatPeriod(invoice.period_year, invoice.period_month).replace(" ", "-")}-${invoice.id.slice(0, 8)}.pdf`);
}
