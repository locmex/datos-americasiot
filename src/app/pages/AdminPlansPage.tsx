import { useEffect, useState } from "react";
import {
  Plus, Trash2, Edit2, X, Loader2, CreditCard, Search, RefreshCw, AlertCircle,
  CheckCircle2, PauseCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/invoice-status";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
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

  useEffect(() => {
    if (open) {
      setForm(
        plan
          ? { name: plan.name, unit_price: String(plan.unit_price), currency: plan.currency }
          : emptyForm,
      );
    }
  }, [open, plan]);

  if (!open) return null;

  const isEditing = !!plan;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const unitPrice = Number(form.unit_price);
    if (!name) { toast.error("El nombre del plan es requerido"); return; }
    if (!isFinite(unitPrice) || unitPrice <= 0) { toast.error("El precio debe ser un número mayor a 0"); return; }

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">{isEditing ? "Editar Plan" : "Nuevo Plan"}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEditing ? `Modifica los datos de "${plan!.name}"` : "Agrega un plan de facturación"}
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
              placeholder="Plan único"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Precio *</label>
              <Input
                type="number" min="0" step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                placeholder="45.00"
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
          <p className="text-xs text-gray-400">El precio ya incluye IVA.</p>
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
              {saving ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Plan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
    if (!confirm(`¿Eliminar el plan "${plan.name}"?\n\nSi está referenciado por SIMs o facturas existentes, no podrá eliminarse — desactívalo en su lugar.`)) return;
    try {
      await api.deletePlan(plan.id);
      toast.success(`Plan "${plan.name}" eliminado`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtered = plans.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-teal-500" />
            Planes de Facturación
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {plans.length} plan{plans.length !== 1 ? "es" : ""} · {plans.filter((p) => p.active).length} activo{plans.filter((p) => p.active).length !== 1 ? "s" : ""}
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
            <span className="hidden sm:inline">Nuevo Plan</span>
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
          placeholder="Buscar por nombre..."
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
              {["Plan", "Precio", "Estado", "Acciones"].map((label) => (
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
              : filtered.map((plan) => {
                  const isActive = plan.active;
                  return (
                    <tr key={plan.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-800">{plan.name}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-700">{formatCurrency(plan.unit_price, plan.currency)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleStatus(plan)}
                          disabled={togglingId === plan.id}
                          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                          style={{ color: isActive ? "#16a34a" : "#94a3b8", background: isActive ? "rgba(22,163,74,0.10)" : "rgba(148,163,184,0.12)" }}
                        >
                          {togglingId === plan.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                          {isActive ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditing(plan); setShowModal(true); }}
                            className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(plan)}
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
            <CreditCard className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">{search ? "Sin resultados para tu búsqueda" : "Aún no hay planes creados"}</p>
            {!search && (
              <Button onClick={() => { setEditing(null); setShowModal(true); }} className="mt-4 gap-2 text-black" style={{ background: "#3ECF8E" }}>
                <Plus className="w-4 h-4" /> Agregar primer plan
              </Button>
            )}
          </div>
        )}
      </div>

      <PlanModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={load}
        plan={editing}
      />
    </div>
  );
}
