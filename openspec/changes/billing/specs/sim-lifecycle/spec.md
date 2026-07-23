# sim-lifecycle Specification

## Purpose

Registro histórico de períodos de vigencia por SIM (`activated_at` / `deactivated_at`), como log append-only que es la única fuente de verdad para facturación. Se alimenta de cambios de estado de SIM y de asignación/desasignación a clientes.

## Requirements

### Requirement: Open Period on Activation Transition

El sistema MUST abrir un nuevo período de vigencia cuando una SIM transiciona a un estado facturable (Activa o Suspendida) desde un estado no facturable (Disponible o Desactivada), y no exista ya un período abierto para esa SIM.

#### Scenario: SIM pasa de Disponible a Activa
- GIVEN una SIM en estado Disponible sin período abierto
- WHEN el estado cambia a Activa
- THEN el sistema MUST crear un nuevo período con `activated_at` = fecha del cambio y `deactivated_at` = null

#### Scenario: SIM pasa de Desactivada a Activa (reactivación)
- GIVEN una SIM en estado Desactivada con su último período cerrado
- WHEN el estado cambia a Activa
- THEN el sistema MUST abrir un período nuevo con `activated_at` = fecha del cambio

### Requirement: Close Period on Deactivation Transition

El sistema MUST cerrar el período abierto de una SIM cuando su estado transiciona a Desactivada.

#### Scenario: SIM pasa de Activa a Desactivada
- GIVEN una SIM con un período abierto (`deactivated_at` null)
- WHEN el estado cambia a Desactivada
- THEN el sistema MUST cerrar el período con `deactivated_at` = fecha del cambio

#### Scenario: Desactivar una SIM sin período abierto
- GIVEN una SIM en estado Disponible (nunca tuvo período)
- WHEN por error se solicita desactivarla
- THEN el sistema MUST NOT crear ni cerrar ningún período

### Requirement: Idempotent State Changes

El sistema MUST NOT abrir un período nuevo ni cerrar uno existente cuando el cambio de estado no representa una transición real (p. ej. "activar" algo que ya está activo, o cambiar entre Activa y Suspendida).

#### Scenario: Re-activar una SIM ya activa
- GIVEN una SIM en estado Activa con un período abierto
- WHEN se ejecuta nuevamente la operación de activar
- THEN el sistema MUST NOT crear un período adicional

#### Scenario: Transición entre Activa y Suspendida
- GIVEN una SIM en estado Activa con un período abierto
- WHEN el estado cambia a Suspendida
- THEN el sistema MUST mantener el mismo período abierto (ambos estados son facturables, no hay corte de vigencia)

### Requirement: Assignment and Unassignment Tracking

El sistema MUST mantener sincronizados el estado operativo de "de quién es la SIM hoy" (KV) con el log de períodos (`sim_assignments`), escribiendo ambos en la misma operación de asignación o desasignación.

#### Scenario: Asignar una SIM a un cliente
- GIVEN una SIM sin cliente asignado
- WHEN el admin la asigna a un cliente
- THEN el sistema MUST registrar la asociación cliente-SIM vigente
- AND el registro de período de vigencia MUST quedar disponible para facturación del cliente correspondiente

#### Scenario: Desasignar una SIM de un cliente
- GIVEN una SIM asignada a un cliente
- WHEN el admin la desasigna
- THEN el sistema MUST reflejar el fin de la relación cliente-SIM sin alterar el historial de períodos ya registrados

### Requirement: Historical Integrity

El log de períodos MUST ser append-only: un período cerrado MUST NOT ser modificado o eliminado por operaciones posteriores. Ciclos posteriores de baja/alta dentro del mismo mes MUST generar entradas de historial propias, sin alterar períodos previos.

#### Scenario: Múltiples ciclos baja/alta en el mismo mes
- GIVEN una SIM que se activa, desactiva y reactiva varias veces dentro de un mismo mes
- WHEN cada transición ocurre
- THEN el sistema MUST registrar un período distinto por cada ciclo
- AND ningún período previamente cerrado MUST ser alterado

### Requirement: Backfill of Preexisting SIMs

El sistema MUST proveer, para las SIMs ya asignadas antes de esta feature, un período de vigencia con `activated_at` anterior al primer período que se vaya a facturar.

#### Scenario: SIM preexistente sin historial
- GIVEN una SIM ya asignada a un cliente antes de la existencia de `sim_assignments`
- WHEN se ejecuta el backfill
- THEN el sistema MUST crear un período con `activated_at` anterior al inicio del primer mes a facturar y `deactivated_at` null
