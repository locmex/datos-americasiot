import { useEffect, useState, useMemo } from "react";
import {
  Plus, Trash2, Shield, User, Search, X, Loader2, Mail, Calendar, RefreshCw, AlertCircle,
  ChevronsUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../lib/api";
import { toast } from "sonner";

interface PortalUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  user_metadata?: { name?: string; role?: string };
}

const ROLES = ["admin", "cliente", "viewer"];
const ROLE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  admin: { color: "#3ECF8E", bg: "rgba(62,207,142,0.1)", label: "Admin" },
  cliente: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "Cliente" },
  viewer: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", label: "Viewer" },
};

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cliente" });
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error("Email y contraseña requeridos"); return; }
    if (form.password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    setLoading(true);
    try {
      await api.createUser(form);
      toast.success(`Usuario ${form.email} creado con acceso al portal`);
      onCreated();
      onClose();
      setForm({ name: "", email: "", password: "", role: "cliente" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="font-semibold text-gray-900">Crear Usuario del Portal</h3>
            <p className="text-xs text-gray-500 mt-0.5">El usuario podrá acceder al portal con estas credenciales</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nombre</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del usuario"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Email *</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="usuario@empresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Contraseña *</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Rol</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => {
                const cfg = ROLE_CONFIG[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className="py-2 text-sm rounded-xl font-medium transition-all border"
                    style={{
                      background: form.role === r ? cfg.bg : "transparent",
                      color: form.role === r ? cfg.color : "#6b7280",
                      borderColor: form.role === r ? cfg.color : "#e5e7eb",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 text-black font-semibold"
              style={{ background: "#3ECF8E" }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Crear Usuario
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDeleteUser = async (user: PortalUser) => {
    if (!confirm(`¿Eliminar el acceso de ${user.email} al portal?`)) return;
    try {
      await api.deleteUser(user.id);
      toast.success(`Usuario ${user.email} eliminado`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRoleChange = async (user: PortalUser, newRole: string) => {
    setRoleLoading(user.id);
    try {
      await api.updateUserRole(user.id, newRole);
      toast.success(`Rol de ${user.email} actualizado a ${newRole}`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, user_metadata: { ...u.user_metadata, role: newRole } } : u
        )
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRoleLoading(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.user_metadata?.name || "").toLowerCase().includes(search.toLowerCase())
  );

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
      if (sortKey === "name")    { aVal = a.user_metadata?.name || a.email; bVal = b.user_metadata?.name || b.email; }
      if (sortKey === "role")    { aVal = a.user_metadata?.role || ""; bVal = b.user_metadata?.role || ""; }
      if (sortKey === "created") { aVal = a.created_at || ""; bVal = b.created_at || ""; }
      if (sortKey === "signin")  { aVal = a.last_sign_in_at || ""; bVal = b.last_sign_in_at || ""; }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 inline-block ml-0.5" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 inline-block ml-0.5" style={{ color: "#3ECF8E" }} />
      : <ArrowDown className="w-3 h-3 inline-block ml-0.5" style={{ color: "#3ECF8E" }} />;
  };

  function formatDate(ts?: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Usuarios con acceso al portal · Supabase Auth
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => setShowCreate(true)}
            className="gap-2 text-black font-semibold"
            style={{ background: "#3ECF8E" }}
          >
            <Plus className="w-4 h-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Usuarios", value: users.length, color: "#3ECF8E" },
          { label: "Admins", value: users.filter((u) => u.user_metadata?.role === "admin").length, color: "#10b981" },
          { label: "Clientes", value: users.filter((u) => u.user_metadata?.role !== "admin").length, color: "#60a5fa" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-2xl font-bold text-gray-900">{loading ? "—" : value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email o nombre..."
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
              {([
                { label: "Usuario",        key: "name" },
                { label: "Rol",            key: "role" },
                { label: "Fecha Registro", key: "created" },
                { label: "Último Acceso",  key: "signin" },
                { label: "Acciones",       key: null },
              ] as const).map(({ label, key }) => (
                <th key={label}
                  onClick={key ? () => handleSort(key) : undefined}
                  className={`px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${key ? "cursor-pointer select-none hover:bg-gray-100 transition-colors" : ""}`}
                  style={{ color: sortKey === key ? "#0d8f5c" : "#6b7280" }}>
                  {label}{key && <SortIcon col={key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : sortedFiltered.map((user) => {
                  const role = user.user_metadata?.role || "cliente";
                  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.cliente;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {(user.user_metadata?.name || user.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            {user.user_metadata?.name && (
                              <p className="text-sm font-medium text-gray-800">{user.user_metadata.name}</p>
                            )}
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{ color: cfg.color, background: cfg.bg }}
                          >
                            {cfg.label}
                          </span>
                          {roleLoading === user.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                          ) : (
                            <select
                              value={role}
                              onChange={(e) => handleRoleChange(user, e.target.value)}
                              className="text-xs text-gray-500 bg-transparent border-none outline-none cursor-pointer hover:text-gray-800"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-600 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatDate(user.created_at)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-500">
                          {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : <span className="italic text-gray-400">Nunca</span>}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">No hay usuarios registrados</p>
            <p className="text-sm text-gray-400 mt-1">Crea el primer usuario del portal</p>
          </div>
        )}
      </div>

      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
      />
    </div>
  );
}