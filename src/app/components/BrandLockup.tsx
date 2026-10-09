/**
 * Logotipo de Americas IoT, idéntico al del header de la landing
 * (americas-iot-web/src/components/brand/Logo.astro): globo con arcos en
 * blanco + "AMERICAS / IoT" en Volte. Está hecho para fondo oscuro (#1a0450).
 */
interface BrandLockupProps {
  /** "md" = barra lateral y login; "sm" = cabecera móvil */
  size?: "sm" | "md";
}

export function BrandLockup({ size = "md" }: BrandLockupProps) {
  const sm = size === "sm";
  return (
    <span className="inline-flex items-center gap-3" style={{ fontFamily: "Volte, ui-sans-serif, system-ui, sans-serif" }}>
      <img
        src="/login/logo-globo.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className={sm ? "block h-8 w-8 shrink-0" : "block h-11 w-11 shrink-0"}
      />
      <span className="leading-none">
        <span
          className={`block font-medium tracking-[0.3em] ${sm ? "text-[0.56rem]" : "text-[0.68rem]"}`}
          style={{ color: "#b6abc9" }}
        >
          AMERICAS
        </span>
        <span
          className={`mt-0.5 block font-bold tracking-tight ${sm ? "text-[1.3rem]" : "text-[1.7rem]"}`}
          style={{ color: "#f4f0fa" }}
        >
          IoT
        </span>
      </span>
      <span className="sr-only">Americas IoT</span>
    </span>
  );
}
