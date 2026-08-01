import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/invoice-status";
import { Icon } from "../components/ui/icon";
import {
  PageHeader, IconButton, SearchField, ErrorBanner, TableCard, TableHead, TableSkeleton,
  EmptyState, StatusSwitch, RowAction, Modal, Field, FormActions, fieldClass,
  FilterPills, ResultCount,
} from "../components/admin/AdminUI";
import { useTableColumns, type ColumnDef } from "../components/table/useTableColumns";
import { TableCustomizer } from "../components/table/TableCustomizer";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  unit_price: number;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

type PlanForm = { name: string; unit_price: string; currency: string };
const emptyForm: PlanForm = { name: "", unit_price: "", currency: "MXN" };

// ── Columnas configurables ───────────────────────────────────────────────────
type PlanColKey = "Plan" | "Precio" | "Estado" | "Acciones";

const PLAN_COLUMNS: ColumnDef<PlanColKey>[] = [
  { key: "Plan",  label: "Plan", locked: true },
  { key: "Precio",    label: "Precio" },
  { key: "Estado",    label: "Estado" },
  { key: "Acciones",  label: "Acciones", locked: true },
];

const ALIGN: Record<PlanColKey, string> = {
  "Plan": "text-left", "Precio": "text-right",
  "Estado": "text-left", "Acciones": "text-right",
};

// ─── Alta / edición ──────────────────────────────────────────────────────────
function PlanModal({
  open, onClose, onSaved, plan,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  plan: Plan | null;
}) {
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const isEditing = !!plan;

  useEffect(() => {
    if (open) {
      setForm(
        plan
          ? { name: plan.name, unit_price: String(plan.unit_price), currency: plan.currency }
          : emptyForm,
      );
    }
  }, [open, plan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const unitPrice = Number(form.unit_price);
    if (!name) { toast.error("El nombre del plan es requerido"); return; }
    if (!isFinite(unitPrice) || unitPrice <= 0) {
      toast.error("El precio debe ser un número mayor a 0");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await api.updatePlan(plan!.id, { name, unit_price: unitPrice, currency: form.currency });
        toast.success(`Plan "${name}" actualizado`);
      } else {
        await api.createPlan({ name, unit_price: unitPrice, currency: form.currency });
        toast.success(`Plan "${name}" creado`);
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
      title={isEditing ? "Editar plan" : "Nuevo plan"}
      subtitle={isEditing ? `Modificá los datos de "${plan!.name}"` : "Agregá un plan de facturación"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre" required>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Plan único"
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio" required>
            <input
              type="number" min="0" step="0.01"
              value={form.unit_price}
              onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
              placeholder="45.00"
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

        <p className="text-body-sm text-on-surface-variant">El precio ya incluye IVA.</p>

        <FormActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEditing ? "Guardar cambios" : "Crear plan"}
          icon={isEditing ? "check" : "add"}
        />
      </form>
    </Modal>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Columnas configurables: en un teléfono la tabla no entra sin scroll lateral.
  const cols = useTableColumns<PlanColKey>("admin.plans.columns", PLAN_COLUMNS);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getPlans();
      setPlans(res.plans || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleStatus = async (plan: Plan) => {
    setTogglingId(plan.id);
    try {
      await api.updatePlan(plan.id, { active: !plan.active });
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, active: !plan.active } : p)));
      toast.success(`Plan "${plan.name}" ${!plan.active ? "activado" : "desactivado"}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (
      !confirm(
        `¿Eliminar el plan "${plan.name}"?\n\nSi está referenciado por SIMs o facturas existentes, no podrá eliminarse — desactivalo en su lugar.`,
      )
    ) return;
    try {
      await api.deletePlan(plan.id);
      toast.success(`Plan "${plan.name}" eliminado`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openNew = () => { setEditing(null); setShowModal(true); };
  const filtered = plans.filter((p) => {
    if (statusFilter === "active" && !p.active) return false;
    if (statusFilter === "inactive" && p.active) return false;
    return !search || p.name.toLowerCase().includes(search.toLowerCase());
  });
  const activeCount = plans.filter((p) => p.active).length;

  return (
    <div className="p-container-margin">
      <PageHeader
        title="Planes de Facturación"
        subtitle={
          <>
            {plans.length} plan{plans.length !== 1 ? "es" : ""} · {activeCount} activo
            {activeCount !== 1 ? "s" : ""}
          </>
        }
      >
        <TableCustomizer
          columns={cols.columns}
          isVisible={cols.isVisible}
          toggle={cols.toggle}
          reset={cols.reset}
          density={cols.density}
          setDensity={cols.setDensity}
          columnLines={cols.columnLines}
          setColumnLines={cols.setColumnLines}
        />
        <IconButton icon="refresh" onClick={load} title="Recargar" spinning={loading} />
        <button
          onClick={openNew}
          className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-label-md shadow-sm transition-colors"
        >
          <Icon name="add" className="text-[18px]" />
          Nuevo Plan
        </button>
      </PageHeader>

      <div className="mb-gutter">
        <SearchField value={search} onChange={setSearch} placeholder="Buscar por nombre…" />
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
            <ResultCount shown={filtered.length} total={plans.length} noun="planes" />
          </>
        }
      >
        <table className="w-full">
          <TableHead
            columns={cols.visibleColumns.map((c) => ({
              label: c.label,
              align: (ALIGN[c.key] === "text-right" ? "right" : "left") as "right" | "left",
            }))}
          />
          <tbody className="divide-y divide-outline-variant/50 text-body-sm text-on-surface">
            {loading ? (
              <TableSkeleton cols={cols.visibleColumns.length} rows={4} />
            ) : (
              filtered.map((plan) => (
                <tr key={plan.id} className="transition-colors hover:bg-surface-container-low">
                  {cols.visibleColumns.map((c, i) => {
                    const td = `px-4 ${cols.densityClass} ${ALIGN[c.key]} ${
                      cols.columnLines ? "border-r border-outline-variant/50" : ""
                    } ${i === 0 ? "sticky left-0 z-10 bg-surface-container-lowest" : ""} ${
                      c.key === "Acciones" ? "sticky right-0 z-10 bg-surface-container-lowest" : ""
                    }`;

                    switch (c.key) {
                      case "Plan":
                        return <td key={c.key} className={`${td} text-label-md text-on-surface`}>{plan.name}</td>;
                      case "Precio":
                        return (
                          <td key={c.key} className={`${td} text-label-md`}>
                            {formatCurrency(plan.unit_price, plan.currency)}
                          </td>
                        );
                      case "Estado":
                        return (
                          <td key={c.key} className={td}>
                            <StatusSwitch
                              active={plan.active}
                              busy={togglingId === plan.id}
                              onToggle={() => handleToggleStatus(plan)}
                            />
                          </td>
                        );
                      case "Acciones":
                        return (
                          <td key={c.key} className={td}>
                            <div className="flex items-center justify-end gap-1">
                              <RowAction
                                icon="edit"
                                title="Editar plan"
                                onClick={() => { setEditing(plan); setShowModal(true); }}
                              />
                              <RowAction
                                icon="delete"
                                title="Eliminar plan"
                                tone="danger"
                                onClick={() => handleDelete(plan)}
                              />
                            </div>
                          </td>
                        );
                      default:
                        return null;
                    }
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && !error && (
          <EmptyState
            icon="layers"
            title={
              search || statusFilter !== "all"
                ? "Sin resultados para este filtro"
                : "Aún no hay planes creados"
            }
            action={
              !search && statusFilter === "all" && (
                <button
                  onClick={openNew}
                  className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-label-md transition-colors"
                >
                  <Icon name="add" className="text-[18px]" />
                  Agregar primer plan
                </button>
              )
            }
          />
        )}
      </TableCard>

      <PlanModal open={showModal} onClose={() => setShowModal(false)} onSaved={load} plan={editing} />
    </div>
  );
}
