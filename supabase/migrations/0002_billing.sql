-- Migration: billing
-- Facturación mensual de SIMs: 5 tablas relacionales que COEXISTEN con el KV (kv_store_ef736a01).
-- RLS deny-all: acceso solo vía service_role desde el edge function (igual que client_orders / KV).
-- sim_assignments es un log de períodos append-only (única fuente para facturar).

-- 1. plans
create table plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  currency   text not null default 'MXN',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. sim_assignments (log de períodos de vigencia; client_id = soft-ref al KV + snapshot)
create table sim_assignments (
  id              uuid primary key default gen_random_uuid(),
  iccid           text not null,
  client_id       text not null,
  client_name     text not null,
  plan_id         uuid references plans(id) on delete restrict,
  activated_at    timestamptz not null,
  deactivated_at  timestamptz,                        -- null = período abierto
  last_status_id  int not null default 1,
  created_at      timestamptz not null default now()
);
create index idx_sa_iccid  on sim_assignments(iccid);
create index idx_sa_client on sim_assignments(client_id);
create index idx_sa_window on sim_assignments(activated_at, deactivated_at);
create unique index uq_sa_open on sim_assignments(iccid) where deactivated_at is null;

-- 3. invoices
create table invoices (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  client_name  text not null,
  period_year  int not null check (period_year between 2020 and 2100),
  period_month int not null check (period_month between 1 and 12),
  status       text not null default 'draft'
                 check (status in ('draft','issued','partially_paid','paid','cancelled')),
  currency     text not null default 'MXN',
  total        numeric(12,2) not null default 0 check (total >= 0),
  issued_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, period_year, period_month)
);
create index idx_inv_client on invoices(client_id);
create index idx_inv_status on invoices(status);
create index idx_inv_period on invoices(period_year, period_month);

-- 4. invoice_items (todo congelado al momento de la generación)
create table invoice_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references invoices(id) on delete cascade,
  iccid             text not null,
  plan_id           uuid references plans(id) on delete restrict,
  plan_name         text not null,
  unit_price        numeric(12,2) not null check (unit_price > 0),
  proration_factor  numeric(3,2) not null check (proration_factor in (0.50,1.00)),
  activated_at      timestamptz not null,
  sim_status        text not null,
  amount            numeric(12,2) not null check (amount > 0),
  unique (invoice_id, iccid)                           -- máx 1 cargo por SIM por factura
);
create index idx_ii_invoice on invoice_items(invoice_id);

-- 5. payments (abonos; append-only, se conservan al cancelar)
create table payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  paid_at     timestamptz not null,
  method      text not null check (length(trim(method)) > 0),
  note        text,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create index idx_pay_invoice on payments(invoice_id);

-- RLS: deny-all (service_role bypassea RLS; anon/authenticated no ven ninguna fila)
alter table plans            enable row level security;
alter table sim_assignments  enable row level security;
alter table invoices         enable row level security;
alter table invoice_items    enable row level security;
alter table payments         enable row level security;

-- down (documentación; no se ejecuta automáticamente):
-- drop table payments, invoice_items, invoices, sim_assignments, plans cascade;
