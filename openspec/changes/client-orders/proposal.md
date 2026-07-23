# Proposal: Client Orders (sistema de pedidos)

## Intent

Hoy no existe forma de que un cliente pida productos (SIMs u otros) desde su portal ni de que el admin gestione esos pedidos. El proceso es manual/externo, sin trazabilidad ni historial. Esta feature introduce un flujo de pedidos end-to-end (cliente crea → admin prepara/envía → cliente recibe) con catálogo de productos, historial de estados y tracking manual. Es el primer módulo con datos relacionales del proyecto: sienta la base para dejar atrás el KV en dominios que lo necesitan.

## Scope

### In Scope (MVP)
- 4 tablas relacionales (`products`, `orders`, `order_items`, `order_status_history`) que COEXISTEN con el KV.
- Puente blando `orders.client_id` (TEXT, sin FK) → `client:<id>` del KV + `client_name` snapshot.
- Endpoints admin: CRUD de productos, listar TODOS los pedidos, cambiar estado, cargar tracking manual.
- Endpoints cliente: ver catálogo, crear pedido, ver historial propio, marcar recibido.
- Check de rol explícito `session.role !== "admin"` en cada ruta admin nueva + helper `requireAdmin`.
- Estados `pending | preparing | shipped | delivered | cancelled` (CHECK en DB).
- Tracking manual: `carrier` (texto libre), `tracking_number`, `tracking_url` armado con map carrier→URL.
- UI admin: páginas "Pedidos" y "Productos" en el nav de `AppLayout`.
- UI cliente: nueva sección "Pedidos" con navegación de nivel superior (Opción B) — agrega el primer routing anidado al portal.
- RLS deny-all en las tablas nuevas desde el día 1 (acceso solo service_role).
- Directorio `supabase/migrations/` versionado en git + aplicación vía Supabase MCP.

### Out of Scope
- Tracking automático por agregador (Skydropx/AfterShip) → Fase 2, diseño aditivo.
- Pagos / facturación / cobros.
- Migrar los clientes del KV a tablas relacionales.
- Notificaciones (email/push) de cambios de estado.
- Type-checking de DTOs (el build no valida tipos — estándar del proyecto).

## Capabilities

### New Capabilities
- `product-catalog`: CRUD admin de productos y lectura del catálogo por el cliente.
- `order-management`: creación de pedidos por cliente, gestión de estado/tracking por admin, historial y confirmación de recepción.

### Modified Capabilities
- None

## Approach

Backend: agregar rutas al Hono monolítico (`index.tsx`) reusando `requireAuth`; introducir `requireAdmin` para las admin-only y `requireClientSession` (ya existe) para las de cliente. Consultas relacionales vía un cliente Supabase reutilizado desde `kv_store.tsx` (service_role, RLS bypass). Persistencia relacional pura para el pedido; el vínculo con el cliente es soft-reference al KV con snapshot de nombre. Historial en tabla dedicada (auditoría, no leída en cada render). Frontend: métodos nuevos añadidos a `api`/`clientApi`; páginas admin nuevas + entradas de nav/routes; portal cliente estrena routing anidado para la sección "Pedidos".

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Directorio nuevo; SQL versionado de las 4 tablas + RLS. |
| `supabase/functions/server/index.tsx` | Modified | Rutas admin/cliente de products y orders; helper `requireAdmin`. |
| `supabase/functions/server/kv_store.tsx` | Modified | Exponer/reutilizar el cliente Supabase para queries relacionales. |
| `src/app/lib/api.ts` | Modified | Métodos nuevos en `api` (admin) y `clientApi` (portal). |
| `src/app/pages/` | New | Páginas admin "Pedidos" y "Productos". |
| `src/app/routes.tsx` | Modified | Rutas admin nuevas + primer routing anidado del portal. |
| `src/app/components/layout/AppLayout.tsx` | Modified | Entradas de nav + title map. |
| Client portal (nav nivel superior) | New | Sección "Pedidos" separada de Dispositivos/SIMs. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ruta admin sin check de rol (no hay guard genérico). | Med | Helper `requireAdmin` + check explícito por ruta; validar en verify. |
| Borrado de cliente en KV deja pedidos huérfanos. | Med | Soft-reference + `client_name` snapshot; documentar (no cascada). |
| Drift de esquema si la migración no se versiona. | Med | Commitear SQL en `supabase/migrations/` además del MCP. |
| RLS mal configurada expone tablas nuevas. | Low | Deny-all/service-role-only desde el día 1; auditar en verify. |
| Mismatch de DTOs no detectado (sin type-check). | Low | Contratos claros en spec/design; pruebas manuales de runtime. |

## Rollback Plan

Migraciones reversibles: `DROP TABLE` de las 4 tablas nuevas (orden inverso por FKs). El KV y todas las rutas existentes quedan intactos, así que revertir código = quitar rutas/páginas nuevas sin efectos colaterales. La feature es puramente aditiva.

## Dependencies

- Acceso a Supabase MCP para aplicar migraciones (proyecto `qbewhyosgeihmdbswcue`).

## Success Criteria

- [ ] Un cliente crea un pedido desde el portal y lo ve en su historial.
- [ ] El admin ve todos los pedidos, cambia estado y carga tracking manual.
- [ ] El admin gestiona el catálogo (CRUD de productos).
- [ ] Cada ruta admin rechaza sesiones de cliente (403).
- [ ] Las 4 tablas tienen RLS deny-all y el SQL está versionado en git.

## Para fases siguientes
- **SPECS**: requisitos y escenarios por capacidad (product-catalog, order-management) — flujos, validaciones, casos de error, transiciones de estado permitidas.
- **DESIGN**: esquema de columnas/tipos/constraints, FKs internas, secuencia de estados, política RLS concreta, forma del map carrier→URL, contrato de request/response de cada endpoint, y decisión de wiring del routing anidado del portal.
