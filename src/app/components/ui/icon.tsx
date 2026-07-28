import type { CSSProperties } from "react";

/**
 * Icono del design system (Material Symbols Outlined).
 *
 * El nombre es el identificador de Material Symbols, por ejemplo:
 * `devices`, `shopping_cart`, `receipt_long`, `check_circle`, `sms`.
 *
 * `filled` activa el eje FILL del variable font (para estados "sólidos",
 * como el check de una SIM activa).
 */
export function Icon({
  name,
  className = "",
  filled = false,
  style,
  title,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      title={title}
      className={`material-symbols-outlined select-none ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1", ...style } : style}
    >
      {name}
    </span>
  );
}
