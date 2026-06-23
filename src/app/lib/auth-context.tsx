import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;          // "admin" | "client"
  organisation?: string;
}

interface AuthState {
  user: AuthUser | null;
  sessionId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("iot_session_id");
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setSessionId(stored);

    api.me()
      .then((res) => setUser(res.user))
      .catch(() => {
        localStorage.removeItem("iot_session_id");
        localStorage.removeItem("iot_user");
        localStorage.removeItem("portal_session_id");
        setSessionId(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    // Always store under the admin key (used by api module)
    localStorage.setItem("iot_session_id", res.sessionId);
    localStorage.setItem("iot_user", JSON.stringify(res.user));
    // If client role, ALSO store under portal key so ClientAuthProvider finds it
    if (res.user.role === "client") {
      localStorage.setItem("portal_session_id", res.sessionId);
    }
    setSessionId(res.sessionId);
    setUser(res.user);
  };

  const logout = async () => {
    try { await api.logout(); } catch (_) {}
    localStorage.removeItem("iot_session_id");
    localStorage.removeItem("iot_user");
    localStorage.removeItem("portal_session_id");
    setSessionId(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, sessionId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
