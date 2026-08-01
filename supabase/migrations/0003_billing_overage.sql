-- Cargo por excedente de datos.
--
-- Un plan incluye N MB. Lo que se consume por encima se cobra a una tarifa por
-- MB configurable por el admin.
--
-- Decisiones fijadas acá:
--
-- 1. `invoice_items.amount` NO cambia de significado: sigue siendo el cargo del
--    plan prorrateado. El excedente vive en `overage_amount`, aparte.
--    Motivo: el desglose agrupa por (plan, precio, prorrateo) y muestra
--    "156 SIMs × $45.00 · 100% = $7,020.00". Si `amount` incluyera excedentes,
--    esa igualdad dejaría de cumplirse y el renglón mentiría.
--
-- 2. Todo lo que define el cargo se CONGELA en la línea: los MB incluidos y la
--    tarifa aplicada. Cambiar el plan o la tarifa mañana no debe reescribir
--    facturas ya generadas. Mismo criterio que `unit_price`.
--
-- 3. La cuota de MB NO se prorratea. Una SIM dada de alta el día 20 paga el 50%
--    de la mensualidad y recibe igual el 100% de los MB incluidos.

-- ── 1. Los planes definen cuántos MB incluyen ────────────────────────────────
alter table plans
  add column included_mb numeric(12,3) not null default 25
    check (included_mb >= 0);

comment on column plans.included_mb is
  'MB incluidos en el plan por mes. No se prorratea: una SIM de alta el día 20 '
  'paga medio mes pero recibe la cuota completa.';

-- ── 2. Ajustes de facturación (fila única) ───────────────────────────────────
-- Tabla en vez de KV porque es un valor que participa del cálculo de dinero y
-- conviene que tenga tipo, CHECK y se pueda leer desde el mismo query.
create table billing_settings (
  id                  boolean primary key default true check (id),  -- fuerza fila única
  overage_rate_per_mb numeric(12,2) not null default 2.00
    check (overage_rate_per_mb >= 0),
  updated_at          timestamptz not null default now()
);

insert into billing_settings (id) values (true);

alter table billing_settings enable row level security;

-- ── 3. El detalle del excedente se congela en cada línea ─────────────────────
alter table invoice_items
  add column consumed_mb    numeric(12,3) not null default 0 check (consumed_mb >= 0),
  add column included_mb    numeric(12,3) not null default 0 check (included_mb >= 0),
  add column overage_mb     numeric(12,3) not null default 0 check (overage_mb >= 0),
  add column overage_rate   numeric(12,2) not null default 0 check (overage_rate >= 0),
  add column overage_amount numeric(12,2) not null default 0 check (overage_amount >= 0),
  -- Se resuelve el consumo llamando a emnify por SIM; si esa llamada falla no se
  -- inventa un cargo. La bandera deja el hueco visible en vez de silenciarlo.
  add column usage_source   text not null default 'none'
    check (usage_source in ('emnify', 'unavailable', 'none'));

comment on column invoice_items.consumed_mb is
  'MB consumidos por la SIM en el período. Congelado al generar.';
comment on column invoice_items.usage_source is
  'emnify = consumo real; unavailable = no se pudo leer y NO se cobró excedente; '
  'none = línea anterior a esta feature.';
