-- Goods receipt details and auditable inventory movements
create table if not exists goods_receipt_items (
  id             uuid primary key default uuid_generate_v4(),
  receipt_id     uuid not null references goods_receipts(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text,
  qty            numeric(18,2) not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  unit           text,
  created_at     timestamptz default now()
);

create table if not exists inventory_ledger (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  movement_type  text not null,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  qty_in         numeric(18,2) not null default 0,
  qty_out        numeric(18,2) not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  created_by     text,
  created_at     timestamptz default now(),
  unique (org_id, ref, product_id, warehouse_id)
);

alter table goods_receipt_items enable row level security;
alter table inventory_ledger enable row level security;

create policy "org_isolation" on goods_receipt_items
  using (receipt_id in (select id from goods_receipts where org_id = get_org_id()));
create policy "org_isolation" on inventory_ledger using (org_id = get_org_id());

create policy "org_insert_goods_receipt_items" on goods_receipt_items for insert
  with check (receipt_id in (select id from goods_receipts where org_id = get_org_id()));
create policy "org_update_goods_receipt_items" on goods_receipt_items for update
  using (receipt_id in (select id from goods_receipts where org_id = get_org_id()));
create policy "org_delete_goods_receipt_items" on goods_receipt_items for delete
  using (receipt_id in (select id from goods_receipts where org_id = get_org_id()));
create policy "org_insert_inventory_ledger" on inventory_ledger for insert with check (org_id = get_org_id());
create policy "org_update_inventory_ledger" on inventory_ledger for update using (org_id = get_org_id());
create policy "org_delete_inventory_ledger" on inventory_ledger for delete using (org_id = get_org_id());
