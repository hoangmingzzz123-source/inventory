-- Phase 4: sales order items and atomic delivery/outbound inventory workflow
create table if not exists sales_order_items (
  id             uuid primary key default uuid_generate_v4(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text,
  qty            numeric(18,2) not null default 1,
  unit_price     numeric(18,0) not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  total          numeric(18,0) generated always as (qty * unit_price) stored,
  created_at     timestamptz default now()
);

create table if not exists delivery_notes (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  sales_order_id uuid references sales_orders(id),
  sales_order_ref text,
  customer_id    uuid references customers(id),
  customer_name  text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  status         text not null default 'Completed',
  note           text,
  created_by     text,
  created_at     timestamptz default now(),
  unique (org_id, ref)
);

create table if not exists delivery_note_items (
  id             uuid primary key default uuid_generate_v4(),
  delivery_id    uuid not null references delivery_notes(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text,
  qty            numeric(18,2) not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  unit_price     numeric(18,0) not null default 0,
  created_at     timestamptz default now()
);

alter table sales_order_items enable row level security;
alter table delivery_notes enable row level security;
alter table delivery_note_items enable row level security;

drop policy if exists "org_isolation" on sales_order_items;
drop policy if exists "org_insert_sales_order_items" on sales_order_items;
drop policy if exists "org_update_sales_order_items" on sales_order_items;
drop policy if exists "org_delete_sales_order_items" on sales_order_items;
drop policy if exists "org_isolation" on delivery_notes;
drop policy if exists "org_insert_delivery_notes" on delivery_notes;
drop policy if exists "org_update_delivery_notes" on delivery_notes;
drop policy if exists "org_delete_delivery_notes" on delivery_notes;
drop policy if exists "org_isolation" on delivery_note_items;
drop policy if exists "org_insert_delivery_note_items" on delivery_note_items;
drop policy if exists "org_update_delivery_note_items" on delivery_note_items;
drop policy if exists "org_delete_delivery_note_items" on delivery_note_items;

create policy "org_isolation" on sales_order_items
  using (sales_order_id in (select id from sales_orders where org_id = get_org_id()));
create policy "org_isolation" on delivery_notes using (org_id = get_org_id());
create policy "org_isolation" on delivery_note_items
  using (delivery_id in (select id from delivery_notes where org_id = get_org_id()));
create policy "org_insert_sales_order_items" on sales_order_items for insert
  with check (sales_order_id in (select id from sales_orders where org_id = get_org_id()));
create policy "org_update_sales_order_items" on sales_order_items for update
  using (sales_order_id in (select id from sales_orders where org_id = get_org_id()));
create policy "org_delete_sales_order_items" on sales_order_items for delete
  using (sales_order_id in (select id from sales_orders where org_id = get_org_id()));
create policy "org_insert_delivery_notes" on delivery_notes for insert with check (org_id = get_org_id());
create policy "org_update_delivery_notes" on delivery_notes for update using (org_id = get_org_id());
create policy "org_delete_delivery_notes" on delivery_notes for delete using (org_id = get_org_id());
create policy "org_insert_delivery_note_items" on delivery_note_items for insert
  with check (delivery_id in (select id from delivery_notes where org_id = get_org_id()));
create policy "org_update_delivery_note_items" on delivery_note_items for update
  using (delivery_id in (select id from delivery_notes where org_id = get_org_id()));
create policy "org_delete_delivery_note_items" on delivery_note_items for delete
  using (delivery_id in (select id from delivery_notes where org_id = get_org_id()));

create or replace function deliver_sales_order(
  p_ref text,
  p_sales_order_id uuid,
  p_sales_order_ref text,
  p_customer_id uuid,
  p_customer_name text,
  p_warehouse_id uuid,
  p_warehouse_name text,
  p_items jsonb,
  p_created_by text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  delivery_id uuid;
  item jsonb;
  product_row record;
  item_product_id uuid;
  item_qty numeric;
  available_qty numeric;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null then raise exception 'Delivery reference is required'; end if;
  if p_warehouse_id is null then raise exception 'Delivery warehouse is required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one delivery item is required'; end if;
  if exists (select 1 from delivery_notes where org_id = current_org and ref = p_ref) then
    raise exception 'Delivery reference already exists';
  end if;

  insert into delivery_notes (org_id, ref, sales_order_id, sales_order_ref, customer_id, customer_name, warehouse_id, warehouse_name, status, note, created_by)
  values (current_org, p_ref, p_sales_order_id, p_sales_order_ref, p_customer_id, coalesce(p_customer_name, ''), p_warehouse_id, p_warehouse_name, 'Completed', p_note, p_created_by)
  returning id into delivery_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_product_id := nullif(item->>'product_id', '')::uuid;
    item_qty := coalesce((item->>'qty')::numeric, 0);
    if item_product_id is null or item_qty <= 0 then raise exception 'Delivery item requires a positive quantity and product'; end if;

    select id, name, sku, cost into product_row from products where id = item_product_id and org_id = current_org for update;
    if not found then raise exception 'Product was not found for delivery'; end if;

    select coalesce(sum(qty_in - qty_out), 0) into available_qty
      from inventory_ledger
      where org_id = current_org and product_id = item_product_id and warehouse_id = p_warehouse_id;
    if available_qty < item_qty then
      raise exception 'Insufficient stock for product %: available %, requested %', product_row.sku, available_qty, item_qty;
    end if;

    insert into delivery_note_items (delivery_id, product_id, product_name, sku, qty, unit_cost, unit_price)
    values (delivery_id, item_product_id, coalesce(item->>'product_name', product_row.name), product_row.sku, item_qty,
      coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), coalesce((item->>'unit_price')::numeric, 0));

    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, p_ref, 'SALE', item_product_id, coalesce(item->>'product_name', product_row.name), product_row.sku,
      p_warehouse_id, p_warehouse_name, 0, item_qty, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), p_created_by);
  end loop;

  if p_sales_order_id is not null then
    update sales_orders set status = 'Delivered', updated_at = now() where id = p_sales_order_id and org_id = current_org;
  end if;
  return delivery_id;
end;
$$;

grant execute on function deliver_sales_order(text, uuid, text, uuid, text, uuid, text, jsonb, text, text) to authenticated;
