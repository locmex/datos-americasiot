import { describe, expect, it } from "vitest";
import { computeProrationFactor, isSimBillable, type Period } from "./proration.ts";

// Todas las fechas usan offset explícito -06:00 (America/Mexico_City, sin DST)
// para que el día calendario sea inequívoco sin importar el timezone del runner.

describe("computeProrationFactor / isSimBillable — 15 escenarios (spec invoicing)", () => {
  // 1. Vigente desde antes del período, sin baja → 100%
  it("1. activada en junio, sin baja → julio = 100%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-06-15T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(isSimBillable(periods, 2026, 7)).toBe(true);
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });

  // 2. Alta el día 1 del período → 100%
  it("2. activada 2026-07-01 → julio = 100%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-01T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });

  // 3. Alta el día 15 (borde inferior) → 100%
  it("3. activada 2026-07-15 → julio = 100%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-15T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });

  // 4. Alta el día 16 (borde superior) → 50%
  it("4. activada 2026-07-16 → julio = 50%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-16T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(0.5);
  });

  // 5. Alta el último día del período → 50%
  it("5. activada 2026-07-31 → julio = 50%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-31T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(0.5);
  });

  // 6. Alta, baja y realta en el mismo mes, primera vigencia <=15 → 100%, un solo cargo
  it("6. alta jul-03, baja jul-10, realta jul-20 → julio = 100% (min día=3)", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-03T00:00:00-06:00", deactivatedAt: "2026-07-10T00:00:00-06:00" },
      { activatedAt: "2026-07-20T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });

  // 7. Alta, baja y realta en el mismo mes, primera vigencia >=16 → 50%
  it("7. alta jul-20, baja jul-25, realta jul-28 → julio = 50% (min día=20)", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-20T00:00:00-06:00", deactivatedAt: "2026-07-25T00:00:00-06:00" },
      { activatedAt: "2026-07-28T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(0.5);
  });

  // 8. Vigente desde antes del período, baja a mitad de mes → la baja no prorratea → 100%
  it("8. activada en mayo, baja jul-26 → julio = 100% (la baja no prorratea)", () => {
    const periods: Period[] = [
      { activatedAt: "2026-05-10T00:00:00-06:00", deactivatedAt: "2026-07-26T00:00:00-06:00" },
    ];
    expect(isSimBillable(periods, 2026, 7)).toBe(true);
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });

  // 9. Baja antes del inicio del período → no se factura
  it("9. baja 2026-06-30 → julio NO se factura", () => {
    const periods: Period[] = [
      { activatedAt: "2026-01-01T00:00:00-06:00", deactivatedAt: "2026-06-30T00:00:00-06:00" },
    ];
    expect(isSimBillable(periods, 2026, 7)).toBe(false);
    expect(computeProrationFactor(periods, 2026, 7)).toBe(0);
  });

  // 10. Baja a mitad del período no genera cargo el mes siguiente
  it("10. baja 2026-07-26 → agosto NO se factura", () => {
    const periods: Period[] = [
      { activatedAt: "2026-01-01T00:00:00-06:00", deactivatedAt: "2026-07-26T00:00:00-06:00" },
    ];
    expect(isSimBillable(periods, 2026, 8)).toBe(false);
    expect(computeProrationFactor(periods, 2026, 8)).toBe(0);
  });

  // 11. Reactivación en un mes posterior se trata como alta nueva
  it("11. baja jul-26, realta sep-20 → jul=100%, ago=0%, sep=50%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-05-01T00:00:00-06:00", deactivatedAt: "2026-07-26T00:00:00-06:00" },
      { activatedAt: "2026-09-20T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
    expect(computeProrationFactor(periods, 2026, 8)).toBe(0);
    expect(computeProrationFactor(periods, 2026, 9)).toBe(0.5);
  });

  // 12. SIM nunca activada → no se factura
  it("12. sin períodos → no se factura en ningún mes", () => {
    const periods: Period[] = [];
    expect(isSimBillable(periods, 2026, 7)).toBe(false);
    expect(computeProrationFactor(periods, 2026, 7)).toBe(0);
  });

  // 13. SIM desactivada durante todo el período (único período cerrado antes de M)
  it("13. único período cerrado antes de M → no se incluye en la factura", () => {
    const periods: Period[] = [
      { activatedAt: "2026-02-01T00:00:00-06:00", deactivatedAt: "2026-02-15T00:00:00-06:00" },
    ];
    expect(isSimBillable(periods, 2026, 7)).toBe(false);
    expect(computeProrationFactor(periods, 2026, 7)).toBe(0);
  });

  // 14. SIM suspendida pero vigente todo el período (período abierto desde antes) → 100%
  it("14. período abierto desde antes (suspendida) → julio = 100%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-03-01T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(isSimBillable(periods, 2026, 7)).toBe(true);
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });

  // 15. Múltiples ciclos baja/alta en el mismo mes → factor por primera vigencia del mes
  it("15. tres ciclos baja/alta en julio → factor por primera vigencia (día 2) = 100%", () => {
    const periods: Period[] = [
      { activatedAt: "2026-07-02T00:00:00-06:00", deactivatedAt: "2026-07-05T00:00:00-06:00" },
      { activatedAt: "2026-07-10T00:00:00-06:00", deactivatedAt: "2026-07-15T00:00:00-06:00" },
      { activatedAt: "2026-07-20T00:00:00-06:00", deactivatedAt: null },
    ];
    expect(computeProrationFactor(periods, 2026, 7)).toBe(1);
  });
});
