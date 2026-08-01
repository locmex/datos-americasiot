import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { clientApi } from "../../lib/api";
import { getOrderStatus, formatCurrency, type OrderStatus } from "../../lib/order-status";
import { Icon } from "../../components/ui/icon";
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
  return new Date(ts).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Catálogo (crear pedido) ──────────────────────────────────────────────────
function CatalogTab({ search, onOrderCreated }: { search: string; onOrderCreated: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
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

  const filtered = products.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const setQty = (id: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const cartEntries = Object.entries(cart);
  const cartUnits = cartEntries.reduce((sum, [, qty]) => sum + qty, 0);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-surface-container-lowest border border-hairline rounded-xl py-20 text-center">
        <Icon name={search ? "search_off" : "inventory_2"} className="text-[44px] text-outline-variant mb-3" />
        <p className="font-label-md text-label-md text-on-surface">
          {search ? "Sin resultados" : "No hay productos disponibles"}
        </p>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          {search
            ? `No encontramos productos para "${search}"`
            : "Tu administrador todavía no publicó productos en el catálogo."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Bento grid de productos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((product) => {
          const qty = cart[product.id] ?? 0;
          const inCart = qty > 0;
          return (
            <div
              key={product.id}
              className={`bg-surface-container-lowest rounded-2xl border p-5 hover:bg-surface-bright transition-colors group flex flex-col h-full ${
                inCart ? "border-primary-container" : "border-hairline"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors">
                  <Icon name="inventory_2" />
                </div>
                {inCart && (
                  <span className="bg-primary-container/20 text-on-primary-container px-2 py-1 rounded-md font-label-xs text-label-xs flex items-center gap-1">
                    <Icon name="check_circle" className="text-[14px]" filled />
                    En el pedido
                  </span>
                )}
              </div>

              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">{product.name}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-6 flex-1">
                {product.description || "Sin descripción."}
              </p>

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-hairline">
                <div className="font-display-md text-display-md text-primary">
                  {formatCurrency(product.price, product.currency)}
                </div>
                <div className="flex items-center bg-surface-container rounded-lg border border-hairline overflow-hidden shrink-0">
                  <button
                    onClick={() => setQty(product.id, qty - 1)}
                    disabled={qty === 0}
                    className="px-3 py-1 hover:bg-surface-variant text-on-surface transition-colors disabled:opacity-30"
                    aria-label={`Quitar una unidad de ${product.name}`}
                  >
                    −
                  </button>
                  <span className="px-2 font-label-md text-label-md w-8 text-center bg-surface-container-lowest">
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty(product.id, qty + 1)}
                    className="px-3 py-1 hover:bg-surface-variant text-on-surface transition-colors"
                    aria-label={`Agregar una unidad de ${product.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Carrito flotante — anclado al borde inferior, dentro del área de contenido
          (el `md:pl-64` compensa el ancho de la sidebar para que quede centrado). */}
      {cartEntries.length > 0 && (
        {/* En móvil se levanta por encima de las tabs inferiores (h-16); en
            escritorio no hay tabs, así que vuelve a bottom-6. */}
        <div className="fixed bottom-20 left-0 right-0 px-4 md:bottom-6 md:pl-64 z-40 pointer-events-none">
          <div className="mx-auto max-w-2xl bg-surface-container-lowest rounded-2xl border border-hairline p-4 flex flex-col md:flex-row items-center justify-between gap-4 pointer-events-auto"
            style={{ boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.08)" }}
          >
            <div className="flex items-center gap-4 flex-1 w-full md:w-auto">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary relative shrink-0">
                <Icon name="shopping_cart" />
                <span className="absolute -top-1 -right-1 bg-error text-on-error font-label-xs text-[10px] w-5 h-5 flex items-center justify-center rounded-full">
                  {cartUnits}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-label-md text-label-md text-on-surface-variant">
                  {cartEntries.length} producto{cartEntries.length !== 1 ? "s" : ""} · {cartUnits} unidad{cartUnits !== 1 ? "es" : ""}
                </p>
                <p className="font-display-md text-display-md text-primary">
                  Total: {formatCurrency(cartTotal)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas del pedido (opcional)"
                className="flex-1 md:w-48 bg-surface border border-hairline rounded-lg px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary px-6 py-2 rounded-lg font-label-md text-label-md transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon name="send" className="text-[18px]" />}
                {submitting ? "Enviando…" : "Realizar Pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Mis Pedidos (historial) ──────────────────────────────────────────────────
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-surface-container-lowest border border-hairline rounded-xl py-20 text-center">
        <Icon name="shopping_cart" className="text-[44px] text-outline-variant mb-3" />
        <p className="font-label-md text-label-md text-on-surface">Aún no has realizado pedidos</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          Explora el catálogo y arma tu primer pedido.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low transition-colors font-label-md text-label-md"
        >
          <Icon name="refresh" className="text-[16px]" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {orders.map((order) => {
          const cfg = getOrderStatus(order.status);
          const canCancel = order.status === "pending" || order.status === "preparing";
          const canReceive = order.status === "shipped";
          const items = order.items || [];
          const total = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);

          return (
            <div key={order.id} className="bg-surface-container-lowest rounded-2xl border border-hairline p-5 flex flex-col">
              {/* Encabezado */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="font-headline-sm text-headline-sm text-on-surface">
                    Pedido #{order.id.slice(0, 8)}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {formatDate(order.created_at)}
                  </p>
                </div>
                <span
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full font-label-xs text-label-xs shrink-0 whitespace-nowrap"
                  style={{ color: cfg.color, background: cfg.bg }}
                >
                  <cfg.icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </span>
              </div>

              {/* Artículos */}
              <div className="rounded-xl border border-hairline divide-y divide-hairline overflow-hidden mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="font-body-md text-body-md text-on-surface truncate">
                      <span className="text-on-surface-variant">{item.quantity} ×</span> {item.product_name}
                    </span>
                    <span className="font-label-md text-label-md text-on-surface shrink-0">
                      {formatCurrency(item.unit_price * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-row-hover">
                  <span className="font-label-md text-label-md text-on-surface-variant">Total</span>
                  <span className="font-label-md text-label-md text-primary">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Envío */}
              {order.carrier && order.tracking_number && (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface-container-low mb-4">
                  <span className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                    <Icon name="local_shipping" className="text-[18px]" />
                    {order.carrier}
                  </span>
                  {order.tracking_url ? (
                    <a
                      href={order.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-label-md text-label-md text-primary hover:underline"
                    >
                      Rastrear <Icon name="open_in_new" className="text-[14px]" />
                    </a>
                  ) : (
                    <span className="font-mono font-body-sm text-body-sm text-on-surface">{order.tracking_number}</span>
                  )}
                </div>
              )}

              {/* Acciones */}
              {(canCancel || canReceive) && (
                <div className="flex gap-2 mt-auto">
                  {canReceive && (
                    <button
                      onClick={() => handleReceived(order)}
                      disabled={busyId === order.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg btn-primary font-label-md text-label-md transition-colors disabled:opacity-60"
                    >
                      {busyId === order.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Icon name="check_circle" className="text-[18px]" />}
                      Marcar recibido
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={busyId === order.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-hairline text-error hover:bg-error-container/30 font-label-md text-label-md transition-colors disabled:opacity-60"
                    >
                      {busyId === order.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Icon name="cancel" className="text-[18px]" />}
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function ClientOrdersPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "history">("catalog");
  const [search, setSearch] = useState("");

  const tabs = [
    { id: "catalog", label: "Catálogo" },
    { id: "history", label: "Mis Pedidos" },
  ] as const;

  return (
    <>
      {/* Encabezado: título, buscador y pestañas */}
      <div className="bg-surface border-b border-hairline">
        <div className="max-w-[1280px] mx-auto px-container-margin pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-display-lg text-display-lg text-on-surface">Pedidos</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Explora el catálogo y da seguimiento a tus compras de conectividad.
              </p>
            </div>

            {activeTab === "catalog" && (
              <div className="relative w-full md:w-80">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar productos…"
                  className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-hairline rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant transition-colors"
                />
              </div>
            )}
          </div>

          <div className="flex gap-6 mt-6">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`pb-2 font-label-md text-label-md transition-colors border-b-2 -mb-px ${
                  activeTab === id
                    ? "text-primary border-primary font-bold"
                    : "text-on-surface-variant border-transparent hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      {/* `pb-40` deja aire para que el carrito flotante no tape la última fila */}
      <div className="max-w-[1280px] mx-auto px-container-margin py-section-gap pb-40">
        {activeTab === "catalog"
          ? <CatalogTab search={search} onOrderCreated={() => setActiveTab("history")} />
          : <HistoryTab />}
      </div>
    </>
  );
}
