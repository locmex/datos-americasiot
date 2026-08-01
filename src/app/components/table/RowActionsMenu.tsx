import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/icon";

// Acciones de fila detrás de un `⋮`.
//
// Reemplaza a los iconos revelados por hover: en táctil no existe el hover, así
// que esos iconos o quedaban siempre visibles apretando la fila, o eran
// invisibles. Un menú explícito resuelve las dos cosas y además escala a más de
// dos acciones.
//
// Móvil: hoja inferior a ancho completo, al alcance del pulgar.
// Escritorio: menú anclado al botón.

export interface RowAction {
  icon: string;
  label: string;
  /**
   * Recibe el botón `⋮` como ancla. Sirve para que un popover de confirmación
   * se posicione contra algo real: sin ancla, popper.js lo deja en la esquina
   * superior izquierda.
   */
  onSelect: (anchor: HTMLElement | null) => void;
  disabled?: boolean;
  /** Acciones destructivas: se pintan en rojo y van al final. */
  danger?: boolean;
}

export function RowActionsMenu({
  actions, title = "Acciones rápidas", label = "Acciones de la fila",
}: {
  actions: RowAction[];
  title?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const run = (a: RowAction) => {
    if (a.disabled) return;
    setOpen(false);
    a.onSelect(triggerRef.current);
  };

  const items: ReactNode = actions.map((a) => (
    <button
      key={a.label}
      onClick={(e) => { e.stopPropagation(); run(a); }}
      disabled={a.disabled}
      className={`flex min-h-[44px] w-full items-center gap-3 px-4 text-left font-body-md text-body-md transition-colors disabled:opacity-40 ${
        a.danger
          ? "text-error hover:bg-error-container"
          : "text-on-surface hover:bg-surface-container-low"
      }`}
    >
      <Icon name={a.icon} className="text-[20px]" />
      {a.label}
    </button>
  ));

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget.getBoundingClientRect());
          setOpen(true);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="tap-target flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container"
      >
        <Icon name="more_vert" className="text-[20px]" />
      </button>

      {open && createPortal(
        <>
          <div
            className="fixed inset-0 z-[70] bg-inverse-surface/40 sm:bg-transparent"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          />

          {/* Móvil: hoja inferior con título */}
          <div
            role="menu"
            className="fixed inset-x-0 bottom-0 z-[71] rounded-t-xl bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] shadow-lg sm:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
              <span className="font-headline-sm text-headline-sm text-on-surface">{title}</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="tap-target flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
            <div className="flex flex-col py-2">{items}</div>
          </div>

          {/* Escritorio: menú anclado */}
          {anchor && (
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[71] hidden w-60 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-lg sm:block"
              style={{
                top: Math.min(anchor.bottom + 4, window.innerHeight - 8),
                left: Math.max(8, anchor.right - 240),
              }}
            >
              {items}
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
