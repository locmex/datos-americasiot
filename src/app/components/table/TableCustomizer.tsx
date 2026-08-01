import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/icon";
import type { ColumnDef, RowDensity } from "./useTableColumns";

// Panel "Personalizar tabla".
//
// En escritorio es un popover anclado al botón; en móvil una hoja inferior a
// ancho completo, porque un popover de 280px sobre una pantalla de 360 es un
// modal disfrazado y encima queda fuera del alcance del pulgar.

const DENSITIES: { value: RowDensity; icon: string; label: string }[] = [
  { value: "compact",     icon: "density_small",  label: "Compacta" },
  { value: "normal",      icon: "density_medium", label: "Normal" },
  { value: "comfortable", icon: "density_large",  label: "Amplia" },
];

export function TableCustomizer<T extends string>({
  columns, isVisible, toggle, reset,
  density, setDensity, columnLines, setColumnLines,
}: {
  columns: ColumnDef<T>[];
  isVisible: (key: T) => boolean;
  toggle: (key: T) => void;
  reset: () => void;
  density: RowDensity;
  setDensity: (d: RowDensity) => void;
  columnLines: boolean;
  setColumnLines: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = columns.filter((c) => isVisible(c.key));
  const hidden = columns.filter((c) => !isVisible(c.key));

  const panel = (
    <div className="flex flex-col gap-5 p-card-padding">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-headline-sm text-headline-sm text-on-surface">Personalizar tabla</h3>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="tap-target flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      {/* Altura de fila */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-body-md text-body-md text-on-surface-variant">Altura de fila</span>
        <div className="flex gap-1">
          {DENSITIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDensity(d.value)}
              title={d.label}
              aria-label={d.label}
              aria-pressed={density === d.value}
              className={`tap-target flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                density === d.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <Icon name={d.icon} className="text-[18px]" />
            </button>
          ))}
        </div>
      </div>

      {/* Líneas de columna */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-body-md text-body-md text-on-surface-variant">Líneas de columna</span>
        <button
          role="switch"
          aria-checked={columnLines}
          aria-label="Líneas de columna"
          onClick={() => setColumnLines(!columnLines)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            columnLines ? "bg-primary-container" : "bg-outline-variant"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow transition-transform ${
              columnLines ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="border-t border-outline-variant" />

      {/* Columnas */}
      <ColumnGroup
        title={`Columnas mostradas (${shown.length}/${columns.length})`}
        items={shown}
        checked
        isVisible={isVisible}
        toggle={toggle}
      />

      {hidden.length > 0 && (
        <>
          <div className="border-t border-outline-variant" />
          <ColumnGroup
            title={`Columnas ocultas (${hidden.length}/${columns.length})`}
            items={hidden}
            checked={false}
            isVisible={isVisible}
            toggle={toggle}
          />
        </>
      )}

      <button
        onClick={reset}
        className="tap-target self-start text-left font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
      >
        Restablecer valores por defecto
      </button>
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        title="Personalizar tabla"
        aria-label="Personalizar tabla"
        className="tap-target flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface-variant transition-colors hover:bg-surface-container"
      >
        <Icon name="tune" className="text-[18px]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-inverse-surface/40" onClick={() => setOpen(false)} />

          {/* Móvil: hoja inferior. Escritorio: panel anclado a la derecha. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Personalizar tabla"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl bg-surface-container-lowest shadow-lg
                       sm:inset-x-auto sm:right-6 sm:top-24 sm:bottom-auto sm:max-h-[70vh] sm:w-80 sm:rounded-xl"
          >
            {panel}
          </div>
        </>
      )}
    </>
  );
}

function ColumnGroup<T extends string>({
  title, items, checked, toggle,
}: {
  title: string;
  items: ColumnDef<T>[];
  checked: boolean;
  isVisible: (key: T) => boolean;
  toggle: (key: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="mb-1 font-body-sm text-body-sm text-on-surface-variant">{title}</p>
      {items.map((c) => (
        <label
          key={c.key}
          className={`flex min-h-[44px] items-center gap-3 rounded-lg px-2 transition-colors ${
            c.locked ? "opacity-60" : "cursor-pointer hover:bg-surface-container-low"
          }`}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={c.locked}
            onChange={() => toggle(c.key)}
            className="h-4 w-4 shrink-0 rounded border-outline-variant accent-[var(--color-primary-container)]"
          />
          <span className="font-body-md text-body-md text-on-surface">{c.label}</span>
          {c.locked && (
            <Icon name="lock" className="ml-auto text-[16px] text-on-surface-variant" title="Columna fija" />
          )}
        </label>
      ))}
    </div>
  );
}
