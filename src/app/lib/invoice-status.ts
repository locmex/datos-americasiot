// Status-token map for the billing feature (plans, invoices, payments).
// Mirrors the shape of `order-status.ts` but is a SEPARATE module: invoice
// states (draft/issued/partially_paid/paid/cancelled) are semantically
// distinct from order states and must not be confused/reused.
import { FileEdit, Send, CircleDollarSign, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled";

export interface InvoiceStatusConfig {
  label: string;
  color: string;
  bg: string;
  icon: LucideIcon;
}

export const INVOICE_STATUS: Record<InvoiceStatus, InvoiceStatusConfig> = {
  draft:          { label: "Borrador",     color: "#6b7280", bg: "rgba(107,114,128,0.12)", icon: FileEdit },
  issued:         { label: "Emitida",      color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: Send },
  partially_paid: { label: "Pago parcial", color: "#d97706", bg: "rgba(217,119,6,0.12)",   icon: CircleDollarSign },
  paid:           { label: "Pagada",       color: "#16a34a", bg: "rgba(22,163,74,0.12)",   icon: CheckCircle2 },
  cancelled:      { label: "Cancelada",    color: "#dc2626", bg: "rgba(220,38,38,0.12)",   icon: XCircle },
};

export function getInvoiceStatus(status: string): InvoiceStatusConfig {
  return INVOICE_STATUS[status as InvoiceStatus] ?? INVOICE_STATUS.draft;
}

export function formatCurrency(amount: number, currency = "MXN"): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)} ${currency}`;
  }
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatPeriod(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

export function formatProrationFactor(factor: number): string {
  return factor >= 1 ? "100%" : "50%";
}
