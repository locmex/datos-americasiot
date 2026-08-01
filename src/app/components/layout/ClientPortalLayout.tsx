import React, { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router";
import { clientApi } from "../../lib/api";
import { ClientAuthContext, ClientUser } from "../../lib/client-auth";
import { AmericasIoTLogo } from "../AmericasIoTLogo";
import { Icon } from "../ui/icon";

// `shortLabel` es lo que se muestra en las tabs inferiores: en un ancho de
// teléfono "Mis Dispositivos" no entra sin truncarse.
const portalNav = [
  { to: "/portal",          icon: "devices",       label: "Mis Dispositivos", shortLabel: "Dispositivos", end: true },
  { to: "/portal/orders",   icon: "shopping_cart", label: "Pedidos",          shortLabel: "Pedidos" },
  { to: "/portal/invoices", icon: "receipt_long",  label: "Mis Facturas",     shortLabel: "Facturas" },
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

// ─── Header (móvil) ───────────────────────────────────────────────────────────
// Ya no lleva las tabs: la navegación vive abajo, al alcance del pulgar.
function PortalMobileHeader() {
  const ctx = useContext(ClientAuthContext)!;

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant bg-surface px-container-margin">
      <AmericasIoTLogo height={24} forceLight />
      <button
        onClick={ctx.logout}
        className="flex items-center gap-1.5 text-label-md text-on-surface-variant transition-colors hover:text-error"
      >
        <Icon name="logout" />
        Salir
      </button>
    </header>
  );
}

// ─── Tabs inferiores (móvil) ──────────────────────────────────────────────────
// En un teléfono la navegación va abajo: es la única zona que el pulgar alcanza
// sin recolocar la mano. Salir NO va acá — un logout entre pestañas se toca por
// accidente y obliga a re-autenticar; se queda en el header.
function PortalBottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-outline-variant bg-surface px-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {portalNav.map(({ to, icon, label, end, shortLabel }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 transition-colors ${
              isActive ? "text-primary" : "text-on-surface-variant"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={icon} filled={isActive} />
              <span className="text-label-xs text-[10px] leading-none">
                {shortLabel ?? label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
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
      <div className="flex min-h-screen flex-col bg-surface text-body-md text-on-surface md:flex-row">
        <PortalSidebar />
        <PortalMobileHeader />
        {/* pt-16 libra el header fijo; pb-24 libra las tabs inferiores */}
        <main className="min-h-screen flex-1 bg-background pt-16 pb-24 md:ml-64 md:pt-0 md:pb-0">
          <Outlet />
        </main>
        <PortalBottomNav />
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
