import { describe, it, expect } from "vitest";
import {
  normalizeRfc,
  isValidRfc,
  tipoPersonaDeRfc,
  isValidCp,
  isRegimenValidoPara,
  isUsoCfdiValidoPara,
  regimenesPara,
  usosCfdiPara,
  validarDatosFiscales,
  validarDatosFiscalesParciales,
  camposFiscalesFaltantes,
  puedeFacturarse,
  RFC_GENERICO_NACIONAL,
} from "./sat-catalogs";

// RFCs reales tomados del CFDI 4.0 de referencia:
//   Emisor   SACJ720919DD9 → persona física, régimen 612
//   Receptor FEC920212PB9  → persona moral,  régimen 601, uso G03
const RFC_FISICA = "SACJ720919DD9";
const RFC_MORAL  = "FEC920212PB9";

describe("normalizeRfc", () => {
  it("pasa a mayúsculas y quita espacios y guiones", () => {
    expect(normalizeRfc(" fec-920212 pb9 ")).toBe("FEC920212PB9");
  });
  it("tolera null/undefined", () => {
    expect(normalizeRfc(undefined as any)).toBe("");
  });
});

describe("isValidRfc", () => {
  it("acepta un RFC de persona moral (12 caracteres)", () => {
    expect(isValidRfc(RFC_MORAL)).toBe(true);
  });
  it("acepta un RFC de persona física (13 caracteres)", () => {
    expect(isValidRfc(RFC_FISICA)).toBe(true);
  });
  it("acepta el RFC genérico nacional", () => {
    expect(isValidRfc(RFC_GENERICO_NACIONAL)).toBe(true);
  });
  it("acepta RFC con Ñ y & en las letras", () => {
    expect(isValidRfc("ÑA&010101AA1")).toBe(true);
  });
  it("rechaza longitudes distintas de 12 o 13", () => {
    expect(isValidRfc("FEC920212PB")).toBe(false);   // 11
    expect(isValidRfc("FECX920212PB99")).toBe(false); // 14
  });
  it("rechaza un mes inválido en la fecha", () => {
    expect(isValidRfc("FEC921312PB9")).toBe(false);
  });
  it("rechaza un día inválido en la fecha", () => {
    expect(isValidRfc("FEC920232PB9")).toBe(false);
  });
  it("rechaza cadena vacía", () => {
    expect(isValidRfc("")).toBe(false);
  });
});

describe("tipoPersonaDeRfc", () => {
  it("12 caracteres es persona moral", () => {
    expect(tipoPersonaDeRfc(RFC_MORAL)).toBe("moral");
  });
  it("13 caracteres es persona física", () => {
    expect(tipoPersonaDeRfc(RFC_FISICA)).toBe("fisica");
  });
  it("devuelve null si la longitud no corresponde", () => {
    expect(tipoPersonaDeRfc("ABC")).toBeNull();
  });
});

describe("isValidCp", () => {
  it("acepta 5 dígitos", () => {
    expect(isValidCp("82210")).toBe(true);
    expect(isValidCp("34200")).toBe(true);
  });
  it("rechaza longitudes distintas o con letras", () => {
    expect(isValidCp("8221")).toBe(false);
    expect(isValidCp("822100")).toBe(false);
    expect(isValidCp("8221A")).toBe(false);
  });
});

describe("régimen fiscal por tipo de persona", () => {
  it("601 aplica a moral pero no a física", () => {
    expect(isRegimenValidoPara("601", "moral")).toBe(true);
    expect(isRegimenValidoPara("601", "fisica")).toBe(false);
  });
  it("612 aplica a física pero no a moral", () => {
    expect(isRegimenValidoPara("612", "fisica")).toBe(true);
    expect(isRegimenValidoPara("612", "moral")).toBe(false);
  });
  it("626 (RESICO) aplica a ambas", () => {
    expect(isRegimenValidoPara("626", "fisica")).toBe(true);
    expect(isRegimenValidoPara("626", "moral")).toBe(true);
  });
  it("rechaza una clave inexistente", () => {
    expect(isRegimenValidoPara("999", "moral")).toBe(false);
  });
  it("regimenesPara devuelve solo los aplicables", () => {
    expect(regimenesPara("moral").every((r) => r.moral)).toBe(true);
    expect(regimenesPara("fisica").every((r) => r.fisica)).toBe(true);
  });
});

describe("uso de CFDI", () => {
  it("G03 (gastos en general) aplica a ambas", () => {
    expect(isUsoCfdiValidoPara("G03", "moral")).toBe(true);
    expect(isUsoCfdiValidoPara("G03", "fisica")).toBe(true);
  });
  it("rechaza una clave inexistente", () => {
    expect(isUsoCfdiValidoPara("ZZ9", "moral")).toBe(false);
  });
  it("usosCfdiPara devuelve solo los aplicables", () => {
    expect(usosCfdiPara("moral").every((u) => u.moral)).toBe(true);
  });
});

describe("validarDatosFiscales", () => {
  const completos = {
    rfc: RFC_MORAL,
    razon_social: "FOMENTO EDUCATIVO Y CULTURAL FRANCISCO DE IBARRA",
    cp_fiscal: "34200",
    regimen_fiscal: "601",
    uso_cfdi: "G03",
  };

  it("no reporta errores cuando los datos están completos y son coherentes", () => {
    expect(validarDatosFiscales(completos)).toEqual({});
    expect(puedeFacturarse(completos)).toBe(true);
  });

  it("reporta todos los campos faltantes cuando está vacío", () => {
    const err = validarDatosFiscales({});
    expect(Object.keys(err).sort()).toEqual(
      ["cp_fiscal", "razon_social", "regimen_fiscal", "rfc", "uso_cfdi"].sort()
    );
    expect(puedeFacturarse({})).toBe(false);
  });

  it("detecta un RFC con formato inválido", () => {
    expect(validarDatosFiscales({ ...completos, rfc: "NOESRFC" }).rfc).toBeTruthy();
  });

  it("detecta un CP que no tiene 5 dígitos", () => {
    expect(validarDatosFiscales({ ...completos, cp_fiscal: "342" }).cp_fiscal).toBeTruthy();
  });

  it("detecta un régimen que no corresponde al tipo de persona", () => {
    // 612 es de persona física, pero el RFC es moral
    const err = validarDatosFiscales({ ...completos, regimen_fiscal: "612" });
    expect(err.regimen_fiscal).toContain("no aplica");
  });

  it("acepta la combinación física + 612 del emisor de referencia", () => {
    expect(
      validarDatosFiscales({
        rfc: RFC_FISICA,
        razon_social: "JUAN DE DIOS SANCHEZ CAMACHO",
        cp_fiscal: "82210",
        regimen_fiscal: "612",
        uso_cfdi: "G03",
      })
    ).toEqual({});
  });

  it("normaliza el RFC antes de validar (minúsculas y guiones)", () => {
    expect(validarDatosFiscales({ ...completos, rfc: "fec-920212-pb9" })).toEqual({});
  });
});

describe("validarDatosFiscalesParciales (campos opcionales)", () => {
  it("acepta un objeto vacío: los datos fiscales se capturan después", () => {
    expect(validarDatosFiscalesParciales({})).toEqual({});
  });

  it("acepta una captura a medias sin reportar faltantes", () => {
    expect(validarDatosFiscalesParciales({ rfc: RFC_MORAL })).toEqual({});
    expect(validarDatosFiscalesParciales({ razon_social: "ACME SA DE CV" })).toEqual({});
  });

  it("rechaza un RFC presente pero mal formado", () => {
    expect(validarDatosFiscalesParciales({ rfc: "NOESRFC" }).rfc).toBeTruthy();
  });

  it("rechaza un CP presente pero inválido", () => {
    expect(validarDatosFiscalesParciales({ cp_fiscal: "342" }).cp_fiscal).toBeTruthy();
  });

  it("rechaza una clave de régimen inexistente", () => {
    expect(validarDatosFiscalesParciales({ regimen_fiscal: "999" }).regimen_fiscal).toBeTruthy();
  });

  it("rechaza un régimen incoherente con el tipo de persona del RFC", () => {
    const err = validarDatosFiscalesParciales({ rfc: RFC_MORAL, regimen_fiscal: "612" });
    expect(err.regimen_fiscal).toContain("no aplica");
  });

  it("no exige coherencia de régimen si todavía no hay RFC", () => {
    expect(validarDatosFiscalesParciales({ regimen_fiscal: "612" })).toEqual({});
  });

  it("rechaza un uso de CFDI inexistente", () => {
    expect(validarDatosFiscalesParciales({ uso_cfdi: "ZZ9" }).uso_cfdi).toBeTruthy();
  });
});

describe("camposFiscalesFaltantes", () => {
  it("lista los cinco campos cuando no hay nada capturado", () => {
    expect(camposFiscalesFaltantes({})).toHaveLength(5);
  });

  it("lista solo lo que falta", () => {
    expect(
      camposFiscalesFaltantes({ rfc: RFC_MORAL, razon_social: "ACME", cp_fiscal: "34200" })
    ).toEqual(["Régimen fiscal", "Uso de CFDI"]);
  });

  it("no lista nada cuando está completo", () => {
    expect(
      camposFiscalesFaltantes({
        rfc: RFC_MORAL, razon_social: "ACME", cp_fiscal: "34200",
        regimen_fiscal: "601", uso_cfdi: "G03",
      })
    ).toEqual([]);
  });

  it("ignora valores que son solo espacios", () => {
    expect(camposFiscalesFaltantes({ rfc: "   " })).toContain("RFC");
  });
});
