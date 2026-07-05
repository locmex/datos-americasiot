# AmericasIoT — La Verdad del Proyecto

> Documento fundacional de SDD. Estado real del proyecto al 2026-06-24, extraído del código y de Supabase (MCP). Esta es la línea base sobre la que se construye.

## 1. Qué es

Plataforma web de **gestión de conectividad IoT**: administra SIMs y dispositivos celulares apoyándose en **EMNIFY** (proveedor de conectividad IoT) como fuente de verdad de la red. Tiene dos áreas:

- **Portal Admin**: inventario de SIMs/chips, dispositivos (endpoints), clientes, usuarios, asignaciones, actividad.
- **Portal Cliente**: cada cliente ve solo sus SIMs/dispositivos, consumo, eventos, SMS.

## 2. Stack real

| Capa | Tecnología |
|------|-----------|
| Build | Vite 6.3.5 (esbuild) |
| UI | React 18.3.1 + TypeScript |
| Estilos | Tailwind CSS 4.1.12 |
| Componentes | shadcn/ui (Radix UI, ~50 comp.) **+ MUI 7** (coexisten) |
| Routing | react-router 7 con **createHashRouter** (rutas en `#`) |
| Gestor | pnpm 11.9 (obligatorio) |
| Backend | Supabase Edge Function (Deno + **Hono**) |
| DB | Supabase Postgres — **1 tabla key-value** |
| Auth | **Casera** (no Supabase Auth) |
| Externo | EMNIFY API (conectividad/SIMs) |
| Deploy | Netlify (auto-deploy en merge a `main`) |

## 3. Arquitectura

```
Browser (React SPA, HashRouter)
   │  fetch + Authorization: Bearer <anon key> + X-IoT-Session: <sessionId>
   ▼
Edge Function "make-server-ef736a01" (Hono, ~2832 líneas, 55 rutas)
   │                                    │
   ▼ service_role                       ▼ EMNIFY_API_TOKEN
Supabase KV (kv_store_ef736a01)    EMNIFY API (cdn + portal)
```

- **Frontend → API**: `src/app/lib/api.ts` expone `api` (admin, sesión `iot_session_id`) y `clientApi` (portal, sesión `portal_session_id`). Todo pasa por la Edge Function; el frontend nunca habla con Postgres directo.
- **Auth**: el server guarda admin/usuarios/sesiones en el KV. Login devuelve un `sessionId` que viaja en el header `X-IoT-Session`. El `Authorization: Bearer` lleva el anon key (lo exige el gateway de Supabase), NO es el mecanismo de auth real.
- **EMNIFY**: el server cachea un JWT de aplicación (`EMNIFY_API_TOKEN`) y hace de proxy hacia la API de EMNIFY para todo lo de SIMs/endpoints/SMS/consumo.

### Estructura de carpetas
- `src/app/pages/` — páginas admin (Dashboard, Devices, Inventory, Clients, Assignment, Users, Activity, Login) + `portal/` (cliente).
- `src/app/components/ui/` — shadcn/ui (~50 componentes).
- `src/app/components/layout/` — AppLayout, ClientPortalLayout, Sidebar.
- `src/app/lib/` — api.ts, auth-context.tsx, client-auth.ts, theme-context.tsx.
- `supabase/functions/server/` — `index.tsx` (servidor) + `kv_store.tsx` (helpers KV).
- `utils/supabase/info.tsx` — projectId + publicAnonKey (autogenerado, hardcodeado).
- `src/imports/` — ~150 capturas de pantalla PNG + `endpoint-data.json` (residuo de Figma Make).

## 4. Supabase (estado real vía MCP)

- **Project ref**: `qbewhyosgeihmdbswcue`
- **Tablas (schema public)**: solo `kv_store_ef736a01` — columnas `key` (text, PK) y `value` (jsonb). **985 filas**. RLS **habilitado, SIN políticas** (deny-all; el acceso real es server-side con service_role).
- **Edge Functions**: `make-server-ef736a01` (ACTIVE, v78, `verify_jwt: true`).
- **Migraciones**: 1 → `20260516224055_create_kv_table_ef736a01`.
- **Extensiones instaladas**: solo las default (pg_stat_statements, pgcrypto, uuid-ossp, supabase_vault, plpgsql). Sin pgvector/postgis activos.

### Dominio guardado en el KV (por convención de prefijos de `key`)
Clientes, usuarios de portal, chips/SIMs locales, sesiones, admin, registro de actividad — todo serializado como JSON en `value`. **No hay modelo relacional.**

## 5. Endpoints (55 rutas — agrupadas)
- **Auth**: `/auth/login`, `/auth/client-login`, `/auth/logout`, `/auth/me`.
- **EMNIFY SIMs**: listar, detalle, cambiar estado, eventos, stats diarios.
- **EMNIFY Endpoints**: CRUD, ubicación, SMS, reset de conectividad, asignar/quitar SIM, IMEI lock, service/tariff profiles, stats, data-usage.
- **Chips (inventario local)**: listar, agregar, asignar/desasignar (individual y bulk), borrar.
- **SIM registration (BIC)**: register-bic1, register-bic2.
- **Clients**: CRUD + set-portal-password.
- **Users**: CRUD + cambiar rol.
- **Activity**: log.
- **Client portal**: mis SIMs, conectividad, detalle/eventos/stats/SMS/uso de dispositivo, rename, reset.

## 6. Fortalezas
- Separación clara Admin vs Cliente (dos contextos de auth y dos APIs).
- `api.ts` limpio, tipado y bien organizado por dominio.
- Helpers de dominio sólidos y documentados: validación **Luhn** (ICCID/IMEI), conversión IMEISV→IMEI.
- Cacheo del JWT de EMNIFY (evita re-autenticar en cada request).
- Manejo de sesión expirada (401 → limpia storage y redirige).
- Hono: framework de servidor liviano y moderno.

## 7. Debilidades (priorizadas)

### 🔴 Críticas
1. **Hashing de contraseñas débil** (`server/index.tsx`): SHA-256 con **salt estático global** hardcodeado (`iot_salt_ef736a01`). SHA-256 es rápido de fuerza bruta y un salt único global no protege por usuario. Debería ser **bcrypt/argon2/scrypt** con salt por usuario.
2. **77 índices DUPLICADOS idénticos** en `kv_store_ef736a01` (sobre `key`). Detectado por el advisor de performance (WARN). Penaliza cada INSERT/UPDATE y desperdicia storage. Acción: conservar uno, dropear el resto.
3. **No existe `tsconfig.json`**. El "TypeScript" no se chequea: `vite build` usa esbuild que transpila sin verificar tipos. Los errores de tipo nunca rompen el build → falsa sensación de seguridad.

### 🟠 Altas
4. **Edge Function monolítica**: 2832 líneas y 55 rutas en un solo archivo. Mezcla auth, proxy EMNIFY, lógica de negocio y KV. Inmantenible e intesteable.
5. **Modelo de datos como KV/JSONB**: sin tablas relacionales, constraints, foreign keys ni validación a nivel DB. No escala ni es consultable eficientemente.
6. **Cero tooling de calidad**: sin tests, sin ESLint, sin Prettier, sin type-check en CI. Scripts solo `build`/`dev`.

### 🟡 Medias
7. **~150 screenshots PNG en `src/imports/`** + `endpoint-data.json`: peso muerto del repo (residuo de Figma Make).
8. **CORS `origin: "*"`** en la Edge Function: cualquier origen puede llamar la API.
9. **Dos sistemas de UI** (shadcn/Radix + MUI) conviviendo: inconsistencia visual y peso de bundle.
10. **RLS sin políticas**: hoy es "accidentalmente seguro" (deny-all + acceso server-side). Frágil si algún día se expone vía PostgREST.

## 8. Mejoras propuestas (orden sugerido)
1. **Quick win DB**: dropear los 76 índices duplicados de `kv_store`.
2. **Type safety**: agregar `tsconfig.json` (strict) + script `typecheck` (`tsc --noEmit`); integrarlo a Netlify para que falle el deploy ante errores de tipo.
3. **Seguridad auth**: migrar el hashing a argon2/bcrypt con salt por usuario; evaluar migrar a Supabase Auth.
4. **Calidad**: ESLint + Prettier + Vitest; primeros tests sobre los helpers puros (Luhn, normalizeImei).
5. **Backend**: trocear la Edge Function por dominio (auth / emnify / chips / clients / users).
6. **Datos**: modelar relacionalmente lo que hoy vive en el KV (clientes, usuarios, chips) con RLS real.
7. **Limpieza**: sacar `src/imports/*.png` del repo; unificar en un solo sistema de UI.

## 9. Restricciones del proyecto
- **pnpm exclusivo** — nunca npm/yarn.
- HashRouter: las rutas NO requieren SPA redirects reales en el server.
- El frontend no usa variables de entorno; las credenciales públicas están en `utils/supabase/info.tsx`.
- Secretos reales (service_role, EMNIFY_API_TOKEN) viven en los secrets de Supabase (Deno.env), nunca en el repo.
