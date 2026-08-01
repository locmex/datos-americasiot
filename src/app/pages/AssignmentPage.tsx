import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  CreditCard, Users, Search, Loader2, Link2, Unlink,
  ChevronLeft, ChevronRight, CheckCircle2, PauseCircle, Circle,
  XCircle, CheckSquare, Square, X, ChevronDown, UserCheck,
} from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { Icon } from "../components/ui/icon";
import { PageHeader, IconButton, FilterPills, SortIcon as SharedSortIcon } from "../components/admin/AdminUI";
import { useTableColumns, type ColumnDef } from "../components/table/useTableColumns";
import { TableCustomizer } from "../components/table/TableCustomizer";
import { api } from "../lib/api";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SIM {
  iccid: string;
  iccid_with_luhn?: string;
  id?: number;
  status?: { id: number; description: string };
  endpoint?: { name: string; id?: number };
  localData?: { clientId?: string; clientName?: string } | null;
}
interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<number, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  0: { label: "Emitida",     color: "#94a3b8", bg: "rgba(148,163,184,0.12)", icon: Circle },
  1: { label: "Activa",      color: "#16a34a", bg: "rgba(22,163,74,0.10)",   icon: CheckCircle2 },
  2: { label: "Suspendida",  color: "#d97706", bg: "rgba(217,119,6,0.10)",   icon: PauseCircle },
  3: { label: "Desactivada", color: "#dc2626", bg: "rgba(220,38,38,0.10)",   icon: XCircle },
};

function displayIccid(sim: SIM) {
  return sim.iccid_with_luhn || sim.iccid;
}

// ── Columnas configurables ────────────────────────────────────────────────────
// Acá las 4 columnas son todas útiles para la tarea, así que el valor del
// selector está sobre todo en la altura de fila (con 1,500 SIMs, ver el doble
// de filas por pantalla cambia el trabajo) y en poder dejar solo ICCID +
// Cliente para una pasada de asignación masiva.
type AsigColKey = "SIM / ICCID" | "Estado" | "Dispositivo" | "Cliente Asignado";

const ASIG_COLUMNS: ColumnDef<AsigColKey>[] = [
  { key: "SIM / ICCID",      label: "SIM / ICCID", locked: true },
  { key: "Estado",           label: "Estado" },
  { key: "Dispositivo",      label: "Dispositivo" },
  { key: "Cliente Asignado", label: "Cliente Asignado" },
];

const ASIG_SORT_KEY: Record<AsigColKey, string> = {
  "SIM / ICCID":      "iccid",
  "Estado":           "status",
  "Dispositivo":      "endpoint",
  "Cliente Asignado": "client",
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// ─── Client picker dropdown ──────────────────────────────────────────────────
function ClientPicker({ clients, value, onChange }: {
  clients: Client[];
  value: string;
  onChange: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const handleOpen = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((o) => !o);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(target)) {
        const portal = document.getElementById("client-picker-portal");
        if (portal && portal.contains(target)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = clients.find((c) => c.id === value);
  const filtered = clients.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company || "").toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200"
      >
        {selected ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: "rgba(62,207,142,0.18)", color: "#059669" }}>
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
              {selected.company && <p className="text-xs text-gray-400 truncate">{selected.company}</p>}
            </div>
          </div>
        ) : (
          <span className="text-gray-400 text-sm">Seleccionar cliente…</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && rect && createPortal(
        <div id="client-picker-portal"
          className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          style={{
            position: "fixed", top: rect.bottom + 4, left: rect.left,
            width: rect.width, zIndex: 9999,
            maxHeight: Math.min(280, window.innerHeight - rect.bottom - 12),
            display: "flex", flexDirection: "column",
          }}
        >
          <div className="p-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-teal-400" />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-6 text-sm text-gray-400">Sin resultados</p>
            ) : (
              filtered.map((c) => (
                <button key={c.id} type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(c.id, c.name); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: "rgba(62,207,142,0.18)", color: "#059669" }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.company || c.email}</p>
                  </div>
                  {c.id === value && <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#3ECF8E" }} />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Assignment Modal ────────────────────────────────────────────────────────
function AssignModal({ sims, clients, onConfirm, onClose }: {
  sims: SIM[];
  clients: Client[];
  onConfirm: (clientId: string, clientName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!clientId) { toast.error("Selecciona un cliente"); return; }
    setLoading(true);
    try {
      await onConfirm(clientId, clientName);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isBulk = sims.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(62,207,142,0.12)" }}>
              <Link2 className="w-5 h-5" style={{ color: "#3ECF8E" }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">
                {isBulk ? `Asignar ${sims.length} SIMs` : "Asignar SIM"}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {isBulk
                  ? `${sims.length} SIMs seleccionadas`
                  : <code className="font-mono">{displayIccid(sims[0])}</code>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Preview chips (bulk) */}
        {isBulk && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {sims.slice(0, 12).map((sim) => (
                <span key={sim.iccid}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-white border border-gray-200 text-gray-600">
                  <CreditCard className="w-2.5 h-2.5 text-gray-400" />
                  {displayIccid(sim).slice(-8)}
                </span>
              ))}
              {sims.length > 12 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] bg-gray-200 text-gray-500 font-medium">
                  +{sims.length - 12} más
                </span>
              )}
            </div>
          </div>
        )}

        {/* Client picker */}
        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Seleccionar cliente</p>
          {clients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No hay clientes registrados</p>
              <p className="text-xs text-gray-400 mt-1">Crea un cliente en el módulo de Clientes primero</p>
            </div>
          ) : (
            <ClientPicker clients={clients} value={clientId}
              onChange={(id, name) => { setClientId(id); setClientName(name); }} />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit}
            disabled={!clientId || loading || clients.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            style={{ background: "#3ECF8E", color: "#000" }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {loading ? "Asignando…" : isBulk ? `Asignar ${sims.length} SIMs` : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AssignmentPage() {
  const [sims, setSims]               = useState<SIM[]>([]);
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(0);
  const [perPage, setPerPage]         = useState(10);
  const [total, setTotal]             = useState(0);

  // Search: separate input state from committed search (server-side)
  const [searchInput, setSearchInput] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const [searchMode, setSearchMode]   = useState<"iccid" | "device">("iccid");

  // Client-side filter tab
  const [filter, setFilter]           = useState<"all" | "assigned" | "unassigned">("all");

  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [modalSims, setModalSims]         = useState<SIM[] | null>(null);

  // ── Load (server-side search) ──────────────────────────────────────────────
  const load = useCallback(async (p = 0, pp = perPage, q = "") => {
    setLoading(true);
    setSelected(new Set());
    try {
      const [simsRes, clientsRes] = await Promise.allSettled([
        api.getSims(p, pp, q),
        api.getClients(),
      ]);
      if (simsRes.status === "fulfilled") {
        setSims(simsRes.value.items || []);
        setTotal(simsRes.value.total_count || 0);
      }
      if (clientsRes.status === "fulfilled") setClients(clientsRes.value.clients || []);
    } finally {
      setLoading(false);
    }
  }, [perPage]);

  useEffect(() => { load(0, perPage, ""); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchInput.trim();
    // For device name mode, prefix with "device:" so the server skips ICCID path
    // For iccid mode, send as-is (numeric detection on server handles it)
    const q = raw && searchMode === "device" ? `device:${raw}` : raw;
    setPage(0);
    setServerQuery(q);
    load(0, perPage, q);
  };

  const handleClear = () => {
    setSearchInput("");
    setServerQuery("");
    setPage(0);
    load(0, perPage, "");
  };

  const handleModeChange = (mode: "iccid" | "device") => {
    setSearchMode(mode);
    setSearchInput("");
    setServerQuery("");
    setPage(0);
    load(0, perPage, "");
  };

  const goToPage = (p: number) => {
    setPage(p);
    load(p, perPage, serverQuery);
  };

  const handlePerPageChange = (pp: number) => {
    setPerPage(pp);
    setPage(0);
    load(0, pp, serverQuery);
  };

  // ── Client-side filter (on top of server results) ──────────────────────────
  const filtered = sims.filter((sim) => {
    const isAssigned = !!sim.localData?.clientId;
    if (filter === "assigned"   && !isAssigned) return false;
    if (filter === "unassigned" && isAssigned)  return false;
    return true;
  });

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allVisibleSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.iccid));
  const someSelected = selected.size > 0;

  const toggleOne = (iccid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(iccid) ? next.delete(iccid) : next.add(iccid);
      return next;
    });

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((s) => next.delete(s.iccid)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((s) => next.add(s.iccid)); return next; });
    }
  };

  // ── Row actions ───────────────────────────────────────────────────────────
  const handleUnassign = async (iccid: string, clientName: string) => {
    if (!confirm(`¿Desasignar este chip de ${clientName}?`)) return;
    setActionLoading((p) => new Set(p).add(iccid));
    try {
      await api.unassignChip(iccid);
      toast.success("Chip desasignado");
      load(page, perPage, serverQuery);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading((p) => { const n = new Set(p); n.delete(iccid); return n; });
    }
  };

  const handleBulkAssign = async (clientId: string, clientName: string) => {
    // Use ICCIDs from modalSims (the actual SIMs shown in the modal),
    // NOT from `selected` — the modal can be opened for a single-row
    // inline button where the row is NOT in the checkbox selection.
    const iccids = (modalSims || []).map((s) => s.iccid).filter(Boolean);
    if (iccids.length === 0) {
      toast.error("No hay SIMs para asignar");
      return;
    }
    try {
      const res = await api.bulkAssign(iccids, clientId, clientName);
      toast.success(`✓ ${res.assigned} SIM${res.assigned !== 1 ? "s" : ""} asignada${res.assigned !== 1 ? "s" : ""} a ${clientName}`);
      if (res.failed > 0) toast.error(`${res.failed} SIMs no pudieron asignarse`);
      setSelected(new Set());
      load(page, perPage, serverQuery);
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const handleBulkUnassign = async () => {
    const iccids = Array.from(selected).filter((iccid) => sims.find((s) => s.iccid === iccid)?.localData?.clientId);
    if (iccids.length === 0) { toast.error("Ninguna SIM seleccionada tiene asignación"); return; }
    if (!confirm(`¿Desasignar ${iccids.length} SIM(s)?`)) return;
    try {
      const res = await api.bulkUnassign(iccids);
      toast.success(`✓ ${res.unassigned} SIMs desasignadas`);
      load(page, perPage, serverQuery);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const assigned   = sims.filter((s) => s.localData?.clientId).length;
  const unassigned = sims.length - assigned;
  const totalPages = Math.ceil(total / perPage);

  const visiblePages = () => {
    const pages: number[] = [];
    const start = Math.max(0, page - 2);
    const end   = Math.min(totalPages - 1, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  // ── Sorting ──────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (sortKey === "iccid")    { aVal = a.iccid || ""; bVal = b.iccid || ""; }
      if (sortKey === "status")   { aVal = String(a.status?.id ?? 0); bVal = String(b.status?.id ?? 0); }
      if (sortKey === "endpoint") { aVal = a.endpoint?.name || ""; bVal = b.endpoint?.name || ""; }
      if (sortKey === "client")   { aVal = a.localData?.clientName || ""; bVal = b.localData?.clientName || ""; }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: string }) => (
    <SharedSortIcon active={sortKey === col} dir={sortDir} />
  );

  // Columnas configurables, persistidas por usuario.
  const cols = useTableColumns<AsigColKey>("admin.assignment.columns", ASIG_COLUMNS);


  const selectedSims = sims.filter((s) => selected.has(s.iccid));

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-container-margin pb-28 md:pb-container-margin">
      <PageHeader
        title="Asignación de SIMs"
        subtitle="Vinculá SIMs con tus clientes · Selección múltiple disponible"
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
        <IconButton
          icon="refresh"
          onClick={() => load(page, perPage, serverQuery)}
          title="Actualizar"
          spinning={loading}
        />
      </PageHeader>

      {/* ── Métricas ── */}
      <div className="mb-gutter grid grid-cols-1 gap-gutter sm:grid-cols-3">
        {[
          { label: "Total SIMs",  value: loading ? null : total,      icon: "sd_card",      tone: "neutral" },
          { label: "Asignadas",   value: loading ? null : assigned,   icon: "link",         tone: "success" },
          { label: "Sin Asignar", value: loading ? null : unassigned, icon: "link_off",     tone: "warning" },
        ].map(({ label, value, icon, tone }) => {
          const t = {
            neutral: { v: "text-on-surface", c: "text-tertiary" },
            success: { v: "text-primary",    c: "bg-primary/10 text-primary rounded p-1" },
            warning: { v: "text-on-warning", c: "bg-warning/10 text-on-warning rounded p-1" },
          }[tone as "neutral" | "success" | "warning"];
          return (
            <div
              key={label}
              className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding transition-colors hover:bg-surface-bright"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <p className="text-body-sm tracking-wider text-on-surface-variant uppercase">{label}</p>
                <span className={t.c}><Icon name={icon} className="text-[16px]" /></span>
              </div>
              <h3 className={`text-display-lg ${t.v}`}>
                {value === null ? "—" : value.toLocaleString("es-MX")}
              </h3>
            </div>
          );
        })}
      </div>

      {/* ── Buscador + filtros ── */}
      <div className="mb-gutter flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <FilterPills
          value={searchMode}
          onChange={handleModeChange}
          options={[
            { value: "iccid",  label: "ICCID" },
            { value: "device", label: "Nombre de dispositivo" },
          ]}
        />

        <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-on-surface-variant" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={searchMode === "iccid" ? "Buscar por ICCID…" : "Buscar por nombre de dispositivo…"}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pr-4 pl-10 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <button type="submit" className="btn-primary shrink-0 rounded-lg px-4 py-2 text-label-md transition-colors">
            Buscar
          </button>
          {serverQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-label-md text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Limpiar
            </button>
          )}
        </form>

        <FilterPills
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all",        label: "Todas" },
            { value: "assigned",   label: "Asignadas" },
            { value: "unassigned", label: "Sin asignar" },
          ]}
        />
      </div>

      {/* ── Tabla (escritorio) ── */}
      <div className="hidden overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface-container-low">
              <tr className="border-b border-outline-variant">
                {/* Checkbox */}
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll}
                    className="flex items-center justify-center w-5 h-5 rounded transition-colors"
                    title={allVisibleSelected ? "Deseleccionar todo" : "Seleccionar todo"}>
                    {allVisibleSelected
                      ? <CheckSquare className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                      : someSelected
                        ? <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-primary-container">
                            <div className="h-0.5 w-2 rounded bg-primary-container" />
                          </div>
                        : <Square className="w-4 h-4 text-outline-variant" />
                    }
                  </button>
                </th>
                {([
                  ...cols.visibleColumns.map((c) => ({ label: c.label, key: ASIG_SORT_KEY[c.key] })),
                  { label: "Acción", key: null },
                ] as { label: string; key: string | null }[]).map(({ label, key }, i) => (
                  <th key={label}
                    onClick={key ? () => handleSort(key) : undefined}
                    className={`px-4 ${cols.densityClass} text-left text-label-xs tracking-wider whitespace-nowrap uppercase ${
                      key ? "cursor-pointer select-none transition-colors hover:bg-surface-container" : ""
                    } ${sortKey === key ? "text-primary" : "text-on-surface-variant"} ${
                      cols.columnLines ? "border-r border-outline-variant/50" : ""
                    } ${i === 0 ? "sticky left-0 z-10 bg-surface-container-low" : ""} ${
                      key === null ? "sticky right-0 z-10 bg-surface-container-low" : ""
                    }`}>
                    {label}{key && <SortIcon col={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-outline-variant/50">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : sortedFiltered.map((sim) => {
                    const isAssigned = !!sim.localData?.clientId;
                    const statusId   = sim.status?.id ?? 0;
                    const cfg        = STATUS_CFG[statusId] ?? STATUS_CFG[0];
                    // Ojo: no llamar `Icon` a esto — taparía el componente
                    // Icon de Material Symbols que usa el resto del archivo.
                    const StatusIcon = cfg.icon;
                    const iccidDisplay = displayIccid(sim);
                    const isSelected = selected.has(sim.iccid);
                    const isLoading  = actionLoading.has(sim.iccid);

                    const cellCls = (i: number) =>
                      `px-4 ${cols.densityClass} ${
                        cols.columnLines ? "border-r border-outline-variant/50" : ""
                      } ${i === 0 ? "sticky left-0 z-10 bg-surface-container-lowest" : ""}`;

                    return (
                      <tr key={sim.iccid}
                        onClick={() => toggleOne(sim.iccid)}
                        className={`group cursor-pointer border-b border-outline-variant/50 transition-colors ${
                          isSelected ? "bg-primary/5" : "hover:bg-surface-container-low"
                        }`}>

                        {/* Checkbox */}
                        <td className={`px-4 ${cols.densityClass}`} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleOne(sim.iccid)} className="flex items-center justify-center w-5 h-5">
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-primary-container" />
                              : <Square className="w-4 h-4 text-outline-variant hover:text-on-surface-variant" />
                            }
                          </button>
                        </td>

                        {cols.visibleColumns.map((c, i) => {
                          switch (c.key) {
                            case "SIM / ICCID":
                              return (
                                <td key={c.key} className={cellCls(i)}>
                                  <div className="flex items-center gap-2">
                                    <Icon name="sd_card" className="shrink-0 text-[18px] text-outline-variant" />
                                    <code className="font-mono text-body-sm tracking-tight text-on-surface">{iccidDisplay}</code>
                                  </div>
                                </td>
                              );

                            case "Estado":
                              return (
                                <td key={c.key} className={cellCls(i)}>
                                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-xs"
                                    style={{ color: cfg.color, background: cfg.bg }}>
                                    <StatusIcon className="w-3 h-3" />
                                    {cfg.label}
                                  </span>
                                </td>
                              );

                            case "Dispositivo":
                              return (
                                <td key={c.key} className={cellCls(i)}>
                                  {sim.endpoint?.name
                                    ? <span className="font-mono text-body-sm text-on-surface">{sim.endpoint.name}</span>
                                    : <span className="text-body-sm italic text-outline-variant">Sin endpoint</span>}
                                </td>
                              );

                            case "Cliente Asignado":
                              return (
                                <td key={c.key} className={cellCls(i)} onClick={(e) => e.stopPropagation()}>
                          {isAssigned ? (
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-label-xs text-on-primary-container">
                                {sim.localData!.clientName!.charAt(0).toUpperCase()}
                              </div>
                              <span className="max-w-[160px] truncate text-label-md text-on-surface">
                                {sim.localData!.clientName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-body-sm italic text-outline-variant">Sin asignar</span>
                          )}
                                </td>
                              );

                            default:
                              return null;
                          }
                        })}

                        {/* Acción — fija a la derecha */}
                        <td
                          className={`px-4 ${cols.densityClass} sticky right-0 z-10 bg-surface-container-lowest`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAssigned ? (
                            <button onClick={() => handleUnassign(sim.iccid, sim.localData!.clientName!)}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 rounded-lg bg-error-container px-3 py-1.5 text-label-xs text-on-error-container transition-opacity hover:opacity-80 disabled:opacity-50">
                              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon name="link_off" className="text-[14px]" />}
                              Quitar
                            </button>
                          ) : (
                            <button onClick={() => setModalSims([sim])}
                              className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-label-xs text-primary transition-colors hover:bg-primary/20">
                              <Icon name="link" className="text-[14px]" />
                              Asignar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">No se encontraron SIMs</p>
            {serverQuery && (
              <p className="text-xs text-gray-400 mt-1">Intenta con otro término de búsqueda</p>
            )}
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Mostrando {(page * perPage + 1).toLocaleString()}–{Math.min((page + 1) * perPage, total).toLocaleString()} de {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => goToPage(page - 1)} disabled={page === 0} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {visiblePages().map(p => (
                <button key={p} onClick={() => goToPage(p)}
                  className="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: p === page ? "#3ECF8E" : "transparent", color: p === page ? "#fff" : "#6b7280", border: p === page ? "none" : "1px solid #e5e7eb" }}>
                  {p + 1}
                </button>
              ))}
              {totalPages > 5 && page < totalPages - 3 && <span className="text-gray-400 text-xs px-1">…{totalPages}</span>}
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">SIMs por página</span>
              <select
                value={perPage}
                onChange={e => handlePerPageChange(Number(e.target.value))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              >
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Cards ── */}
      <div className="md:hidden space-y-2">
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-2.5 shadow-sm">
            <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-gray-600">
              {allVisibleSelected
                ? <CheckSquare className="w-4 h-4" style={{ color: "#3ECF8E" }} />
                : <Square className="w-4 h-4 text-gray-300" />}
              {allVisibleSelected ? "Deseleccionar todo" : `Seleccionar los ${filtered.length} visibles`}
            </button>
            {someSelected && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(62,207,142,0.15)", color: "#059669" }}>
                {selected.size} sel.
              </span>
            )}
          </div>
        )}

        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
                <Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" />
              </div>
            ))
          : filtered.length === 0
            ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CreditCard className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">No se encontraron SIMs</p>
              </div>
            )
            : filtered.map((sim) => {
                const isAssigned   = !!sim.localData?.clientId;
                const statusId     = sim.status?.id ?? 0;
                const cfg          = STATUS_CFG[statusId] ?? STATUS_CFG[0];
                const Icon         = cfg.icon;
                const iccidDisplay = displayIccid(sim);
                const isSelected   = selected.has(sim.iccid);
                const isLoading    = actionLoading.has(sim.iccid);

                return (
                  <div key={sim.iccid}
                    onClick={() => toggleOne(sim.iccid)}
                    className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 cursor-pointer transition-colors"
                    style={{
                      borderColor: isSelected ? "rgba(62,207,142,0.5)" : "#f1f5f9",
                      background:  isSelected ? "rgba(62,207,142,0.04)" : "white",
                    }}>
                    {/* Checkbox */}
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <button onClick={() => toggleOne(sim.iccid)}>
                        {isSelected
                          ? <CheckSquare className="w-5 h-5" style={{ color: "#3ECF8E" }} />
                          : <Square className="w-5 h-5 text-gray-200" />
                        }
                      </button>
                    </div>
                    {/* Status icon */}
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-mono text-gray-800 block truncate">{iccidDisplay}</code>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                        {isAssigned && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-[11px] text-gray-600 truncate">{sim.localData!.clientName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Action */}
                    <div className="shrink-0 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                      {isAssigned ? (
                        <button onClick={() => handleUnassign(sim.iccid, sim.localData!.clientName!)}
                          disabled={isLoading}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: "rgba(239,68,68,0.10)", color: "#dc2626" }}>
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                          Quitar
                        </button>
                      ) : (
                        <button onClick={() => setModalSims([sim])}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(62,207,142,0.10)", color: "#059669" }}>
                          <UserCheck className="w-3 h-3" />
                          Asignar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

        {/* Mobile pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-500">
              {(page * perPage + 1).toLocaleString()}–{Math.min((page + 1) * perPage, total).toLocaleString()} de{" "}
              <span className="font-semibold">{total.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => goToPage(page - 1)} disabled={page === 0}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600 px-2 font-medium">{page + 1} / {totalPages}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating multi-select action bar ── */}
      {someSelected && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl"
          style={{ background: "#111827", minWidth: "min(90vw, 480px)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: "#3ECF8E", color: "#000" }}>
              {selected.size}
            </div>
            <span className="text-white text-sm font-medium truncate">
              {selected.size === 1 ? "SIM seleccionada" : "SIMs seleccionadas"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectedSims.some((s) => s.localData?.clientId) && (
              <button onClick={handleBulkUnassign}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                <Unlink className="w-3.5 h-3.5" />
                Quitar
              </button>
            )}
            <button onClick={() => setModalSims(selectedSims)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: "#3ECF8E", color: "#000" }}>
              <UserCheck className="w-3.5 h-3.5" />
              Asignar a cliente
            </button>
            <button onClick={() => setSelected(new Set())}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modalSims && (
        <AssignModal
          sims={modalSims}
          clients={clients}
          onConfirm={handleBulkAssign}
          onClose={() => setModalSims(null)}
        />
      )}
    </div>
  );
}