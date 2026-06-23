import { useEffect, useState, useCallback } from "react";
import {
  Plus, Search, Trash2, Edit2, X, Loader2, Users, Building, Phone,
  Mail, CreditCard, Link2, Unlink, CheckSquare, Square, ChevronRight,
  RefreshCw, UserCheck, SlidersHorizontal, Globe, KeyRound, Eye, EyeOff,
  CheckCircle2, Lock, Copy, ExternalLink, ShieldCheck, AlertTriangle,
  Check, ChevronLeft, ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Client {
  id: string; name: string; email: string;
  company?: string; phone?: string; notes?: string; createdAt: string;
  portalEnabled?: boolean;
}
interface ChipData {
  iccid: string; clientId: string; clientName: string;
}
interface SIM {
  iccid: string; iccid_with_luhn?: string;
  status?: { id: number; description: string };
  endpoint?: { name: string };
  localData?: { clientId?: string; clientName?: string } | null;
}

function displayIccid(iccid: string, withLuhn?: string) {
  return withLuhn || addLuhnDigit(iccid);
}

function addLuhnDigit(iccid: string): string {
  if (!iccid) return iccid;
  const s = iccid.trim().replace(/\D/g, "");
  if (s.length >= 20) return s;
  const reversed = s.split("").reverse().map(Number);
  const sum = reversed.reduce((acc, d, i) => {
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    return acc + d;
  }, 0);
  const check = (10 - (sum % 10)) % 10;
  return s + check;
}

const SIM_STATUS_COLOR: Record<number, string> = { 0: "#94a3b8", 1: "#16a34a", 2: "#d97706", 3: "#dc2626" };
const SIM_STATUS_LABEL: Record<number, string> = { 0: "Emitida", 1: "Activa", 2: "Suspendida", 3: "Desactivada" };

// ─── Step 1: Client Info ──────────────────────────────────────────────────────
function StepClientInfo({ form, setForm, errors }: {
  form: { name: string; email: string; company: string; phone: string; notes: string };
  setForm: (f: any) => void;
  errors: Record<string, string>;
}) {
  const field = (
    key: keyof typeof form,
    label: string,
    type = "text",
    placeholder = "",
    required = false,
  ) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 transition-all ${
          errors[key]
            ? "border-red-300 focus:ring-red-100 bg-red-50"
            : "border-gray-200 focus:ring-emerald-100 focus:border-emerald-400 bg-gray-50"
        }`}
      />
      {errors[key] && <p className="text-xs text-red-500 flex items-center gap-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="space-y-4 py-2">
      {field("name", "Nombre completo", "text", "Juan Pérez", true)}
      {field("email", "Correo electrónico", "email", "juan@empresa.com", true)}
      <div className="grid grid-cols-2 gap-3">
        {field("company", "Empresa", "text", "Empresa S.A.")}
        {field("phone", "Teléfono", "tel", "+52 55 0000 0000")}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Notas</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))}
          placeholder="Notas adicionales..."
          className="w-full h-20 px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 resize-none bg-gray-50"
        />
      </div>
    </div>
  );
}

// ─── Shared paginated SIM list ────────────────────────────────────────────────
const SIM_PAGE_SIZE = 10;

function SimPagedList({
  selected, setSelected, headerSlot,
}: {
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  headerSlot?: React.ReactNode;
}) {
  const [allUnassigned, setAllUnassigned] = useState<SIM[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch a large batch; filter unassigned client-side.
    api.getSims(0, 500, "").then((res) => {
      if (cancelled) return;
      const items: SIM[] = res.items || [];
      setAllUnassigned(items.filter((s) => !s.localData?.clientId));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = allUnassigned.filter((s) => {
    if (!search.trim()) return true;
    const id = displayIccid(s.iccid, s.iccid_with_luhn);
    const q = search.toLowerCase();
    return id.toLowerCase().includes(q) || (s.endpoint?.name || "").toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / SIM_PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageSims = filtered.slice(safePage * SIM_PAGE_SIZE, (safePage + 1) * SIM_PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * SIM_PAGE_SIZE + 1;
  const to = Math.min((safePage + 1) * SIM_PAGE_SIZE, filtered.length);

  useEffect(() => { setPage(0); }, [search]);

  const allPageSelected = pageSims.length > 0 && pageSims.every((s) => selected.has(s.iccid));

  const toggleOne = (iccid: string) => {
    const n = new Set(selected);
    n.has(iccid) ? n.delete(iccid) : n.add(iccid);
    setSelected(n);
  };

  const togglePage = () => {
    const n = new Set(selected);
    if (allPageSelected) pageSims.forEach((s) => n.delete(s.iccid));
    else pageSims.forEach((s) => n.add(s.iccid));
    setSelected(n);
  };

  // Visible page buttons (max 5 + ellipsis)
  const visiblePages = (): (number | "…")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: (number | "…")[] = [0];
    if (safePage > 2) pages.push("…");
    for (let i = Math.max(1, safePage - 1); i <= Math.min(totalPages - 2, safePage + 1); i++) pages.push(i);
    if (safePage < totalPages - 3) pages.push("…");
    pages.push(totalPages - 1);
    return pages;
  };

  return (
    <div className="flex flex-col gap-3">
      {headerSlot}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ICCID o dispositivo…"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-gray-50"
        />
      </div>

      {/* Select-page row */}
      {!loading && pageSims.length > 0 && (
        <div className="flex items-center justify-between">
          <button onClick={togglePage} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">
            {allPageSelected
              ? <CheckSquare className="w-4 h-4" style={{ color: "#3ECF8E" }} />
              : <Square className="w-4 h-4 text-gray-300" />}
            {allPageSelected ? "Deseleccionar página" : "Seleccionar página"}
          </button>
          {selected.size > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(62,207,142,0.15)", color: "#059669" }}>
              {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* SIM rows */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: SIM_PAGE_SIZE }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : pageSims.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <CreditCard className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-sm font-medium text-gray-400">
              {allUnassigned.length === 0 ? "No hay SIMs sin asignar disponibles" : "Sin resultados para tu búsqueda"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pageSims.map((sim) => {
              const iccid = displayIccid(sim.iccid, sim.iccid_with_luhn);
              const sid = sim.status?.id ?? 0;
              const isSelected = selected.has(sim.iccid);
              return (
                <button
                  key={sim.iccid}
                  onClick={() => toggleOne(sim.iccid)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all hover:bg-gray-50"
                  style={{ background: isSelected ? "rgba(62,207,142,0.05)" : undefined }}
                >
                  <div className="shrink-0">
                    {isSelected
                      ? <CheckSquare className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                      : <Square className="w-4 h-4 text-gray-200" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-xs font-mono text-gray-800 block truncate">{iccid}</code>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: SIM_STATUS_COLOR[sid] }}>
                      {SIM_STATUS_LABEL[sid]}{sim.endpoint?.name ? ` · ${sim.endpoint.name}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {from}–{to} de {filtered.length} SIMs
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {visiblePages().map((pg, i) =>
              pg === "…" ? (
                <span key={`ell-${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-gray-400">…</span>
              ) : (
                <button
                  key={pg}
                  onClick={() => setPage(pg as number)}
                  className="w-7 h-7 rounded-lg text-xs font-semibold transition-colors"
                  style={
                    pg === safePage
                      ? { background: "#3ECF8E", color: "#fff" }
                      : { color: "#6b7280" }
                  }
                >
                  {(pg as number) + 1}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: SIM Assignment ───────────────────────────────────────────────────
function StepSims({ selected, setSelected }: {
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  return (
    <div className="py-2">
      <SimPagedList
        selected={selected}
        setSelected={setSelected}
      />
    </div>
  );
}

/// ─── Step 3: Portal Access ───────────────────────────────────────────────────
function StepPortal({ password, setPassword, confirmPw, setConfirmPw }: {
  password: string; setPassword: (v: string) => void;
  confirmPw: string; setConfirmPw: (v: string) => void;
}) {
  const [showPw, setShowPw] = useState(false);

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const strengthColors = ["", "#ef4444", "#f59e0b", "#10b981"];
  const strengthLabels = ["", "Débil", "Regular", "Segura"];
  const match = password.length > 0 && confirmPw.length > 0 && password === confirmPw;
  const mismatch = confirmPw.length > 0 && password !== confirmPw;

  return (
    <div className="space-y-4 py-2">
      {/* Password fields */}
      {[
        { label: "Contraseña", val: password, set: setPassword, placeholder: "Mínimo 6 caracteres" },
        { label: "Confirmar contraseña", val: confirmPw, set: setConfirmPw, placeholder: "Repite la contraseña" },
      ].map(({ label, val, set, placeholder }) => (
        <div key={label} className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type={showPw ? "text" : "password"}
              value={val}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-gray-50"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      ))}

      {/* Strength + match indicator */}
      {password.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((lvl) => (
              <div
                key={lvl}
                className="flex-1 h-1 rounded-full transition-all"
                style={{ background: strength >= lvl ? strengthColors[strength] : "#e5e7eb" }}
              />
            ))}
          </div>
          <p className="text-xs" style={{ color: strengthColors[strength] }}>
            Seguridad: {strengthLabels[strength]}
          </p>
        </div>
      )}
      {match && (
        <p className="text-xs text-emerald-600 flex items-center gap-1">
          <Check className="w-3 h-3" /> Las contraseñas coinciden
        </p>
      )}
      {mismatch && (
        <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
      )}
    </div>
  );
}

// ─── Create Client Stepper ────────────────────────────────────────────────────
function CreateClientStepper({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", notes: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedSims, setSelectedSims] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setForm({ name: "", email: "", company: "", phone: "", notes: "" });
      setFormErrors({});
      setSelectedSims(new Set());
      setPassword("");
      setConfirmPw("");
    }
  }, [open]);

  const STEPS = [
    { label: "Cliente", icon: Users },
    { label: "SIMs", icon: CreditCard },
    { label: "Portal", icon: Globe },
  ];

  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "El nombre es requerido";
    if (!form.email.trim()) errors.email = "El email es requerido";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Email inválido";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep1()) return;
    setStep((s) => s + 1);
  };

  const handleCreate = async () => {
    if (!password || password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    if (password !== confirmPw) { toast.error("Las contraseñas no coinciden"); return; }
    setSaving(true);
    try {
      const res = await api.createClient(form);
      const newClient = res.client || res;
      const clientId = newClient.id;
      const clientName = form.name.trim();

      if (selectedSims.size > 0 && clientId) {
        await api.bulkAssign(Array.from(selectedSims), clientId, clientName);
      }

      if (clientId) {
        await api.setPortalPassword(clientId, password);
      }

      toast.success(`✓ Cliente ${clientName} creado correctamente`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const isLastStep = step === STEPS.length - 1;
  const canGoNext = step < STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "calc(100dvh - 16px)", minHeight: "min(640px, 90dvh)" }}
      >
        {/* ── Header ── */}
        <div className="shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-gray-900 text-lg leading-tight">Nuevo Cliente</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Paso {step + 1} de {STEPS.length} — {STEPS[step].label}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                      style={{
                        background: done || active ? "#3ECF8E" : "#f3f4f6",
                        color: done || active ? "#fff" : "#9ca3af",
                        boxShadow: active ? "0 0 0 4px rgba(62,207,142,0.18)" : "none",
                      }}
                    >
                      {done ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                    </div>
                    <span
                      className="text-[10px] mt-1 font-semibold"
                      style={{ color: done || active ? "#059669" : "#9ca3af" }}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className="flex-1 h-0.5 mx-2 mb-4 rounded-full transition-all"
                      style={{ background: i < step ? "#3ECF8E" : "#e5e7eb" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6">
          {step === 0 && (
            <StepClientInfo form={form} setForm={setForm} errors={formErrors} />
          )}
          {step === 1 && (
            <StepSims selected={selectedSims} setSelected={setSelectedSims} />
          )}
          {step === 2 && (
            <StepPortal
              password={password}
              setPassword={setPassword}
              confirmPw={confirmPw}
              setConfirmPw={setConfirmPw}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {step > 0 && <ChevronLeft className="w-4 h-4" />}
              {step === 0 ? "Cancelar" : "Atrás"}
            </button>

            <div className="flex-1 flex gap-2">
              {/* Skip button for optional steps */}
              {step > 0 && !isLastStep && (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 transition-colors"
                >
                  Omitir
                </button>
              )}
              {isLastStep ? (
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-black transition-all disabled:opacity-60"
                  style={{ background: "#3ECF8E" }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Creando..." : "Crear Cliente"}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-black transition-all"
                  style={{ background: "#3ECF8E" }}
                >
                  Siguiente
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Edit Client Modal (simple form) ─────────────────────────────────────────
function EditClientModal({ open, onClose, onSaved, client }: {
  open: boolean; onClose: () => void; onSaved: () => void; client: Client;
}) {
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", notes: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name,
        email: client.email,
        company: client.company || "",
        phone: client.phone || "",
        notes: client.notes || "",
      });
    }
  }, [client, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) { toast.error("Nombre y email son requeridos"); return; }
    setLoading(true);
    try {
      await api.updateClient(client.id, form);
      toast.success("Cliente actualizado");
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Editar Cliente</h3>
            <p className="text-xs text-gray-400 mt-0.5">Modifica los datos del cliente</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {[
            { key: "name", label: "Nombre completo *", type: "text", ph: "Juan Pérez" },
            { key: "email", label: "Email *", type: "email", ph: "juan@empresa.com" },
            { key: "company", label: "Empresa", type: "text", ph: "Empresa S.A." },
            { key: "phone", label: "Teléfono", type: "tel", ph: "+52 55 0000 0000" },
          ].map(({ key, label, type, ph }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <input
                type={type}
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={ph}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-gray-50"
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notas adicionales..."
              className="w-full h-20 px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 resize-none bg-gray-50"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-black transition-all disabled:opacity-60"
              style={{ background: "#3ECF8E" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SIM Picker Modal ─────────────────────────────────────────────────────────
function SimPickerModal({ client, onClose, onAssigned }: {
  client: Client; onClose: () => void; onAssigned: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const handleAssign = async () => {
    if (selected.size === 0) { toast.error("Selecciona al menos una SIM"); return; }
    setSaving(true);
    try {
      const res = await api.bulkAssign(Array.from(selected), client.id, client.name);
      toast.success(`✓ ${res.assigned} SIM${res.assigned !== 1 ? "s" : ""} asignada${res.assigned !== 1 ? "s" : ""} a ${client.name}`);
      onAssigned();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(62,207,142,0.12)" }}>
              <Link2 className="w-5 h-5" style={{ color: "#3ECF8E" }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Asignar SIMs</h3>
              <p className="text-xs text-gray-400 mt-0.5">a <span className="font-semibold text-gray-600">{client.name}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable SIM list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <SimPagedList selected={selected} setSelected={setSelected} />
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleAssign}
            disabled={selected.size === 0 || saving}
            className="flex-1 font-semibold text-black"
            style={{ background: "#3ECF8E" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
            {saving ? "Asignando…" : `Asignar ${selected.size > 0 ? selected.size : ""} SIM${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Chips Drawer ─────────────────────────────────────────────────────────────
function ChipsDrawer({ client, chips, onClose, onRefresh }: {
  client: Client; chips: ChipData[]; onClose: () => void; onRefresh: () => void;
}) {
  const [removingIccid, setRemovingIccid] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [searchChip, setSearchChip] = useState("");

  const clientChips = chips.filter((c) => c.clientId === client.id);
  const filtered = clientChips.filter((c) => {
    if (!searchChip) return true;
    const full = addLuhnDigit(c.iccid);
    return full.includes(searchChip) || c.iccid.includes(searchChip);
  });

  const handleRemove = async (iccid: string) => {
    if (!confirm(`¿Quitar este chip del cliente ${client.name}?`)) return;
    setRemovingIccid(iccid);
    try {
      await api.unassignChip(iccid);
      toast.success("Chip desasignado");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setRemovingIccid(null); }
  };

  const handleRemoveAll = async () => {
    if (!confirm(`¿Quitar TODOS los ${clientChips.length} chips de ${client.name}?`)) return;
    try {
      const res = await api.bulkUnassign(clientChips.map((c) => c.iccid));
      toast.success(`✓ ${res.unassigned} chips desasignados`);
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0" style={{ background: "rgba(62,207,142,0.15)", color: "#059669" }}>
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{client.name}</h3>
            {client.company && <p className="text-xs text-gray-400 truncate">{client.company}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 shrink-0">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 shrink-0 space-y-1">
          <p className="flex items-center gap-2 text-xs text-gray-500"><Mail className="w-3.5 h-3.5 text-gray-400" />{client.email}</p>
          {client.phone && <p className="flex items-center gap-2 text-xs text-gray-500"><Phone className="w-3.5 h-3.5 text-gray-400" />{client.phone}</p>}
        </div>
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-400" />
              {clientChips.length} SIM{clientChips.length !== 1 ? "s" : ""} asignada{clientChips.length !== 1 ? "s" : ""}
            </p>
            {clientChips.length > 1 && (
              <button onClick={handleRemoveAll} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors">
                <Unlink className="w-3 h-3" />Quitar todas
              </button>
            )}
          </div>
          {clientChips.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input value={searchChip} onChange={(e) => setSearchChip(e.target.value)} placeholder="Filtrar chips…" className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-emerald-400" />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400 font-medium">
                {clientChips.length === 0 ? "Sin SIMs asignadas" : "Sin resultados"}
              </p>
              {clientChips.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Usa el botón de abajo para asignar SIMs</p>
              )}
            </div>
          ) : (
            filtered.map((chip) => (
              <div key={chip.iccid}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60 group hover:border-gray-200 transition-colors">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(62,207,142,0.1)" }}>
                  <CreditCard className="w-3.5 h-3.5" style={{ color: "#3ECF8E" }} />
                </div>
                <code className="flex-1 text-xs font-mono text-gray-700 truncate min-w-0">
                  {addLuhnDigit(chip.iccid)}
                </code>
                <button
                  onClick={() => handleRemove(chip.iccid)}
                  disabled={removingIccid === chip.iccid}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50"
                  title="Quitar chip"
                >
                  {removingIccid === chip.iccid
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                    : <X className="w-3.5 h-3.5 text-red-400" />}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
          <Button onClick={() => setShowPicker(true)} className="w-full font-semibold text-black gap-2" style={{ background: "#3ECF8E" }}>
            <Plus className="w-4 h-4" />Asignar más SIMs
          </Button>
          <Button variant="outline" onClick={onClose} className="w-full">Cerrar</Button>
        </div>
      </div>
      {showPicker && (
        <SimPickerModal
          client={client}
          onClose={() => setShowPicker(false)}
          onAssigned={() => { setShowPicker(false); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Portal Password Modal ────────────────────────────────────────────────────
function PortalPasswordModal({ client, onClose, onSaved }: {
  client: Client; onClose: () => void; onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [portalStatus, setPortalStatus] = useState<{
    portalEnabled: boolean;
    hasPassword: boolean;
    updatedAt: string | null;
    keyFound: "portal-auth:clientId" | "client-auth:email" | "none";
    email?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const getPortalOrigin = (): string => {
    try { return window.top?.location?.origin || window.location.origin; }
    catch { return window.location.origin; }
  };
  const portalUrl = `${getPortalOrigin()}/#/`;

  useEffect(() => {
    setChecking(true);
    api.get(`/clients/${client.id}/portal-status`)
      .then((res: any) => setPortalStatus(res))
      .catch(() => setPortalStatus(null))
      .finally(() => setChecking(false));
  }, [client.id]);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(portalUrl).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(portalUrl));
    } catch { fallbackCopy(portalUrl); }
  };

  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
    document.body.appendChild(el); el.focus(); el.select();
    try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
    document.body.removeChild(el);
  };

  const handleSave = async () => {
    if (password.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    if (password !== confirm) { toast.error("Las contraseñas no coinciden"); return; }
    setLoading(true);
    try {
      await api.setPortalPassword(client.id, password);
      toast.success(`✓ Acceso portal configurado para ${client.name}`);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(62,207,142,0.12)" }}>
              <KeyRound className="w-5 h-5" style={{ color: "#3ECF8E" }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{client.portalEnabled ? "Cambiar contraseña" : "Habilitar Portal"}</h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{client.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Verificando estado del portal...</span>
            </div>
          ) : portalStatus ? (
            <>
              <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{
                background: portalStatus.portalEnabled && portalStatus.keyFound !== "none" ? "rgba(62,207,142,0.07)" : "rgba(245,158,11,0.07)",
                border: `1px solid ${portalStatus.portalEnabled && portalStatus.keyFound !== "none" ? "rgba(62,207,142,0.2)" : "rgba(245,158,11,0.2)"}`,
              }}>
                {portalStatus.portalEnabled && portalStatus.keyFound !== "none"
                  ? <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#059669" }} />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#d97706" }} />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ color: portalStatus.portalEnabled && portalStatus.keyFound !== "none" ? "#059669" : "#92400e" }}>
                    {portalStatus.portalEnabled && portalStatus.keyFound !== "none"
                      ? "Acceso configurado correctamente"
                      : portalStatus.keyFound === "none"
                        ? "⚠️ Registro de acceso no encontrado — re-aplica la contraseña"
                        : "Portal no configurado aún"}
                  </p>
                  <p className="text-gray-500 mt-0.5">
                    {portalStatus.portalEnabled && portalStatus.keyFound !== "none"
                      ? `Contraseña guardada · actualizado ${portalStatus.updatedAt ? new Date(portalStatus.updatedAt).toLocaleDateString("es-MX") : "—"}`
                      : portalStatus.keyFound === "none"
                        ? "El cliente no podrá iniciar sesión. Establece la contraseña de nuevo."
                        : "Configura una contraseña para que el cliente pueda acceder."}
                  </p>
                </div>
              </div>
              {portalStatus.keyFound === "none" && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs bg-red-50 border border-red-100">
                  <span className="font-mono text-red-600 break-all">
                    Email en sistema: <strong>{portalStatus.email ?? client.email}</strong><br />
                    Registro auth: <strong>no encontrado en KV</strong>
                  </span>
                </div>
              )}
            </>
          ) : null}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL de acceso del cliente</label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50">
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="flex-1 text-xs font-mono text-gray-700 truncate">{portalUrl}</span>
              <button onClick={handleCopy} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors" style={{ background: copied ? "rgba(62,207,142,0.15)" : "#f3f4f6", color: copied ? "#059669" : "#6b7280" }}>
                {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-gray-400 px-1">
              Comparte esta URL con el cliente. Usará su email <strong className="text-gray-600">{client.email}</strong> y la contraseña que configures abajo.
            </p>
          </div>
          {[
            { label: "Nueva contraseña", val: password, set: setPassword },
            { label: "Confirmar contraseña", val: confirm, set: setConfirm },
          ].map(({ label, val, set }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type={showPw ? "text" : "password"} value={val} onChange={(e) => set(e.target.value)} placeholder="••••••••" className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-emerald-400" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={loading || !password || !confirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: "#3ECF8E", color: "#000" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {loading ? "Guardando..." : client.portalEnabled ? "Actualizar" : "Habilitar acceso"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [chips, setChips] = useState<ChipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [portalClient, setPortalClient] = useState<Client | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ch] = await Promise.allSettled([api.getClients(), api.getChips()]);
      if (c.status === "fulfilled") setClients(c.value.clients || []);
      if (ch.status === "fulfilled") setChips(ch.value.chips || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (client: Client) => {
    if (!confirm(`¿Eliminar cliente "${client.name}"?\n\nSe desvincularán automáticamente todos los SIMs asignados a este cliente.`)) return;
    try {
      const res = await api.deleteClient(client.id);
      const unlinked = (res as any).chipsUnlinked ?? 0;
      toast.success(
        unlinked > 0
          ? `Cliente ${client.name} eliminado · ${unlinked} SIM${unlinked > 1 ? "s" : ""} desvinculado${unlinked > 1 ? "s" : ""}`
          : `Cliente ${client.name} eliminado`
      );
      if (activeClient?.id === client.id) setActiveClient(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const getChipCount = (clientId: string) => chips.filter((c) => c.clientId === clientId).length;
  const getClientChips = (clientId: string) => chips.filter((c) => c.clientId === clientId);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(search.toLowerCase())
  );

  const portalEnabled = clients.filter((c: any) => c.portalEnabled).length;

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-500" />
            Gestión de Clientes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: "#3ECF8E" }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Cliente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o empresa..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Total Clientes",  value: clients.length,                                         color: "#3ECF8E", icon: Users },
          { label: "Chips Asignados", value: chips.filter((c) => c.clientId).length,                 color: "#60a5fa", icon: CreditCard },
          { label: "Sin Chips",       value: clients.filter((c) => getChipCount(c.id) === 0).length, color: "#f59e0b", icon: Users },
          { label: "Portal Activo",   value: portalEnabled,                                           color: "#a855f7", icon: Globe },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100 flex items-center gap-2 md:gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-lg md:text-xl font-bold text-gray-900 leading-tight">{loading ? "—" : value}</p>
              <p className="text-[10px] md:text-xs text-gray-500 truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-3">
              <Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 shadow-sm border border-gray-100 text-center">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="font-medium text-gray-500">{search ? "No se encontraron clientes" : "Aún no hay clientes registrados"}</p>
          {!search && (
            <Button onClick={() => setShowCreate(true)} className="mt-4 gap-2 text-black" style={{ background: "#3ECF8E" }}>
              <Plus className="w-4 h-4" /> Agregar primer cliente
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => {
            const clientChips = getClientChips(client.id);
            const chipCount = clientChips.length;
            const isActive = activeClient?.id === client.id;
            const hasPortal = (client as any).portalEnabled;

            return (
              <div key={client.id}
                className="bg-white rounded-2xl shadow-sm border flex flex-col transition-all hover:shadow-md"
                style={{ borderColor: isActive ? "rgba(62,207,142,0.4)" : "#f1f5f9" }}>

                {/* Card header */}
                <div className="flex items-start justify-between p-5 pb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "rgba(62,207,142,0.15)", color: "#059669" }}>
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{client.name}</p>
                      {client.company && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                          <Building className="w-3 h-3 shrink-0" />{client.company}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditing(client)} className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(client)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Contact */}
                <div className="px-5 pb-3 space-y-1">
                  <p className="flex items-center gap-2 text-xs text-gray-500 truncate">
                    <Mail className="w-3.5 h-3.5 text-gray-300 shrink-0" />{client.email}
                  </p>
                  {client.phone && (
                    <p className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone className="w-3.5 h-3.5 text-gray-300 shrink-0" />{client.phone}
                    </p>
                  )}
                </div>

                {/* Portal access badge */}
                <div className="px-5 pb-3">
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all hover:opacity-80"
                    style={{
                      background: hasPortal ? "rgba(62,207,142,0.06)" : "#f9fafb",
                      borderColor: hasPortal ? "rgba(62,207,142,0.3)" : "#e5e7eb",
                    }}
                    onClick={() => setPortalClient(client)}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5" style={{ color: hasPortal ? "#059669" : "#9ca3af" }} />
                      <span className="text-xs font-medium" style={{ color: hasPortal ? "#059669" : "#9ca3af" }}>
                        {hasPortal ? "Portal activo" : "Sin acceso al portal"}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPortalClient(client); }}
                      className="text-xs font-semibold flex items-center gap-1 transition-colors"
                      style={{ color: hasPortal ? "#6366f1" : "#3ECF8E" }}
                    >
                      <KeyRound className="w-3 h-3" />
                      {hasPortal ? "Cambiar clave" : "Habilitar"}
                    </button>
                  </div>
                </div>

                {/* Chips section */}
                <button
                  onClick={() => setActiveClient(isActive ? null : client)}
                  className="mx-4 mb-4 p-3 rounded-xl border transition-all text-left group"
                  style={{
                    borderColor: isActive ? "rgba(62,207,142,0.35)" : "#e5e7eb",
                    background: isActive ? "rgba(62,207,142,0.05)" : "#f9fafb",
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: chipCount > 0 ? "#059669" : "#9ca3af" }}>
                      <CreditCard className="w-3.5 h-3.5" />
                      {chipCount === 0 ? "Sin SIMs asignadas" : `${chipCount} SIM${chipCount !== 1 ? "s" : ""} asignada${chipCount !== 1 ? "s" : ""}`}
                    </span>
                    <span className="text-xs font-medium flex items-center gap-1 transition-colors" style={{ color: isActive ? "#059669" : "#6b7280" }}>
                      <SlidersHorizontal className="w-3 h-3" />
                      Gestionar
                      <ChevronRight className={`w-3 h-3 transition-transform ${isActive ? "rotate-90" : ""}`} />
                    </span>
                  </div>
                  {chipCount > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {clientChips.slice(0, 3).map((chip) => (
                        <code key={chip.iccid} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(62,207,142,0.12)", color: "#059669" }}>
                          …{chip.iccid.slice(-8)}
                        </code>
                      ))}
                      {chipCount > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">+{chipCount - 3} más</span>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Chips Drawer */}
      {activeClient && (
        <ChipsDrawer client={activeClient} chips={chips} onClose={() => setActiveClient(null)} onRefresh={load} />
      )}

      {/* Portal password modal */}
      {portalClient && (
        <PortalPasswordModal client={portalClient} onClose={() => setPortalClient(null)} onSaved={load} />
      )}

      {/* Create stepper */}
      <CreateClientStepper
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />

      {/* Edit modal */}
      {editing && (
        <EditClientModal
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          client={editing}
        />
      )}
    </div>
  );
}
