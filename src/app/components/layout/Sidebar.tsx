import {
  LayoutDashboard, CreditCard, Users, UserCheck, LogOut, Cpu,
} from "lucide-react";
import { useNavigate, NavLink } from "react-router";
import { useAuth } from "../../lib/auth-context";
import { toast } from "sonner";
import { AmericasIoTLogo } from "../AmericasIoTLogo";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard",         end: true },
  { to: "/devices",   icon: Cpu,             label: "Dispositivos" },
  { to: "/inventory", icon: CreditCard,      label: "Inventario SIMs" },
  { to: "/assignment",icon: UserCheck,       label: "Asignación" },
  { to: "/clients",   icon: Users,           label: "Clientes" },
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

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.25)" }}
          onClick={onClose}
        />
      )}

      <aside
        className={`
          flex flex-col h-screen w-64 fixed left-0 top-0 z-40 select-none
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
        style={{ background: "#ffffff", borderRight: "1px solid #e8e8ed" }}
      >
        {/* ── Logo ──────────────────────────────────────────── */}
        <div
          className="flex items-center px-5 h-16"
          style={{ borderBottom: "1px solid #e8e8ed" }}
        >
          <AmericasIoTLogo height={30} forceLight />
        </div>

        {/* ── Navigation ────────────────────────────────────── */}
        <nav className="flex-1 px-3 py-5 overflow-y-auto">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2"
            style={{ color: "#c7c7cc" }}
          >
            Menú
          </p>
          <ul className="space-y-0.5">
            {navItems.map(({ to, icon: Icon, label, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
                  style={({ isActive }) => ({
                    color:      isActive ? "#0d8f5c"                    : "#6b6b80",
                    background: isActive ? "rgba(62,207,142,0.10)"      : "transparent",
                    fontWeight: isActive ? 600                           : 400,
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-all"
                        style={{
                          background: isActive ? "rgba(62,207,142,0.18)" : "#f5f5f7",
                          color:      isActive ? "#3ECF8E"                : "#8e8ea0",
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Footer ────────────────────────────────────────── */}
        <div
          className="px-3 py-3 space-y-1"
          style={{ borderTop: "1px solid #e8e8ed" }}
        >
          {/* User card */}
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{ background: "#f5f5f7" }}
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0"
              style={{ background: "rgba(62,207,142,0.18)", color: "#3ECF8E" }}
            >
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "#1a1a1a" }}>
                {user?.name || "Admin"}
              </p>
              <p className="text-[10px] truncate" style={{ color: "#adadb8" }}>
                {user?.email || "Americas IoT"}
              </p>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all"
            style={{ color: "#adadb8" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#e11d48"; (e.currentTarget as HTMLElement).style.background = "#fff1f2"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#adadb8"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}