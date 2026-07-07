import { useEffect, useState } from "react";
import {
  Plus, Trash2, Edit2, X, Loader2, Package, Search, RefreshCw, AlertCircle,
  CheckCircle2, PauseCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/order-status";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

type ProductForm = { name: string; price: string; description: string; currency: string };
const emptyForm: ProductForm = { name: "", price: "", description: "", currency: "MXN" };

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
function ProductModal({
  open, onClose, onSaved, product,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  product: Product | null;
}) {
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? { name: product.name, price: String(product.price), description: product.description ?? "", currency: product.currency }
          : emptyForm,
      );
    }
  }, [open, product]);

  if (!open) return null;

  const isEditing = !!product;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) { toast.error("El nombre del producto es requerido"); return; }
    if (!isFinite(price) || price <= 0) { toast.error("El precio debe ser un número mayor a 0"); return; }

    setSaving(true);
    try {
      if (isEditing) {
        await api.updateProduct(product!.id, { name, price, description: form.description, currency: form.currency });
        toast.success(`Producto "${name}" actualizado`);
      } else {
        await api.createProduct({ name, price, description: form.description || undefined, currency: form.currency });
        toast.success(`Producto "${name}" creado`);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">{isEditing ? "Editar Producto" : "Nuevo Producto"}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEditing ? `Modifica los datos de "${product!.name}"` : "Agrega un producto al catálogo"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nombre *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Antena LoRa exterior"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Precio (MXN) *</label>
              <Input
                type="number" min="0" step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Moneda</label>
              <Input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                placeholder="MXN"
                maxLength={3}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Detalles del producto..."
              className="w-full h-20 px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 resize-none bg-gray-50"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 text-black font-semibold"
              style={{ background: "#3ECF8E" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {saving ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Producto"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getProducts();
      setProducts(res.products || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleStatus = async (product: Product) => {
    const nextStatus = product.status === "active" ? "inactive" : "active";
    setTogglingId(product.id);
    try {
      await api.updateProduct(product.id, { status: nextStatus });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: nextStatus } : p)));
      toast.success(`Producto "${product.name}" ${nextStatus === "active" ? "activado" : "desactivado"}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`¿Eliminar el producto "${product.name}"?\n\nSi está referenciado en pedidos existentes, no podrá eliminarse — desactívalo en su lugar.`)) return;
    try {
      await api.deleteProduct(product.id);
      toast.success(`Producto "${product.name}" eliminado`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-teal-500" />
            Catálogo de Productos
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {products.length} producto{products.length !== 1 ? "s" : ""} · {products.filter((p) => p.status === "active").length} activo{products.filter((p) => p.status === "active").length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="gap-2 text-black font-semibold"
            style={{ background: "#3ECF8E" }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Producto</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o descripción..."
          className="pl-10"
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
              {["Producto", "Precio", "Estado", "Acciones"].map((label) => (
                <th key={label} className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-gray-500 whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : filtered.map((product) => {
                  const isActive = product.status === "active";
                  return (
                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-800">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{product.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-700">{formatCurrency(product.price, product.currency)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleStatus(product)}
                          disabled={togglingId === product.id}
                          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                          style={{ color: isActive ? "#16a34a" : "#94a3b8", background: isActive ? "rgba(22,163,74,0.10)" : "rgba(148,163,184,0.12)" }}
                        >
                          {togglingId === product.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                          {isActive ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditing(product); setShowModal(true); }}
                            className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">{search ? "Sin resultados para tu búsqueda" : "Aún no hay productos en el catálogo"}</p>
            {!search && (
              <Button onClick={() => { setEditing(null); setShowModal(true); }} className="mt-4 gap-2 text-black" style={{ background: "#3ECF8E" }}>
                <Plus className="w-4 h-4" /> Agregar primer producto
              </Button>
            )}
          </div>
        )}
      </div>

      <ProductModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={load}
        product={editing}
      />
    </div>
  );
}
