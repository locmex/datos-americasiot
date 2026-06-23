import React, { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router";
import { LogOut } from "lucide-react";
import { clientApi } from "../../lib/api";
import { ClientAuthContext, ClientUser } from "../../lib/client-auth";
import { AmericasIoTLogo } from "../AmericasIoTLogo";

// ─── Auth Provider (single instance for ALL portal routes) ────────────────────
function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: restore session if one is stored in localStorage
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
    // Store session ID and immediately set user — no second server round-trip needed
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

// ─── Portal Header (only shown when logged in) ────────────────────────────────
function PortalHeader() {
  const ctx = useContext(ClientAuthContext)!;
  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 md:px-6 h-14"
      style={{ background: "#ffffff", borderBottom: "1px solid #e8e8ed" }}
    >
      <div className="flex items-center gap-3">
        <AmericasIoTLogo height={26} forceLight />
        <span
          className="hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(62,207,142,0.12)", color: "#0d8f5c" }}
        >
          Portal Cliente
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs font-semibold leading-tight" style={{ color: "#1a1a1a" }}>
            Hola, <span style={{ color: "#059669" }}>{ctx.user?.name?.split(" ")[0]}</span> 👋
          </p>
          <p className="hidden sm:block text-[10px] leading-tight" style={{ color: "#adadb8" }}>
            {ctx.user?.email}
          </p>
        </div>
        <button
          onClick={ctx.logout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ color: "#e11d48", background: "#fff1f2" }}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function PortalLoading() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#f2f4f7" }}>
      <div className="text-center space-y-4">
        <div className="relative w-12 h-12 mx-auto">
          <div
            className="absolute inset-0 rounded-2xl animate-pulse"
            style={{ background: "rgba(62,207,142,0.15)" }}
          />
          <div className="absolute inset-3 rounded-xl" style={{ background: "#3ECF8E" }} />
        </div>
        <p className="text-xs font-medium" style={{ color: "#adadb8" }}>
          Cargando portal...
        </p>
      </div>
    </div>
  );
}

// ─── Portal Router (auth guard + layout switcher) ─────────────────────────────
// This runs INSIDE the single ClientAuthProvider — no double-init possible.
function PortalRouter() {
  const ctx      = useContext(ClientAuthContext)!;
  const location = useLocation();
  const isLoginPage = location.pathname === "/portal/login";

  // Still checking stored session
  if (ctx.isLoading) return <PortalLoading />;

  // Not authenticated → send to the unified login page at /
  if (!ctx.user && !isLoginPage) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Authenticated + trying to see login → dashboard
  if (ctx.user && isLoginPage) {
    return <Navigate to="/portal" replace />;
  }

  // Authenticated: show header + content
  if (ctx.user) {
    return (
      <div className="min-h-screen" style={{ background: "#f2f4f7" }}>
        <PortalHeader />
        <main className="pt-14">
          <Outlet />
        </main>
      </div>
    );
  }

  // Not authenticated + on login (legacy path): redirect to /
  return <Navigate to="/" replace />;
}

// ─── Public export: single root for all /portal/** routes ─────────────────────
export function PortalRootLayout() {
  return (
    <ClientAuthProvider>
      <PortalRouter />
    </ClientAuthProvider>
  );
}

// Legacy aliases kept so any other import still compiles
export function ClientPortalLayout()       { return <PortalRootLayout />; }
export function ClientPortalLoginWrapper() { return <PortalRootLayout />; }