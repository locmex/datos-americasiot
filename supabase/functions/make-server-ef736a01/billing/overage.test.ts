import { describe, it, expect } from "vitest";
import { computeOverage } from "./overage";

// Parámetros reales del proyecto al momento de escribir esto:
// plan de 25 MB incluidos, excedente a $2.00 por MB.
const PLAN = { includedMb: 25, ratePerMb: 2 };

describe("computeOverage — dentro de la cuota", () => {
  it("no cobra si consumió menos que la cuota", () => {
    expect(computeOverage({ consumedMb: 10, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });

  it("no cobra si consumió exactamente la cuota", () => {
    expect(computeOverage({ consumedMb: 25, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });

  it("no cobra si no consumió nada", () => {
    expect(computeOverage({ consumedMb: 0, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });
});

describe("computeOverage — excedido", () => {
  it("cobra el excedente entero", () => {
    // 100 MB consumidos - 25 incluidos = 75 excedentes × $2 = $150
    expect(computeOverage({ consumedMb: 100, ...PLAN }))
      .toEqual({ overageMb: 75, overageAmount: 150 });
  });

  it("cobra fracciones de MB", () => {
    // 25.5 - 25 = 0.5 MB × $2 = $1.00
    expect(computeOverage({ consumedMb: 25.5, ...PLAN }))
      .toEqual({ overageMb: 0.5, overageAmount: 1 });
  });

  it("redondea el importe a centavos", () => {
    // 25.333 - 25 = 0.333 MB × $2 = $0.666 → $0.67
    expect(computeOverage({ consumedMb: 25.333, ...PLAN }))
      .toEqual({ overageMb: 0.333, overageAmount: 0.67 });
  });

  it("un excedente grande no pierde precisión", () => {
    // 1024 - 25 = 999 MB × $2 = $1,998
    expect(computeOverage({ consumedMb: 1024, ...PLAN }))
      .toEqual({ overageMb: 999, overageAmount: 1998 });
  });
});

describe("computeOverage — ruido de punto flotante", () => {
  it("no inventa excedente por error de coma flotante", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en IEEE-754. Con cuota 0.3 el resultado
    // ingenuo daría un excedente de 4e-17 MB, que redondeado a centavos es $0
    // pero igual ensuciaría la factura con una línea de excedente en 0.
    const consumed = 0.1 + 0.2;
    expect(computeOverage({ consumedMb: consumed, includedMb: 0.3, ratePerMb: 2 }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });

  it("un excedente por debajo del milésimo de MB se descarta", () => {
    expect(computeOverage({ consumedMb: 25.0001, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });
});

describe("computeOverage — datos inválidos no generan cargo", () => {
  it("consumo NaN no cobra", () => {
    expect(computeOverage({ consumedMb: NaN, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });

  it("consumo negativo no cobra", () => {
    expect(computeOverage({ consumedMb: -50, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });

  it("consumo infinito no cobra", () => {
    expect(computeOverage({ consumedMb: Infinity, ...PLAN }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });

  it("tarifa en 0 registra el excedente pero no cobra", () => {
    // Sirve para desactivar el cobro sin perder la métrica de consumo.
    expect(computeOverage({ consumedMb: 100, includedMb: 25, ratePerMb: 0 }))
      .toEqual({ overageMb: 0, overageAmount: 0 });
  });
});

describe("computeOverage — plan sin cuota", () => {
  it("con cuota 0 se cobra todo lo consumido", () => {
    expect(computeOverage({ consumedMb: 10, includedMb: 0, ratePerMb: 2 }))
      .toEqual({ overageMb: 10, overageAmount: 20 });
  });
});

describe("computeOverage — la cuota NO se prorratea", () => {
  it("una SIM de medio mes recibe la cuota completa", () => {
    // Decisión del proyecto: la SIM dada de alta el día 20 paga el 50% de la
    // mensualidad, pero conserva los 25 MB enteros. Esta función ni siquiera
    // recibe el factor de prorrateo — que no lo reciba ES la garantía.
    expect(computeOverage({ consumedMb: 30, ...PLAN }))
      .toEqual({ overageMb: 5, overageAmount: 10 });
  });
});
