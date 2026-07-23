import { useEffect, useState } from "react";
import {
  ClipboardList, X, Loader2, RefreshCw, AlertCircle, Search, ChevronRight,
  Truck, ExternalLink, History as HistoryIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import { ORDER_STATUS, ADMIN_NEXT_STATUS, CARRIERS, formatCurrency, getOrderStatus, type OrderStatus } from "../lib/order-status";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
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
  return new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function orderTotal(items: OrderItem[] = []): number {
  return items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
}

// ─── Status change form ───────────────────────────────────────────────────────
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
    <div className="p-3 rounded-xl border space-y-3" style={{ borderColor: cfg.color, background: cfg.bg }}>
      <p className="text-xs font-semibold" style={{ color: cfg.color }}>
        Cambiar estado a "{cfg.label}"
      </p>
      {needsTracking && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Paquetería *</label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Selecciona…</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">Número de guía *</label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="123456789" className="bg-white" />
          </div>
        </div>
      )}
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
          {saving ? "Guardando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

// ─── Order Detail Drawer ──────────────────────────────────────────────────────
function OrderDetailDrawer({
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

  useEffect(() => { loadDetail(); }, [initialOrder.id]);

  const statusCfg = getOrderStatus(order.status);
  const StatusIcon = statusCfg.icon;
  const nextOptions = ADMIN_NEXT_STATUS[order.status] ?? [];

  const handleConfirmed = (updated: Order) => {
    setOrder(updated);
    setPendingTarget(null);
    onUpdated();
    loadDetail();
  };

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
            <p className="text-sm font-bold text-gray-900 truncate">Pedido #{order.id.slice(0, 8)}</p>
            <p className="text-xs text-gray-400 truncate">{order.client_name}</p>
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
              {/* Status + tracking */}
              <div className="p-3 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estado</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: statusCfg.color, background: statusCfg.bg }}>
                    {statusCfg.label}
                  </span>
                </div>
                {order.carrier && order.tracking_number && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />{order.carrier}</span>
                    {order.tracking_url ? (
                      <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline">
                        {order.tracking_number}<ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs font-mono text-gray-600">{order.tracking_number}</span>
                    )}
                  </div>
                )}
                {order.notes && <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">{order.notes}</p>}
              </div>

              {/* Items */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Productos</p>
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-400">{item.quantity} × {formatCurrency(item.unit_price)}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-700 shrink-0">{formatCurrency(item.unit_price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-1 pt-2">
                  <span className="text-xs font-semibold text-gray-500">Total</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(orderTotal(items))}</span>
                </div>
              </div>

              {/* Change status actions */}
              {nextOptions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Cambiar estado</p>
                  {pendingTarget ? (
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
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all hover:opacity-80"
                            style={{ color: nextCfg.color, borderColor: nextCfg.color, background: nextCfg.bg }}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                            {next === "cancelled" ? "Cancelar pedido" : `Marcar ${nextCfg.label.toLowerCase()}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* History */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
                  <HistoryIcon className="w-3 h-3" />Historial
                </p>
                <div className="space-y-2">
                  {history.length === 0 ? (
                    <p className="text-xs text-gray-400">Sin historial aún</p>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: getOrderStatus(h.to_status).color }} />
                        <div className="min-w-0">
                          <p className="text-gray-700">
                            {h.from_status ? `${getOrderStatus(h.from_status).label} → ` : ""}
                            <span className="font-semibold">{getOrderStatus(h.to_status).label}</span>
                            <span className="text-gray-400"> · {h.changed_by_role === "admin" ? "Admin" : "Cliente"}</span>
                          </p>
                          <p className="text-gray-400">{formatDate(h.created_at)}{h.note ? ` · ${h.note}` : ""}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
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
    (o) => !search || o.client_name.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-teal-500" />
            Pedidos
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {orders.length} pedido{orders.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o ID de pedido..."
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "")}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{ORDER_STATUS[s].label}</option>
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
              {["Pedido", "Cliente", "Estado", "Fecha", ""].map((label) => (
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
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : filtered.map((order) => {
                  const cfg = getOrderStatus(order.status);
                  const itemsCount = (order.items || []).length;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelected(order)}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-mono text-gray-700">#{order.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-400">{itemsCount} producto{itemsCount !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-800">{order.client_name}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
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
            <ClipboardList className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">{search || statusFilter ? "Sin resultados" : "Aún no hay pedidos"}</p>
          </div>
        )}
      </div>

      {selected && (
        <OrderDetailDrawer
          order={selected}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
