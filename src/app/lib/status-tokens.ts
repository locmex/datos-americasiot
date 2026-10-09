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

// Marca Americas IoT — morado. Ya no se confunde con "activo/online",
// que es verde de estado (STATUS_TOKENS.good).
export const BRAND: Tone = {
  text: "#4a20c4",
  solid: "#270779",
  tint: "rgba(74,32,196,0.10)",
};

export const STATUS_TOKENS: Record<"good" | "warning" | "muted" | "danger", Tone> = {
  good:    { text: "#15803d", solid: "#16a34a", tint: "rgba(22,163,74,0.10)" },
  warning: { text: "#b45309", solid: "#f59e0b", tint: "rgba(217,119,6,0.10)" },
  muted:   { text: "#57536a", solid: "#9a95ab", tint: "rgba(87,83,106,0.10)" },
  danger:  { text: "#b91c1c", solid: "#ef4444", tint: "rgba(220,38,38,0.10)" },
};
