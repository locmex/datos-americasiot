# Brain-dump: CFDI — timbrado de facturas

> Análisis previo al diseño formal. Capturado el 2026-07-27, a partir del PAC propuesto
> (SmarterWeb) y de un CFDI 4.0 timbrado real usado como referencia.

## Contexto

El jefe pide emitir **facturas fiscales (CFDI 4.0)** además del comprobante interno que ya
genera `billing`. Esto estaba **explícitamente fuera de alcance** del change `billing` por su
tamaño e implicancias legales — ahora entra como change propio.

- **PAC elegido**: [SmarterWeb](https://smarterweb.com.mx/) (venden paquetes de timbres; hay que cotizar).
- **Dos modos de integración** que ofrecen:
  1. Nosotros armamos el XML → ellos lo timbran.
  2. Nosotros mandamos **JSON** → ellos devuelven el XML timbrado.
- **Decisión: modo JSON.** Armar CFDI 4.0 a mano en una edge function de Deno es frágil
  (namespaces, orden de nodos, validación XSD, sellado). Que el PAC construya el XML reduce
  drásticamente la superficie de error.
- Una factura son **dos artefactos**: el **XML** (lo que legalmente vale) y el **PDF**
  (representación impresa). Hoy solo generamos un PDF interno, que NO es fiscal.

## Estructura del CFDI 4.0 (del ejemplo real)

Lo que **nosotros** aportamos:

| Nodo | Campos |
|---|---|
| `Comprobante` | Version, Serie, Folio, Fecha, FormaPago, CondicionesDePago, Moneda, SubTotal, Total, TipoDeComprobante (`I`), Exportacion (`01`), MetodoPago (`PUE`), LugarExpedicion (CP del emisor) |
| `Emisor` | Rfc, Nombre, RegimenFiscal |
| `Receptor` | Rfc, Nombre, **DomicilioFiscalReceptor** (CP), **RegimenFiscalReceptor**, **UsoCFDI** |
| `Concepto` | ClaveProdServ, Cantidad, ClaveUnidad, Unidad, Descripcion, ValorUnitario, Importe, ObjetoImp (`02` = sí objeto de impuesto) |
| `Impuestos` | Traslado: Base, Impuesto (`002` = IVA), TipoFactor (`Tasa`), TasaOCuota (`0.160000`), Importe |

Lo que agrega el **PAC/SAT** (no lo construimos nosotros): `Sello`, `NoCertificado`,
`Certificado`, y el complemento `TimbreFiscalDigital` con **UUID**, `FechaTimbrado`,
`SelloSAT`, `NoCertificadoSAT`, `RfcProvCertif`.

## 🔴 Problema 1 — El precio "$45 IVA incluido" no sobrevive tal cual

El CFDI exige **desglosar base e impuesto**, y el SAT valida la aritmética. Con base
`45 / 1.16 = 38.7931034…`:

| Enfoque | Cálculo (156 SIMs) | Total | ¿Cuadra? |
|---|---|---|---|
| `ValorUnitario = 38.79` (2 decimales) | 6,051.24 + IVA 968.20 | **7,019.44** | ❌ 56 centavos de menos |
| `ValorUnitario = 38.793103` (6 decimales) | 6,051.72 + IVA 968.28 | **7,020.00** | ✅ |

**Decisión**: usar **6 decimales en `ValorUnitario`** (CFDI 4.0 lo permite) y calcular
`Importe`, `Base` e `Impuesto` redondeando a 2 decimales al final. El total del CFDI debe
coincidir **exacto** con el total de nuestra factura interna.

> Ojo: esto hay que cubrirlo con tests (igual que el prorrateo). Es aritmética con dinero.

## 🔴 Problema 2 — No tenemos los datos fiscales del receptor

Hoy `client:<id>` (KV) guarda: `name, email, company, phone, notes`.
El CFDI exige, por cliente: **RFC**, **Nombre/razón social exacta**, **CP del domicilio
fiscal**, **Régimen fiscal**, **Uso CFDI**.

CFDI 4.0 valida que RFC + Nombre + CP coincidan **exactamente** con el padrón del SAT; si no,
**rechaza el timbrado**. No es opcional ni postergable.

**Fuente del dato**: la **Constancia de Situación Fiscal** que cada cliente descarga del SAT.

## Dependencias externas (bloqueantes para timbrar)

- [ ] **CSD** — Certificado de Sello Digital: `.cer` + `.key` + contraseña. Son **secretos
      críticos**: van a los secrets de Supabase, nunca al repo.
- [ ] **Timbres** contratados en SmarterWeb (requiere cotización).
- [ ] Credenciales de API de SmarterWeb.

Al 2026-07-27: **ninguno de los tres está listo.**

## Plan por fases

### Fase 1 — Datos fiscales del receptor ← SIN BLOQUEOS, empezar por acá
- Extender el modelo de cliente con: `rfc`, `razon_social`, `cp_fiscal`, `regimen_fiscal`,
  `uso_cfdi`, `email_facturacion`.
- Catálogos del SAT embebidos (régimen fiscal, uso CFDI, forma/método de pago).
- Validación: formato de RFC (persona física/moral), CP de 5 dígitos, combinaciones
  válidas régimen↔uso CFDI.
- UI de captura en el panel admin + completar los 5 clientes existentes.
- Indicador de "cliente listo para facturar" (tiene todos los datos fiscales).

**Por qué primero**: no depende del CSD ni del PAC, es prerrequisito absoluto, y tiene el
plazo más largo porque cada cliente tiene que entregar su constancia.

### Fase 2 — Integración con SmarterWeb (cuando haya CSD + timbres)
- Extender `invoices` con: `uuid`, `serie`, `folio`, `xml_url`, `pdf_url`, `stamped_at`,
  `stamp_status`, `cancel_status`.
- Serie y folio consecutivos, sin huecos.
- Construcción del JSON del CFDI a partir de la factura interna (con la aritmética del
  Problema 1).
- Almacenamiento del XML y el PDF en Supabase Storage.
- **Cancelación**: en CFDI es un trámite ante el SAT con clave de motivo, no un borrado.

## Fuera de alcance (por ahora)
- Complemento de pago (REP) para facturas PPD — hoy usamos PUE.
- Notas de crédito / egresos.
- Facturación automática por cron (Supabase lo soporta; se evalúa después).
