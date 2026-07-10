# Tasks: Billing — facturación mensual de SIMs

## Phase 1: Infra / DB

- [ ] 1.1 Escribir `supabase/migrations/0002_billing.sql`: tablas `plans`, `sim_assignments`, `invoices`, `invoice_items`, `payments` (orden FK), constraints (`unique(invoice_id,iccid)`, `unique(client_id,period_year,period_month)`, partial unique open period), índices, RLS deny-all, `down`.
- [ ] 1.2 En la misma migración: seed `plans` ("Plan único", $45.00 MXN).
- [ ] 1.3 En la misma migración: backfill `sim_assignments` desde `kv_store_ef736a01` (238 SIMs, `activated_at='2026-01-01-06'`, idempotente `NOT EXISTS`). Confirmar antes de aplicar que el primer mes a facturar (junio 2026) sea posterior a esa fecha.
- [ ] 1.4 Aplicar `0002_billing.sql` vía MCP Supabase (`apply_migration`). Depende de: 1.1-1.3.
- [ ] 1.5 Verificar con `list_tables`/`get_advisors` que las 5 tablas, constraints y RLS quedaron como en el diseño. Depende de: 1.4.

## Phase 2: Testing setup + lógica pura (red de seguridad)

- [ ] 2.1 `pnpm add -D vitest`; crear `vitest.config.ts` (`environment:'node'`, `include:['**/*.test.ts']`); agregar scripts `test`/`test:watch` en `package.json`.
- [ ] 2.2 Escribir `supabase/functions/make-server-ef736a01/billing/proration.test.ts` con los 15 escenarios del spec (RED — deben fallar sin implementación).
- [ ] 2.3 Implementar `supabase/functions/make-server-ef736a01/billing/proration.ts` (`isSimBillable`, `computeProrationFactor`, sin imports Deno/Node). Depende de: 2.2.
- [ ] 2.4 Correr `pnpm test`; los 15 casos deben pasar en verde. Depende de: 2.3.

## Phase 3: Backend

- [ ] 3.1 Implementar `supabase/functions/make-server-ef736a01/billing/sim-periods.ts` con `syncSimPeriod(iccid,{statusId?,actorId?})`. Depende de: 1.4, 2.3.
- [ ] 3.2 Enganchar `syncSimPeriod` en `index.ts:597` y `:2509` (tras PATCH status EMNIFY OK), en try/catch que no rompe la request. Depende de: 3.1.
- [ ] 3.3 Enganchar `syncSimPeriod` en `index.ts:1953`, `:1970`, `:1989` (tras assign/unassign/bulk, `kv.set` OK). Depende de: 3.1.
- [ ] 3.4 CRUD `/plans` (`GET`/`POST`/`PATCH`, `requireAdmin`; 422 nombre vacío/precio≤0). Depende de: 1.4.
- [ ] 3.5 `POST /billing/generate {year,month}`: agrupa `sim_assignments` por cliente/iccid, usa `computeProrationFactor`, upsert invoice draft, rebuild items si draft/skip si no; 422 período futuro. Depende de: 2.4, 3.1-3.3.
- [ ] 3.6 `GET /invoices` (filtros status/client/year/month) y `GET /invoices/:id` (items+payments+balance). Depende de: 3.5.
- [ ] 3.7 `POST /invoices/:id/issue` (draft→issued; 422 si no draft). Depende de: 3.5.
- [ ] 3.8 `POST /invoices/:id/payments` (abono): valida status, sobrepago, fecha/método; recalcula `partially_paid`/`paid`. Depende de: 3.7.
- [ ] 3.9 `POST /invoices/:id/cancel` (422 si `paid`). Depende de: 3.5.
- [ ] 3.10 `GET /billing/reconcile` (read-only diff KV↔períodos). Depende de: 3.1.
- [ ] 3.11 `GET /client/invoices` y `GET /client/invoices/:id` (`requireClientSession`; ajena → 403/404). Depende de: 3.6.

## Phase 4: Frontend

- [ ] 4.1 `pnpm add jspdf`.
- [ ] 4.2 Crear `src/app/lib/invoice-status.ts` (mapa de estados + `formatCurrency`), siguiendo el patrón de `src/app/lib/order-status.ts`.
- [ ] 4.3 Agregar métodos `api.*` (plans, billing/generate, invoices, payments, cancel, reconcile) y `clientApi.*` (invoices) en `src/app/lib/api.ts`. Depende de: 3.4-3.11.
- [ ] 4.4 Crear `src/app/pages/AdminPlansPage.tsx` (CRUD planes), siguiendo el patrón de `src/app/pages/AdminOrdersPage.tsx`. Depende de: 4.3.
- [ ] 4.5 Crear `src/app/pages/AdminInvoicesPage.tsx` (listado, detalle, generar, emitir, abonar, cancelar, botón PDF). Depende de: 4.3, 4.2.
- [ ] 4.6 Crear `src/app/pages/portal/ClientInvoicesPage.tsx` (listado + detalle solo-lectura, botón PDF gate `status!=draft`). Depende de: 4.3, 4.2.
- [ ] 4.7 Implementar generación de PDF client-side con jsPDF a partir del JSON de factura ya autorizado (usado en 4.5 y 4.6). Depende de: 4.1.
- [ ] 4.8 Agregar rutas en `routes.tsx` (admin: Planes/Facturación; portal: Mis Facturas). Depende de: 4.4-4.6.
- [ ] 4.9 Agregar nav en `Sidebar.tsx`/`AppLayout.tsx` (admin) y `ClientPortalLayout.tsx` (portal). Depende de: 4.8.

## Phase 5: Verify / QA

- [ ] 5.1 Correr `pnpm test` completo (15 casos de prorrateo en verde). Depende de: 2.4.
- [ ] 5.2 Pruebas manuales de endpoints: 401/403/422 en cada ruta admin y cliente; doble `POST /billing/generate` no duplica (idempotencia). Depende de: 3.4-3.11.
- [ ] 5.3 Verificar constraints en DB (unique invoice/iccid, unique client/period, partial unique open period) y RLS deny-all vía MCP Supabase (`get_advisors`). Depende de: 1.5.
- [ ] 5.4 Flujo E2E admin: generar → emitir → abonar (parcial y total) → cancelar (draft/issued) → PDF. Depende de: 4.5, 5.2.
- [ ] 5.5 Flujo E2E cliente: ver "Mis Facturas", detalle de factura propia, 403/404 en factura ajena, PDF de factura issued/paid. Depende de: 4.6, 5.2.
