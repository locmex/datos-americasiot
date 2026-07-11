# Design: Billing — facturación mensual de SIMs

## Technical Approach

Aditivo, pegado a `client-orders`: 5 tablas relacionales (RLS deny-all, acceso solo vía `db()` service_role), `client_id` TEXT soft-ref al KV + snapshots, rutas Hono con `requireAdmin`/`requireClientSession`, módulo `invoice-status.ts` análogo a `order-status.ts`, páginas siguiendo el patrón `AdminOrdersPage`. El corazón es `sim_assignments` como **log de períodos append-only** (única fuente para facturar) y una **función pura de prorrateo** compartida por el edge (Deno) y los tests (Vitest). PDF client-side con jsPDF. Cubre specs `sim-lifecycle`, `billing-plans`, `invoicing`, `payments`.

## Architecture Decisions

### Decision: Reconciliación idempotente en vez de "leer estado previo"
**Choice**: Un único helper `syncSimPeriod(iccid, {statusId?})` que, DESPUÉS de la operación exitosa, compara el estado DESEADO (`billable && tieneCliente`) contra si ya existe un período abierto, y abre/cierra según corresponda.
**Alternatives considered**: Leer el estado EMNIFY previo antes del PATCH (planteado en la propuesta) y diffear transiciones.
**Rationale**: La existencia de un período abierto YA codifica el estado previo persistido. Reconciliar es idempotente por construcción (cubre re-activar-ya-activa, Activa↔Suspendida sin corte, desactivar-sin-período) sin GETs extra de EMNIFY en los hooks de status (el `statusId` nuevo llega en el body). Solo assign/unassign, que no cambian status, hacen 1 GET a `/sim/:id` para conocer si es billable — ops de baja frecuencia. Todo envuelto en try/catch que NUNCA falla la request original. Supera el enfoque de la propuesta y lo documento como tal.

### Decision: Función pura de prorrateo — fuente única compartida Deno/Node
**Choice**: `supabase/functions/make-server-ef736a01/billing/proration.ts`, sin imports de Deno ni Node (solo `Date`+aritmética). El edge la importa con `./billing/proration.ts`; Vitest la importa con `./proration.ts` (Vite resuelve la extensión `.ts`).
**Alternatives considered**: Duplicar la función en el frontend para los tests; extraerla a un paquete npm.
**Rationale**: Es la lógica más crítica y la más testeada (15 escenarios). Duplicar arriesga drift. Al no tener dependencias de runtime, un solo archivo sirve a ambos mundos.

### Decision: Factor por conjunto de períodos, no por período único
**Choice**: `computeProrationFactor(periods, year, month)` opera sobre TODOS los períodos de una SIM en el mes → resuelve "primera vigencia del mes" con ciclos baja/alta correctamente. Firma:
```ts
type Period = { activatedAt: string; deactivatedAt: string | null };
export function isSimBillable(periods: Period[], year: number, month: number): boolean;
export function computeProrationFactor(periods: Period[], year: number, month: number): 0 | 0.5 | 1;
```
**Rationale**: La firma de período único no puede modelar "alta día 3, baja 10, realta 20 → 100% y UN cargo". El generador agrupa períodos por `iccid` y llama una vez por SIM.

### Decision: Snapshot de `last_status_id` en el período (no consultar EMNIFY al facturar)
**Choice**: `sim_assignments.last_status_id` se actualiza en cada `syncSimPeriod`. El generador congela `sim_status` desde ahí.
**Rationale**: Spec: "no se consulta EMNIFY al facturar". Actualizar el status del período ABIERTO no viola append-only (solo se prohíbe alterar/borrar períodos cerrados).

### Decision: Idempotencia por constraints de DB
**Choice**: `unique(invoice_id, iccid)` (máx 1 cargo/SIM), `unique(client_id, period_year, period_month)` (no duplicar factura), partial `unique(iccid) where deactivated_at is null` (máx 1 período abierto).
**Rationale**: Garantía de la DB, no promesa del código. Doble click del botón no duplica.

### Decision: PDF client-side, sin endpoint
**Choice**: Botón "Descargar PDF" en el detalle (admin y cliente) genera con jsPDF a partir del JSON de la factura ya autorizado por la API. Gate: `status !== 'draft'`.
**Rationale**: La API ya autoriza el detalle por rol; no hace falta ruta nueva ni PDF en el servidor.

## Data Flow

```
Cambio de estado / assign / unassign (index.ts)
  emnifyFetch/kv.set OK ──► try{ syncSimPeriod(iccid) }catch{log}  (nunca rompe request)
                                     │
                                     ▼  reconciliar deseado vs período abierto
                              sim_assignments (log append-only)
                                     │  (única fuente)
POST /billing/generate ──► computeProrationFactor(periods, y, m) ──► invoices + invoice_items (congelados)
POST /invoices/:id/payments ──► payments ──► recomputar saldo ──► status issued→partially_paid→paid
GET (admin/cliente) ──► invoice JSON ──► jsPDF (frontend)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0002_billing.sql` | Create | 5 tablas (orden FK) + seed plan $45.00 + backfill KV + RLS deny-all |
| `supabase/functions/make-server-ef736a01/billing/proration.ts` | Create | Función pura `isSimBillable`/`computeProrationFactor` |
| `supabase/functions/make-server-ef736a01/billing/proration.test.ts` | Create | 15 escenarios del spec |
| `supabase/functions/make-server-ef736a01/billing/sim-periods.ts` | Create | Helper `syncSimPeriod` (usa `db()` + `kv`) |
| `.../index.ts:597,2509` | Modify | Tras PATCH EMNIFY OK → `syncSimPeriod(iccid,{statusId})` |
| `.../index.ts:1953,1970,1989` | Modify | Tras `kv.set` OK → `syncSimPeriod(iccid)` |
| `.../index.ts` | New routes | CRUD `/plans`, `/billing/*`, `/invoices/*`, `/client/invoices/*`, `/billing/reconcile` |
| `vitest.config.ts` | Create | `test.include=['**/*.test.ts']`, `environment:'node'` |
| `package.json` | Modify | `-D vitest`; `+jspdf`; scripts `test`/`test:watch` |
| `src/app/lib/api.ts` | Modify | métodos `api.*` y `clientApi.*` de billing |
| `src/app/lib/invoice-status.ts` | Create | mapa de estados + `formatCurrency` |
| `src/app/pages/Admin{Plans,Invoices}Page.tsx`, `portal/ClientInvoicesPage.tsx` | Create | UI |
| `routes.tsx`, `Sidebar.tsx`/`AppLayout.tsx`, `ClientPortalLayout.tsx` | Modify | rutas + nav ambos portales |

## Schema (0002_billing.sql — orden de creación)

```sql
-- 1. plans
create table plans(
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name))>0),
  unit_price numeric(12,2) not null check(unit_price>0),
  currency text not null default 'MXN',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

-- 2. sim_assignments (log de períodos; client_id soft-ref KV + snapshot)
create table sim_assignments(
  id uuid primary key default gen_random_uuid(),
  iccid text not null,
  client_id text not null,
  client_name text not null,
  plan_id uuid references plans(id) on delete restrict,
  activated_at timestamptz not null,
  deactivated_at timestamptz,               -- null = período abierto
  last_status_id int not null default 1,
  created_at timestamptz not null default now());
create index idx_sa_iccid on sim_assignments(iccid);
create index idx_sa_client on sim_assignments(client_id);
create index idx_sa_window on sim_assignments(activated_at, deactivated_at);
create unique index uq_sa_open on sim_assignments(iccid) where deactivated_at is null;

-- 3. invoices
create table invoices(
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  client_name text not null,
  period_year int not null check(period_year between 2020 and 2100),
  period_month int not null check(period_month between 1 and 12),
  status text not null default 'draft'
    check(status in('draft','issued','partially_paid','paid','cancelled')),
  currency text not null default 'MXN',
  total numeric(12,2) not null default 0 check(total>=0),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, period_year, period_month));
create index idx_inv_client on invoices(client_id);
create index idx_inv_status on invoices(status);
create index idx_inv_period on invoices(period_year, period_month);

-- 4. invoice_items (todo congelado)
create table invoice_items(
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  iccid text not null,
  plan_id uuid references plans(id) on delete restrict,
  plan_name text not null,
  unit_price numeric(12,2) not null check(unit_price>0),
  proration_factor numeric(3,2) not null check(proration_factor in (0.50,1.00)),
  activated_at timestamptz not null,
  sim_status text not null,
  amount numeric(12,2) not null check(amount>0),
  unique(invoice_id, iccid));                 -- máx 1 cargo/SIM/factura
create index idx_ii_invoice on invoice_items(invoice_id);

-- 5. payments (abonos; append-only, se conservan al cancelar)
create table payments(
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  paid_at timestamptz not null,
  method text not null check(length(trim(method))>0),
  note text,
  created_by text not null,
  created_at timestamptz not null default now());
create index idx_pay_invoice on payments(invoice_id);

alter table plans enable row level security;
alter table sim_assignments enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;

-- seed + backfill (mismo archivo; requiere plans creada)
insert into plans(name,unit_price,currency) values('Plan único',45.00,'MXN');
insert into sim_assignments(iccid,client_id,client_name,plan_id,activated_at,last_status_id)
select k.value->>'iccid', k.value->>'clientId', coalesce(k.value->>'clientName','—'),
       (select id from plans where active order by created_at limit 1),
       timestamptz '2026-01-01 00:00:00-06', 1
from kv_store_ef736a01 k
where k.key like 'chip:%' and (k.value->>'clientId') is not null
  and not exists (select 1 from sim_assignments s where s.iccid = k.value->>'iccid');
```
Backfill vive en la MISMA migración (SQL puro leyendo el JSONB del KV) — reproducible, versionado, idempotente por el `not exists`. `activated_at = 2026-01-01` (< primer mes a facturar, junio 2026) → 100% por la fórmula. **down**: `drop table payments, invoice_items, invoices, sim_assignments, plans cascade;`

## Pure Proration (proration.ts)

Constante de zona: **UTC-6** fija (America/Mexico_City, sin DST post-2023). Se compara por instantes.
```ts
const MX = 6 * 3600e3;                                   // offset ms
const startOfM = (y:number,m:number)=> Date.UTC(y,m-1,1) + MX;
const startNext = (y:number,m:number)=> Date.UTC(m===12?y+1:y, m%12,1) + MX;
const mxDay = (iso:string)=> new Date(Date.parse(iso)-MX).getUTCDate();

function overlaps(p:Period,y:number,m:number){
  const a=Date.parse(p.activatedAt), s=startOfM(y,m), e=startNext(y,m);
  const d=p.deactivatedAt?Date.parse(p.deactivatedAt):Infinity;
  return a < e && d >= s;                                 // vigente ≥1 día de M
}
export function isSimBillable(ps:Period[],y:number,m:number){ return ps.some(p=>overlaps(p,y,m)); }
export function computeProrationFactor(ps:Period[],y:number,m:number): 0|0.5|1 {
  const ov = ps.filter(p=>overlaps(p,y,m));
  if(!ov.length) return 0;
  if(ov.some(p=>Date.parse(p.activatedAt) < startOfM(y,m))) return 1;   // venía de antes → 100%
  const firstDay = Math.min(...ov.map(p=>mxDay(p.activatedAt)));        // primera vigencia del mes
  return firstDay <= 15 ? 1 : 0.5;
}
```
Mapeo de los 15 escenarios (todos verificados):

| # | Input (períodos) | mes | factor |
|---|---|---|---|
|1|act jun, sin baja|jul|1|
|2|act jul-01|jul|1|
|3|act jul-15|jul|1|
|4|act jul-16|jul|0.5|
|5|act jul-31|jul|0.5|
|6|jul-03→10, jul-20→∅|jul|1 (min día=3)|
|7|jul-20→25, jul-28→∅|jul|0.5 (min día=20)|
|8|act may, deact jul-26|jul|1 (venía antes)|
|9|deact jun-30|jul|0 (no overlap)|
|10|deact jul-26|ago|0 (no overlap)|
|11|jul-…→26; sep-20→∅|jul/ago/sep|1 / 0 / 0.5|
|12|sin períodos|any|0|
|13|período cerrado antes de M|M|0|
|14|suspendida, abierto desde antes|jul|1|
|15|3 ciclos en jul|jul|1 item, factor por 1ª vigencia|

## Interfaces / Contracts

`syncSimPeriod(iccid, {statusId?, actorId?})`: lee `chip:iccid` (clientId/planId) → `statusId` (body o GET `/sim/:id`) → `billable = statusId∈{1,2}` → `desired = billable && !!clientId`. Abre período (insert) si `desired && !open`; cierra (set `deactivated_at=now`) si `!desired && open`; siempre `update last_status_id` del período abierto. Idempotente; errores solo se loguean.

Endpoints (JSON, `requireAdmin` salvo indicado):

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
|GET|`/plans`| |`{plans:[{id,name,unit_price,currency,active}]}`|
|POST|`/plans`|`{name,unit_price,currency?}`|`{plan}` · 422 precio≤0/nombre vacío|
|PATCH|`/plans/:id`|`{name?,unit_price?,active?}`|`{plan}`|
|POST|`/billing/generate`|`{year,month}`|`{created:n, skipped:n, invoices:[...]}` · 422 período futuro|
|GET|`/invoices`|`?status&client_id&year&month`|`{invoices:[{...,total,status}]}`|
|GET|`/invoices/:id`| |`{invoice, items:[...], payments:[...], balance}`|
|POST|`/invoices/:id/issue`| |`{invoice}` · 422 si no `draft`|
|POST|`/invoices/:id/payments`|`{amount,paid_at,method,note?}`|`{payment, invoice}` · 422 monto/saldo/estado|
|POST|`/invoices/:id/cancel`| |`{invoice}` · 422 si `paid`|
|GET|`/billing/reconcile`| |`{divergences:[{iccid,kvClientId,periodClientId}]}` (read-only)|
|GET|`/client/invoices`|(`requireClientSession`)|solo del `clientId` de sesión|
|GET|`/client/invoices/:id`|(`requireClientSession`)|`{invoice,items,payments,balance}`; ajena → 403/404|

`POST /billing/generate` (idempotente): rechaza si `(year,month) > mes actual` → 422. Selecciona períodos que `overlaps`; agrupa por `client_id` y luego por `iccid`. Por cliente: upsert invoice `(client_id,year,month)`; si status ≠ `draft` → skip (inmutable); si `draft` → borra sus items y recomputa. Por SIM: `factor=computeProrationFactor(periodsOfIccid)`; si `>0` inserta item congelado (`amount=unit_price*factor`). `invoice.total=Σ amounts`.

Registro de abono: valida `status∈{issued,partially_paid}` (si no → 422), `amount>0`, `amount ≤ total−Σpagos` (sobrepago → 422), fecha y método presentes. Inserta; recomputa Σ; `Σ==total → paid`, `0<Σ<total → partially_paid`.

## Testing Strategy

| Layer | Qué | Cómo |
|---|---|---|
|Unit|15 escenarios de prorrateo + `isSimBillable`|Vitest sobre `proration.ts` puro (primer test runner del proyecto)|
|Unit|Bordes de saldo/estado de abono|Función pura de transición de estado (opcional, extraíble)|
|Integración|generate idempotente, unique constraints|Manual vía MCP Supabase / staging (sin harness HTTP hoy)|

Vitest: `pnpm add -D vitest`; `vitest.config.ts` mínimo (`environment:'node'`, `include:['**/*.test.ts']`); scripts `"test":"vitest run"`, `"test:watch":"vitest"`. Sin tsconfig (esbuild transpila sin typecheck).

## Migration / Rollout

Aditivo. Migración 0002 (tablas+seed+backfill) reversible con el `down`. Frontend: quitar rutas/nav, `pnpm remove jspdf`. Los 5 hooks son llamadas aisladas envueltas en try/catch → revertir = borrar 5 líneas + `billing/`. KV, EMNIFY y rutas existentes intactos.

## Sequence Diagrams

Generar facturas de un período:
```
Admin → API POST /billing/generate {y,m}
API: y,m > hoy? → 422
API → sim_assignments: SELECT overlaps(y,m)
API: group by client → by iccid → computeProrationFactor()   (pura, sin EMNIFY/KV)
API → invoices: upsert(client,y,m) [draft: rebuild; emitida: skip]
API → invoice_items: insert congelados (unique invoice_id,iccid)
API → invoices: total=Σamount
API → Admin: {created,skipped,invoices}
```
Registrar un abono:
```
Admin → API POST /invoices/:id/payments {amount,paid_at,method}
API → invoices: status∈{issued,partially_paid}? no→422
API → payments: Σ; amount>0 && amount≤total−Σ? no→422 (sobrepago)
API → payments: INSERT abono
API: Σ'=Σ+amount → status = Σ'==total?paid : partially_paid
API → invoices: UPDATE status
API → Admin: {payment, invoice{status,balance}}
```

## Open Questions

- [ ] `activated_at` del backfill fijado a `2026-01-01`: confirmar que el primer mes a facturar sea ≥ febrero 2026 (hoy 2026-07-10 → junio 2026, OK).
- [ ] `plan_id` por SIM: hoy 1 plan; el período usa el plan activo por defecto (UI de asignación plan↔SIM es Fase 2, fuera de scope).
