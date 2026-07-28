// Primitivos visuales del panel admin.
//
// Las 9 pantallas del panel comparten la misma anatomía: encabezado con
// acciones, buscador, tabla dentro de una card con encabezado fijo, estado
// vacío y modales. Vivían copiados en cada página, lo que hacía que cualquier
// ajuste del design system tuviera que replicarse nueve veces.
//
// Todo acá usa exclusivamente tokens de `stitch-theme.css`.

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Icon } from "../ui/icon";

// ─── Encabezado de página ────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-gutter flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-1 text-display-md text-on-background">{title}</h1>
        {subtitle && <p className="text-body-lg text-on-surface-variant">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── Botón sólo-icono (recargar, cerrar…) ────────────────────────────────────
export function IconButton({
  icon, onClick, title, disabled, spinning, tone = "neutral",
}: {
  icon: string;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  spinning?: boolean;
  tone?: "neutral" | "danger";
}) {
  const tones = {
    neutral: "text-on-surface-variant hover:bg-surface-container",
    danger: "text-on-surface-variant hover:bg-error-container hover:text-on-error-container",
  }[tone];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface transition-colors disabled:opacity-50 ${tones}`}
    >
      <Icon name={icon} className={`text-[18px] ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
}

// ─── Buscador ────────────────────────────────────────────────────────────────
export function SearchField({
  value, onChange, placeholder, className = "max-w-md",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-on-surface-variant" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pr-3 pl-10 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

// ─── Campos de formulario ────────────────────────────────────────────────────
export const fieldClass =
  "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60";

export function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-label-md text-on-surface">
        {label} {required && <span className="text-error">*</span>}
      </label>
      {children}
      {hint && <p className="text-body-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

// ─── Banner de error ─────────────────────────────────────────────────────────
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-gutter flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error bg-error-container p-4">
      <div className="flex items-center gap-3">
        <Icon name="error" className="shrink-0 text-error" />
        <p className="text-body-md text-on-error-container">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-error px-3 py-1.5 text-label-md text-on-error transition-opacity hover:opacity-90"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

// ─── Pastillas de filtro ─────────────────────────────────────────────────────
export interface PillOption<T extends string> {
  value: T;
  label: string;
}

export function FilterPills<T extends string>({
  options, value, onChange,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            className={`rounded-lg px-3 py-1.5 text-label-md transition-colors ${
              selected
                ? "btn-primary"
                : "border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Card con tabla ──────────────────────────────────────────────────────────
export function TableCard({
  children, toolbar, className = "",
}: {
  children: ReactNode;
  /** Barra sobre la tabla (filtros a la izquierda, conteo a la derecha). */
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest ${className}`}>
      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** "Mostrando 4 de 124 productos" — contexto de cuánto está filtrado. */
export function ResultCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <p className="text-body-sm text-on-surface-variant">
      Mostrando {shown} de {total} {noun}
    </p>
  );
}

export interface Column {
  label: string;
  align?: "left" | "right" | "center";
  className?: string;
}

/** Encabezado de tabla fijo — imprescindible con listados de 1,500 SIMs. */
export function TableHead({ columns }: { columns: Column[] }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-container-low">
      <tr className="border-b border-outline-variant">
        {columns.map((c, i) => (
          <th
            key={`${c.label}-${i}`}
            className={`px-4 py-3 text-label-xs tracking-wider whitespace-nowrap text-on-surface-variant uppercase ${
              c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
            } ${c.className ?? ""}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** Indicador de orden de columna. Compartido por Dispositivos, Inventario y Asignación. */
export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return <Icon name="unfold_more" className="ml-0.5 inline-block align-middle text-[14px] opacity-30" />;
  }
  return (
    <Icon
      name={dir === "asc" ? "arrow_upward" : "arrow_downward"}
      className="ml-0.5 inline-block align-middle text-[14px] text-primary"
    />
  );
}

export function TableSkeleton({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 w-full animate-pulse rounded bg-surface-container" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Estado vacío ────────────────────────────────────────────────────────────
export function EmptyState({
  icon, title, hint, action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon name={icon} className="mb-3 text-[48px] text-outline-variant" />
      <p className="text-body-md text-on-surface-variant">{title}</p>
      {hint && <p className="mt-1 text-body-sm text-on-surface-variant">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Switch de estado (control) ──────────────────────────────────────────────
// Una badge comunica "esto es un dato", no "esto se toca". Cuando el estado se
// puede cambiar, el control tiene que PARECER un control antes de que el mouse
// llegue: de ahí el switch en vez de una badge clickeable.
export function StatusSwitch({
  active, onToggle, busy, labels = ["Activo", "Inactivo"],
}: {
  active: boolean;
  onToggle: () => void;
  busy?: boolean;
  labels?: [string, string];
}) {
  const label = active ? labels[0] : labels[1];
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={`${label} — click para ${active ? "desactivar" : "activar"}`}
      title={`Click para ${active ? "desactivar" : "activar"}`}
      onClick={onToggle}
      disabled={busy}
      className="group inline-flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-surface-container disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          active ? "bg-primary-container" : "bg-outline-variant"
        }`}
      >
        {busy ? (
          <Icon
            name="progress_activity"
            className="absolute left-1/2 -translate-x-1/2 animate-spin text-[14px] text-on-surface"
          />
        ) : (
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest shadow transition-transform ${
              active ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        )}
      </span>
      <span className={`text-label-md ${active ? "text-on-surface" : "text-on-surface-variant"}`}>
        {label}
      </span>
    </button>
  );
}

// ─── Acciones de fila ────────────────────────────────────────────────────────
export function RowAction({
  icon, onClick, title, tone = "neutral",
}: {
  icon: string;
  onClick: () => void;
  title: string;
  tone?: "neutral" | "danger";
}) {
  const tones = {
    neutral: "text-on-surface-variant hover:bg-surface-container hover:text-primary",
    danger: "text-on-surface-variant hover:bg-error-container hover:text-on-error-container",
  }[tone];

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition-colors ${tones}`}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────
export function Modal({
  open, onClose, title, subtitle, children, size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  // Cerrar con Escape: en un panel de escritorio que se usa horas, tener que
  // ir al mouse para descartar un modal cansa.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-inverse-surface/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-surface-container-lowest shadow-lg sm:rounded-xl ${
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant px-card-padding pt-card-padding pb-4">
          <div className="min-w-0">
            <h3 className="text-headline-sm text-on-surface">{title}</h3>
            {subtitle && <p className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
        <div className="p-card-padding">{children}</div>
      </div>
    </div>
  );
}

// ─── Botones de formulario ───────────────────────────────────────────────────
export function FormActions({
  onCancel, submitLabel, submitting, submittingLabel, icon = "check",
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting?: boolean;
  submittingLabel?: string;
  icon?: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md text-on-surface transition-colors hover:bg-surface-container"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-label-md transition-colors disabled:opacity-50"
      >
        <Icon name={submitting ? "progress_activity" : icon} className={`text-[18px] ${submitting ? "animate-spin" : ""}`} />
        {submitting ? (submittingLabel ?? "Guardando…") : submitLabel}
      </button>
    </div>
  );
}
