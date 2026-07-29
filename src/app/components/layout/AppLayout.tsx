import { useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../lib/auth-context";
import { AmericasIoTLogo } from "../AmericasIoTLogo";
import { Icon } from "../ui/icon";

const bottomNav = [
  { to: "/dashboard",  icon: "dashboard",      label: "Dashboard", end: true },
  { to: "/devices",    icon: "router",         label: "Dispositivos" },
  { to: "/inventory",  icon: "sd_card",        label: "Inventario" },
  { to: "/assignment", icon: "assignment_ind", label: "Asignación" },
  { to: "/clients",    icon: "group",          label: "Clientes" },
  { to: "/orders",     icon: "shopping_cart",  label: "Pedidos" },
  { to: "/products",   icon: "inventory_2",    label: "Productos" },
  { to: "/invoices",   icon: "receipt_long",   label: "Facturación" },
  { to: "/plans",      icon: "layers",         label: "Planes" },
];

const pageTitles: Record<string, string> = {
  "/dashboard":  "Dashboard",
  "/devices":    "Dispositivos",
  "/inventory":  "Inventario SIMs",
  "/assignment": "Asignación",
  "/clients":    "Clientes",
  "/orders":     "Pedidos",
  "/products":   "Productos",
  "/invoices":   "Facturación",
  "/plans":      "Planes",
};

function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "";

  return (
    <header className="fixed top-0 right-0 left-0 z-20 flex h-14 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 md:hidden">
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        aria-label="Abrir menú"
      >
        <Icon name="menu" />
      </button>

      <AmericasIoTLogo height={22} forceLight />

      {title && (
        <span className="flex-1 truncate text-right text-label-md text-on-surface-variant">
          {title}
        </span>
      )}
    </header>
  );
}

function BottomNav() {
  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-20 flex items-stretch overflow-x-auto border-t border-outline-variant bg-surface-container-lowest md:hidden no-scrollbar"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {bottomNav.map(({ to, icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex min-w-[72px] flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
              isActive ? "text-primary" : "text-on-surface-variant"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
              )}
              <Icon name={icon} filled={isActive} className="text-[18px]" />
              <span className="text-label-xs leading-none">{label}</span>
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 animate-pulse rounded-xl bg-primary-container/20" />
            <div className="absolute inset-3 rounded-lg bg-primary-container" />
          </div>
          <p className="text-body-sm text-on-surface-variant">Cargando portal…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  // Los clientes tienen su propio layout en /portal
  if (user.role === "client") return <Navigate to="/portal" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

      <main className="flex-1 overflow-y-auto pt-14 pb-20 md:ml-64 md:pt-0 md:pb-0">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
