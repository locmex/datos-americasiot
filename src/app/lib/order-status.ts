// Small local status-token map for the client-orders feature (product catalog + order management).
// NOTE: this project also has a `status-tokens.ts` module, but it lives on another branch
// (feat/client-portal-redesign) and is NOT present on feat/client-orders — do not import it.
import { Clock, PackageCheck, Truck, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

export type OrderStatus = "pending" | "preparing" | "shipped" | "delivered" | "cancelled";

export interface OrderStatusConfig {
  label: string;
  color: string;
  bg: string;
  /** Icono Lucide (portal del cliente). */
  icon: LucideIcon;
  /** Nombre en Material Symbols — iconografía del design system Stitch. */
  symbol: string;
}

export const ORDER_STATUS: Record<OrderStatus, OrderStatusConfig> = {
  pending:   { label: "Pendiente",  color: "#6b7280", bg: "rgba(107,114,128,0.12)", icon: Clock,        symbol: "schedule" },
  preparing: { label: "Preparando", color: "#d97706", bg: "rgba(217,119,6,0.12)",   icon: PackageCheck, symbol: "inventory_2" },
  shipped:   { label: "Enviado",    color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: Truck,        symbol: "local_shipping" },
  delivered: { label: "Recibido",   color: "#16a34a", bg: "rgba(22,163,74,0.12)",   icon: CheckCircle2, symbol: "task_alt" },
  cancelled: { label: "Cancelado",  color: "#dc2626", bg: "rgba(220,38,38,0.12)",   icon: XCircle,      symbol: "cancel" },
};

export function getOrderStatus(status: string): OrderStatusConfig {
  return ORDER_STATUS[status as OrderStatus] ?? ORDER_STATUS.pending;
}

// Allowed next-status transitions from the admin side (mirrors server's ALLOWED map,
// minus the client-only shipped→delivered which the admin can also trigger).
export const ADMIN_NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending:   ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped:   ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const CARRIERS = ["estafeta", "dhl", "fedex", "ups"] as const;

export function formatCurrency(amount: number, currency = "MXN"): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)} ${currency}`;
  }
}
