import { createContext, useContext } from "react";

export interface ClientUser {
  id: string;
  email: string;
  name: string;
  role: "client";
}

export interface ClientAuthState {
  user: ClientUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const ClientAuthContext = createContext<ClientAuthState | null>(null);

export function useClientAuth(): ClientAuthState {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error("useClientAuth must be used inside PortalRootLayout");
  return ctx;
}
