// Cargo por excedente de datos.
//
// Un plan incluye N MB al mes. Lo consumido por encima se cobra a una tarifa por
// MB que el admin configura.
//
// Igual que `proration.ts`: función pura, sin red ni base de datos, para poder
// fijarla con tests. Es plata.

export interface OverageInput {
  /** MB consumidos en el período (decimales, como los devuelve emnify). */
  consumedMb: number;
  /** MB incluidos en el plan. NO se prorratea. */
  includedMb: number;
  /** Precio por MB excedente, en la moneda de la factura. */
  ratePerMb: number;
}

export interface OverageResult {
  /** MB por encima de la cuota. 0 si no se excedió. */
  overageMb: number;
  /** Importe del excedente, redondeado a centavos. */
  overageAmount: number;
}

/** Redondeo a 3 decimales: emnify entrega MB decimales y no queremos que el
 *  ruido de punto flotante invente un excedente de 0.0000001 MB. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Redondeo a centavos. Es el importe que termina en la factura. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeOverage({
  consumedMb,
  includedMb,
  ratePerMb,
}: OverageInput): OverageResult {
  // Entradas inválidas (NaN, Infinity, negativos) no generan cargo. Preferimos
  // no cobrar a cobrar de más por un dato roto.
  const consumed = Number.isFinite(consumedMb) && consumedMb > 0 ? consumedMb : 0;
  const included = Number.isFinite(includedMb) && includedMb > 0 ? includedMb : 0;
  const rate = Number.isFinite(ratePerMb) && ratePerMb > 0 ? ratePerMb : 0;

  const overageMb = round3(Math.max(0, consumed - included));
  if (overageMb <= 0 || rate <= 0) {
    return { overageMb: 0, overageAmount: 0 };
  }

  return { overageMb, overageAmount: round2(overageMb * rate) };
}
