import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  ORDER_STATUS, ADMIN_NEXT_STATUS, CARRIERS, formatCurrency, getOrderStatus,
  type OrderStatus,
} from "../lib/order-status";
import { Icon } from "../components/ui/icon";
import {
  PageHeader, IconButton, SearchField, ErrorBanner, TableCard, TableHead, TableSkeleton,
  EmptyState, Field, fieldClass,
} from "../components/admin/AdminUI";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
}
interface OrderHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_by_role: "admin" | "client";
  note: string | null;
  created_at: string;
}
interface Order {
  id: string;
  client_id: string;
  client_name: string;
  status: OrderStatus;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function orderTotal(items: OrderItem[] = []): number {
  return items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
}

// ─── Chip de estado ──────────────────────────────────────────────────────────
function StatusChip({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const cfg = getOrderStatus(status);
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

// ─── Cambio de estado ────────────────────────────────────────────────────────
function StatusChangeForm({
  order, targetStatus, onCancel, onConfirmed,
}: {
  order: Order;
  targetStatus: OrderStatus;
  onCancel: () => void;
  onConfirmed: (updated: Order) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const needsTracking = targetStatus === "shipped";
  const cfg = getOrderStatus(targetStatus);

  const handleConfirm = async () => {
    if (needsTracking && (!carrier.trim() || !tracking.trim())) {
      toast.error("Se requiere paquetería y número de guía para marcar como enviado");
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateOrderStatus(order.id, {
        status: targetStatus,
        carrier: needsTracking ? carrier.trim() : undefined,
        tracking_number: needsTracking ? tracking.trim() : undefined,
        note: note.trim() || undefined,
      });
      toast.success(`Pedido actualizado a "${cfg.label}"`);
      onConfirmed(res.order);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: cfg.color, background: cfg.bg }}>
      <p className="text-label-md" style={{ color: cfg.color }}>
        Cambiar estado a "{cfg.label}"
      </p>

      {needsTracking && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Paquetería" required>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={fieldClass}>
              <option value="">Seleccioná…</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Número de guía" required>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="123456789"
              className={fieldClass}
            />
          </Field>
        </div>
      )}

      <Field label="Nota interna">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Comentario interno…"
          className={fieldClass}
        />
      </Field>

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
          className="btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-label-md transition-colors disabled:opacity-50"
        >
          {saving && <Icon name="progress_activity" className="animate-spin text-[16px]" />}
          {saving ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

// ─── Panel de detalle ────────────────────────────────────────────────────────
function OrderDetailPanel({
  order: initialOrder, onClose, onUpdated,
}: {
  order: Order;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [items, setItems] = useState<OrderItem[]>(initialOrder.items ?? []);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.getOrderById(initialOrder.id);
      setOrder(res.order);
      setItems(res.items || []);
      setHistory(res.history || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPendingTarget(null);
    loadDetail();
  }, [initialOrder.id]);

  const nextOptions = ADMIN_NEXT_STATUS[order.status] ?? [];

  const handleConfirmed = (updated: Order) => {
    setOrder(updated);
    setPendingTarget(null);
    onUpdated();
    loadDetail();
  };

  return (
    <div className="flex h-[700px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg">
      {/* Cabecera fija — estado, envío y acciones siempre visibles */}
      <div className="z-20 shrink-0 border-b border-outline-variant bg-surface-bright p-card-padding">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 text-label-xs tracking-wider text-on-surface-variant uppercase">
              Detalle de pedido
            </div>
            <h3 className="truncate font-mono text-display-md leading-tight text-on-surface">
              #{order.id.slice(0, 8)}
            </h3>
            <p className="mt-1 truncate text-body-sm text-primary">{order.client_name}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusChip status={order.status} size="md" />
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
              aria-label="Cerrar detalle"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>

        {order.carrier && order.tracking_number && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-outline-variant/50 bg-surface p-3">
            <span className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
              <Icon name="local_shipping" className="text-[16px]" />
              {order.carrier.toUpperCase()}
            </span>
            {order.tracking_url ? (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-label-md text-primary hover:underline"
              >
                {order.tracking_number}
                <Icon name="open_in_new" className="text-[14px]" />
              </a>
            ) : (
              <span className="font-mono text-label-md text-on-surface">{order.tracking_number}</span>
            )}
          </div>
        )}

        {nextOptions.length > 0 &&
          (pendingTarget ? (
            <StatusChangeForm
              order={order}
              targetStatus={pendingTarget}
              onCancel={() => setPendingTarget(null)}
              onConfirmed={handleConfirmed}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextOptions.map((next) => {
                const nextCfg = getOrderStatus(next);
                return (
                  <button
                    key={next}
                    onClick={() => setPendingTarget(next)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-label-xs transition-opacity hover:opacity-80"
                    style={{ color: nextCfg.color, borderColor: nextCfg.color, background: nextCfg.bg }}
                  >
                    <Icon name={nextCfg.symbol} className="text-[16px]" />
                    {next === "cancelled" ? "Cancelar pedido" : `Marcar ${nextCfg.label.toLowerCase()}`}
                  </button>
                );
              })}
            </div>
          ))}
      </div>

      {/* Contenido desplazable */}
      <div className="flex-1 overflow-y-auto bg-surface p-card-padding">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-surface-container" />
            ))}
          </div>
        ) : (
          <>
            <h4 className="mb-3 flex items-center gap-2 text-label-md text-on-surface">
              <Icon name="inventory_2" className="text-[18px] text-on-surface-variant" />
              Productos
            </h4>
            <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-b border-outline-variant/50 px-3 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-md text-on-surface">{item.product_name}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="shrink-0 text-label-md text-on-surface">
                    {formatCurrency(item.unit_price * item.quantity)}
                  </p>
                </div>
              ))}
              {items.length === 0 && (
                <p className="px-3 py-3 text-body-sm text-on-surface-variant">Este pedido no tiene productos</p>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-2">
              <span className="text-label-md text-on-surface-variant">Total</span>
              <span className="text-headline-sm text-on-surface">{formatCurrency(orderTotal(items))}</span>
            </div>

            {order.notes && (
              <p className="mt-4 rounded-lg bg-surface-container-low p-3 text-body-sm text-on-surface-variant">
                {order.notes}
              </p>
            )}

            <h4 className="mt-6 mb-3 flex items-center gap-2 text-label-md text-on-surface">
              <Icon name="history" className="text-[18px] text-on-surface-variant" />
              Historial
            </h4>
            {history.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">Sin historial aún</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 text-body-sm">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: getOrderStatus(h.to_status).color }}
                    />
                    <div className="min-w-0">
                      <p className="text-on-surface">
                        {h.from_status ? `${getOrderStatus(h.from_status).label} → ` : ""}
                        <span className="text-label-md">{getOrderStatus(h.to_status).label}</span>
                        <span className="text-on-surface-variant">
                          {" "}· {h.changed_by_role === "admin" ? "Admin" : "Cliente"}
                        </span>
                      </p>
                      <p className="text-on-surface-variant">
                        {formatDate(h.created_at)}{h.note ? ` · ${h.note}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [selected, setSelected] = useState<Order | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getOrders(statusFilter ? { status: statusFilter } : undefined);
      setOrders(res.orders || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = orders.filter(
    (o) =>
      !search ||
      o.client_name.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-container-margin">
      <PageHeader title="Pedidos" subtitle={`${orders.length} pedido${orders.length !== 1 ? "s" : ""}`}>
        <IconButton icon="refresh" onClick={load} title="Recargar" spinning={loading} />
      </PageHeader>

      <div className="mb-gutter flex flex-col gap-3 sm:flex-row">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por cliente o ID de pedido…"
          className="max-w-md flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md outline-none focus:border-primary"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{ORDER_STATUS[s].label}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        <TableCard className="lg:col-span-2">
          <table className="w-full">
            <TableHead
              columns={[
                { label: "Pedido" },
                { label: "Cliente" },
                { label: "Estado" },
                { label: "Fecha" },
              ]}
            />
            <tbody className="divide-y divide-outline-variant/50 text-body-sm text-on-surface">
              {loading ? (
                <TableSkeleton cols={4} />
              ) : (
                filtered.map((order) => {
                  const itemsCount = (order.items || []).length;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelected(order)}
                      className={`cursor-pointer transition-colors hover:bg-surface-container-low ${
                        selected?.id === order.id ? "bg-surface-container-highest/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-label-md text-on-surface">#{order.id.slice(0, 8)}</div>
                        <div className="text-label-xs text-on-surface-variant">
                          {itemsCount} producto{itemsCount !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-label-md text-on-surface">{order.client_name}</td>
                      <td className="px-4 py-3"><StatusChip status={order.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">
                        {formatDate(order.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {!loading && filtered.length === 0 && !error && (
            <EmptyState
              icon="shopping_cart"
              title={search || statusFilter ? "Sin resultados" : "Aún no hay pedidos"}
            />
          )}
        </TableCard>

        <div className="lg:col-span-1">
          {selected ? (
            <OrderDetailPanel order={selected} onClose={() => setSelected(null)} onUpdated={load} />
          ) : (
            <div className="hidden h-[700px] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest/50 text-center lg:flex">
              <Icon name="shopping_cart" className="mb-3 text-[40px] text-outline-variant" />
              <p className="text-body-md text-on-surface-variant">Seleccioná un pedido</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Los productos, el envío y el historial aparecen acá
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
