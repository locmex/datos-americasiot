import React, { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router";
import { clientApi } from "../../lib/api";
import { ClientAuthContext, ClientUser } from "../../lib/client-auth";
import { BrandLockup } from "../BrandLockup";
import { Icon } from "../ui/icon";
import { BILLING_ENABLED } from "../../lib/features";

// `shortLabel` es lo que se muestra en las tabs inferiores: en un ancho de
// teléfono "Mis Dispositivos" no entra sin truncarse.
const portalNav = [
  { to: "/portal",          icon: "devices",       label: "Mis Dispositivos", shortLabel: "Dispositivos", end: true },
  { to: "/portal/orders",   icon: "shopping_cart", label: "Pedidos",          shortLabel: "Pedidos" },
  ...(BILLING_ENABLED
    ? [{ to: "/portal/invoices", icon: "receipt_long", label: "Mis Facturas", shortLabel: "Facturas" }]
    : []),
];

// ─── Sidebar (desktop) ────────────────────────────────────────────────────────
function PortalSidebar() {
  const ctx = useContext(ClientAuthContext)!;
  const initial = ctx.user?.name?.charAt(0)?.toUpperCase()
    || ctx.user?.email?.charAt(0)?.toUpperCase()
    || "C";

  return (
    <nav
      className="hidden md:flex flex-col h-screen py-6 px-3 fixed left-0 top-0 w-64 z-50"
      style={{ background: "#1a0450", color: "#b6abc9" }}
      aria-label="Secciones"
    >
      <div className="mb-8 px-2">
        <BrandLockup />
      </div>

      {/* Usuario */}
      <div className="flex items-center gap-3 px-4 mb-8">
        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-white" style={{ background: "#35109c" }}>
          {initial}
        </div>
        <div className="min-w-0">
          <p className="font-label-md text-label-md text-white truncate">
            Hola, {ctx.user?.name?.split(" ")[0] ?? "Cliente"}
          </p>
          <p className="font-body-sm text-body-sm" style={{ color: "#b6abc9" }}>Portal del cliente</p>
        </div>
      </div>

      {/* Navegación */}
      <div className="flex-1 flex flex-col gap-0.5">
        {portalNav.map(({ to, icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative rounded-lg px-4 py-2 flex items-center gap-3 font-label-md text-label-md transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-[#b6abc9] hover:bg-white/5 hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r" style={{ background: "#22e4c8" }} />
                )}
                <Icon name={icon} filled={isActive} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Salir */}
      <div className="mt-auto border-t border-white/10 pt-3">
        <button
          onClick={ctx.logout}
          className="w-full flex items-center gap-3 px-4 py-2 text-[#b6abc9] hover:bg-white/5 hover:text-white transition-colors rounded-lg font-label-md text-label-md"
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
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between px-container-margin"
      style={{ background: "#1a0450" }}
    >
      <BrandLockup size="sm" />
      <button
        onClick={ctx.logout}
        className="flex items-center gap-1.5 text-label-md text-[#d8cffa] transition-colors hover:text-white"
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
