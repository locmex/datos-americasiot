/**
 * Cálculo de montos para el CFDI 4.0.
 *
 * PROBLEMA QUE RESUELVE
 * Nuestros planes se cotizan con el precio **IVA incluido** ($45.00 por SIM), pero el
 * CFDI exige desglosar base e impuesto, y el SAT valida la aritmética:
 *
 *     SubTotal + TotalImpuestosTrasladados === Total
 *
 * Si se redondea el valor unitario a 2 decimales, la cuenta NO cierra:
 *     38.79 × 156 = 6,051.24  →  +IVA 968.20  =  7,019.44   ✗ (faltan 56 centavos)
 *
 * CFDI 4.0 permite hasta **6 decimales en ValorUnitario**, y con eso sí cierra:
 *     38.793103 × 156 = 6,051.72  →  +IVA 968.28  =  7,020.00   ✓
 *
 * Por eso el valor unitario se calcula con 6 decimales y solo se redondea a 2 al
 * obtener el importe, la base y el impuesto.
 *
 * Funciones PURAS: sin dependencias de red ni de Deno, para poder testearlas.
 */

export const IVA_TASA = 0.16;
export const IMPUESTO_IVA = "002";
export const TIPO_FACTOR_TASA = "Tasa";
/** Servicios de telecomunicaciones — c_ClaveProdServ */
export const CLAVE_PROD_SERV_CONECTIVIDAD = "81161700";
/** Unidad de servicio — c_ClaveUnidad */
export const CLAVE_UNIDAD_SERVICIO = "E48";
export const UNIDAD_SERVICIO = "SERVICIO";
/** 02 = Sí objeto de impuesto */
export const OBJETO_IMP_SI = "02";

/** Redondeo monetario a 2 decimales, estable ante el error de punto flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Redondeo a 6 decimales (máximo que el SAT admite en ValorUnitario). */
export function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

/**
 * Separa un precio que YA incluye IVA en su base y su impuesto.
 * La base se devuelve con 6 decimales; el impuesto, redondeado a 2.
 */
export function desglosarPrecioConIva(
  precioConIva: number,
  tasa: number = IVA_TASA,
): { base: number; iva: number } {
  const base = round6(precioConIva / (1 + tasa));
  return { base, iva: round2(precioConIva - base) };
}

export interface LineaFacturable {
  /** Texto que aparece en el concepto del CFDI */
  descripcion: string;
  cantidad: number;
  /** Precio unitario CON IVA incluido (así se cotizan nuestros planes) */
  precioUnitarioConIva: number;
  /** Identificador interno opcional (p. ej. la clave del plan) */
  noIdentificacion?: string;
}

export interface ConceptoCfdi {
  ClaveProdServ: string;
  NoIdentificacion?: string;
  Cantidad: number;
  ClaveUnidad: string;
  Unidad: string;
  Descripcion: string;
  /** 6 decimales */
  ValorUnitario: number;
  /** 2 decimales */
  Importe: number;
  ObjetoImp: string;
  Impuestos: {
    Traslados: Array<{
      Base: number;
      Impuesto: string;
      TipoFactor: string;
      TasaOCuota: number;
      Importe: number;
    }>;
  };
}

export interface MontosCfdi {
  SubTotal: number;
  TotalImpuestosTrasladados: number;
  Total: number;
  Conceptos: ConceptoCfdi[];
}

/**
 * Construye los conceptos y los totales del CFDI a partir de líneas cuyo precio
 * viene con IVA incluido.
 *
 * Garantiza que `SubTotal + TotalImpuestosTrasladados === Total`, que es lo que
 * valida el SAT al timbrar.
 */
export function calcularMontosCfdi(
  lineas: LineaFacturable[],
  tasa: number = IVA_TASA,
): MontosCfdi {
  const Conceptos: ConceptoCfdi[] = lineas.map((l) => {
    const ValorUnitario = round6(l.precioUnitarioConIva / (1 + tasa));
    const Importe = round2(ValorUnitario * l.cantidad);
    const impuestoImporte = round2(Importe * tasa);

    return {
      ClaveProdServ: CLAVE_PROD_SERV_CONECTIVIDAD,
      ...(l.noIdentificacion ? { NoIdentificacion: l.noIdentificacion } : {}),
      Cantidad: l.cantidad,
      ClaveUnidad: CLAVE_UNIDAD_SERVICIO,
      Unidad: UNIDAD_SERVICIO,
      Descripcion: l.descripcion,
      ValorUnitario,
      Importe,
      ObjetoImp: OBJETO_IMP_SI,
      Impuestos: {
        Traslados: [{
          Base: Importe,
          Impuesto: IMPUESTO_IVA,
          TipoFactor: TIPO_FACTOR_TASA,
          TasaOCuota: tasa,
          Importe: impuestoImporte,
        }],
      },
    };
  });

  const SubTotal = round2(Conceptos.reduce((s, c) => s + c.Importe, 0));
  const TotalImpuestosTrasladados = round2(
    Conceptos.reduce((s, c) => s + c.Impuestos.Traslados[0].Importe, 0),
  );

  return {
    SubTotal,
    TotalImpuestosTrasladados,
    Total: round2(SubTotal + TotalImpuestosTrasladados),
    Conceptos,
  };
}

/**
 * Verifica la identidad que valida el SAT. Úsese como guarda antes de mandar el
 * comprobante al PAC: si esto falla, el timbrado se rechaza.
 */
export function montosCuadran(m: MontosCfdi): boolean {
  return round2(m.SubTotal + m.TotalImpuestosTrasladados) === round2(m.Total);
}
