import { useNavigate, NavLink } from "react-router";
import { useAuth } from "../../lib/auth-context";
import { toast } from "sonner";
import { BrandLockup } from "../BrandLockup";
import { Icon } from "../ui/icon";
import { BILLING_ENABLED } from "../../lib/features";

type NavItem = { to: string; icon: string; label: string; end?: boolean };

// Mismo orden de siempre, agrupado: lo que se opera a diario y lo comercial.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operación",
    items: [
      { to: "/dashboard",  icon: "dashboard",      label: "Dashboard", end: true },
      { to: "/devices",    icon: "router",         label: "Dispositivos" },
      { to: "/inventory",  icon: "sd_card",        label: "Inventario SIMs" },
      { to: "/assignment", icon: "assignment_ind", label: "Asignación" },
      { to: "/clients",    icon: "group",          label: "Clientes" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { to: "/orders",   icon: "shopping_cart", label: "Pedidos" },
      { to: "/products", icon: "inventory_2",   label: "Productos" },
      ...(BILLING_ENABLED ? [
        { to: "/invoices", icon: "receipt_long", label: "Facturación" },
        { to: "/plans",    icon: "layers",       label: "Planes" },
      ] : []),
    ],
  },
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

      {/* Barra en el morado oscuro de la marca (#1a0450), como el header de
          la landing y la franja del login. Indicador activo en cian de señal. */}
      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-full w-64 select-none flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
        style={{ background: "#1a0450", color: "#b6abc9" }}
      >
        {/* ── Marca ─────────────────────────────────────────── */}
        <div className="px-5 pt-6 pb-7">
          <BrandLockup />
        </div>

        {/* ── Navegación ────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto px-3" aria-label="Secciones">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(182,171,201,0.75)" }}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ to, icon, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors duration-200 ${
                        isActive
                          ? "bg-white/10 font-semibold text-white"
                          : "text-[#b6abc9] hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r"
                            style={{ background: "#22e4c8" }}
                          />
                        )}
                        <Icon name={icon} filled={isActive} />
                        <span>{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Pie: usuario + salir ──────────────────────────── */}
        <div className="mt-auto space-y-1 border-t border-white/10 px-3 pt-3 pb-5">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-md text-white" style={{ background: "#35109c" }}>
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label-md text-white">
                {user?.name || "Admin"}
              </p>
              <p className="truncate text-body-sm" style={{ color: "#b6abc9" }}>
                {user?.email || "Americas IoT"}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body-md text-[#b6abc9] transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="logout" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
