import React, { useState, useEffect, useMemo } from "react";
import {
  X, Cpu, ChevronDown, Plus, Tag, Lock, AlertCircle,
  CheckCircle2, RefreshCw, Info, Shield, Power, CreditCard,
  Search, Loader2,
} from "lucide-react";
import { api } from "../lib/api";

interface Profile { id: number; name: string; description?: string }

interface Props {
  onClose: () => void;
  onCreated: (device: any) => void;
}

// ── Small field wrapper ──────────────────────────────────────────
function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-400">*</span>}
        {hint && (
          <span
            className="inline-flex items-center cursor-help text-gray-400 hover:text-gray-600"
            title={hint}
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Custom select ──────────────────────────────────────────────
function SelectField({
  value, onChange, options, placeholder, loading, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Profile[];
  placeholder: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || loading || options.length === 0}
        className="w-full appearance-none text-sm border border-gray-200 rounded-xl px-4 py-2.5 pr-10 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
      >
        <option value="">
          {loading ? "Cargando..." : options.length === 0 ? "Sin opciones" : placeholder}
        </option>
        {options.map(o => (
          <option key={o.id} value={String(o.id)}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ── SIM Status helpers ────────────────────────────────────────────
const SIM_STATUS_OPTS = [
  { id: "all", label: "Todos",      color: "#6b7280" },
  { id: "1",   label: "Activa",     color: "#16a34a" },
  { id: "2",   label: "Suspendida", color: "#d97706" },
  { id: "0",   label: "Emitida",    color: "#6366f1" },
] as const;

function getSimStatus(s: any): { label: string; color: string } {
  const id = s?.status?.id ?? 0;
  if (id === 1) return { label: "Activa",     color: "#16a34a" };
  if (id === 2) return { label: "Suspendida", color: "#d97706" };
  return              { label: "Emitida",     color: "#6366f1" };
}

// ── Inline SIM Picker ─────────────────────────────────────────────
function SimPicker({
  selectedIccid,
  onSelect,
}: {
  selectedIccid: string;
  onSelect: (iccid: string, sim: any) => void;
}) {
  const [sims, setSims]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [statusF, setStatusF] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const res: any = await api.getSims(0, 200, "");
        const all: any[] = res.items ?? (Array.isArray(res) ? res : []);
        setSims(all.filter((s: any) => !s.endpoint?.id));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sims.filter(s => {
      const matchQ  = !q ||
        (s.iccid || "").toLowerCase().includes(q) ||
        (s.iccid_with_luhn || "").toLowerCase().includes(q) ||
        (s.msisdn || "").toLowerCase().includes(q);
      const matchSt = statusF === "all" || String(s.status?.id ?? 0) === statusF;
      return matchQ && matchSt;
    });
  }, [search, statusF, sims]);

  const counts = useMemo(() => ({
    all: sims.length,
    "1": sims.filter(s => (s.status?.id ?? 0) === 1).length,
    "2": sims.filter(s => (s.status?.id ?? 0) === 2).length,
    "0": sims.filter(s => (s.status?.id ?? 0) === 0).length,
  }), [sims]);

  const selectedSim = sims.find(s => (s.iccid_with_luhn || s.iccid) === selectedIccid);

  return (
    <div
      className="rounded-2xl border overflow-hidden mt-1"
      style={{ borderColor: "#e0e7ff", background: "linear-gradient(180deg,#f5f3ff 0%,#fff 40%)" }}
    >
      {/* Picker header: search + pills */}
      <div className="px-4 pt-3.5 pb-3 border-b border-indigo-100/60 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-300 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ICCID o MSISDN…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-indigo-100 rounded-xl bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {SIM_STATUS_OPTS.map(opt => {
            const cnt    = counts[opt.id as keyof typeof counts] ?? 0;
            const active = statusF === opt.id;
            return (
              <button key={opt.id} type="button" onClick={() => setStatusF(opt.id)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all"
                style={{
                  borderColor: active ? opt.color : "#e5e7eb",
                  background:  active ? `${opt.color}18` : "white",
                  color:       active ? opt.color : "#9ca3af",
                }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: active ? opt.color : "#d1d5db" }} />
                {opt.label}
                <span className="font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center"
                  style={{ background: active ? `${opt.color}25` : "#f3f4f6", color: active ? opt.color : "#9ca3af", fontSize: 9 }}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SIM list */}
      <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-indigo-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Cargando SIMs disponibles…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <AlertCircle className="w-7 h-7 text-red-300" />
            <p className="text-xs text-red-500">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-xs font-semibold text-gray-500">
              {search || statusF !== "all" ? "Ninguna SIM coincide" : "Sin SIMs disponibles"}
            </p>
            <p className="text-[10px] text-gray-400">
              {search || statusF !== "all" ? "Prueba con otros filtros" : "Todas las SIMs ya están asignadas"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100/80">
            {filtered.map(sim => {
              const iccid      = sim.iccid_with_luhn || sim.iccid || "";
              const isSelected = selectedIccid === iccid;
              const st         = getSimStatus(sim);
              return (
                <button
                  key={sim.id}
                  type="button"
                  onClick={() => onSelect(isSelected ? "" : iccid, isSelected ? null : sim)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-indigo-50/40"
                  style={{ background: isSelected ? "rgba(99,102,241,0.07)" : undefined }}
                >
                  {/* Radio */}
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                    style={{ borderColor: isSelected ? "#6366f1" : "#d1d5db", background: isSelected ? "#6366f1" : "white" }}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  {/* Icon */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: isSelected ? `${st.color}15` : "#f3f4f6" }}>
                    <CreditCard className="w-4 h-4" style={{ color: isSelected ? st.color : "#9ca3af" }} />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-semibold text-gray-700 truncate">
                      {iccid ? `…${iccid.slice(-12)}` : `SIM #${sim.id}`}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {sim.msisdn || "Sin MSISDN"}
                    </p>
                  </div>
                  {/* Status */}
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${st.color}18`, color: st.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && (
        <div className="px-4 py-2 border-t border-indigo-50 bg-white/60 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            {filtered.length} SIM{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}
          </p>
          {selectedSim && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] font-semibold text-indigo-600">SIM seleccionada</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────
export function AddDeviceModal({ onClose, onCreated }: Props) {
  // Form fields
  const [name, setName]                       = useState("");
  const [serviceProfileId, setServiceProfileId] = useState("");
  const [tariffProfileId, setTariffProfileId]   = useState("");
  const [imeiLock, setImeiLock]               = useState(false);
  const [imei, setImei]                       = useState("");
  const [tagInput, setTagInput]               = useState("");
  const [tags, setTags]                       = useState<string[]>([]);
  const [initialStatus, setInitialStatus]     = useState<0 | 1>(0); // 0=Disabled, 1=Enabled
  const [assignSim, setAssignSim]             = useState(false);
  const [simIccid, setSimIccid]               = useState("");

  // Profile data
  const [serviceProfiles, setServiceProfiles] = useState<Profile[]>([]);
  const [tariffProfiles, setTariffProfiles]   = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError]     = useState<string | null>(null);

  // Submission
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [success, setSuccess]                 = useState(false);

  // Load profiles on mount
  useEffect(() => {
    const load = async () => {
      setProfilesLoading(true);
      setProfilesError(null);
      try {
        const [sp, tp] = await Promise.all([
          api.getServiceProfiles() as Promise<Profile[]>,
          api.getTariffProfiles() as Promise<Profile[]>,
        ]);
        setServiceProfiles(Array.isArray(sp) ? sp : []);
        setTariffProfiles(Array.isArray(tp) ? tp : []);
        // Pre-select first option if only one exists
        if (Array.isArray(sp) && sp.length === 1) setServiceProfileId(String(sp[0].id));
        if (Array.isArray(tp) && tp.length === 1) setTariffProfileId(String(tp[0].id));
      } catch (e: any) {
        setProfilesError(e.message);
      } finally {
        setProfilesLoading(false);
      }
    };
    load();
  }, []);

  // Tags helpers
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
  };

  // Validation
  const nameOk    = name.trim().length >= 2;
  const imeiOk    = !imeiLock || (imei.replace(/\D/g, "").length >= 14);
  const canSubmit = nameOk && !!serviceProfileId && !!tariffProfileId && imeiOk && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        name:               name.trim(),
        service_profile_id: Number(serviceProfileId),
        tariff_profile_id:  Number(tariffProfileId),
        initial_status:     initialStatus,
      };
      if (imeiLock)                    payload.imei_lock  = true;
      if (imeiLock && imei)            payload.imei       = imei.trim();
      if (tags.length > 0)             payload.tags       = tags;
      if (assignSim && simIccid.trim()) payload.sim_iccid = simIccid.trim();

      const created = await api.createEndpoint(payload);
      setSuccess(true);
      setTimeout(() => {
        onCreated(created);
        onClose();
      }, 1200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full overflow-hidden"
        style={{ maxWidth: 560, maxHeight: "92vh" }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ background: "linear-gradient(135deg, #0f766e, #0ea5e9)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Añadir dispositivo</h2>
              <p className="text-xs text-white/70">Crear nuevo endpoint en emnify</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/15 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Success overlay ── */}
        {success && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(62,207,142,0.12)" }}
            >
              <CheckCircle2 className="w-9 h-9 text-teal-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-800">¡Dispositivo creado!</p>
              <p className="text-sm text-gray-500 mt-1">
                <strong>{name}</strong> fue registrado en emnify correctamente.
              </p>
            </div>
          </div>
        )}

        {/* ── Form ── */}
        {!success && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Profile loading error */}
            {profilesError && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>No se pudieron cargar los perfiles: {profilesError}. Puedes introducirlos manualmente.</span>
              </div>
            )}

            {/* ── Device Name ── */}
            <Field
              label="Nombre del dispositivo"
              required
              hint="Nombre descriptivo para identificar el dispositivo en el portal"
            >
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Tracker Flotilla MX-001"
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300 transition-colors"
                autoFocus
              />
              {name.trim().length > 0 && name.trim().length < 2 && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Mínimo 2 caracteres
                </p>
              )}
            </Field>

            {/* ── Profiles ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Perfil de servicio"
                required
                hint="Controla qué servicios tiene activados: datos, SMS MT, SMS MO"
              >
                <SelectField
                  value={serviceProfileId}
                  onChange={setServiceProfileId}
                  options={serviceProfiles}
                  placeholder="Seleccionar perfil..."
                  loading={profilesLoading}
                />
              </Field>

              <Field
                label="Perfil de cobertura"
                required
                hint="Define las redes y países donde puede operar el dispositivo"
              >
                <SelectField
                  value={tariffProfileId}
                  onChange={setTariffProfileId}
                  options={tariffProfiles}
                  placeholder="Seleccionar cobertura..."
                  loading={profilesLoading}
                />
              </Field>
            </div>

            {/* ── Initial Status ── */}
            <Field
              label="Estado inicial"
              hint="Define si el dispositivo quedará habilitado o deshabilitado al crearse"
            >
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {([
                  { id: 0, label: "Deshabilitado", color: "#94a3b8" },
                  { id: 1, label: "Habilitado",    color: "#16a34a" },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setInitialStatus(opt.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all"
                    style={{
                      background: initialStatus === opt.id ? `${opt.color}18` : "white",
                      color:      initialStatus === opt.id ? opt.color : "#9ca3af",
                      borderRight: opt.id === 0 ? "1px solid #e5e7eb" : "none",
                      fontWeight:  initialStatus === opt.id ? 600 : 400,
                    }}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* ── IMEI Lock ── */}
            <div
              className="rounded-xl border transition-colors"
              style={{
                borderColor: imeiLock ? "#5eead4" : "#e5e7eb",
                background: imeiLock ? "rgba(62,207,142,0.04)" : "white",
              }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: imeiLock ? "rgba(62,207,142,0.12)" : "rgba(148,163,184,0.10)" }}
                  >
                    <Lock className="w-4 h-4" style={{ color: imeiLock ? "#0d9488" : "#94a3b8" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Bloqueo de IMEI</p>
                    <p className="text-xs text-gray-400">
                      Solo este dispositivo físico puede usar la SIM
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setImeiLock(v => !v); if (imeiLock) setImei(""); }}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                  style={{ background: imeiLock ? "#3ECF8E" : "#d1d5db" }}
                >
                  <span
                    className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200"
                    style={{ transform: imeiLock ? "translateX(20px)" : "translateX(0px)" }}
                  />
                </button>
              </div>

              {imeiLock && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Shield className="w-3.5 h-3.5 text-teal-500" />
                    <label className="text-xs font-semibold text-gray-600">
                      IMEI del dispositivo
                    </label>
                  </div>
                  <input
                    type="text"
                    value={imei}
                    onChange={e => setImei(e.target.value.replace(/[^\d]/g, "").slice(0, 16))}
                    placeholder="15 o 16 dígitos"
                    className="w-full text-sm font-mono border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200 transition-colors"
                    maxLength={16}
                  />
                  {imei.length > 0 && imei.length < 14 && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Mínimo 14 dígitos
                    </p>
                  )}
                  {imei.length >= 14 && (
                    <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> IMEI válido
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Tags ── */}
            <Field
              label="Etiquetas"
              hint="Organiza y filtra dispositivos por grupo, cliente o función"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Ej. flota-norte, cliente-abc…"
                    className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-200 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200 transition-colors disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-1"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="hover:text-blue-900 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-1">
                Enter o coma para añadir · Click en ✕ para eliminar
              </p>
            </Field>

            {/* ── SIM Assignment ── */}
            <div
              className="rounded-xl border transition-colors"
              style={{
                borderColor: assignSim ? "#c7d2fe" : "#e5e7eb",
                background:  assignSim ? "rgba(99,102,241,0.03)" : "white",
              }}
            >
              {/* Toggle row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: assignSim ? "rgba(99,102,241,0.12)" : "rgba(148,163,184,0.10)" }}
                  >
                    <CreditCard className="w-4 h-4" style={{ color: assignSim ? "#6366f1" : "#94a3b8" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Asignar SIM</p>
                    <p className="text-xs text-gray-400">
                      {assignSim && simIccid
                        ? <span className="text-indigo-600 font-medium font-mono">…{simIccid.slice(-12)}</span>
                        : "Vincula una SIM de tu inventario emnify"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setAssignSim(v => !v); if (assignSim) setSimIccid(""); }}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                  style={{ background: assignSim ? "#6366f1" : "#d1d5db" }}
                >
                  <span
                    className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200"
                    style={{ transform: assignSim ? "translateX(20px)" : "translateX(0px)" }}
                  />
                </button>
              </div>

              {/* SIM Picker panel */}
              {assignSim && (
                <div className="px-4 pb-4">
                  <SimPicker
                    selectedIccid={simIccid}
                    onSelect={(iccid) => setSimIccid(iccid)}
                  />
                </div>
              )}
            </div>

            {/* ── Submission error ── */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span className="break-words">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        {!success && (
          <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/60">
            <div className="text-xs text-gray-400">
              <span className="text-red-400">*</span> campos requeridos
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                style={{
                  background: canSubmit
                    ? "linear-gradient(135deg, #3ECF8E, #0ea5e9)"
                    : "#d1d5db",
                }}
              >
                {submitting
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creando...</>
                  : <><Cpu className="w-4 h-4" /> Crear dispositivo</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}