# payments Specification

## Purpose

Registro manual de pagos de facturas por parte del admin, y exposición del estado de cobro. Decisión de alcance: en el MVP una factura admite **pagos en abonos** (pagos parciales). Cada abono reduce el saldo pendiente; la factura se salda automáticamente cuando la suma de abonos iguala el total. El cliente ve el saldo y el historial de abonos, pero no los registra.

## Requirements

### Requirement: Payment Registration (abonos)

El sistema MUST permitir a un admin registrar un abono sobre una factura `issued` o `partially_paid`, indicando monto, fecha, método y nota opcional. El monto MUST ser mayor que 0 y MUST ser menor o igual al **saldo pendiente** de la factura, definido como `total − Σ(abonos registrados)`.

#### Scenario: Abono parcial deja la factura parcialmente pagada
- GIVEN una factura `issued` con total 450.00 y sin abonos
- WHEN el admin registra un abono por 200.00
- THEN el sistema MUST guardar el abono
- AND el saldo pendiente MUST quedar en 250.00
- AND el estado de la factura MUST cambiar a `partially_paid`

#### Scenario: Abono que completa el total salda la factura
- GIVEN una factura `partially_paid` con total 450.00 y 200.00 ya abonados (saldo 250.00)
- WHEN el admin registra un abono por 250.00
- THEN el sistema MUST guardar el abono
- AND el estado de la factura MUST cambiar automáticamente a `paid`

#### Scenario: Abono que excede el saldo pendiente
- GIVEN una factura `partially_paid` con saldo pendiente 250.00
- WHEN el admin intenta registrar un abono por un monto mayor a 250.00
- THEN el sistema MUST rechazar la operación con error 422 (no se admite sobrepago)

#### Scenario: Abono con monto no positivo
- GIVEN una factura `issued`
- WHEN el admin intenta registrar un abono con monto 0 o negativo
- THEN el sistema MUST rechazar la operación con error 422

#### Scenario: Pago sobre una factura en estado draft
- GIVEN una factura en estado `draft` (no emitida)
- WHEN el admin intenta registrar un abono
- THEN el sistema MUST rechazar la operación con error 422

#### Scenario: Pago sobre una factura ya pagada
- GIVEN una factura en estado `paid`
- WHEN el admin intenta registrar otro abono sobre la misma factura
- THEN el sistema MUST rechazar la operación con error 422 (saldo pendiente 0)

#### Scenario: Datos de pago inválidos
- GIVEN una factura `issued`
- WHEN el admin intenta registrar un abono sin fecha o sin método
- THEN el sistema MUST rechazar la operación con error 422

### Requirement: Invoice Status Lifecycle

El estado de una factura MUST transicionar `draft` → `issued` → `partially_paid` → `paid`, con `cancelled` alcanzable desde `draft`, `issued` o `partially_paid`. El estado MUST ser `partially_paid` cuando `0 < Σ(abonos) < total`, y `paid` cuando `Σ(abonos) == total`. Una factura `paid` o `cancelled` MUST NOT volver a un estado anterior.

#### Scenario: Cancelar una factura en draft
- GIVEN una factura en estado `draft`
- WHEN el admin la cancela
- THEN el estado MUST cambiar a `cancelled`

#### Scenario: Cancelar una factura emitida sin abonos
- GIVEN una factura en estado `issued` sin abonos registrados
- WHEN el admin la cancela
- THEN el estado MUST cambiar a `cancelled`

#### Scenario: Cancelar una factura parcialmente pagada
- GIVEN una factura en estado `partially_paid` con abonos registrados
- WHEN el admin la cancela
- THEN el sistema MUST cambiar el estado a `cancelled`
- AND los abonos registrados MUST conservarse en el historial (auditoría)

#### Scenario: Intento de cancelar una factura pagada
- GIVEN una factura en estado `paid`
- WHEN el admin intenta cancelarla
- THEN el sistema MUST rechazar la operación con error 422

#### Scenario: Intento de transición inválida
- GIVEN una factura en estado `cancelled`
- WHEN se intenta emitirla o registrar un abono
- THEN el sistema MUST rechazar la operación con error 422

### Requirement: Payment Visibility

El cliente MUST poder ver, de sus propias facturas, el estado de pago, el saldo pendiente y el historial de abonos; pero MUST NOT poder registrar, modificar ni cancelar pagos.

#### Scenario: Cliente consulta el saldo e historial de su factura
- GIVEN una factura `partially_paid` del cliente autenticado
- WHEN el cliente la consulta
- THEN el sistema MUST mostrar el estado, el saldo pendiente y la lista de abonos con su fecha y monto

#### Scenario: Cliente intenta registrar un pago
- GIVEN un cliente autenticado (no admin)
- WHEN intenta registrar un abono sobre una factura propia
- THEN el sistema MUST responder 403

### Requirement: Authorization

Todas las operaciones de escritura sobre pagos MUST estar restringidas a admin autenticado.

#### Scenario: Acceso no autenticado
- GIVEN un request sin sesión admin válida
- WHEN intenta registrar un abono o cambiar el estado de una factura
- THEN el sistema MUST responder 401 o 403
