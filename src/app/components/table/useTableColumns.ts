import { useCallback, useEffect, useMemo, useState } from "react";

// Preferencias de tabla por usuario.
//
// En móvil la tabla NO colapsa a tarjetas: el usuario reduce las columnas a lo
// que le importa. Por eso esta preferencia es el mecanismo responsive, no un
// adorno — y tiene que sobrevivir a la recarga.
//
// Se guarda en localStorage: es una preferencia de presentación, por dispositivo,
// sin ningún valor fuera de este navegador. No justifica una tabla ni una
// migración.

export interface ColumnDef<T extends string> {
  /** Clave estable. Cambiarla invalida la preferencia guardada de ese usuario. */
  key: T;
  label: string;
  /** Nunca se puede ocultar (el identificador de la fila). */
  locked?: boolean;
  /** Fuera de la selección por defecto. */
  hiddenByDefault?: boolean;
}

export type RowDensity = "compact" | "normal" | "comfortable";

export const DENSITY_CLASS: Record<RowDensity, string> = {
  compact: "py-1.5",
  normal: "py-3",
  comfortable: "py-5",
};

interface StoredPrefs<T extends string> {
  visible: T[];
  density: RowDensity;
  columnLines: boolean;
}

function readPrefs<T extends string>(storageKey: string): Partial<StoredPrefs<T>> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // localStorage puede fallar en modo privado o con la cuota llena. Una
    // preferencia de columnas no vale romper la pantalla.
    return null;
  }
}

export function useTableColumns<T extends string>(
  storageKey: string,
  columns: ColumnDef<T>[],
) {
  const defaults = useMemo(
    () => columns.filter((c) => c.locked || !c.hiddenByDefault).map((c) => c.key),
    [columns],
  );

  const [visible, setVisible] = useState<T[]>(defaults);
  const [density, setDensity] = useState<RowDensity>("normal");
  const [columnLines, setColumnLines] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar una sola vez, descartando claves que ya no existen (una columna
  // renombrada o eliminada no debe dejar la tabla en un estado imposible).
  useEffect(() => {
    const stored = readPrefs<T>(storageKey);
    if (stored) {
      const valid = new Set(columns.map((c) => c.key));
      const locked = columns.filter((c) => c.locked).map((c) => c.key);
      if (Array.isArray(stored.visible)) {
        const kept = stored.visible.filter((k) => valid.has(k));
        const withLocked = [...new Set([...locked, ...kept])];
        if (withLocked.length > 0) setVisible(withLocked);
      }
      if (stored.density) setDensity(stored.density);
      if (typeof stored.columnLines === "boolean") setColumnLines(stored.columnLines);
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ visible, density, columnLines }));
    } catch {
      // Ver nota en readPrefs.
    }
  }, [hydrated, storageKey, visible, density, columnLines]);

  const toggle = useCallback(
    (key: T) => {
      const col = columns.find((c) => c.key === key);
      if (col?.locked) return;
      setVisible((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      );
    },
    [columns],
  );

  const reset = useCallback(() => {
    setVisible(defaults);
    setDensity("normal");
    setColumnLines(false);
  }, [defaults]);

  /** Columnas visibles en el orden declarado, no en el orden de selección. */
  const visibleColumns = useMemo(
    () => columns.filter((c) => visible.includes(c.key)),
    [columns, visible],
  );

  const isVisible = useCallback((key: T) => visible.includes(key), [visible]);

  return {
    columns,
    visibleColumns,
    isVisible,
    toggle,
    reset,
    density,
    setDensity,
    densityClass: DENSITY_CLASS[density],
    columnLines,
    setColumnLines,
  };
}
