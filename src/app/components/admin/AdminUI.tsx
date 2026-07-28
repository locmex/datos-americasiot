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

// ─── Card con tabla ──────────────────────────────────────────────────────────
export function TableCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest ${className}`}>
      <div className="overflow-x-auto">{children}</div>
    </div>
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

// ─── Chip de estado activo / inactivo ────────────────────────────────────────
export function ActiveChip({
  active, onClick, busy,
}: {
  active: boolean;
  onClick?: () => void;
  busy?: boolean;
}) {
  const cls = active
    ? "bg-primary/10 text-primary"
    : "bg-on-surface-variant/10 text-on-surface-variant";
  const content = (
    <>
      <Icon
        name={busy ? "progress_activity" : active ? "check_circle" : "pause_circle"}
        className={`text-[14px] ${busy ? "animate-spin" : ""}`}
      />
      {active ? "Activo" : "Inactivo"}
    </>
  );

  if (!onClick) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-xs ${cls}`}>
        {content}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={active ? "Desactivar" : "Activar"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-xs transition-opacity hover:opacity-80 disabled:opacity-50 ${cls}`}
    >
      {content}
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
