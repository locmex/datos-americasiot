import { useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../lib/auth-context";
import { AmericasIoTLogo } from "../AmericasIoTLogo";
import { Menu, LayoutDashboard, CreditCard, UserCheck, Users, Cpu } from "lucide-react";

const bottomNav = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/devices",    icon: Cpu,             label: "Dispositivos" },
  { to: "/inventory",  icon: CreditCard,      label: "Inventario" },
  { to: "/assignment", icon: UserCheck,       label: "Asignación" },
  { to: "/clients",    icon: Users,           label: "Clientes" },
];

function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const location = useLocation();
  const labels: Record<string, string> = {
    "/dashboard":  "Dashboard",
    "/devices":    "Dispositivos",
    "/inventory":  "Inventario SIMs",
    "/assignment": "Asignación",
    "/clients":    "Clientes",
  };
  const title = labels[location.pathname] ?? "";

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 h-14"
      style={{ background: "#ffffff", borderBottom: "1px solid #e8e8ed" }}
    >
      <button
        onClick={onMenuClick}
        className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
        style={{ color: "#8e8ea0" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f5f5f7"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <Menu className="w-5 h-5" />
      </button>

      <AmericasIoTLogo height={22} forceLight />

      {title && (
        <span className="flex-1 text-right text-xs font-medium truncate" style={{ color: "#c7c7cc" }}>
          {title}
        </span>
      )}
    </header>
  );
}

function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch"
      style={{
        background:    "#ffffff",
        borderTop:     "1px solid #e8e8ed",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {bottomNav.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative"
          style={({ isActive }) => ({ color: isActive ? "#3ECF8E" : "#c7c7cc" })}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: "#3ECF8E" }}
                />
              )}
              <Icon className="w-[18px] h-[18px]" />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#f2f4f7" }}>
        <div className="text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ background: "rgba(62,207,142,0.15)" }} />
            <div className="absolute inset-3 rounded-xl" style={{ background: "#3ECF8E" }} />
          </div>
          <p className="text-xs font-medium" style={{ color: "#adadb8" }}>Cargando portal...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  // Clients have their own layout at /portal — redirect them if they land here
  if (user.role === "client") return <Navigate to="/portal" replace />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f2f4f7" }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

      <main className="flex-1 overflow-y-auto pt-14 pb-20 md:pt-0 md:pb-0 md:ml-64">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}