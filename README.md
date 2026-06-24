# AmericasIoT

Aplicación web de AmericasIoT. El diseño original está en [Figma](https://www.figma.com/design/oM5P3kNVHrf0xpI55bFC82/AmericasIoT).

## Stack

- **React 18** + **Vite 6** + **TypeScript**
- **Tailwind CSS 4** con componentes Radix UI y MUI
- **Supabase** como backend
- **pnpm** como gestor de paquetes

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior
- [pnpm](https://pnpm.io) (este proyecto está fijado a pnpm vía el campo `packageManager`)

Si no tenés pnpm, activalo con Corepack (viene incluido con Node):

```bash
corepack enable pnpm
```

> En Windows puede requerir ejecutar la terminal como Administrador la primera vez.

## Puesta en marcha

Instalar dependencias:

```bash
pnpm install
```

Levantar el servidor de desarrollo:

```bash
pnpm dev
```

Compilar para producción:

```bash
pnpm build
```

## Notas

- Usá **siempre pnpm**. No corras `npm install` ni `yarn`: generan otro lockfile y rompen la consistencia de dependencias.
