# Portal Cliente — Brief funcional completo

> Documento para rediseño visual (Google Stitch u otra herramienta de diseño).
> Describe **qué hace** cada pantalla del portal del cliente de AmericasIoT.
> Extraído del código real, no de supuestos.

---

## Contexto del producto

**AmericasIoT** es una plataforma de gestión de conectividad IoT. Los clientes son empresas que tienen SIMs celulares instaladas en dispositivos (rastreadores GPS, sensores, etc.). El **Portal Cliente** les permite monitorear sus SIMs/dispositivos, pedir productos y consultar su facturación.

- **Idioma**: español (es-MX). Moneda: MXN.
- **Usuario tipo**: operador/administrador de flota en una empresa cliente. No es técnico en redes.
- **Uso principal**: escritorio, pero debe funcionar en móvil (los operadores revisan en campo).
- **Volumen real**: un cliente puede tener desde 1 hasta ~200 SIMs.

---

## Sistema visual actual (a modernizar, no a descartar)

| Elemento | Valor actual |
|---|---|
| Verde de marca | `#3ECF8E` (claro) / `#059669` (texto/acento) |
| Fondo de app | `#f2f4f7` |
| Superficie (cards) | `#ffffff`, bordes `#e8e8ed`, radios `12–16px` |
| Semántica de estado | verde = activo/online/pagado · ámbar = suspendido/pendiente · gris = disponible/sin conexión · rojo = desactivado/cancelado · azul = enviado |
| Tipografía | sans-serif del sistema |
| Iconografía | Lucide (line icons) |

**Stack técnico** (para que el diseño sea implementable): React + Tailwind CSS 4 + shadcn/ui.

---

## Estructura de navegación

```
Login (unificado admin/cliente)
   └── Portal Cliente
        ├── Mis Dispositivos   (pantalla principal)
        ├── Pedidos
        └── Mis Facturas
```

**Layout persistente**:
- **Header fijo** (56px): logo AmericasIoT · badge "Portal Cliente" · "Hola, {nombre} 👋" + email · botón "Salir".
- **Barra de navegación fija** (44px, debajo del header): 3 pestañas con icono — Mis Dispositivos, Pedidos, Mis Facturas. La activa se resalta en verde con fondo suave.
- **Contenido**: centrado, ancho máximo ~1280px, respiración generosa.

---

# Pantalla 1 — Mis Dispositivos

La pantalla más usada. Monitoreo y control de las SIMs del cliente.

### 1.1 Barra superior
- **Buscador** ancho: "Buscar dispositivo, ICCID o IMEI…" con icono de lupa y botón de limpiar.
- Contador "N SIMs" + botón **Actualizar** (con spinner al recargar).

### 1.2 Tarjetas de resumen (5, clicables → filtran la lista)
| Tarjeta | Significado |
|---|---|
| **Total SIMs** | todas las del cliente (número hero, color de marca) |
| **Activas** | SIM operando (verde) |
| **Suspendidas** | temporalmente inactivas (ámbar) |
| **Disponibles** | en inventario, nunca activadas (gris) |
| **Desactivadas** | dadas de baja (rojo) |

Cada una: icono en contenedor redondeado + número grande + etiqueta. Al hacer click filtra la lista y la tarjeta queda marcada como seleccionada. **Los 4 estados suman el Total.**

### 1.3 Pestañas de contenido
`Dispositivos` | `Mis SIMs` — y a la derecha, botón **Exportar** (descarga CSV).

#### Pestaña "Dispositivos" (tabla)
Solo las SIMs vinculadas a un dispositivo físico. Columnas:

1. **Checkbox** de selección múltiple (con "seleccionar todo" en el encabezado).
2. **Dispositivo**: icono de chip + nombre (link) + "SIM ID: 1234567" debajo.
3. **Estado**: pastilla clicable (`Activa` / `Suspendida` / …). Al hacer click abre un **popover de confirmación** para suspender o activar la línea.
4. **Acciones**: dos iconos con tooltip — *refrescar conexión* (reinicia la conectividad, pide confirmación) y *enviar SMS*.
5. **Conexión**: pastilla de estado en vivo — `4G Online` (verde, con punto que late), `Registrado` (ámbar), `Sin conexión` (gris). Mientras carga muestra "Cargando…".
6. **ICCID** (20 dígitos, monoespaciado).
7. **IMEI** (15 dígitos, monoespaciado; "—" si no tiene).

**Barra de acciones masivas**: aparece al seleccionar filas → "N dispositivos seleccionados" + botón **Renombrar** + **Limpiar**.

Ordenamiento por columna (flechas ↑↓). Estados vacíos: "Sin dispositivos" / "Sin resultados para '…'".

#### Pestaña "Mis SIMs" (lista)
Todas las SIMs, tengan dispositivo o no. Cada fila:
- Icono con color del estado + **ICCID** (últimos 12 dígitos) + nombre del dispositivo o "Sin dispositivo".
- **Consumo del mes**: `↑ TX` y `↓ RX` en MB/GB.
- Pastilla de **estado** (clicable, mismo popover de confirmación).
- Chevron → abre el panel de detalle de la SIM.

Si hay un filtro activo se muestra un chip "Filtro activo: Activas ✕" para quitarlo.

### 1.4 Modales y paneles de esta pantalla

**A. Detalle de dispositivo** (al hacer click en el nombre)
Modal amplio con secciones:
- **Información general**: ID del dispositivo, dirección IP, IMEI, bloqueo de IMEI (activo/inactivo), política de servicio, política de cobertura.
- **Datos del SIM**: ICCID, IMSI, MSISDN.
- **Conectividad**: país, operador, MCC/MNC, LAC/Cell ID, última verificación.
- **Servicios**: tres indicadores on/off — Datos, SMS MT, SMS MO.
- **Eventos**: historial paginado de eventos de red.
- **Consumo**: gráfico de barras TX/RX con selector de período (semana, mes, etc.).

**B. Consola de SMS** — estilo app de mensajería
- Encabezado verde oscuro con avatar "IoT", nombre del dispositivo e ICCID, botón recargar y cerrar.
- **Burbujas de chat**: enviados a la derecha (verde), recibidos a la izquierda (blanco). Cada burbuja con hora e indicador de estado (enviado ✓✓, entregado, pendiente ⟳, error ⚠).
- **Barra de envío**: campo "Origen" (máx. 11 caracteres o 17 dígitos, con contador), textarea de 160 caracteres con contador regresivo, botón circular de enviar.
- Estados: cargando historial, sin mensajes, error con "Reintentar".

**C. Renombrar dispositivos** (masivo)
Modal con lista de los dispositivos seleccionados; para cada uno, su ICCID abreviado y un campo de texto para el nuevo nombre. Botones Cancelar / Guardar.

**D. Panel de detalle de SIM** (lateral en escritorio, hoja inferior en móvil)
Dos pestañas:
- **Información general del SIM**: dispositivo, conexión, ICCID, IMSI, ID SIM, estado.
- **Consumo**: totales del mes (Enviado TX / Recibido RX) + total, y gráfico de barras de tráfico reciente por hora con leyenda TX/RX.

**E. Popovers de confirmación**
Pequeños, anclados al botón que los dispara:
- *Suspender/Activar conexión*: nombre del dispositivo + botones Cancelar / Confirmar (rojo para suspender, verde para activar).
- *Refrescar SIM*: "El dispositivo se desconectará y reconectará" + Cancelar / Refrescar.

---

# Pantalla 2 — Pedidos

El cliente solicita productos (SIMs u otros artículos) al administrador.

### Pestañas: `Catálogo` | `Mis Pedidos`

#### Catálogo (crear pedido)
- **Buscador** de productos.
- **Grid de tarjetas de producto**: nombre, descripción (2 líneas máx.), precio destacado en verde, y un selector de cantidad `− 0 +`.
- **Carrito flotante** (fijo abajo, aparece al agregar algo): "N productos" + total, campo de **notas** opcional, y botón grande **Realizar Pedido**.
- Estados vacíos: "No hay productos disponibles" / "Sin resultados".

#### Mis Pedidos (historial)
Lista de tarjetas, una por pedido:
- **#ID corto** + fecha de creación.
- **Pastilla de estado**: `Pendiente` (gris) → `Preparando` (ámbar) → `Enviado` (azul) → `Recibido` (verde) · `Cancelado` (rojo).
- **Artículos**: "2 × SIM IoT ......... $90.00".
- **Envío** (cuando aplica): paquetería + enlace "Rastrear ↗" al sitio del transportista.
- **Acciones contextuales**:
  - `Marcar recibido` (verde) — solo si el pedido está *Enviado*.
  - `Cancelar` (rojo, con confirmación) — solo si está *Pendiente* o *Preparando*.
- Estado vacío: "Aún no has realizado pedidos".

---

# Pantalla 3 — Mis Facturas

Historial de facturación mensual de las SIMs del cliente. **Solo lectura** (el cliente no paga desde aquí).

- Encabezado + botón **Actualizar**.
- **Lista de tarjetas expandibles**, una por período (mes/año). Cerrada muestra:
  - Icono del estado + **período** ("julio 2026") + pastilla de estado: `Borrador` · `Emitida` · `Parcial` · `Pagada` · `Cancelada`.
  - **Total** de la factura + chevron.
- **Al expandir**:
  - **Saldo pendiente** (ámbar si debe, verde si está saldada).
  - **Desglose por SIM**: una línea por SIM con ICCID, plan, porcentaje de prorrateo y monto.
    > ⚠️ Un cliente puede tener **150+ SIMs**: este listado es hoy la mayor debilidad de la pantalla (ver "Problemas a resolver").
  - **Abonos**: fecha, método de pago y monto de cada abono registrado.
  - Botón **Descargar PDF** (comprobante interno; no disponible en borradores).
- Estado vacío: "Aún no tienes facturas".

---

# Problemas a resolver en el rediseño

1. **Falta de contraste**: mucho texto secundario en gris claro (`#9ca3af`) que se pierde sobre fondo blanco. Subir el contraste manteniendo 3 niveles de jerarquía (título / dato / metadato).
2. **Se siente genérico**: la base de componentes es neutra y nunca se le dio identidad de marca. Falta personalidad: tipografía con escala definida, profundidad coherente, microinteracciones.
3. **Listas largas sin resumen**: el desglose de factura muestra 150+ líneas idénticas ("$45.00 · Plan único · prorrateo 100%"). Debería **agruparse** ("156 SIMs × $45.00 · 100% = $7,020.00") y permitir expandir el detalle con buscador.
4. **Densidad de tabla**: con 200 SIMs, la tabla de dispositivos necesita mejor legibilidad de fila, sticky header y quizá paginación/virtualización.
5. **Acciones enterradas**: en paneles con listas largas, los botones de acción quedan al final. Deben estar siempre visibles (encabezado o pie fijo).

# Restricciones (no negociables)

- Debe mantenerse **toda** la funcionalidad descrita.
- Semántica de color de estados: no reasignar colores (verde=bien, ámbar=atención, gris=inactivo, rojo=baja).
- Los estados de conexión y de SIM siempre llevan **icono + etiqueta**, nunca solo color (accesibilidad).
- Responsive real: la tabla de dispositivos debe degradar bien a móvil.
- Español mexicano; formatos de fecha y moneda locales.
