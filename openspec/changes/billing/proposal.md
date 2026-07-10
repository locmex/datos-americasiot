# Proposal: Billing — facturación mensual de SIMs

## Intent

Hoy no se puede facturar. No existe `activated_at`/`deactivated_at` en ningún lado: el estado de la SIM vive en EMNIFY y se lee en vivo, y assign/unassign sobrescriben el KV in-place sin historial. Sin registro temporal de altas y bajas es imposible saber qué SIMs cobrarle a qué cliente en qué mes. Éxito = el admin genera con un botón las facturas del mes vencido, las revisa, las emite, marca pagos; y cada cliente ve sus facturas con desglose SIM por SIM.

## Scope

### In Scope
- 5 tablas relacionales: `plans`, `sim_assignments`, `invoices`, `invoice_items`, `payments` (coexisten con KV y con las de `client-orders`).
- Registro de altas/bajas enganchado en los 2 únicos puntos de cambio de estado (`index.ts:597` admin, `index.ts:2509` cliente): leer estado previo → detectar transición real → escribir período en `sim_assignments`.
- Dual-write en assign/unassign/bulk-assign (`index.ts:1953`, `:1970`, `:1989`).
- Backfill de las 238 SIMs asignadas con `activated_at` anterior al primer período facturado.
- Endpoints admin (CRUD planes, generar facturas `draft`, emitir, marcar pago, listar) y cliente (sus facturas + desglose).
- UI Admin + Portal Cliente; PDF de comprobante interno con **jsPDF** (nueva dep, `pnpm add jspdf`).

### Out of Scope
- CFDI / timbrado SAT.
- Pasarela de pago y cobro automático (el pago se marca a mano).
- pg_cron (v2; la generación se diseña idempotente para habilitarlo sin reescritura).
- Notificaciones / envío de facturas por email.
- UI de asignación de plan por SIM (hoy hay un solo plan) → Fase 2.
- Migrar `chip.clientId` fuera del KV.

## Reglas de negocio cerradas (no re-debatir)

1. Ciclo **mensual vencido**.
2. Precio en `plan`; plan a nivel SIM. Hoy 1 plan; el modelo soporta N.
3. Vigencia: se factura el mes M si estuvo vigente ≥1 día de M. `vigente = activated_at != null AND (deactivated_at == null OR deactivated_at >= inicio de M)`.
4. **Prorrateo — regla central**: lo determina la **primera vigencia dentro de M**. Vigente desde antes de M → 100%. Primera vigencia en día D: **D ≤ 15 → 100%**, **D ≥ 16 → 50%**. Ciclos posteriores de baja/alta dentro de M no agregan cargos ni cambian el factor.
5. **Máximo un cargo por SIM por mes**, impuesto por `unique (invoice_id, iccid)` — garantía de la DB, no promesa del código.
6. La baja **no prorratea**: cobra el mes completo y deja de cobrar desde el mes siguiente.
7. Reactivación en mes posterior = alta nueva → aplica la regla del día 15.
8. Se cobran todos los estados **excepto Desactivada (3)**. Disponible (0) nunca entra: no tiene alta.
9. `activated_at`/`deactivated_at` son **datos propios**. No se consulta EMNIFY al facturar.
10. **Dos fuentes, roles distintos**: `chip.clientId` (KV) = operación diaria ("de quién es hoy"); `sim_assignments` = log temporal de períodos y **única fuente para facturar**. Se escriben juntas.
11. Cada `invoice_item` congela: `iccid`, `plan_name`, `unit_price`, `proration_factor`, `activated_at`, `sim_status`, `amount`. Admin y cliente ven el desglose.
12. Disparo **manual** por botón del admin → `draft` → revisar → emitir. Función idempotente.

> Supuesto del usuario, anotado y NO optimizado: "creo que nunca se reasignará una SIM a otro cliente". El modelo de períodos lo soporta gratis igual.

## Capabilities

### New Capabilities
- `sim-lifecycle`: registro de períodos de vigencia por SIM (`activated_at`/`deactivated_at`), enganche en cambios de estado, dual-write con KV, backfill.
- `billing-plans`: catálogo de planes con precio; asignación de plan a SIM.
- `invoicing`: generación idempotente de facturas del mes vencido, prorrateo, desglose congelado, emisión, PDF.
- `payments`: registro manual de pagos y estado de cobro de la factura.

### Modified Capabilities
None (las capabilities de `client-orders` no cambian de requisito).

## Approach

Aditivo, pegado a los patrones ya validados en `client-orders`: `client_id` TEXT soft-ref sin FK + `client_name` snapshot, RLS deny-all (acceso solo vía `db()` service_role), guards `requireAdmin`/`requireClientSession`, rutas anidadas en `routes.tsx`, módulo `invoice-status.ts` análogo a `order-status.ts`.

El corazón es `sim_assignments` como **historial** (fila por período, nunca mutación in-place). Los dos endpoints de cambio de estado leen el estado previo **antes** del PATCH a EMNIFY para saber si hay transición real; solo entonces abren o cierran un período. La facturación es una función pura sobre esos períodos: no toca EMNIFY, no lee el KV. El PDF se genera en el frontend con jsPDF a partir de la factura ya emitida.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/000X_billing.sql` | New | 5 tablas + `unique(invoice_id, iccid)` + RLS deny-all |
| `supabase/migrations/000X_billing_backfill.sql` | New | Backfill 238 SIMs asignadas |
| `supabase/functions/make-server-ef736a01/index.ts:597` | Modified | Cambio de estado admin → abrir/cerrar período |
| `supabase/functions/make-server-ef736a01/index.ts:2509` | Modified | Cambio de estado cliente → ídem |
| `supabase/functions/make-server-ef736a01/index.ts:1953,1970,1989` | Modified | Dual-write assign/unassign/bulk-assign |
| `supabase/functions/make-server-ef736a01/index.ts` | New routes | Admin: planes, generar/emitir factura, pagos. Cliente: sus facturas + desglose |
| `src/app/lib/api.ts` | Modified | Métodos `api.*` y `clientApi.*` de billing |
| `src/app/lib/invoice-status.ts` | New | Constantes de estado de factura |
| `src/app/routes.tsx`, `Sidebar.tsx`, `ClientPortalLayout.tsx` | Modified | Rutas y nav en ambos portales |
| `src/app/pages/Admin{Invoices,Plans}Page.tsx`, `portal/ClientInvoicesPage.tsx` | New | UI |
| `package.json` | Modified | `pnpm add jspdf` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Desincronización dual-write `chip.clientId` ↔ `sim_assignments` | Med | Escritura en el mismo handler y orden fijo; endpoint admin de reconciliación (read-only diff) que liste divergencias |
| Backfill sin fecha real de activación | High | `activated_at` = fecha anterior al primer período facturado (cobra 100% por la fórmula, sin trucos). EMNIFY solo como referencia opcional |
| El estado previo no se persiste hoy → falsa transición | High | Leer estado en EMNIFY **antes** del PATCH; si no hay cambio real, no escribir período. Idempotencia reforzada: no abrir período si ya hay uno abierto |
| Doble ejecución del botón → facturas duplicadas | Med | `unique(invoice_id, iccid)` + unicidad de factura por (client_id, período); generación idempotente |
| Sin type-check ni test runner | Med | Contratos explícitos en DESIGN; interfaces TS que mapeen 1:1 la fila de Supabase (patrón `AdminOrdersPage.tsx`) |
| Prorrateo mal implementado → cobros incorrectos | Med | Algoritmo aislado y determinista sobre períodos; escenarios de borde definidos en SPECS |

## Rollback Plan

La feature es **aditiva**: KV, EMNIFY y todas las rutas existentes siguen funcionando sin ella.

1. **Migraciones**: reversibles con `drop table payments, invoice_items, invoices, sim_assignments, plans cascade;` (migración `down` incluida). Ningún cambio destructivo sobre `kv_store_ef736a01` ni sobre las tablas de `client-orders`.
2. **Frontend**: quitar rutas de `routes.tsx` y entradas de nav; `pnpm remove jspdf`. Páginas nuevas son archivos aislados.
3. **Código existente modificado** (el único punto delicado): los 5 enganches en `index.ts` (`:597`, `:1953`, `:1970`, `:1989`, `:2509`). Se implementan como **bloques aditivos aislados** — una llamada a un helper (p. ej. `recordSimPeriod(...)` / `syncAssignment(...)`) colocada después del `emnifyFetch` exitoso y antes de `logActivity`, envuelta en try/catch que **nunca** falla la request original. Revertir = borrar esas 5 llamadas + el módulo helper; el comportamiento previo queda intacto byte a byte.

## Dependencies

- `jspdf` (nueva dependencia, instalar con **pnpm**).
- **Pendiente de dato (no bloquea diseño)**: el precio fijo del plan único — es un seed. La migración deja el `INSERT INTO plans` con el precio a completar.

## Success Criteria

- [ ] El admin genera las facturas de un mes vencido con un botón, en estado `draft`, y re-ejecutarlo no duplica cargos.
- [ ] Cada SIM vigente ≥1 día del mes aparece exactamente una vez, con factor 100% o 50% según la regla del día 15 aplicada a su primera vigencia del mes.
- [ ] Una SIM desactivada a mitad de mes cobra el mes completo y no aparece en el mes siguiente.
- [ ] Las 238 SIMs preexistentes cobran 100% en el primer período facturado.
- [ ] El admin emite la factura, marca el pago y descarga el PDF.
- [ ] El cliente ve solo sus facturas, con desglose SIM por SIM y PDF.

## Handoff

- **SPECS** (`sdd-spec`): requisitos y escenarios por capability — matriz de casos de prorrateo (alta día 1/15/16/31, baja + realta mismo mes, realta mes posterior), estados facturables, idempotencia de la generación, autorización por rol, visibilidad del desglose.
- **DESIGN** (`sdd-design`): columnas y tipos, constraints (`unique(invoice_id, iccid)`, unicidad factura/período), políticas RLS, algoritmo de cálculo del factor de prorrateo, contratos de request/response de cada endpoint, estrategia y SQL del backfill de las 238 SIMs, diseño del helper de enganche (lectura del estado previo), wiring de UI y del PDF.
