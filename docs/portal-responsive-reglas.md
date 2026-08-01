# Portal cliente — reglas de responsive

> Extraídas de `.stitch/movil-mis-facturas.html` (única pantalla móvil que Stitch
> generó para el portal) y de las 9 móviles del admin, que aportan el patrón de
> colapso de tabla.
>
> **Se infieren reglas, no pantallas.** El admin tiene 9 entradas de nav y tablas
> de 1,500 filas; el portal tiene 3 secciones y sus propios patrones. Copiar
> layouts del admin dejaría un panel interno disfrazado de portal.

---

## 1. Navegación

| Breakpoint | Patrón |
|---|---|
| `< md` | **Barra de tabs fija abajo** (`fixed bottom-0`, `h-16`), icono + etiqueta de 10px |
| `≥ md` | Sidebar de 256px fija a la izquierda (ya existente, sin cambios) |

- Item activo: `text-primary` + icono con `FILL 1`. Inactivo: `text-on-surface-variant`.
- El header móvil deja de contener las tabs: queda solo marca + acción.
- El contenido necesita `pb-24` para no quedar tapado por la barra.

**Desviación deliberada:** Stitch pone "Salir" como cuarta pestaña. No se
implementa así — un logout al alcance del pulgar, entre pestañas de navegación,
se toca por accidente y obliga a re-autenticar. Salir se queda en el header.

**Desviación deliberada:** el header de Stitch trae una foto de perfil de stock.
El portal no tiene avatar ni pantalla de perfil; se omite.

## 2. Tabla → tarjeta

Debajo de `md`, cada fila de tabla se vuelve una tarjeta:

```
rounded-xl border border-outline-variant bg-surface-container-lowest
active:scale-[0.98]        ← feedback táctil
```

Anatomía de la fila colapsada:

| Zona | Contenido |
|---|---|
| Izquierda | Cuadro de 48×48 (`rounded-lg`) con color semántico de estado + icono |
| Centro | Identificador (`text-label-md`) sobre descriptor (`text-body-sm`) |
| Derecha | Dato principal (monto / métrica) sobre chip de estado |

El detalle va **dentro de la misma tarjeta**, expandible, separado por
`border-t border-outline-variant` y sobre `bg-surface`.

## 3. Acciones

- En móvil viven **dentro del detalle expandido**, nunca en la fila colapsada.
- Botones hermanos: `flex-1` lado a lado, altura mínima 44px (objetivo táctil).
- Nada de acciones reveladas por hover: en táctil no existe el hover.

## 4. Densidad

- Las tarjetas de resumen se apilan a 1 columna, conservando `p-card-padding`.
- Márgenes laterales: `px-container-margin` (24px).
- Los identificadores largos (ICCID de 20 dígitos) van en `font-mono` con
  `tracking-tight` y truncado; nunca fuerzan scroll horizontal.

## 5. Qué NO se hace responsive

- El scroll horizontal de tabla en móvil: se reemplaza por tarjetas, no se
  conserva como fallback.
- Ocultar columnas sin más: si un dato no cabe, va al detalle expandible. No se
  descarta información que el cliente sí necesita.
