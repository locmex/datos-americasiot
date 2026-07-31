import React, { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router";
import { clientApi } from "../../lib/api";
import { ClientAuthContext, ClientUser } from "../../lib/client-auth";
import { AmericasIoTLogo } from "../AmericasIoTLogo";
import { Icon } from "../ui/icon";

const portalNav = [
  { to: "/portal",          icon: "devices",      label: "Mis Dispositivos", end: true },
  { to: "/portal/orders",   icon: "shopping_cart", label: "Pedidos" },
  { to: "/portal/invoices", icon: "receipt_long",  label: "Mis Facturas" },
];

// ─── Sidebar (desktop) ────────────────────────────────────────────────────────
function PortalSidebar() {
  const ctx = useContext(ClientAuthContext)!;
  const initial = ctx.user?.name?.charAt(0)?.toUpperCase()
    || ctx.user?.email?.charAt(0)?.toUpperCase()
    || "C";

  return (
    <nav className="hidden md:flex flex-col h-screen py-6 px-4 bg-surface border-r border-outline-variant fixed left-0 top-0 w-64 z-50">
      <div className="mb-8 px-4">
        <AmericasIoTLogo height={28} forceLight />
      </div>

      {/* Usuario */}
      <div className="flex items-center gap-3 px-4 mb-8">
        <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant shrink-0 flex items-center justify-center font-bold text-on-secondary-container">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="font-label-md text-label-md text-on-surface truncate">
            Hola, {ctx.user?.name?.split(" ")[0] ?? "Cliente"} 👋
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Portal Cliente</p>
        </div>
      </div>

      {/* Navegación */}
      <div className="flex-1 flex flex-col gap-2">
        {portalNav.map(({ to, icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `rounded-lg px-4 py-2 flex items-center gap-3 font-label-md text-label-md transition-all ${
                isActive
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={icon} filled={isActive} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Salir */}
      <div className="mt-auto px-4">
        <button
          onClick={ctx.logout}
          className="w-full flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-error transition-colors rounded-lg font-label-md text-label-md"
        >
          <Icon name="logout" />
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}

// ─── Header + tabs (móvil) ────────────────────────────────────────────────────
function PortalMobileHeader() {
  const ctx = useContext(ClientAuthContext)!;

  return (
    <header className="md:hidden flex flex-col w-full px-container-margin bg-surface border-b border-outline-variant sticky top-0 z-40">
      <div className="flex items-center justify-between h-16">
        <AmericasIoTLogo height={24} forceLight />
        <button
          onClick={ctx.logout}
          className="flex items-center gap-1.5 text-on-surface-variant hover:text-error transition-colors font-label-md text-label-md"
        >
          <Icon name="logout" />
          Salir
        </button>
      </div>
      <div className="flex gap-6 overflow-x-auto no-scrollbar">
        {portalNav.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `pb-2 whitespace-nowrap font-body-md text-body-md transition-colors ${
                isActive
                  ? "text-primary border-b-2 border-primary font-bold"
                  : "text-on-surface-variant font-medium hover:text-primary"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </header>
  );
}

// ─── Auth Provider (una sola instancia para TODAS las rutas del portal) ───────
function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Al montar: restaura la sesión si hay una guardada en localStorage
  useEffect(() => {
    const stored = localStorage.getItem("portal_session_id");
    if (!stored) {
      setIsLoading(false);
      return;
    }
    clientApi
      .me()
      .then((res) => setUser(res.user as ClientUser))
      .catch(() => {
        localStorage.removeItem("portal_session_id");
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await clientApi.login(email, password);
    localStorage.setItem("portal_session_id", res.sessionId);
    setUser(res.user as ClientUser);
  };

  const logout = async () => {
    try { await clientApi.logout(); } catch (_) {}
    localStorage.removeItem("portal_session_id");
    localStorage.removeItem("iot_session_id");
    localStorage.removeItem("iot_user");
    setUser(null);
  };

  return (
    <ClientAuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

// ─── Pantalla de carga ────────────────────────────────────────────────────────
function PortalLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="text-center space-y-4">
        <div className="relative w-12 h-12 mx-auto">
          <div className="absolute inset-0 rounded-xl animate-pulse bg-primary-container/20" />
          <div className="absolute inset-3 rounded-lg bg-primary-container" />
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Cargando portal…</p>
      </div>
    </div>
  );
}

// ─── Router del portal (guard de auth + layout) ───────────────────────────────
function PortalRouter() {
  const ctx      = useContext(ClientAuthContext)!;
  const location = useLocation();
  const isLoginPage = location.pathname === "/portal/login";

  // Todavía verificando la sesión guardada
  if (ctx.isLoading) return <PortalLoading />;

  // Sin autenticar → al login unificado en /
  if (!ctx.user && !isLoginPage) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Autenticado + intentando ver el login → dashboard
  if (ctx.user && isLoginPage) {
    return <Navigate to="/portal" replace />;
  }

  if (ctx.user) {
    return (
      <div className="bg-surface text-on-surface font-body-md text-body-md min-h-screen flex flex-col md:flex-row">
        <PortalSidebar />
        <PortalMobileHeader />
        <main className="flex-1 md:ml-64 bg-background min-h-screen">
          <Outlet />
        </main>
      </div>
    );
  }

  return <Navigate to="/" replace />;
}

// ─── Export público: raíz única de todas las rutas /portal/** ─────────────────
export function PortalRootLayout() {
  return (
    <ClientAuthProvider>
      <PortalRouter />
    </ClientAuthProvider>
  );
}

// Alias legacy para que cualquier import existente siga compilando
export function ClientPortalLayout()       { return <PortalRootLayout />; }
export function ClientPortalLoginWrapper() { return <PortalRootLayout />; }
