// ─── Sistema de color del Portal ──────────────────────────────────────────────
// Regla (skill dataviz): el color comunica ESTADO, no decora.
// La paleta de estado es RESERVADA (good/warning/muted/danger) y siempre
// se acompaña de ícono + label — nunca color solo.
//
// Cada token trae un par consistente:
//   text  → color de texto/ícono (contraste sobre blanco)
//   solid → color pleno (borde activo, punto de conexión)
//   tint  → fondo suave (pill, card seleccionada)

export interface Tone {
  text: string;
  solid: string;
  tint: string;
}

// Marca AmericasIoT — el teal es la identidad. "Activo/online" = marca.
export const BRAND: Tone = {
  text: "#059669",
  solid: "#3ECF8E",
  tint: "rgba(5,150,105,0.10)",
};

export const STATUS_TOKENS: Record<"good" | "warning" | "muted" | "danger", Tone> = {
  good:    { text: "#059669", solid: "#10b981", tint: "rgba(5,150,105,0.10)" },
  warning: { text: "#d97706", solid: "#f59e0b", tint: "rgba(217,119,6,0.10)" },
  muted:   { text: "#64748b", solid: "#94a3b8", tint: "rgba(100,116,139,0.10)" },
  danger:  { text: "#dc2626", solid: "#ef4444", tint: "rgba(220,38,38,0.10)" },
};
