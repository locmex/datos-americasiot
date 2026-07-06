# Brain-dump: Notifications (change futuro)

> Nota pre-exploración. NO es un change formal todavía — solo contexto capturado en caliente
> mientras diseñábamos `client-orders`. Cuando se arranque, correr `/sdd-new notifications`.

## Por qué existe este change

Notificaciones se sacó **a propósito** del scope de `client-orders`: es una **capacidad transversal**
(no solo pedidos — también SIMs, dispositivos, consumo, etc.). Meterla dentro de pedidos la
acoplaría a un dominio y habría que reescribirla. Va como change independiente y desplegable por sí solo.

## Dónde `client-orders` la necesita (los enganches)

El flujo de pedidos emite transiciones de estado. Cada transición es un punto de notificación:

| Transición | Notificar a | Mensaje |
|------------|-------------|---------|
| `pending` (cliente crea pedido) | **Admin** | "Nuevo pedido de {cliente}" |
| `preparing` | Cliente | "Tu pedido está en preparación" |
| `shipped` | Cliente | "Tu pedido fue enviado" + paquetería + link de tracking |
| `delivered` (cliente confirma) | Admin (opcional) | "El cliente confirmó la recepción" |
| `cancelled` | La otra parte | "El pedido fue cancelado" |

## Enganche técnico (ya preparado)

`client-orders` crea la tabla **`order_status_history`**, que registra cada transición.
Ese es el punto natural de reacción: el sistema de notificaciones consume esos eventos
(trigger, webhook, o polling) SIN tocar el código de pedidos. Separación limpia:
`client-orders` = "qué pasó"; `notifications` = "a quién y cómo avisar".

## Decisiones abiertas (para cuando se diseñe)

- **Canal**: email / push / in-app / combinación.
- **Proveedor**: Resend, SendGrid, o el propio Supabase (Auth emails / Edge + SMTP).
- **Templates** y i18n (es-MX).
- **Preferencias del usuario**: opt-in/opt-out por tipo de evento.
- **Entrega**: síncrona en la request vs. cola/async (pg_net, pgmq — ya disponibles en el proyecto).

## Fuera de alcance de pedidos

`client-orders` NO implementa nada de esto. Solo deja el historial de estados como base.
