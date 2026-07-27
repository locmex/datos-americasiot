import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import {
  REGIMENES_FISCALES, USOS_CFDI,
  normalizeRfc, isValidRfc, tipoPersonaDeRfc,
  regimenesPara, usosCfdiPara,
  validarDatosFiscalesParciales, camposFiscalesFaltantes,
  type DatosFiscales,
} from "../lib/sat-catalogs";

/**
 * Captura de los datos fiscales del receptor (CFDI 4.0).
 *
 * Todos los campos son OPCIONALES: el cliente puede darse de alta sin ellos y
 * completarlos cuando entregue su Constancia de Situación Fiscal. Mientras falten,
 * no se le puede emitir factura fiscal — el indicador de arriba lo hace explícito.
 */
export function FiscalDataFields({
  value,
  onChange,
}: {
  value: DatosFiscales;
  onChange: (patch: Partial<DatosFiscales>) => void;
}) {
  const rfc = normalizeRfc(value.rfc ?? "");
  const tipo = rfc && isValidRfc(rfc) ? tipoPersonaDeRfc(rfc) : null;
  const errores = validarDatosFiscalesParciales(value);
  const faltantes = camposFiscalesFaltantes(value);
  const completo = faltantes.length === 0 && Object.keys(errores).length === 0;

  // Sin un RFC válido no se puede saber si es física o moral: se ofrece el catálogo completo
  const regimenes = tipo ? regimenesPara(tipo) : REGIMENES_FISCALES;
  const usos      = tipo ? usosCfdiPara(tipo)  : USOS_CFDI;

  const inputCls = (campo: string) =>
    `w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 bg-gray-50 ${
      errores[campo]
        ? "border-red-300 focus:ring-red-100 focus:border-red-400"
        : "border-gray-200 focus:ring-emerald-100 focus:border-emerald-400"
    }`;

  return (
    <div className="space-y-4">
      {/* Encabezado + estado */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl border"
        style={
          completo
            ? { borderColor: "rgba(5,150,105,0.3)", background: "rgba(5,150,105,0.06)" }
            : { borderColor: "rgba(217,119,6,0.3)", background: "rgba(217,119,6,0.06)" }
        }
      >
        {completo
          ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#059669" }} />
          : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />}
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: completo ? "#059669" : "#d97706" }}>
            {completo ? "Listo para facturar" : "No se pueden emitir facturas fiscales"}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {completo
              ? "Los datos fiscales están completos y son coherentes."
              : faltantes.length > 0
                ? `Falta capturar: ${faltantes.join(", ")}.`
                : "Corrige los datos marcados para poder facturar."}
          </p>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <FileText className="w-3.5 h-3.5 shrink-0" />
        Estos datos deben coincidir <strong>exactamente</strong> con la Constancia de Situación
        Fiscal del cliente; si no, el SAT rechaza el timbrado.
      </p>

      {/* RFC */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">RFC</label>
        <input
          type="text"
          value={value.rfc ?? ""}
          onChange={(e) => onChange({ rfc: e.target.value.toUpperCase() })}
          placeholder="XAXX010101000"
          maxLength={13}
          className={`${inputCls("rfc")} font-mono uppercase`}
        />
        {errores.rfc
          ? <p className="text-[11px] text-red-500">{errores.rfc}</p>
          : tipo && <p className="text-[11px] text-gray-500">Persona {tipo === "moral" ? "moral" : "física"}</p>}
      </div>

      {/* Razón social */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Razón social</label>
        <input
          type="text"
          value={value.razon_social ?? ""}
          onChange={(e) => onChange({ razon_social: e.target.value })}
          placeholder="EMPRESA EJEMPLO SA DE CV"
          className={inputCls("razon_social")}
        />
        <p className="text-[11px] text-gray-500">Sin régimen societario abreviado si el SAT no lo abrevia.</p>
      </div>

      {/* CP fiscal */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Código postal fiscal</label>
        <input
          type="text"
          inputMode="numeric"
          value={value.cp_fiscal ?? ""}
          onChange={(e) => onChange({ cp_fiscal: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          placeholder="82210"
          maxLength={5}
          className={`${inputCls("cp_fiscal")} font-mono`}
        />
        {errores.cp_fiscal && <p className="text-[11px] text-red-500">{errores.cp_fiscal}</p>}
      </div>

      {/* Régimen fiscal */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Régimen fiscal</label>
        <select
          value={value.regimen_fiscal ?? ""}
          onChange={(e) => onChange({ regimen_fiscal: e.target.value })}
          className={inputCls("regimen_fiscal")}
        >
          <option value="">— Selecciona —</option>
          {regimenes.map((r) => (
            <option key={r.clave} value={r.clave}>{r.clave} · {r.descripcion}</option>
          ))}
        </select>
        {errores.regimen_fiscal && <p className="text-[11px] text-red-500">{errores.regimen_fiscal}</p>}
      </div>

      {/* Uso CFDI */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Uso de CFDI</label>
        <select
          value={value.uso_cfdi ?? ""}
          onChange={(e) => onChange({ uso_cfdi: e.target.value })}
          className={inputCls("uso_cfdi")}
        >
          <option value="">— Selecciona —</option>
          {usos.map((u) => (
            <option key={u.clave} value={u.clave}>{u.clave} · {u.descripcion}</option>
          ))}
        </select>
        {errores.uso_cfdi
          ? <p className="text-[11px] text-red-500">{errores.uso_cfdi}</p>
          : <p className="text-[11px] text-gray-500">Para servicios recurrentes se suele usar G03 · Gastos en general.</p>}
      </div>
    </div>
  );
}
