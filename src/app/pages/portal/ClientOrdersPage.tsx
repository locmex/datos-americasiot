import { useEffect, useState, useMemo } from "react";
import {
  ShoppingCart, Package, Plus, Minus, Loader2, RefreshCw, Search,
  ExternalLink, Truck, CheckCircle2, XCircle,
} from "lucide-react";
import { clientApi } from "../../lib/api";
import { ORDER_STATUS, getOrderStatus, formatCurrency, type OrderStatus } from "../../lib/order-status";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  status: "active" | "inactive";
}
interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
}
interface Order {
  id: string;
  status: OrderStatus;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  notes?: string | null;
  created_at: string;
  items?: OrderItem[];
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Catalog tab (create order) ───────────────────────────────────────────────
function CatalogTab({ onOrderCreated }: { onOrderCreated: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientApi.getProducts();
      setProducts(res.products || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const setQty = (id: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const cartEntries = Object.entries(cart);
  const cartTotal = cartEntries.reduce((sum, [id, qty]) => {
    const p = products.find((pr) => pr.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const handleSubmit = async () => {
    if (cartEntries.length === 0) { toast.error("Agrega al menos un producto"); return; }
    setSubmitting(true);
    try {
      await clientApi.createOrder({
        items: cartEntries.map(([product_id, quantity]) => ({ product_id, quantity })),
        notes: notes.trim() || undefined,
      });
      toast.success("Pedido creado correctamente");
      setCart({});
      setNotes("");
      onOrderCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-gray-100">
          <Package className="w-10 h-10 text-gray-200 mb-2" />
          <p className="text-sm font-medium text-gray-400">{search ? "Sin resultados" : "No hay productos disponibles"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((product) => {
            const qty = cart[product.id] ?? 0;
            return (
              <div key={product.id} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                    {product.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{product.description}</p>}
                  </div>
                  <p className="text-sm font-bold shrink-0" style={{ color: "#059669" }}>
                    {formatCurrency(product.price, product.currency)}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <button
                    onClick={() => setQty(product.id, qty - 1)}
                    disabled={qty === 0}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-gray-800">{qty}</span>
                  <button
                    onClick={() => setQty(product.id, qty + 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cartEntries.length > 0 && (
        <div className="sticky bottom-4 bg-white rounded-2xl border shadow-lg p-4 space-y-3" style={{ borderColor: "rgba(62,207,142,0.3)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" style={{ color: "#3ECF8E" }} />
              {cartEntries.length} producto{cartEntries.length !== 1 ? "s" : ""}
            </span>
            <span className="text-base font-bold text-gray-900">{formatCurrency(cartTotal)}</span>
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas para el pedido (opcional)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-black transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "#3ECF8E" }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {submitting ? "Enviando..." : "Realizar Pedido"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── History tab (own orders) ─────────────────────────────────────────────────
function HistoryTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clientApi.getMyOrders();
      setOrders(res.orders || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleReceived = async (order: Order) => {
    setBusyId(order.id);
    try {
      await clientApi.markReceived(order.id);
      toast.success("Pedido marcado como recibido");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (order: Order) => {
    if (!confirm("¿Cancelar este pedido?")) return;
    setBusyId(order.id);
    try {
      await clientApi.cancelOrder(order.id);
      toast.success("Pedido cancelado");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-100">
        <ShoppingCart className="w-10 h-10 text-gray-200 mb-2" />
        <p className="text-sm font-medium text-gray-400">Aún no has realizado pedidos</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
      {orders.map((order) => {
        const cfg = getOrderStatus(order.status);
        const StatusIcon = cfg.icon;
        const canCancel = order.status === "pending" || order.status === "preparing";
        const canReceive = order.status === "shipped";
        const items = order.items || [];
        return (
          <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-mono text-gray-500">#{order.id.slice(0, 8)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.created_at)}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ color: cfg.color, background: cfg.bg }}>
                <StatusIcon className="w-3.5 h-3.5" />{cfg.label}
              </span>
            </div>

            <div className="divide-y divide-gray-50 border-t border-b border-gray-50 py-1">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-700 truncate">{item.quantity} × {item.product_name}</span>
                  <span className="text-gray-500 shrink-0">{formatCurrency(item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {order.carrier && order.tracking_number && (
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500"><Truck className="w-3.5 h-3.5" />{order.carrier}</span>
                {order.tracking_url ? (
                  <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-blue-600 hover:underline">
                    Rastrear <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="font-mono text-gray-600">{order.tracking_number}</span>
                )}
              </div>
            )}

            {(canCancel || canReceive) && (
              <div className="flex gap-2 pt-1">
                {canReceive && (
                  <button
                    onClick={() => handleReceived(order)}
                    disabled={busyId === order.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: "#16a34a" }}
                  >
                    {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Marcar recibido
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => handleCancel(order)}
                    disabled={busyId === order.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-60"
                    style={{ color: "#dc2626", borderColor: "rgba(220,38,38,0.3)" }}
                  >
                    {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientOrdersPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "history">("catalog");

  const tabs = useMemo(() => ([
    { id: "catalog", label: "Catálogo", icon: Package },
    { id: "history", label: "Mis Pedidos", icon: ShoppingCart },
  ] as const), []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-10">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" style={{ color: "#3ECF8E" }} />
          Pedidos
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Solicita productos y da seguimiento a tus pedidos</p>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors relative"
            style={{ color: activeTab === id ? "#3ECF8E" : "#6b7280" }}
          >
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {label}
            {activeTab === id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ background: "#3ECF8E" }} />
            )}
          </button>
        ))}
      </div>

      {activeTab === "catalog"
        ? <CatalogTab onOrderCreated={() => setActiveTab("history")} />
        : <HistoryTab />}
    </div>
  );
}
