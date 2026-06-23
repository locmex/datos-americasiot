import { createHashRouter, Navigate, Outlet } from "react-router";
import { AuthProvider } from "./lib/auth-context";
import { AppLayout } from "./components/layout/AppLayout";
import { PortalRootLayout } from "./components/layout/ClientPortalLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import ClientsPage from "./pages/ClientsPage";
import AssignmentPage from "./pages/AssignmentPage";
import DevicesPage from "./pages/DevicesPage";
import ClientPortalDashboard from "./pages/portal/ClientPortalDashboard";

function AdminRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

// createHashRouter → URLs use # fragment — never hits the server for sub-paths.
// Admin:  /#/dashboard, /#/devices, /#/clients …
// Client: /#/portal
// Both roles log in at /#/ (the unified login page).
export const router = createHashRouter([
  // ── Admin + Client login (unified) ───────────────────────────────────────────
  {
    path: "/",
    Component: AdminRoot,
    children: [
      { index: true, Component: LoginPage },
      { path: "login", element: <Navigate to="/" replace /> },
      {
        Component: AppLayout,
        children: [
          { path: "dashboard",  Component: DashboardPage  },
          { path: "devices",    Component: DevicesPage    },
          { path: "inventory",  Component: InventoryPage  },
          { path: "clients",    Component: ClientsPage    },
          { path: "assignment", Component: AssignmentPage },
          { path: "*",          element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },

  // ── Client portal (dashboard only — login is now at /#/) ─────────────────────
  // PortalRootLayout checks for portal_session_id and redirects to / if absent.
  {
    path: "/portal",
    Component: PortalRootLayout,
    children: [
      { index: true, Component: ClientPortalDashboard },
      // Legacy /portal/login → back to unified login
      { path: "login", element: <Navigate to="/" replace /> },
      { path: "*",     element: <Navigate to="/portal" replace /> },
    ],
  },
]);
