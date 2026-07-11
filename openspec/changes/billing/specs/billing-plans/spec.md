# billing-plans Specification

## Purpose

Catálogo de planes de facturación con precio, y asignación de un plan a cada SIM. Un plan define el monto mensual que se cobra por SIM asignada a él.

## Requirements

### Requirement: Plan Creation

El sistema MUST permitir a un admin crear un plan con nombre, precio mensual, moneda y estado activo.

#### Scenario: Admin crea un plan válido
- GIVEN un admin autenticado
- WHEN crea un plan con nombre "Plan único" y precio 45.00 MXN
- THEN el plan se crea con estado activo por defecto

#### Scenario: Precio inválido
- GIVEN un admin autenticado
- WHEN intenta crear un plan con precio <= 0
- THEN el sistema MUST rechazar la operación con error 422

#### Scenario: Nombre requerido
- GIVEN un admin autenticado
- WHEN intenta crear un plan sin nombre (vacío o ausente)
- THEN el sistema MUST rechazar la operación con error 422

### Requirement: Plan Listing

El sistema MUST permitir a un admin listar todos los planes, activos e inactivos.

#### Scenario: Listar planes
- GIVEN existen planes activos e inactivos
- WHEN el admin solicita la lista
- THEN el sistema retorna todos los planes con su estado

### Requirement: Plan Update

El sistema MUST permitir a un admin actualizar nombre y precio de un plan existente. El cambio de precio NO MUST afectar facturas ya generadas (los items congelan `unit_price` al momento de facturar).

#### Scenario: Admin actualiza el precio de un plan
- GIVEN un plan existente con precio 45.00
- WHEN el admin lo actualiza a 50.00
- THEN el precio nuevo aplica solo a facturas futuras
- AND las facturas ya emitidas conservan el `unit_price` congelado en sus items

### Requirement: Plan Deactivation

El sistema MUST permitir desactivar un plan (soft delete) en lugar de eliminarlo, dado que puede estar referenciado por SIMs y por historial de facturación.

#### Scenario: Admin desactiva un plan
- GIVEN un plan activo sin SIMs asignadas
- WHEN el admin lo desactiva
- THEN el plan deja de estar disponible para nuevas asignaciones
- AND el plan permanece visible en el historial de facturas que ya lo usaron

#### Scenario: Intento de desactivar un plan con SIMs asignadas
- GIVEN un plan activo con al menos una SIM asignada
- WHEN el admin intenta desactivarlo
- THEN el sistema SHOULD advertir o bloquear la operación hasta que no queden SIMs activas en ese plan

### Requirement: Plan Assignment to SIM

El sistema MUST permitir asignar un plan activo a una SIM. Cada SIM MUST tener exactamente un plan vigente a la vez (el modelo soporta N planes aunque hoy exista solo uno).

#### Scenario: Asignar plan a una SIM sin plan
- GIVEN una SIM sin plan asignado
- WHEN el admin le asigna un plan activo
- THEN la SIM queda asociada a ese plan para efectos de facturación futura

#### Scenario: Intento de asignar un plan inactivo
- GIVEN un plan desactivado
- WHEN el admin intenta asignarlo a una SIM
- THEN el sistema MUST rechazar la operación con error 422

### Requirement: Authorization

Todas las operaciones de esta capability MUST estar restringidas a usuarios admin autenticados.

#### Scenario: Acceso no autenticado
- GIVEN un request sin sesión admin válida
- WHEN intenta crear, listar, actualizar o desactivar un plan
- THEN el sistema MUST responder 401 o 403
