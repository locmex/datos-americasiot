-- Migration: client_orders
-- Sistema de pedidos: 4 tablas relacionales que COEXISTEN con el KV (kv_store_ef736a01).
-- RLS deny-all: acceso solo vía service_role desde el edge function (igual que la tabla KV).

-- 1. products
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  price       numeric(12,2) not null check (price > 0),
  currency    text not null default 'MXN',
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. orders  (client_id = soft-reference a client:<id> del KV; sin FK)
create table orders (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null,
  client_name     text not null,
  status          text not null default 'pending'
                    check (status in ('pending','preparing','shipped','delivered','cancelled')),
  carrier         text,
  tracking_number text,
  tracking_url    text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_orders_client_id  on orders(client_id);
create index idx_orders_status     on orders(status);
create index idx_orders_created_at on orders(created_at desc);

-- 3. order_items
create table order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id)   on delete cascade,
  product_id   uuid not null references products(id) on delete restrict,
  product_name text not null,
  unit_price   numeric(12,2) not null check (unit_price > 0),
  quantity     integer not null check (quantity > 0)
);
create index idx_order_items_order_id   on order_items(order_id);
create index idx_order_items_product_id on order_items(product_id);

-- 4. order_status_history
create table order_status_history (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  changed_by      text not null,
  changed_by_role text not null check (changed_by_role in ('admin','client')),
  note            text,
  created_at      timestamptz not null default now()
);
create index idx_osh_order_id on order_status_history(order_id);

-- RLS: deny-all (service_role bypassea RLS; anon/authenticated no ven ninguna fila)
alter table products             enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table order_status_history enable row level security;
