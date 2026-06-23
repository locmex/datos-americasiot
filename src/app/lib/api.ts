import { projectId, publicAnonKey } from "/utils/supabase/info";

export const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ef736a01`;

// ── Admin API (uses iot_session_id) ──────────────────────────────────────────
function getSessionId(): string {
  return localStorage.getItem("iot_session_id") || "";
}

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const sessionId = getSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
  };
  if (sessionId) headers["X-IoT-Session"] = sessionId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401) {
    // Session expired or invalid — clear and redirect to admin login
    localStorage.removeItem("iot_session_id");
    localStorage.removeItem("iot_user");
    if (typeof window !== "undefined") {
      // With hash routing the path lives in window.location.hash, not pathname
      const isPortal = window.location.hash.startsWith("#/portal");
      if (!isPortal) window.location.href = "/";
    }
    throw new Error(data.error || "Sesión expirada. Por favor, inicia sesión nuevamente.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body: any) => request<T>("POST", path, body),
  patch: <T = any>(path: string, body: any) => request<T>("PATCH", path, body),
  delete: <T = any>(path: string) => request<T>("DELETE", path),

  // AUTH (admin)
  login: (email: string, password: string) =>
    request("POST", "/auth/login", { email, password }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),

  // EMNIFY
  getSims: (page = 0, perPage = 50, q = "", statusId?: number | null) =>
    request("GET", `/emnify/sims?page=${page}&per_page=${perPage}&q=${encodeURIComponent(q)}${statusId != null ? `&status=${statusId}` : ""}`),
  getSimById: (id: string | number) => request("GET", `/emnify/sims/${id}`),
  updateSimStatus: (id: string | number, statusId: number, iccid?: string) =>
    request("PATCH", `/emnify/sims/${id}/status`, { statusId, iccid }),
  getEndpoints: (page = 0, perPage = 10, q = "") =>
    request("GET", `/emnify/endpoints?page=${page}&per_page=${perPage}&q=${encodeURIComponent(q)}`),
  getEndpointById: (id: string | number) =>
    request("GET", `/emnify/endpoints/${id}`),
  getDeviceLocation: (id: string | number) =>
    request("GET", `/emnify/endpoints/${id}/location`),
  getServiceProfiles: () => request("GET", "/emnify/service-profiles"),
  getTariffProfiles: () => request("GET", "/emnify/tariff-profiles"),
  createEndpoint: (data: {
    name: string;
    service_profile_id: number;
    tariff_profile_id: number;
    imei_lock?: boolean;
    imei?: string;
    tags?: string[];
  }) => request("POST", "/emnify/endpoints", data),
  updateEndpoint: (id: string | number, body: any) =>
    request("PATCH", `/emnify/endpoints/${id}`, body),
  resetEndpointConnectivity: (id: string | number) =>
    request("DELETE", `/emnify/endpoints/${id}/connectivity`),
  sendDeviceSms: (id: string | number, message: string, source = "AmericasIoT") =>
    request("POST", `/emnify/endpoints/${id}/sms`, { message, source }),
  getSmsHistory: (id: string | number, page = 1, perPage = 50) =>
    request("GET", `/emnify/endpoints/${id}/sms?page=${page}&per_page=${perPage}`),
  setImeiLock: (id: string | number, locked: boolean) =>
    request("PATCH", `/emnify/endpoints/${id}`, { imei_lock: locked }),
  detachSim: (id: string | number) =>
    request("DELETE", `/emnify/endpoints/${id}/sim`),
  assignSimToEndpoint: (endpointId: string | number, simId: number) =>
    request("POST", `/emnify/endpoints/${endpointId}/assign-sim`, { sim_id: simId }),
  deleteEndpoint: (id: string | number) =>
    request("DELETE", `/emnify/endpoints/${id}`),
  getStats: () => request("GET", "/emnify/stats"),
  getDataUsage: () => request("GET", "/emnify/data-usage"),
  debugVolume: () => request("GET", "/emnify/debug-volume"),
  cacheClear: () => request("POST", "/emnify/cache-clear"),

  // SIM detail — events & daily stats
  getSimEvents: (simId: string | number, page = 1, perPage = 5) =>
    request("GET", `/emnify/sims/${simId}/events?page=${page}&per_page=${perPage}`),
  getSimDailyStats: (simId: string | number, endpointId?: string | number, period: "week" | "last_week" | "month" | "last_month" | "two_months" = "week") =>
    request("GET", `/emnify/sims/${simId}/stats?period=${period}${endpointId ? `&endpoint_id=${endpointId}` : ""}`),

  // SIM registration via BIC
  registerSimBic1: (bic: string) => request("POST", "/sims/register-bic1", { bic }),
  registerSimBic2: (bic2: string) => request("POST", "/sims/register-bic2", { bic2 }),

  // CHIPS (local inventory)
  getChips: () => request("GET", "/chips"),
  addChips: (iccids: string[]) => request("POST", "/chips", { iccids }),
  assignChip: (iccid: string, clientId: string, clientName: string) =>
    request("POST", `/chips/${iccid}/assign`, { clientId, clientName }),
  unassignChip: (iccid: string) => request("POST", `/chips/${iccid}/unassign`),
  bulkAssign: (iccids: string[], clientId: string, clientName: string) =>
    request("POST", "/chips/bulk-assign", { iccids, clientId, clientName }),
  bulkUnassign: (iccids: string[]) =>
    request("POST", "/chips/bulk-unassign", { iccids }),
  deleteChip: (iccid: string) => request("DELETE", `/chips/${encodeURIComponent(iccid)}`),

  // CLIENTS
  getClients: () => request("GET", "/clients"),
  createClient: (data: any) => request("POST", "/clients", data),
  updateClient: (id: string, data: any) => request("PATCH", `/clients/${id}`, data),
  deleteClient: (id: string) => request("DELETE", `/clients/${id}`),
  setPortalPassword: (clientId: string, password: string) =>
    request("POST", `/clients/${clientId}/set-portal-password`, { password }),

  // USERS (portal access)
  getUsers: () => request("GET", "/users"),
  createUser: (data: any) => request("POST", "/users", data),
  updateUserRole: (id: string, role: string) =>
    request("PATCH", `/users/${id}/role`, { role }),
  deleteUser: (id: string) => request("DELETE", `/users/${id}`),

  // ACTIVITY
  getActivity: () => request("GET", "/activity"),
};

// ── Client Portal API (uses portal_session_id) ───────────────────────────────
function getPortalSessionId(): string {
  return localStorage.getItem("portal_session_id") || "";
}

async function clientRequest<T = any>(method: string, path: string, body?: any): Promise<T> {
  const sessionId = getPortalSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
  };
  if (sessionId) headers["X-IoT-Session"] = sessionId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401) {
    // Client session expired — clear local storage and throw.
    // Navigation back to /portal/login is handled by PortalRouter in the layout.
    localStorage.removeItem("portal_session_id");
    throw new Error(data.error || "Sesión expirada. Por favor, inicia sesión nuevamente.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

export const clientApi = {
  login: (email: string, password: string) =>
    clientRequest("POST", "/auth/client-login", { email, password }),
  logout: () => clientRequest("POST", "/auth/logout"),
  me: () => clientRequest("GET", "/auth/me"),

  // Client portal operations
  getMySims: () => clientRequest("GET", "/client/sims"),
  getSimsConnectivity: () => clientRequest("GET", "/client/sims/connectivity"),
  getDeviceDetail: (endpointId: string | number) =>
    clientRequest("GET", `/client/devices/${endpointId}`),
  getDeviceEvents: (endpointId: string | number, page = 1, perPage = 5) =>
    clientRequest("GET", `/client/devices/${endpointId}/events?page=${page}&per_page=${perPage}`),
  getDeviceStats: (endpointId: string | number, period = "week") =>
    clientRequest("GET", `/client/devices/${endpointId}/stats?period=${period}`),
  updateSimStatus: (simId: string | number, statusId: number, iccid: string) =>
    clientRequest("PATCH", `/client/sims/${simId}/status`, { statusId, iccid }),
  sendSms: (endpointId: string | number, message: string, iccid: string) =>
    clientRequest("POST", `/client/sims/${endpointId}/sms`, { message, iccid }),
  getSmsHistory: (endpointId: string | number, page = 1, perPage = 50) =>
    clientRequest("GET", `/client/devices/${endpointId}/sms?page=${page}&per_page=${perPage}`),
  getSimUsage: (endpointId: string | number, iccid: string) =>
    clientRequest("GET", `/client/sims/${endpointId}/usage?iccid=${encodeURIComponent(iccid)}`),
  resetDeviceConnectivity: (endpointId: string | number) =>
    clientRequest("POST", `/client/devices/${endpointId}/reset-connectivity`, {}),
  renameDevice: (endpointId: string | number, name: string) =>
    clientRequest("PATCH", `/client/devices/${endpointId}/name`, { name }),
};