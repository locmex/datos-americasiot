/**
 * Catálogos del SAT y validaciones fiscales (CFDI 4.0).
 *
 * Funciones PURAS: sin dependencias de red ni de DOM, para poder testearlas.
 * Los catálogos son subconjuntos de los oficiales del SAT, acotados a los casos
 * que aplican a AmericasIoT (servicio de conectividad IoT facturado a empresas).
 */

// ─── c_RegimenFiscal ──────────────────────────────────────────────────────────
export interface RegimenFiscal {
  clave: string;
  descripcion: string;
  fisica: boolean;
  moral: boolean;
}

export const REGIMENES_FISCALES: RegimenFiscal[] = [
  { clave: "601", descripcion: "General de Ley Personas Morales",                              fisica: false, moral: true  },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos",                     fisica: false, moral: true  },
  { clave: "605", descripcion: "Sueldos y Salarios e Ingresos Asimilados a Salarios",          fisica: true,  moral: false },
  { clave: "606", descripcion: "Arrendamiento",                                                fisica: true,  moral: false },
  { clave: "607", descripcion: "Régimen de Enajenación o Adquisición de Bienes",               fisica: true,  moral: false },
  { clave: "608", descripcion: "Demás ingresos",                                               fisica: true,  moral: false },
  { clave: "610", descripcion: "Residentes en el Extranjero sin Establecimiento Permanente",   fisica: true,  moral: true  },
  { clave: "611", descripcion: "Ingresos por Dividendos (socios y accionistas)",               fisica: true,  moral: false },
  { clave: "612", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales", fisica: true, moral: false },
  { clave: "614", descripcion: "Ingresos por intereses",                                       fisica: true,  moral: false },
  { clave: "615", descripcion: "Régimen de los ingresos por obtención de premios",             fisica: true,  moral: false },
  { clave: "616", descripcion: "Sin obligaciones fiscales",                                    fisica: true,  moral: false },
  { clave: "620", descripcion: "Sociedades Cooperativas de Producción",                        fisica: false, moral: true  },
  { clave: "621", descripcion: "Incorporación Fiscal",                                         fisica: true,  moral: false },
  { clave: "622", descripcion: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",     fisica: true,  moral: true  },
  { clave: "623", descripcion: "Opcional para Grupos de Sociedades",                           fisica: false, moral: true  },
  { clave: "624", descripcion: "Coordinados",                                                  fisica: false, moral: true  },
  { clave: "625", descripcion: "Actividades Empresariales con ingresos por Plataformas Tecnológicas", fisica: true, moral: false },
  { clave: "626", descripcion: "Régimen Simplificado de Confianza",                            fisica: true,  moral: true  },
];

// ─── c_UsoCFDI ────────────────────────────────────────────────────────────────
export interface UsoCFDI {
  clave: string;
  descripcion: string;
  fisica: boolean;
  moral: boolean;
}

export const USOS_CFDI: UsoCFDI[] = [
  { clave: "G01", descripcion: "Adquisición de mercancías",                    fisica: true, moral: true },
  { clave: "G02", descripcion: "Devoluciones, descuentos o bonificaciones",    fisica: true, moral: true },
  { clave: "G03", descripcion: "Gastos en general",                            fisica: true, moral: true },
  { clave: "I01", descripcion: "Construcciones",                               fisica: true, moral: true },
  { clave: "I02", descripcion: "Mobiliario y equipo de oficina por inversiones", fisica: true, moral: true },
  { clave: "I03", descripcion: "Equipo de transporte",                         fisica: true, moral: true },
  { clave: "I04", descripcion: "Equipo de cómputo y accesorios",               fisica: true, moral: true },
  { clave: "I08", descripcion: "Otra maquinaria y equipo",                     fisica: true, moral: true },
  { clave: "S01", descripcion: "Sin efectos fiscales",                         fisica: true, moral: true },
  { clave: "CP01", descripcion: "Pagos",                                       fisica: true, moral: true },
];

// ─── Constantes del servicio que facturamos ───────────────────────────────────
/** Servicios de telecomunicaciones — c_ClaveProdServ */
export const CLAVE_PROD_SERV_CONECTIVIDAD = "81161700";
/** Unidad de servicio — c_ClaveUnidad */
export const CLAVE_UNIDAD_SERVICIO = "E48";
export const UNIDAD_SERVICIO = "SERVICIO";
/** IVA trasladado, tasa 16% */
export const IVA_TASA = 0.16;
export const IMPUESTO_IVA = "002";

// ─── Tipo de persona ──────────────────────────────────────────────────────────
export type TipoPersona = "fisica" | "moral";

/** RFC genéricos del SAT (público en general y residentes en el extranjero) */
export const RFC_GENERICO_NACIONAL = "XAXX010101000";
export const RFC_GENERICO_EXTRANJERO = "XEXX010101000";

/**
 * Deduce el tipo de persona por la longitud del RFC:
 * 12 caracteres = moral, 13 = física.
 */
export function tipoPersonaDeRfc(rfc: string): TipoPersona | null {
  const clean = normalizeRfc(rfc);
  if (clean.length === 12) return "moral";
  if (clean.length === 13) return "fisica";
  return null;
}

/** Normaliza un RFC: sin espacios ni guiones, en mayúsculas. */
export function normalizeRfc(rfc: string): string {
  return (rfc ?? "").toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Valida la estructura de un RFC mexicano.
 * Moral:  3 letras + AAMMDD + 3 de homoclave  (12)
 * Física: 4 letras + AAMMDD + 3 de homoclave  (13)
 * NO valida contra el padrón del SAT — eso lo hace el PAC al timbrar.
 */
export function isValidRfc(rfc: string): boolean {
  const clean = normalizeRfc(rfc);
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(clean)) return false;
  if (clean.length !== 12 && clean.length !== 13) return false;

  // La fecha embebida (posiciones tras las letras) debe ser válida
  const letras = clean.length === 12 ? 3 : 4;
  const yy = Number(clean.slice(letras, letras + 2));
  const mm = Number(clean.slice(letras + 2, letras + 4));
  const dd = Number(clean.slice(letras + 4, letras + 6));
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  // Días por mes (año 2000 como referencia para febrero bisiesto laxo)
  const diasMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dd > diasMes[mm - 1]) return false;
  if (Number.isNaN(yy)) return false;

  return true;
}

/** Código postal mexicano: exactamente 5 dígitos. */
export function isValidCp(cp: string): boolean {
  return /^\d{5}$/.test((cp ?? "").trim());
}

/** ¿La clave de régimen fiscal existe y aplica al tipo de persona? */
export function isRegimenValidoPara(clave: string, tipo: TipoPersona): boolean {
  const r = REGIMENES_FISCALES.find((x) => x.clave === clave);
  if (!r) return false;
  return tipo === "fisica" ? r.fisica : r.moral;
}

/** ¿La clave de uso de CFDI existe y aplica al tipo de persona? */
export function isUsoCfdiValidoPara(clave: string, tipo: TipoPersona): boolean {
  const u = USOS_CFDI.find((x) => x.clave === clave);
  if (!u) return false;
  return tipo === "fisica" ? u.fisica : u.moral;
}

/** Regímenes aplicables a un tipo de persona (para poblar un select). */
export function regimenesPara(tipo: TipoPersona): RegimenFiscal[] {
  return REGIMENES_FISCALES.filter((r) => (tipo === "fisica" ? r.fisica : r.moral));
}

/** Usos de CFDI aplicables a un tipo de persona (para poblar un select). */
export function usosCfdiPara(tipo: TipoPersona): UsoCFDI[] {
  return USOS_CFDI.filter((u) => (tipo === "fisica" ? u.fisica : u.moral));
}

// ─── Datos fiscales del receptor ──────────────────────────────────────────────
export interface DatosFiscales {
  rfc?: string | null;
  razon_social?: string | null;
  cp_fiscal?: string | null;
  regimen_fiscal?: string | null;
  uso_cfdi?: string | null;
}

/**
 * Valida el conjunto de datos fiscales de un cliente.
 * Devuelve un mapa campo → mensaje. Vacío = listo para facturar.
 */
export function validarDatosFiscales(d: DatosFiscales): Record<string, string> {
  const errores: Record<string, string> = {};

  const rfc = normalizeRfc(d.rfc ?? "");
  if (!rfc) {
    errores.rfc = "El RFC es requerido para facturar";
  } else if (!isValidRfc(rfc)) {
    errores.rfc = "El RFC no tiene un formato válido";
  }

  if (!(d.razon_social ?? "").trim()) {
    errores.razon_social = "La razón social es requerida (debe coincidir con el SAT)";
  }

  if (!(d.cp_fiscal ?? "").trim()) {
    errores.cp_fiscal = "El código postal fiscal es requerido";
  } else if (!isValidCp(d.cp_fiscal!)) {
    errores.cp_fiscal = "El código postal debe tener 5 dígitos";
  }

  const tipo = tipoPersonaDeRfc(rfc);

  if (!(d.regimen_fiscal ?? "").trim()) {
    errores.regimen_fiscal = "El régimen fiscal es requerido";
  } else if (tipo && !isRegimenValidoPara(d.regimen_fiscal!, tipo)) {
    errores.regimen_fiscal = `El régimen ${d.regimen_fiscal} no aplica a una persona ${tipo}`;
  }

  if (!(d.uso_cfdi ?? "").trim()) {
    errores.uso_cfdi = "El uso de CFDI es requerido";
  } else if (tipo && !isUsoCfdiValidoPara(d.uso_cfdi!, tipo)) {
    errores.uso_cfdi = `El uso ${d.uso_cfdi} no aplica a una persona ${tipo}`;
  }

  return errores;
}

/** ¿El cliente tiene todo lo necesario para emitirle un CFDI? */
export function puedeFacturarse(d: DatosFiscales): boolean {
  return Object.keys(validarDatosFiscales(d)).length === 0;
}
