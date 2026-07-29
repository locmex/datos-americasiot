import { useNavigate, NavLink } from "react-router";
import { useAuth } from "../../lib/auth-context";
import { toast } from "sonner";
import { AmericasIoTLogo } from "../AmericasIoTLogo";
import { Icon } from "../ui/icon";

const navItems = [
  { to: "/dashboard",  icon: "dashboard",       label: "Dashboard", end: true },
  { to: "/devices",    icon: "router",          label: "Dispositivos" },
  { to: "/inventory",  icon: "sd_card",         label: "Inventario SIMs" },
  { to: "/assignment", icon: "assignment_ind",  label: "Asignación" },
  { to: "/clients",    icon: "group",           label: "Clientes" },
  { to: "/orders",     icon: "shopping_cart",   label: "Pedidos" },
  { to: "/products",   icon: "inventory_2",     label: "Productos" },
  { to: "/invoices",   icon: "receipt_long",    label: "Facturación" },
  { to: "/plans",      icon: "layers",          label: "Planes" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Sesión cerrada");
    navigate("/");
  };

  const initial =
    user?.name?.charAt(0)?.toUpperCase() ||
    user?.email?.charAt(0)?.toUpperCase() ||
    "A";

  return (
    <>
      {/* Overlay móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-on-surface/25 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-full w-64 select-none flex-col
          border-r border-outline-variant bg-surface
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* ── Marca ─────────────────────────────────────────── */}
        <div className="px-5 pt-container-margin pb-8">
          <AmericasIoTLogo height={28} forceLight />
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Admin Console
          </p>
        </div>

        {/* ── Navegación ────────────────────────────────────── */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          {navItems.map(({ to, icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors duration-200 ${
                  isActive
                    ? "border-r-4 border-primary bg-surface-container-high font-bold text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={icon} filled={isActive} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── Pie: usuario + salir ──────────────────────────── */}
        <div className="mt-auto space-y-1 border-t border-outline-variant px-2 pt-3 pb-container-margin">
          <div className="flex items-center gap-2.5 rounded-lg bg-surface-container-low px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-label-md text-on-primary-container">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label-md text-on-surface">
                {user?.name || "Admin"}
              </p>
              <p className="truncate text-body-sm text-on-surface-variant">
                {user?.email || "Americas IoT"}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body-md text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
          >
            <Icon name="logout" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
