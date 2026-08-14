-- WarehouseOS Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Organizations ───────────────────────────────────────────
create table if not exists organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz default now()
);

-- ─── Profiles (extends auth.users) ──────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'staff',   -- admin | manager | staff
  org_id      uuid references organizations(id),
  created_at  timestamptz default now()
);

create table if not exists roles (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text not null,
  name_vi     text not null,
  name_en     text not null,
  is_system   boolean not null default false,
  description text,
  created_at  timestamptz default now(),
  unique (org_id, code)
);

create table if not exists role_permissions (
  role_id     uuid not null references roles(id) on delete cascade,
  module      text not null,
  action      text not null,
  allowed     boolean not null default true,
  primary key (role_id, module, action)
);

-- Auto-create profile on signup via trigger
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  org_id uuid;
  org_name text;
begin
  org_name := coalesce(new.raw_user_meta_data->>'org_name', 'My Organization');
  insert into public.organizations (name) values (org_name) returning id into org_id;
  insert into public.profiles (id, email, full_name, role, org_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'admin',
    org_id
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Products ────────────────────────────────────────────────
create table if not exists products (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  sku         text not null,
  barcode     text,
  name        text not null,
  category    text,
  brand       text,
  unit        text,
  cost        numeric(18,0) not null default 0,
  price       numeric(18,0) not null default 0,
  qty         integer not null default 0,
  status      text not null default 'Active',
  updated_at  timestamptz default now(),
  updated_by  text,
  unique (org_id, sku)
);

-- ─── Categories ──────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text not null,
  name_vi     text not null,
  name_en     text not null,
  parent_id   uuid references categories(id),
  description text,
  status      text not null default 'Active',
  unique (org_id, code)
);

-- ─── Brands ──────────────────────────────────────────────────
create table if not exists brands (
  id       uuid primary key default uuid_generate_v4(),
  org_id   uuid not null references organizations(id) on delete cascade,
  code     text not null,
  name     text not null,
  country  text,
  website  text,
  status   text not null default 'Active',
  unique (org_id, code)
);

-- ─── Units ───────────────────────────────────────────────────
create table if not exists units (
  id       uuid primary key default uuid_generate_v4(),
  org_id   uuid not null references organizations(id) on delete cascade,
  code     text not null,
  name_vi  text not null,
  name_en  text not null,
  type     text not null default 'Quantity',
  status   text not null default 'Active',
  unique (org_id, code)
);

-- ─── Warehouses ──────────────────────────────────────────────
create table if not exists warehouses (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text not null,
  name        text not null,
  address     text,
  manager     text,
  phone       text,
  status      text not null default 'Active',
  stock_value numeric(18,0) not null default 0,
  unique (org_id, code)
);

-- ─── Customers ───────────────────────────────────────────────
create table if not exists customers (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organizations(id) on delete cascade,
  code         text not null,
  name         text not null,
  phone        text,
  email        text,
  tax_code     text,
  address      text,
  credit_limit numeric(18,0) not null default 0,
  debt         numeric(18,0) not null default 0,
  status       text not null default 'Active',
  created_at   timestamptz default now(),
  unique (org_id, code)
);

-- ─── Suppliers ───────────────────────────────────────────────
create table if not exists suppliers (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  code          text not null,
  name          text not null,
  phone         text,
  email         text,
  tax_code      text,
  address       text,
  payment_terms integer not null default 30,
  debt          numeric(18,0) not null default 0,
  status        text not null default 'Active',
  created_at    timestamptz default now(),
  unique (org_id, code)
);

-- ─── Quotations ─────────────────────────────────────────────
create table if not exists quotations (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  customer_id    uuid references customers(id),
  customer_name  text not null,
  date           date not null default current_date,
  valid_until    date,
  status         text not null default 'Draft',
  discount_val   numeric(18,0) not null default 0,
  discount_type  text not null default 'pct',
  notes          text,
  total          numeric(18,0) not null default 0,
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (org_id, id)
);

create table if not exists quotation_items (
  id             uuid primary key default uuid_generate_v4(),
  quotation_id   uuid not null references quotations(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  supplier_id    uuid references suppliers(id),
  supplier_name  text,
  import_unit    text,
  sell_unit      text,
  qty            numeric(18,2) not null default 1,
  cost_price     numeric(18,0) not null default 0,
  profit_pct     numeric(18,2) not null default 0,
  selling_price  numeric(18,0) not null default 0,
  vat_pct        numeric(18,2) not null default 0,
  total          numeric(18,0) not null default 0,
  created_at     timestamptz default now()
);

-- ─── Purchase Orders ─────────────────────────────────────────
create table if not exists purchase_orders (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  supplier_id    uuid references suppliers(id),
  supplier_name  text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  status         text not null default 'Draft',
  total          numeric(18,0) not null default 0,
  notes          text,
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (org_id, ref)
);

-- ─── Purchase Order Items ────────────────────────────────────
create table if not exists purchase_order_items (
  id          uuid primary key default uuid_generate_v4(),
  po_id       uuid not null references purchase_orders(id) on delete cascade,
  product_id  uuid references products(id),
  product_name text not null,
  sku         text,
  qty         integer not null default 1,
  unit_cost   numeric(18,0) not null default 0,
  total       numeric(18,0) generated always as (qty * unit_cost) stored
);

-- ─── Goods Receipts ──────────────────────────────────────────
create table if not exists goods_receipts (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  po_id          uuid references purchase_orders(id),
  po_ref         text,
  supplier_name  text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  status         text not null default 'Completed',
  items          integer not null default 0,
  created_by     text,
  created_at     timestamptz default now(),
  unique (org_id, ref)
);

-- ─── Sales Orders ────────────────────────────────────────────
create table if not exists sales_orders (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  customer_id    uuid references customers(id),
  customer_name  text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  status         text not null default 'Draft',
  subtotal       numeric(18,0) not null default 0,
  tax            numeric(18,0) not null default 0,
  total          numeric(18,0) not null default 0,
  notes          text,
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (org_id, ref)
);

-- ─── Inventory Balance ───────────────────────────────────────
create table if not exists inventory_balance (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  qty            integer not null default 0,
  min_qty        integer not null default 0,
  max_qty        integer not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  updated_at     timestamptz default now(),
  unique (org_id, sku, warehouse_id)
);

-- ─── Invoices ────────────────────────────────────────────────
create table if not exists invoices (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  ref           text not null,
  so_id         uuid references sales_orders(id),
  so_ref        text,
  customer_name text not null,
  amount        numeric(18,0) not null default 0,
  tax           numeric(18,0) not null default 0,
  total         numeric(18,0) not null default 0,
  status        text not null default 'Draft',
  created_at    timestamptz default now(),
  unique (org_id, ref)
);

-- ─── Cash Book ───────────────────────────────────────────────
create table if not exists cash_book (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  ref         text not null,
  type        text not null,   -- Receipt | Payment
  description text,
  amount      numeric(18,0) not null,
  balance     numeric(18,0) not null default 0,
  created_at  timestamptz default now()
);

-- ─── Row Level Security ──────────────────────────────────────
alter table organizations       enable row level security;
alter table profiles            enable row level security;
alter table roles              enable row level security;
alter table role_permissions   enable row level security;
alter table products            enable row level security;
alter table categories          enable row level security;
alter table brands              enable row level security;
alter table units               enable row level security;
alter table warehouses          enable row level security;
alter table customers           enable row level security;
alter table suppliers           enable row level security;
alter table quotations          enable row level security;
alter table quotation_items     enable row level security;
alter table purchase_orders     enable row level security;
alter table purchase_order_items enable row level security;
alter table goods_receipts      enable row level security;
alter table sales_orders        enable row level security;
alter table inventory_balance   enable row level security;
alter table invoices            enable row level security;
alter table cash_book           enable row level security;

-- Helper: get current user's org_id
create or replace function get_org_id()
returns uuid language sql security definer stable as $$
  select org_id from profiles where id = auth.uid()
$$;

-- RLS Policies — users can only access their org's data
create policy "org_isolation" on roles          using (org_id = get_org_id());
create policy "org_isolation" on role_permissions using (role_id in (select id from roles where org_id = get_org_id()));
create policy "org_isolation" on products       using (org_id = get_org_id());
create policy "org_isolation" on categories     using (org_id = get_org_id());
create policy "org_isolation" on brands         using (org_id = get_org_id());
create policy "org_isolation" on units          using (org_id = get_org_id());
create policy "org_isolation" on warehouses     using (org_id = get_org_id());
create policy "org_isolation" on customers      using (org_id = get_org_id());
create policy "org_isolation" on suppliers      using (org_id = get_org_id());
create policy "org_isolation" on quotations     using (org_id = get_org_id());
create policy "org_isolation" on quotation_items using (quotation_id in (select id from quotations where org_id = get_org_id()));
create policy "org_isolation" on purchase_orders using (org_id = get_org_id());
create policy "org_isolation" on goods_receipts  using (org_id = get_org_id());
create policy "org_isolation" on sales_orders   using (org_id = get_org_id());
create policy "org_isolation" on inventory_balance using (org_id = get_org_id());
create policy "org_isolation" on invoices       using (org_id = get_org_id());
create policy "org_isolation" on cash_book      using (org_id = get_org_id());

create policy "org_isolation" on purchase_order_items
  using (po_id in (select id from purchase_orders where org_id = get_org_id()));

-- Profile: user can read/update own profile
create policy "own_profile_read"   on profiles using (id = auth.uid());
create policy "own_profile_update" on profiles for update using (id = auth.uid());

-- Org: members can read their org
create policy "org_members_read" on organizations
  using (id = get_org_id());

-- Full CRUD policies (using same helper) — insert/update/delete
do $$ begin
  for tbl in select unnest(array['roles','role_permissions','products','categories','brands','units','warehouses',
    'customers','suppliers','quotations','quotation_items','purchase_orders','goods_receipts','sales_orders',
    'inventory_balance','invoices','cash_book']) as t loop
    execute format(
      'create policy "org_insert_%1$s" on %1$s for insert with check (org_id = get_org_id())',
      tbl
    );
    execute format(
      'create policy "org_update_%1$s" on %1$s for update using (org_id = get_org_id())',
      tbl
    );
    execute format(
      'create policy "org_delete_%1$s" on %1$s for delete using (org_id = get_org_id())',
      tbl
    );
  end loop;
end $$;
