# Tasks: Client Orders (sistema de pedidos)

## Phase 1: Infra / DB

- [ ] 1.1 Crear `supabase/migrations/0001_client_orders.sql` con las 4 tablas (`products`, `orders`, `order_items`, `order_status_history`), índices, CHECKs y `enable row level security` sin policies (deny-all), en el orden del design.
- [ ] 1.2 Aplicar la migración vía Supabase MCP `apply_migration` sobre el proyecto `qbewhyosgeihmdbswcue`.
- [ ] 1.3 Verificar con `list_tables` (MCP) que las 4 tablas y sus índices quedaron creados como en el SQL versionado.

## Phase 2: Backend

- [x] 2.1 (depende de 1.2) Crear `supabase/functions/server/db.tsx`: cliente `db()` (service_role, patrón `client()`) + `CARRIER_URLS` + `buildTrackingUrl(carrier, track)`.
- [x] 2.2 En `index.tsx`, agregar helper `requireAdmin(c)` junto a `requireClientSession` (retorna sesión solo si `role === "admin"`).
- [x] 2.3 (depende de 2.1, 2.2) Admin: `GET /products` — lista completa de productos.
- [x] 2.4 Admin: `POST /products` — valida `name` no vacío y `price > 0`; 400 si falla.
- [x] 2.5 Admin: `PATCH /products/:id` — mismas validaciones que creación; 404 si no existe.
- [x] 2.6 Admin: `DELETE /products/:id` — 409 si referenciado en `order_items` (FK `on delete restrict`), 404 si no existe.
- [x] 2.7 Admin: `GET /orders` — soporta `?status=&client_id=`, retorna todas las órdenes.
- [x] 2.8 Admin: `GET /orders/:id` — retorna `{ order, items, history }`; 404 si no existe.
- [x] 2.9 Admin: `PATCH /orders/:id/status` — valida transición contra mapa `ALLOWED`; 422 si inválida; exige `carrier`+`tracking_number` para `shipped`; calcula `tracking_url` con `buildTrackingUrl`; inserta fila en `order_status_history`.
- [x] 2.10 Cliente: `GET /client/products` — solo productos `status='active'`.
- [x] 2.11 (depende de 2.1) Cliente: `POST /client/orders` — valida items no vacíos y `quantity > 0`; valida productos existen y están `active`; copia snapshot `product_name`/`unit_price`; lee `client_name` desde KV (`client:<id>`); inserta `orders`+`order_items`+`order_status_history` (to=`pending`).
- [x] 2.12 Cliente: `GET /client/orders` — filtra solo por `session.clientId`.
- [x] 2.13 Cliente: `PATCH /client/orders/:id/received` — solo si dueño y estado `shipped`; 422 si no.
- [x] 2.14 Cliente: `PATCH /client/orders/:id/cancel` — solo si dueño (403 si ajeno), solo desde `pending`/`preparing` (422 si no); inserta history.

## Phase 3: Frontend

- [x] 3.1 (depende de Phase 2) En `src/app/lib/api.ts`: métodos admin en `api` (products CRUD, list/get orders, patch status).
- [x] 3.2 En `src/app/lib/api.ts`: métodos cliente en `clientApi` (catálogo, crear pedido, historial, received, cancel).
- [x] 3.3 (depende de 3.1) Crear `src/app/pages/AdminProductsPage.tsx` — CRUD catálogo (crear, editar, activar/desactivar, eliminar).
- [x] 3.4 (depende de 3.1) Crear `src/app/pages/AdminOrdersPage.tsx` — lista de pedidos, detalle, cambio de estado + tracking, cancelación admin.
- [x] 3.5 (depende de 3.2) Crear `src/app/pages/portal/ClientOrdersPage.tsx` — catálogo, crear pedido, historial, marcar recibido, cancelar propio pedido.
- [x] 3.6 (depende de 3.3, 3.4) En `src/app/routes.tsx`: agregar rutas admin `orders`/`products`.
- [x] 3.7 (depende de 3.6) En `src/app/components/layout/AppLayout.tsx`: agregar nav + title map para "Pedidos" y "Productos".
- [x] 3.8 (depende de 3.5) En `src/app/routes.tsx`: agregar children bajo `/portal` (`index` → `ClientPortalDashboard`, `orders` → `ClientOrdersPage`, catch-alls) según Opción B del design.
- [x] 3.9 (depende de 3.8) En `src/app/components/layout/ClientPortalLayout.tsx`: agregar nav superior con dos `NavLink` (`/portal` end, `/portal/orders`) antes del `<Outlet/>`.

## Phase 4: Testing / Verify

- [ ] 4.1 Manual: `POST /products` — happy path (crea `active`) y errores 400 (name vacío, price≤0/no numérico).
- [ ] 4.2 Manual: `PATCH /products/:id` y `DELETE /products/:id` — validaciones, 404, 409 al borrar producto referenciado.
- [ ] 4.3 Manual: rutas admin llamadas con sesión cliente → 403 (products y orders).
- [ ] 4.4 Manual: `POST /client/orders` — happy path, 400 items vacíos, 400 quantity≤0, 400 producto inactivo/inexistente.
- [ ] 4.5 Manual: `PATCH /orders/:id/status` — transiciones válidas (pending→preparing→shipped→delivered), 422 en transición inválida (ej. pending→delivered), 400 shipped sin carrier/tracking.
- [ ] 4.6 Manual: `PATCH /client/orders/:id/received` (solo desde `shipped`, 422 si no) y `PATCH /client/orders/:id/cancel` (solo `pending`/`preparing`, 403 si ajeno, 422 si `shipped`+).
- [ ] 4.7 Manual: `GET /orders` (admin, todas) vs `GET /client/orders` (cliente, solo propias) — verificar scope y 403/404 al acceder a pedido ajeno.
- [ ] 4.8 DB: insert directo violando CHECKs (`price≤0`, `quantity≤0`) → error; intentar `DELETE` de producto referenciado vía SQL → bloqueado por `on delete restrict`.
- [ ] 4.9 RLS: query con clave `anon`/`authenticated` contra las 4 tablas → 0 filas (deny-all).
- [ ] 4.10 E2E: cliente crea pedido → admin pasa a `preparing` → admin pasa a `shipped` con tracking → cliente marca `received` (`delivered`) → verificar `order_status_history` con las 4 entradas en orden.
