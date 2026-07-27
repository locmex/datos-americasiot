/**
 * Validación de datos fiscales (CFDI 4.0) — lado servidor.
 *
 * Espejo mínimo de `src/app/lib/sat-catalogs.ts`: acá solo validamos FORMATO y
 * pertenencia al catálogo. Las descripciones legibles viven en el front porque
 * solo sirven para poblar los selects.
 *
 * Los campos son OPCIONALES: un cliente puede darse de alta sin datos fiscales y
 * completarlos después (cuando entregue su Constancia de Situación Fiscal). Lo que
 * NO se acepta es un dato presente pero mal formado.
 */

export const CAMPOS_FISCALES = [
  "rfc",
  "razon_social",
  "cp_fiscal",
  "regimen_fiscal",
  "uso_cfdi",
] as const;

export type CampoFiscal = typeof CAMPOS_FISCALES[number];

const REGIMENES_MORAL  = ["601", "603", "610", "620", "622", "623", "624", "626"];
const REGIMENES_FISICA = ["605", "606", "607", "608", "610", "611", "612", "614", "615", "616", "621", "622", "625", "626"];
const USOS_CFDI        = ["G01", "G02", "G03", "I01", "I02", "I03", "I04", "I08", "S01", "CP01"];

export function normalizeRfc(rfc?: string | null): string {
  return (rfc ?? "").toUpperCase().replace(/[\s-]/g, "");
}

/** Estructura de RFC: 3 letras (moral) o 4 (física) + AAMMDD + homoclave. */
export function isValidRfc(rfc?: string | null): boolean {
  const s = normalizeRfc(rfc);
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(s)) return false;
  if (s.length !== 12 && s.length !== 13) return false;
  const letras = s.length === 12 ? 3 : 4;
  const mm = Number(s.slice(letras + 2, letras + 4));
  const dd = Number(s.slice(letras + 4, letras + 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const diasMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dd <= diasMes[mm - 1];
}

export function isValidCp(cp?: string | null): boolean {
  return /^\d{5}$/.test((cp ?? "").trim());
}

function tipoPersona(rfc: string): "fisica" | "moral" | null {
  if (rfc.length === 12) return "moral";
  if (rfc.length === 13) return "fisica";
  return null;
}

/** Extrae y normaliza solo los campos fiscales de un payload arbitrario. */
export function extraerFiscales(body: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CAMPOS_FISCALES) {
    if (body?.[k] !== undefined && body[k] !== null) {
      out[k] = k === "rfc" ? normalizeRfc(String(body[k])) : String(body[k]).trim();
    }
  }
  return out;
}

/**
 * Valida ÚNICAMENTE los campos presentes. Vacío = todavía no capturado (OK).
 * Devuelve un mapa campo → mensaje; vacío significa que no hay errores.
 */
export function validarFiscalesParciales(d: Record<string, any>): Record<string, string> {
  const errores: Record<string, string> = {};

  const rfc = normalizeRfc(d.rfc);
  if (rfc && !isValidRfc(rfc)) errores.rfc = "El RFC no tiene un formato válido";

  const cp = (d.cp_fiscal ?? "").trim();
  if (cp && !isValidCp(cp)) errores.cp_fiscal = "El código postal debe tener 5 dígitos";

  const tipo = rfc && isValidRfc(rfc) ? tipoPersona(rfc) : null;

  const regimen = (d.regimen_fiscal ?? "").trim();
  if (regimen) {
    const existe = REGIMENES_MORAL.includes(regimen) || REGIMENES_FISICA.includes(regimen);
    if (!existe) {
      errores.regimen_fiscal = "El régimen fiscal no existe en el catálogo del SAT";
    } else if (tipo) {
      const aplica = tipo === "moral"
        ? REGIMENES_MORAL.includes(regimen)
        : REGIMENES_FISICA.includes(regimen);
      if (!aplica) errores.regimen_fiscal = `El régimen ${regimen} no aplica a una persona ${tipo}`;
    }
  }

  const uso = (d.uso_cfdi ?? "").trim();
  if (uso && !USOS_CFDI.includes(uso)) {
    errores.uso_cfdi = "El uso de CFDI no existe en el catálogo del SAT";
  }

  return errores;
}

/** ¿Están los cinco campos y son coherentes? Determina si se le puede timbrar. */
export function puedeFacturarse(d: Record<string, any>): boolean {
  const faltantes = CAMPOS_FISCALES.filter((k) => !String(d?.[k] ?? "").trim());
  if (faltantes.length > 0) return false;
  return Object.keys(validarFiscalesParciales(d)).length === 0;
}
