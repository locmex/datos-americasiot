import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/order-status";
import { Icon } from "../components/ui/icon";
import {
  PageHeader, IconButton, SearchField, ErrorBanner, TableCard, TableHead, TableSkeleton,
  EmptyState, StatusSwitch, RowAction, Modal, Field, FormActions, fieldClass,
  FilterPills, ResultCount,
} from "../components/admin/AdminUI";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
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

// ─── Alta / edición ──────────────────────────────────────────────────────────
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
  const isEditing = !!product;

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? {
              name: product.name,
              price: String(product.price),
              description: product.description ?? "",
              currency: product.currency,
            }
          : emptyForm,
      );
    }
  }, [open, product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) { toast.error("El nombre del producto es requerido"); return; }
    if (!isFinite(price) || price <= 0) {
      toast.error("El precio debe ser un número mayor a 0");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await api.updateProduct(product!.id, {
          name, price, description: form.description, currency: form.currency,
        });
        toast.success(`Producto "${name}" actualizado`);
      } else {
        await api.createProduct({
          name, price, description: form.description || undefined, currency: form.currency,
        });
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
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar producto" : "Nuevo producto"}
      subtitle={isEditing ? `Modificá los datos de "${product!.name}"` : "Agregá un producto al catálogo"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre" required>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Antena LoRa exterior"
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio" required>
            <input
              type="number" min="0" step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
          <Field label="Moneda">
            <input
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              placeholder="MXN"
              maxLength={3}
              className={fieldClass}
            />
          </Field>
        </div>

        <Field label="Descripción" hint="Lo que el cliente ve en el catálogo al hacer un pedido.">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Detalle del producto…"
            rows={3}
            className={`${fieldClass} resize-y`}
          />
        </Field>

        <FormActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEditing ? "Guardar cambios" : "Crear producto"}
          icon={isEditing ? "check" : "add"}
        />
      </form>
    </Modal>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

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
    if (
      !confirm(
        `¿Eliminar el producto "${product.name}"?\n\nSi está referenciado en pedidos existentes, no podrá eliminarse — desactivalo en su lugar.`,
      )
    ) return;
    try {
      await api.deleteProduct(product.id);
      toast.success(`Producto "${product.name}" eliminado`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openNew = () => { setEditing(null); setShowModal(true); };
  const filtered = products.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
  });
  const activeCount = products.filter((p) => p.status === "active").length;

  return (
    <div className="p-container-margin">
      <PageHeader
        title="Catálogo de Productos"
        subtitle={
          <>
            {products.length} producto{products.length !== 1 ? "s" : ""} · {activeCount} activo
            {activeCount !== 1 ? "s" : ""}
          </>
        }
      >
        <IconButton icon="refresh" onClick={load} title="Recargar" spinning={loading} />
        <button
          onClick={openNew}
          className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-label-md shadow-sm transition-colors"
        >
          <Icon name="add" className="text-[18px]" />
          Nuevo Producto
        </button>
      </PageHeader>

      <div className="mb-gutter">
        <SearchField value={search} onChange={setSearch} placeholder="Buscar por nombre o descripción…" />
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <TableCard
        toolbar={
          <>
            <FilterPills
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "active", label: "Activos" },
                { value: "inactive", label: "Inactivos" },
              ]}
            />
            <ResultCount shown={filtered.length} total={products.length} noun="productos" />
          </>
        }
      >
        <table className="w-full">
          <TableHead
            columns={[
              { label: "Producto" },
              { label: "Precio", align: "right" },
              { label: "Estado" },
              { label: "Acciones", align: "right" },
            ]}
          />
          <tbody className="divide-y divide-outline-variant/50 text-body-sm text-on-surface">
            {loading ? (
              <TableSkeleton cols={4} rows={4} />
            ) : (
              filtered.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <div className="text-label-md text-on-surface">{product.name}</div>
                    {product.description && (
                      <div className="mt-0.5 max-w-md truncate text-body-sm text-on-surface-variant">
                        {product.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-label-md">
                    {formatCurrency(product.price, product.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSwitch
                      active={product.status === "active"}
                      busy={togglingId === product.id}
                      onToggle={() => handleToggleStatus(product)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <RowAction
                        icon="edit"
                        title="Editar producto"
                        onClick={() => { setEditing(product); setShowModal(true); }}
                      />
                      <RowAction
                        icon="delete"
                        title="Eliminar producto"
                        tone="danger"
                        onClick={() => handleDelete(product)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && !error && (
          <EmptyState
            icon="inventory_2"
            title={
              search || statusFilter !== "all"
                ? "Sin resultados para este filtro"
                : "Aún no hay productos en el catálogo"
            }
            action={
              !search && statusFilter === "all" && (
                <button
                  onClick={openNew}
                  className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-label-md transition-colors"
                >
                  <Icon name="add" className="text-[18px]" />
                  Agregar primer producto
                </button>
              )
            }
          />
        )}
      </TableCard>

      <ProductModal open={showModal} onClose={() => setShowModal(false)} onSaved={load} product={editing} />
    </div>
  );
}
