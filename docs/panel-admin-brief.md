# Panel Admin — Brief funcional completo

> Documento para rediseño visual (Google Stitch u otra herramienta de diseño).
> Describe **qué hace** cada pantalla del panel de administración de AmericasIoT.
> Extraído del código real, no de supuestos. Complementa a `portal-cliente-brief.md`.

---

## Contexto del producto

**AmericasIoT** gestiona conectividad IoT: SIMs celulares instaladas en dispositivos de sus clientes. El **Panel Admin** es la herramienta interna del equipo de AmericasIoT para administrar el inventario completo de SIMs, los clientes, sus pedidos y su facturación.

- **Idioma**: español (es-MX). Moneda: MXN.
- **Usuario tipo**: operador interno de AmericasIoT. Perfil técnico-administrativo. Trabaja horas en esta herramienta.
- **Uso principal**: escritorio (pantalla grande). Debe degradar a tablet/móvil.
- **Volumen real**: ~1,500 SIMs en total, ~1,570 dispositivos, 5+ clientes. **Es una herramienta de alta densidad de datos.**
- **Fuente de verdad externa**: la red y el estado de las SIMs vienen de **EMNIFY** (proveedor de conectividad). El panel es un cliente de esa API.

---

## Sistema visual actual (a modernizar, no a descartar)

| Elemento | Valor actual |
|---|---|
| Verde de marca | `#3ECF8E` (claro) / `#059669`–`#0d8f5c` (texto/acento) |
| Canvas de app | `#f2f4f7` |
| Superficie (cards) | `#ffffff`, borde `#e8e8ed`, radio `12–16px` |
| Semántica de estado SIM | `0` Emitida/Disponible = gris `#94a3b8` · `1` Activa = verde `#16a34a` · `2` Suspendida = ámbar `#d97706` · `3` Desactivada = rojo `#dc2626` |
| Tipografía | sans-serif del sistema |
| Iconografía | Lucide (line icons) |

**Stack técnico** (para que el diseño sea implementable): React + Tailwind CSS 4 + shadcn/ui.

---

## Estructura de navegación

**Sidebar fija de 256px** (colapsable a overlay en móvil), con:
- **Logo** AmericasIoT arriba (bloque de 64px).
- Etiqueta "MENÚ" + **9 entradas** de navegación, cada una con icono en contenedor redondeado. La activa: texto verde, fondo verde translúcido, icono resaltado.
- **Pie**: tarjeta de usuario (avatar con inicial, nombre, email) + "Cerrar Sesión".

```
Dashboard · Dispositivos · Inventario SIMs · Asignación · Clientes
Pedidos · Productos · Facturación · Planes
```

---

# Pantalla 1 — Dashboard

Vista de estado general de la operación. Solo lectura.

- **Saludo contextual**: "Buenos días, {nombre} 👋" + subtítulo "Resumen de conectividad IoT · emnify" + botón **Actualizar**.
- **4 tarjetas de métrica** (icono, número grande, etiqueta, nota al pie en color):
  | Tarjeta | Nota |
  |---|---|
  | Total SIMs en emnify | "Chips en inventario emnify" |
  | SIMs Activas | "Con datos activos" |
  | SIMs Suspendidas | "Temporalmente inactivas" |
  | Clientes Registrados | "En este portal" |
- **Banner de caché** (ámbar): "Mostrando datos del caché (N min). El recálculo completo puede tardar ~30 segundos." + acción **Recalcular ahora**.
- **Volumen de datos del mes**: cifra grande (ej. "631.41 MB") desglosada en **TX Enviado** ↑ y **RX Recibido** ↓, más "Endpoints con datos: 116 / 1574".
- **Estado de los dispositivos**: barra de proporción horizontal + leyenda con conteos — Online (verde), Deshabilitado (ámbar), Offline (gris).
- **Tráfico (últimas 6 h)**: gráfico de barras TX/RX con leyenda.

---

# Pantalla 2 — Dispositivos

Listado maestro de los endpoints registrados en EMNIFY (~1,570).

- **Encabezado**: título + "Endpoints registrados en emnify · N en total" + botones **Actualizar** y **Agregar dispositivo** (primario).
- **Buscador** ancho ("Buscar por nombre, ICCID…") con botón **Buscar** y leyenda de campos buscables (Nombre · ICCID · Etiqueta).
- **Tabla** (columnas ordenables): checkbox · **Nombre** · **Etiquetas** · **Estado** (chip: Habilitado / Suspendido / Deshabilitado) · **Conexión** (chip: 4G Online / Registrado / Sin conexión) · **ICCID** · **Acciones**.
- **Acciones por fila** (iconos con tooltip): refrescar conectividad · suspender/activar · enviar SMS · menú "⋮" con más opciones.
- **Paginación** con selector de filas por página (5 / 10 / 25 / 50).
- **Modales**: agregar dispositivo · consola de SMS (estilo chat, igual que en el portal) · diálogos de confirmación para acciones destructivas · detalle de dispositivo (ver más abajo).

### Modal de detalle de dispositivo (compartido con el portal cliente)
- **Información general**: ID, dirección IP, IMEI, bloqueo de IMEI, política de servicio, política de cobertura.
- **Datos del SIM**: ICCID, IMSI, MSISDN.
- **Conectividad**: país, operador, MCC/MNC, LAC/Cell ID, última verificación.
- **Servicios**: indicadores on/off de Datos, SMS MT, SMS MO.
- **Eventos**: tabla paginada con severidad codificada por color.
- **Consumo**: gráfico con selector de período.

---

# Pantalla 3 — Inventario SIMs

Administración del inventario de SIMs (independiente del dispositivo).

- **Filtros de estado** en pastillas: Todas · Activa · Suspendida · Emitida.
- **Tabla/listado** de SIMs con chip de estado y datos de consumo.
- **Panel de detalle** con pestañas:
  - **Información**: tipo de SIM, modelo (ej. "Triple corte: Mini (2FF), Micro (3FF), Nano (4FF)"), ICCID, IMSI, ilustración de la SIM.
  - **Eventos**: historial paginado con severidad y marca de "Actualización en tiempo real".
  - **Estadísticas**: tabla de consumo diario con selector de período (esta semana / semana pasada / mes / mes pasado / dos meses) y fila de totales.
- **Modal "Agregar SIM"**: alta por **código BIC** en dos pasos (BIC1 → BIC2), con resultado de la operación.

---

# Pantalla 4 — Asignación

Vincula SIMs con clientes. Es el puente entre inventario y cartera.

- **3 tarjetas de métrica**: Total SIMs · Asignadas · Sin Asignar.
- **Buscador** con selector de criterio: por **ICCID** o por **Nombre de dispositivo**.
- **Filtros**: Todas · Asignadas · Sin asignar.
- **Tabla**: SIM / ICCID · Estado · Dispositivo · **Cliente Asignado** · Acción.
- **Selector de cliente** con búsqueda incorporada ("Buscar cliente…").
- **Modal de asignación**: permite asignar en lote las SIMs seleccionadas a un cliente.
- Paginación con filas por página.

---

# Pantalla 5 — Clientes

Cartera de clientes y su acceso al portal.

- **4 tarjetas de métrica**: Total Clientes · Chips Asignados · Sin Chips · Portal Activo.
- **Buscador** por nombre, email o empresa.
- **Listado de clientes** con sus datos y conteo de chips.

### Alta de cliente — asistente de 3 pasos
1. **Cliente**: nombre completo, email, empresa, teléfono, notas.
2. **SIMs**: selección paginada de SIMs a asignar, con buscador ("Buscar ICCID o dispositivo…").
3. **Portal**: contraseña de acceso al portal (mínimo 6 caracteres) + confirmación.

### Otras acciones
- **Editar cliente** (mismos campos del paso 1).
- **Asignar SIMs** a un cliente existente (modal selector).
- **Panel de chips del cliente**: lista de sus chips con filtro y acción "quitar chip".
- **Cambiar contraseña del portal** (con mostrar/ocultar y confirmación).

---

# Pantalla 6 — Pedidos

Gestión de los pedidos que hacen los clientes desde su portal.

- **Buscador** por cliente o ID de pedido + filtro por estado.
- **Tabla de pedidos** de todos los clientes.
- **Panel de detalle** con los artículos del pedido, historial de estados y acciones.
- **Cambio de estado** con formulario contextual: al marcar **Enviado** pide **paquetería** y **número de guía** (genera el enlace de rastreo), más una **nota interna** opcional.
- **Flujo**: `Pendiente → Preparando → Enviado → Recibido`, con `Cancelado` disponible solo antes del envío.

---

# Pantalla 7 — Productos

Catálogo que ven los clientes al hacer un pedido.

- **Buscador** por nombre.
- **CRUD completo**: crear, editar, activar/desactivar y eliminar productos.
- Campos: **nombre**, **precio** (MXN), **descripción**, **estado** (activo/inactivo).
- Un producto **inactivo** desaparece del catálogo del cliente pero no rompe pedidos históricos.

---

# Pantalla 8 — Facturación

Generación y cobro de la facturación mensual de SIMs. **La pantalla más crítica: maneja dinero.**

- **Encabezado**: título, "N facturas", y tres acciones — recargar, **Generar Facturas** (primaria) y **Resincronizar estados**.
- **Generar facturas**: selector de mes + año → crea un **borrador** por cada cliente con SIMs vigentes en ese período. Es idempotente (regenerar no duplica).
- **Resincronizar estados**: corrige los períodos de vigencia de las SIMs contra EMNIFY. Corre primero en **modo previsualización** mostrando qué cambiaría, y pide confirmación antes de aplicar.
- **Buscador** por cliente o ID de factura + filtro por estado.
- **Tabla**: Cliente (+ID corto) · Período · **Estado** (chip: Borrador / Emitida / Parcial / Pagada / Cancelada) · **SIMs** (cantidad facturada) · **Total**.

### Detalle de factura
- **Resumen**: estado, total, SIMs facturadas, saldo pendiente, fecha de emisión.
- **Desglose por SIM**: ICCID, plan, precio unitario, **factor de prorrateo** y monto.
  > ⚠️ Un cliente puede tener **150+ SIMs**. Hoy es una lista plana de líneas casi idénticas — debe **agruparse** ("156 SIMs × $45.00 · 100% = $7,020.00") con detalle expandible y buscador por ICCID.
- **Abonos**: historial de pagos parciales (fecha, método, monto, nota).
- **Acciones**: Emitir · Registrar abono · Cancelar · Descargar PDF.
  > ⚠️ Hoy estas acciones quedan **al final del scroll**, después de las 150+ SIMs. Deben estar siempre visibles.
- **Registrar abono**: monto (no puede exceder el saldo), fecha, método (Efectivo / Transferencia / Tarjeta / Cheque / Otro) y nota.

---

# Pantalla 9 — Planes

Catálogo de planes de precio que se aplican a las SIMs.

- **Buscador** por nombre.
- **CRUD**: crear, editar, activar/desactivar.
- Campos: **nombre** (ej. "Plan único"), **precio mensual** (ej. 45.00 MXN, IVA incluido), **estado**.
- Hoy existe un solo plan; el modelo soporta varios (a futuro, cada SIM podrá tener el suyo).

---

# Problemas a resolver en el rediseño

1. **Falta de contraste**: mucho texto secundario en gris claro (`#adadb8`, `#9ca3af`) que se pierde. Mantener 3 niveles de jerarquía pero todos legibles.
2. **Se siente genérico**: base de componentes neutra sin identidad de marca. Falta escala tipográfica definida, profundidad coherente y microinteracciones.
3. **Densidad de datos sin herramientas**: con ~1,500 SIMs las tablas necesitan encabezado fijo (sticky), un modo de vista compacta, y mejor legibilidad de fila (los ICCID/IMEI de 20 dígitos son difíciles de escanear).
4. **Listas largas sin resumen**: el desglose de factura muestra 150+ líneas idénticas; debe agruparse.
5. **Acciones enterradas**: en paneles con listas largas los botones quedan al final del scroll. Deben ir en un encabezado o pie fijo.
6. **Inconsistencia de nomenclatura**: el mismo estado de SIM aparece como "Emitida" (inventario/asignación), "Disponible" (portal) y "Deshabilitado" (dispositivos). **Unificar**.

# Restricciones (no negociables)

- Debe mantenerse **toda** la funcionalidad descrita.
- Semántica de color de estados: no reasignar (verde = activo/bien, ámbar = suspendido/atención, gris = inactivo/sin datos, rojo = desactivado/error).
- Los estados siempre llevan **icono + etiqueta**, nunca solo color (accesibilidad).
- La sidebar de 9 secciones se mantiene; puede rediseñarse pero no reorganizarse sin acordarlo.
- Español mexicano; formatos de fecha y moneda locales.
- Los datos de red (estado, conexión, consumo) provienen de EMNIFY y pueden tardar: **todos los listados necesitan estados de carga (skeletons) y de error explícitos**.

---

# Nota técnica (no diseñar)

Existen en el código `UsersPage.tsx` y `ActivityPage.tsx`, pero **no están ruteadas**: son código muerto y no forman parte del panel. No incluirlas en el rediseño.
