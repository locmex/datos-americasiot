/* Función pura de prorrateo — sin imports de Deno ni Node (solo Date + aritmética).
   Fuente única compartida: el edge la importa como "./billing/proration.ts",
   Vitest la importa como "./proration.ts" (Vite resuelve la extensión .ts).

   Zona fija: UTC-6 (America/Mexico_City, sin DST post-2023). Se compara por instantes. */

export type Period = { activatedAt: string; deactivatedAt: string | null };

const MX = 6 * 3600e3; // offset ms (UTC-6)

const startOfM = (y: number, m: number) => Date.UTC(y, m - 1, 1) + MX;
const startNext = (y: number, m: number) => Date.UTC(m === 12 ? y + 1 : y, m % 12, 1) + MX;
const mxDay = (iso: string) => new Date(Date.parse(iso) - MX).getUTCDate();

function overlaps(p: Period, y: number, m: number): boolean {
  const a = Date.parse(p.activatedAt);
  const s = startOfM(y, m);
  const e = startNext(y, m);
  const d = p.deactivatedAt ? Date.parse(p.deactivatedAt) : Infinity;
  return a < e && d >= s; // vigente >=1 día del mes M
}

export function isSimBillable(periods: Period[], year: number, month: number): boolean {
  return periods.some((p) => overlaps(p, year, month));
}

export function computeProrationFactor(
  periods: Period[],
  year: number,
  month: number,
): 0 | 0.5 | 1 {
  const ov = periods.filter((p) => overlaps(p, year, month));
  if (!ov.length) return 0;
  if (ov.some((p) => Date.parse(p.activatedAt) < startOfM(year, month))) return 1; // venía de antes → 100%
  const firstDay = Math.min(...ov.map((p) => mxDay(p.activatedAt))); // primera vigencia del mes
  return firstDay <= 15 ? 1 : 0.5;
}
