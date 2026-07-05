# Skill Registry — AmericasIoT

> Generado por sdd-init (2026-06-24). Infraestructura SDD, no es un artefacto de cambio.

## Project Conventions
- **Gestor de paquetes**: pnpm exclusivo. Nunca npm/yarn (rompen el lockfile y la consistencia).
- **Commits**: conventional commits. Sin atribución de IA / Co-Authored-By.
- **Stack**: Vite 6 + React 18 + TypeScript + Tailwind 4 + shadcn/ui. Backend: Supabase Edge Function (Hono/Deno).
- **Routing**: createHashRouter (rutas en fragmento `#`).
- **Sin tsconfig/tests/linter** todavía — ver `openspec/project-truth.md` §7-8.

## User Skills (disponibles, relevancia a este proyecto)
| Skill | Trigger | Relevante aquí |
|-------|---------|----------------|
| go-testing | Tests en Go / Bubbletea | ❌ (proyecto JS/TS) |
| skill-creator | Crear nuevas skills | ⚪ ocasional |
| skill-registry | Actualizar este registro | ⚪ meta |

No hay skills específicas de React/TS/Supabase instaladas. Si se agregan (p. ej. testing de Vitest/RTL), re-correr `skill-registry`.

## Compact Rules (auto-resueltas para sub-agentes)
- **pnpm-only**: usar pnpm para todo comando de paquetes; nunca npm/yarn.
- **conventional-commits**: `tipo: descripción`, sin atribución de IA.
- **no-typecheck-yet**: el build no valida tipos; no asumir seguridad de tipos hasta que exista tsconfig + script typecheck.
- **kv-backend**: la persistencia es key-value JSONB en `kv_store_ef736a01`; no asumir tablas relacionales.
