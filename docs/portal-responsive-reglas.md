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

## 2. La tabla se queda tabla

**Decisión del proyecto (revisa una versión anterior de este doc que proponía
colapsar a tarjetas).** En móvil la tabla NO se convierte en tarjetas, ni en el
portal ni en el admin. Se mantiene como tabla con scroll horizontal.

El mecanismo responsive es el **selector de columnas**: en un teléfono el usuario
reduce la tabla a las columnas que le importan, en vez de que el diseño decida
por él. Es el patrón de EMNIFY y evita mantener dos representaciones del mismo
dato.

Condiciones para que esto no se rompa:

- La **columna de acciones queda fija** (`sticky right-0`). Con scroll horizontal,
  una acción que se va hacia la derecha es una acción inalcanzable.
- La **primera columna identificadora queda fija** (`sticky left-0`), o al
  desplazarse el usuario pierde de vista de qué fila está leyendo.
- La preferencia de columnas se guarda por usuario en `localStorage`.

La excepción son los listados que ya nacieron como tarjetas (facturas, pedidos):
esos siguen siendo tarjetas, porque nunca fueron tablas.

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
