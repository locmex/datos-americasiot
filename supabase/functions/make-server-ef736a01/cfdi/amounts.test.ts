import { describe, it, expect } from "vitest";
import {
  round2, round6,
  desglosarPrecioConIva,
  calcularMontosCfdi,
  montosCuadran,
  IVA_TASA,
} from "./amounts.ts";

describe("redondeos", () => {
  it("round2 evita el error de punto flotante", () => {
    expect(round2(968.2752)).toBe(968.28);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(6051.724068)).toBe(6051.72);
  });
  it("round6 conserva la precisión del valor unitario", () => {
    expect(round6(45 / 1.16)).toBe(38.793103);
    expect(round6(810 / 1.16)).toBe(698.275862);
  });
});

describe("desglosarPrecioConIva", () => {
  it("separa $45 IVA incluido en base e impuesto", () => {
    const { base, iva } = desglosarPrecioConIva(45);
    expect(base).toBe(38.793103);
    expect(iva).toBe(6.21);
  });
  it("la base más el IVA reconstruyen el precio original", () => {
    const { base, iva } = desglosarPrecioConIva(45);
    expect(round2(base + iva)).toBe(45.0);
  });
});

// El CFDI 4.0 de referencia (timbrado y aceptado por el SAT) declara:
//   ValorUnitario 698.28 · SubTotal 698.28 · IVA 111.72 · Total 810.00
describe("contra el CFDI de referencia (Total 810.00)", () => {
  const m = calcularMontosCfdi([
    { descripcion: "CONSUMO DE ALIMENTOS", cantidad: 1, precioUnitarioConIva: 810 },
  ]);

  it("reproduce el SubTotal del comprobante real", () => {
    expect(m.SubTotal).toBe(698.28);
  });
  it("reproduce el IVA trasladado del comprobante real", () => {
    expect(m.TotalImpuestosTrasladados).toBe(111.72);
  });
  it("reproduce el Total del comprobante real", () => {
    expect(m.Total).toBe(810.0);
  });
});

describe("facturación de SIMs a $45 IVA incluido", () => {
  it("156 SIMs cuadran exactamente en $7,020.00", () => {
    const m = calcularMontosCfdi([
      { descripcion: "Servicio de conectividad IoT — julio 2026", cantidad: 156, precioUnitarioConIva: 45 },
    ]);
    expect(m.SubTotal).toBe(6051.72);
    expect(m.TotalImpuestosTrasladados).toBe(968.28);
    expect(m.Total).toBe(7020.0);
  });

  it("el enfoque ingenuo de 2 decimales NO habría cuadrado", () => {
    // Documenta el bug que evitamos: 38.79 × 156 = 6,051.24 → total 7,019.44
    const valorUnitario2dec = round2(45 / 1.16); // 38.79
    const importe = round2(valorUnitario2dec * 156);
    const iva = round2(importe * IVA_TASA);
    expect(round2(importe + iva)).toBe(7019.44);
    expect(round2(importe + iva)).not.toBe(7020.0);
  });

  it("una sola SIM da 38.79 + 6.21 = 45.00", () => {
    const m = calcularMontosCfdi([
      { descripcion: "Servicio de conectividad IoT", cantidad: 1, precioUnitarioConIva: 45 },
    ]);
    expect(m.SubTotal).toBe(38.79);
    expect(m.TotalImpuestosTrasladados).toBe(6.21);
    expect(m.Total).toBe(45.0);
  });

  it("cuadra también con prorrateo al 50% ($22.50)", () => {
    const m = calcularMontosCfdi([
      { descripcion: "Conectividad IoT — completo", cantidad: 150, precioUnitarioConIva: 45 },
      { descripcion: "Conectividad IoT — medio mes", cantidad: 6, precioUnitarioConIva: 22.5 },
    ]);
    expect(montosCuadran(m)).toBe(true);
    expect(m.Total).toBe(round2(m.SubTotal + m.TotalImpuestosTrasladados));
  });
});

describe("estructura de los conceptos", () => {
  const m = calcularMontosCfdi([
    { descripcion: "Conectividad IoT", cantidad: 10, precioUnitarioConIva: 45, noIdentificacion: "PLAN-UNICO" },
  ]);
  const cpt = m.Conceptos[0];

  it("usa la clave de producto de telecomunicaciones y unidad de servicio", () => {
    expect(cpt.ClaveProdServ).toBe("81161700");
    expect(cpt.ClaveUnidad).toBe("E48");
    expect(cpt.Unidad).toBe("SERVICIO");
  });
  it("marca el concepto como objeto de impuesto", () => {
    expect(cpt.ObjetoImp).toBe("02");
  });
  it("la Base del traslado es igual al Importe del concepto", () => {
    expect(cpt.Impuestos.Traslados[0].Base).toBe(cpt.Importe);
  });
  it("declara IVA tasa 16%", () => {
    expect(cpt.Impuestos.Traslados[0].Impuesto).toBe("002");
    expect(cpt.Impuestos.Traslados[0].TipoFactor).toBe("Tasa");
    expect(cpt.Impuestos.Traslados[0].TasaOCuota).toBe(0.16);
  });
  it("incluye NoIdentificacion solo si se proporcionó", () => {
    expect(cpt.NoIdentificacion).toBe("PLAN-UNICO");
    const sinId = calcularMontosCfdi([{ descripcion: "x", cantidad: 1, precioUnitarioConIva: 45 }]);
    expect(sinId.Conceptos[0].NoIdentificacion).toBeUndefined();
  });
});

describe("montosCuadran", () => {
  it("es verdadero para cantidades arbitrarias", () => {
    for (const cantidad of [1, 3, 7, 17, 26, 48, 99, 156, 200, 1517]) {
      const m = calcularMontosCfdi([
        { descripcion: `${cantidad} SIMs`, cantidad, precioUnitarioConIva: 45 },
      ]);
      expect(montosCuadran(m)).toBe(true);
    }
  });
});
