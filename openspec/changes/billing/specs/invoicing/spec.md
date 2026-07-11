# invoicing Specification

## Purpose

Generación de facturas mensuales por cliente a partir de los períodos de vigencia registrados en `sim-lifecycle`, con cálculo de prorrateo, desglose congelado por SIM, emisión y comprobante PDF. El disparo es manual (botón admin) y la generación MUST ser idempotente.

## Requirements

### Requirement: Invoice Generation for a Period

El sistema MUST permitir a un admin generar, para un período (mes/año) dado, una factura en estado `draft` por cada cliente que tenga al menos una SIM vigente ≥1 día en ese período.

Una SIM se considera vigente en el mes M si `activated_at != null` y (`deactivated_at == null` o `deactivated_at` cae en M o después).

#### Scenario: Generación exitosa de un período con clientes facturables
- GIVEN al menos un cliente con SIMs vigentes en julio
- WHEN el admin genera facturas del período julio
- THEN el sistema MUST crear una factura `draft` por cada cliente con SIMs vigentes
- AND cada factura MUST incluir un item por cada SIM vigente de ese cliente en julio

#### Scenario: Cliente sin SIMs vigentes en el período
- GIVEN un cliente cuyas SIMs estuvieron todas Desactivadas antes del inicio del período
- WHEN el admin genera facturas del período
- THEN el sistema MUST NOT crear factura para ese cliente

#### Scenario: Generación de un período futuro
- GIVEN el período solicitado es posterior al mes calendario actual
- WHEN el admin intenta generar facturas de ese período
- THEN el sistema MUST rechazar la operación con error 422

#### Scenario: Doble generación del mismo período
- GIVEN ya existen facturas `draft` o `issued` generadas para el período julio
- WHEN el admin ejecuta nuevamente la generación de julio
- THEN el sistema MUST NOT crear cargos duplicados
- AND el resultado final MUST seguir teniendo como máximo un item por SIM por factura por período

### Requirement: Proration Factor Calculation

El sistema MUST calcular el factor de prorrateo de cada SIM facturada según la **primera vigencia dentro del mes M**, sin importar ciclos posteriores de baja/alta dentro del mismo mes. La baja MUST NOT prorratear: siempre cobra el mes completo del que fue parte.

Regla: si la SIM venía vigente desde antes de M → factor 100%. Si la primera vigencia ocurre en M el día D → D ≤ 15 → 100%; D ≥ 16 → 50%.

#### Scenario: Vigente desde antes del período, sin baja
- GIVEN una SIM activada en junio y sin baja
- WHEN se factura julio
- THEN el factor de prorrateo MUST ser 100%

#### Scenario: Alta el día 1 del período
- GIVEN una SIM activada el 1 de julio
- WHEN se factura julio
- THEN el factor MUST ser 100%

#### Scenario: Alta el día 15 del período (borde inferior)
- GIVEN una SIM activada el 15 de julio
- WHEN se factura julio
- THEN el factor MUST ser 100%

#### Scenario: Alta el día 16 del período (borde superior)
- GIVEN una SIM activada el 16 de julio
- WHEN se factura julio
- THEN el factor MUST ser 50%

#### Scenario: Alta el último día del período
- GIVEN una SIM activada el 31 de julio
- WHEN se factura julio
- THEN el factor MUST ser 50%

#### Scenario: Alta, baja y realta dentro del mismo mes con primera vigencia ≤15
- GIVEN una SIM activada el 3 de julio, desactivada el 10 de julio y reactivada el 20 de julio
- WHEN se factura julio
- THEN el factor MUST ser 100% (determinado por la primera vigencia del mes, día 3)
- AND el sistema MUST generar exactamente un cargo para esa SIM en julio

#### Scenario: Alta, baja y realta dentro del mismo mes con primera vigencia ≥16
- GIVEN una SIM activada el 20 de julio, desactivada el 25 de julio y reactivada el 28 de julio
- WHEN se factura julio
- THEN el factor MUST ser 50%
- AND el sistema MUST generar exactamente un cargo para esa SIM en julio

#### Scenario: Vigente desde antes del período, dada de baja a mitad del mes
- GIVEN una SIM activada en mayo y desactivada el 26 de julio
- WHEN se factura julio
- THEN el factor MUST ser 100% (la baja no prorratea)

#### Scenario: Baja antes del inicio del período
- GIVEN una SIM desactivada el 30 de junio
- WHEN se factura julio
- THEN el sistema MUST NOT incluir esa SIM en la factura de julio

#### Scenario: Baja a mitad del período no genera cargo el mes siguiente
- GIVEN una SIM desactivada el 26 de julio y sin reactivación
- WHEN se factura agosto
- THEN el sistema MUST NOT incluir esa SIM en la factura de agosto

#### Scenario: Reactivación en un mes posterior se trata como alta nueva
- GIVEN una SIM desactivada el 26 de julio y reactivada el 20 de septiembre
- WHEN se factura julio, agosto y septiembre
- THEN julio MUST facturarse al 100% (por la baja no prorrateada)
- AND agosto MUST NOT generar cargo
- AND septiembre MUST facturarse al 50% (nueva alta, día 20 ≥ 16)

#### Scenario: SIM nunca activada
- GIVEN una SIM en estado Disponible sin `activated_at`
- WHEN se genera cualquier período
- THEN el sistema MUST NOT incluir esa SIM en ninguna factura

#### Scenario: SIM desactivada durante todo el período
- GIVEN una SIM cuyo único período cerró antes del inicio de M y no tiene vigencia dentro de M
- WHEN se factura M
- THEN el sistema MUST NOT incluir esa SIM en la factura

#### Scenario: SIM suspendida pero vigente todo el período
- GIVEN una SIM en estado Suspendida durante todo julio, con período abierto desde antes
- WHEN se factura julio
- THEN el sistema MUST incluir esa SIM en la factura al 100%

#### Scenario: Múltiples ciclos baja/alta en el mismo mes garantizan un único cargo
- GIVEN una SIM con tres ciclos de baja/alta distintos dentro de julio
- WHEN se factura julio
- THEN el sistema MUST generar exactamente un item de factura para esa SIM, con el factor determinado por la primera vigencia del mes

### Requirement: Invoice Emission

El sistema MUST permitir a un admin emitir (`draft` → `issued`) una factura previamente generada. Una vez emitida, el desglose MUST quedar inmutable.

#### Scenario: Emisión exitosa
- GIVEN una factura en estado `draft`
- WHEN el admin la emite
- THEN el estado MUST cambiar a `issued`
- AND los items de la factura MUST NOT ser modificables después de la emisión

#### Scenario: Intento de emitir una factura ya emitida
- GIVEN una factura en estado `issued`
- WHEN el admin intenta emitirla nuevamente
- THEN el sistema MUST rechazar la operación con error 422

### Requirement: Invoice Item Breakdown

Cada item de factura MUST congelar al momento de la generación: `iccid`, `plan_name`, `unit_price`, `proration_factor`, `activated_at`, `sim_status` y `amount`. Cambios posteriores en el plan, el nombre del cliente o el estado de la SIM MUST NOT alterar items ya generados.

#### Scenario: Consulta de desglose de una factura emitida
- GIVEN una factura `issued` con 3 items
- WHEN el admin o el cliente dueño la consultan
- THEN el sistema MUST retornar los 3 items con todos los campos congelados

#### Scenario: Cambio de precio de plan no afecta facturas pasadas
- GIVEN una factura ya generada con `unit_price` = 45.00
- WHEN el precio del plan se actualiza a 50.00
- THEN el `unit_price` del item ya generado MUST permanecer en 45.00

### Requirement: Invoice Visibility and Authorization

El admin MUST poder ver todas las facturas de todos los clientes. Un cliente MUST ver únicamente sus propias facturas.

#### Scenario: Admin lista todas las facturas
- GIVEN facturas de múltiples clientes
- WHEN el admin las lista
- THEN el sistema MUST retornar facturas de todos los clientes

#### Scenario: Cliente lista sus facturas
- GIVEN un cliente autenticado con facturas propias
- WHEN solicita su listado
- THEN el sistema MUST retornar únicamente sus propias facturas

#### Scenario: Cliente intenta acceder a una factura ajena
- GIVEN un cliente autenticado
- WHEN solicita el detalle de una factura de otro cliente
- THEN el sistema MUST responder 403 o 404

#### Scenario: Acceso no autenticado
- GIVEN un request sin sesión válida (ni admin ni cliente)
- WHEN intenta listar o consultar facturas
- THEN el sistema MUST responder 401

### Requirement: PDF Receipt

El sistema MUST generar un comprobante PDF interno descargable por el admin y por el cliente dueño de la factura, a partir de una factura emitida.

#### Scenario: Admin descarga el PDF de cualquier factura
- GIVEN una factura `issued`
- WHEN el admin solicita el PDF
- THEN el sistema MUST generar y entregar el comprobante con el desglose de items

#### Scenario: Cliente descarga el PDF de su propia factura
- GIVEN una factura `issued` del cliente autenticado
- WHEN el cliente solicita el PDF
- THEN el sistema MUST generar y entregar el comprobante

#### Scenario: Cliente intenta descargar el PDF de una factura ajena
- GIVEN una factura `issued` de otro cliente
- WHEN el cliente autenticado solicita su PDF
- THEN el sistema MUST responder 403 o 404
