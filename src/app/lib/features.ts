/* Feature flags, resolved at build time from Vite env vars.
   Billing (invoices, plans, client "Mis Facturas") stays hidden unless
   VITE_FEATURE_BILLING=true is set in the build environment. Off by default
   so production never exposes it by accident. The backend endpoints and the
   SIM period sync keep running either way; this only gates the UI. */
export const BILLING_ENABLED = import.meta.env.VITE_FEATURE_BILLING === "true";
