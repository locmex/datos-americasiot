import type { CSSProperties } from "react";

/**
 * Icono del design system (Material Symbols Outlined).
 *
 * El nombre es el identificador de Material Symbols, por ejemplo:
 * `devices`, `shopping_cart`, `receipt_long`, `check_circle`, `sms`.
 *
 * `filled` activa el eje FILL del variable font (para estados "sólidos",
 * como el check de una SIM activa).
 *
 * ── Por qué lleva `translate="no"` ──────────────────────────────────────────
 * Material Symbols no dibuja imágenes: usa LIGADURAS. El DOM contiene la
 * palabra literal (`search`) y la fuente la sustituye por el glifo.
 *
 * El traductor de Chrome en Android detecta la página en español, traduce esa
 * palabra suelta a `BUSCAR`, y la fuente ya no encuentra ninguna ligadura con
 * ese nombre: se renderiza el texto crudo, encimado, porque el layout tenía
 * reservados 20px para un glifo.
 *
 * `translate="no"` es el atributo estándar; `notranslate` es el gancho legado
 * que todavía miran algunas versiones de Google Translate. Van los dos.
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
      translate="no"
      className={`material-symbols-outlined notranslate select-none ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1", ...style } : style}
    >
      {name}
    </span>
  );
}
