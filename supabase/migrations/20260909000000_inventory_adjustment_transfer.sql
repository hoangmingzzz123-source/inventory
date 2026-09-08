-- Phase 3: inventory adjustments and warehouse transfers using inventory_ledger as source of truth
create table if not exists inventory_adjustments (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  reason         text not null default 'Manual adjustment',
  note           text,
  status         text not null default 'Completed',
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (org_id, ref)
);

create table if not exists inventory_adjustment_items (
  id             uuid primary key default uuid_generate_v4(),
  adjustment_id  uuid not null references inventory_adjustments(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text not null,
  qty_delta      numeric(18,2) not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  created_at     timestamptz default now()
);

create table if not exists inventory_transfers (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  ref            text not null,
  from_warehouse_id   uuid references warehouses(id),
  from_warehouse_name text not null,
  to_warehouse_id     uuid references warehouses(id),
  to_warehouse_name   text not null,
  status         text not null default 'Completed',
  note           text,
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (org_id, ref)
);

create table if not exists inventory_transfer_items (
  id             uuid primary key default uuid_generate_v4(),
  transfer_id    uuid not null references inventory_transfers(id) on delete cascade,
  product_id     uuid references products(id),
  product_name   text not null,
  sku            text,
  qty            numeric(18,2) not null default 0,
  unit_cost      numeric(18,0) not null default 0,
  created_at     timestamptz default now()
);

alter table inventory_adjustments enable row level security;
alter table inventory_adjustment_items enable row level security;
alter table inventory_transfers enable row level security;
alter table inventory_transfer_items enable row level security;

drop policy if exists "org_isolation" on inventory_adjustments;
drop policy if exists "org_insert_inventory_adjustments" on inventory_adjustments;
drop policy if exists "org_update_inventory_adjustments" on inventory_adjustments;
drop policy if exists "org_delete_inventory_adjustments" on inventory_adjustments;
drop policy if exists "org_isolation" on inventory_adjustment_items;
drop policy if exists "org_insert_inventory_adjustment_items" on inventory_adjustment_items;
drop policy if exists "org_update_inventory_adjustment_items" on inventory_adjustment_items;
drop policy if exists "org_delete_inventory_adjustment_items" on inventory_adjustment_items;
drop policy if exists "org_isolation" on inventory_transfers;
drop policy if exists "org_insert_inventory_transfers" on inventory_transfers;
drop policy if exists "org_update_inventory_transfers" on inventory_transfers;
drop policy if exists "org_delete_inventory_transfers" on inventory_transfers;
drop policy if exists "org_isolation" on inventory_transfer_items;
drop policy if exists "org_insert_inventory_transfer_items" on inventory_transfer_items;
drop policy if exists "org_update_inventory_transfer_items" on inventory_transfer_items;
drop policy if exists "org_delete_inventory_transfer_items" on inventory_transfer_items;

create policy "org_isolation" on inventory_adjustments using (org_id = get_org_id());
create policy "org_isolation" on inventory_adjustment_items
  using (adjustment_id in (select id from inventory_adjustments where org_id = get_org_id()));
create policy "org_isolation" on inventory_transfers using (org_id = get_org_id());
create policy "org_isolation" on inventory_transfer_items
  using (transfer_id in (select id from inventory_transfers where org_id = get_org_id()));

create policy "org_insert_inventory_adjustments" on inventory_adjustments for insert with check (org_id = get_org_id());
create policy "org_update_inventory_adjustments" on inventory_adjustments for update using (org_id = get_org_id());
create policy "org_delete_inventory_adjustments" on inventory_adjustments for delete using (org_id = get_org_id());
create policy "org_insert_inventory_adjustment_items" on inventory_adjustment_items for insert
  with check (adjustment_id in (select id from inventory_adjustments where org_id = get_org_id()));
create policy "org_update_inventory_adjustment_items" on inventory_adjustment_items for update
  using (adjustment_id in (select id from inventory_adjustments where org_id = get_org_id()));
create policy "org_delete_inventory_adjustment_items" on inventory_adjustment_items for delete
  using (adjustment_id in (select id from inventory_adjustments where org_id = get_org_id()));

create policy "org_insert_inventory_transfers" on inventory_transfers for insert with check (org_id = get_org_id());
create policy "org_update_inventory_transfers" on inventory_transfers for update using (org_id = get_org_id());
create policy "org_delete_inventory_transfers" on inventory_transfers for delete using (org_id = get_org_id());
create policy "org_insert_inventory_transfer_items" on inventory_transfer_items for insert
  with check (transfer_id in (select id from inventory_transfers where org_id = get_org_id()));
create policy "org_update_inventory_transfer_items" on inventory_transfer_items for update
  using (transfer_id in (select id from inventory_transfers where org_id = get_org_id()));
create policy "org_delete_inventory_transfer_items" on inventory_transfer_items for delete
  using (transfer_id in (select id from inventory_transfers where org_id = get_org_id()));

create or replace function append_inventory_movement(
  p_org_id uuid,
  p_ref text,
  p_movement_type text,
  p_product_id uuid,
  p_product_name text,
  p_sku text,
  p_warehouse_id uuid,
  p_warehouse_name text,
  p_qty_in numeric,
  p_qty_out numeric,
  p_unit_cost numeric,
  p_created_by text default null
)
returns void
language plpgsql
security definer
as $$
begin
  if p_movement_type not in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'OPENING_BALANCE', 'RECEIPT', 'SALE', 'RETURN_IN', 'RETURN_OUT') then
    raise exception 'Unsupported inventory movement type: %', p_movement_type;
  end if;

  insert into inventory_ledger (
    org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name,
    qty_in, qty_out, unit_cost, created_by, created_at
  ) values (
    p_org_id, p_ref, p_movement_type, p_product_id, p_product_name, p_sku, p_warehouse_id,
    p_warehouse_name, p_qty_in, p_qty_out, coalesce(p_unit_cost, 0), p_created_by, now()
  );
end;
$$;

grant execute on function append_inventory_movement(uuid, text, text, uuid, text, text, uuid, text, numeric, numeric, numeric, text) to authenticated;

create or replace function create_inventory_adjustment(
  p_ref text,
  p_warehouse_id uuid,
  p_warehouse_name text,
  p_reason text,
  p_items jsonb,
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  adjustment_id uuid;
  item jsonb;
  delta numeric;
  product_row record;
begin
  perform require_permission('Inventory', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null then raise exception 'Adjustment reference is required'; end if;
  if p_warehouse_id is null then raise exception 'Adjustment warehouse is required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one adjustment item is required'; end if;
  if exists (select 1 from inventory_adjustments where org_id = current_org and ref = p_ref) then raise exception 'Adjustment reference already exists'; end if;

  insert into inventory_adjustments (org_id, ref, warehouse_id, warehouse_name, reason, status, created_by)
  values (current_org, p_ref, p_warehouse_id, p_warehouse_name, coalesce(p_reason, 'Manual adjustment'), 'Completed', p_created_by)
  returning id into adjustment_id;

  for item in select * from jsonb_array_elements(p_items) loop
    delta := coalesce((item->>'qty_delta')::numeric, 0);
    if nullif(item->>'product_id', '') is null or delta = 0 then raise exception 'Adjustment item requires product and non-zero delta'; end if;
    select id, name, sku, cost into product_row from products where id = (item->>'product_id')::uuid and org_id = current_org;
    if not found then raise exception 'Product was not found for adjustment'; end if;

    insert into inventory_adjustment_items (adjustment_id, product_id, product_name, sku, warehouse_id, warehouse_name, qty_delta, unit_cost)
    values (adjustment_id, product_row.id, coalesce(item->>'product_name', product_row.name), product_row.sku, p_warehouse_id, p_warehouse_name, delta, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0));
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, p_ref, case when delta > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end, product_row.id, coalesce(item->>'product_name', product_row.name), product_row.sku, p_warehouse_id, p_warehouse_name, greatest(delta, 0), greatest(-delta, 0), coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), p_created_by);
  end loop;
  perform append_audit_event('inventory_adjustments', 'CREATE', p_ref, null, jsonb_build_object('warehouse_id', p_warehouse_id, 'items', p_items));
  return adjustment_id;
end;
$$;

create or replace function create_inventory_transfer(
  p_ref text,
  p_from_warehouse_id uuid,
  p_from_warehouse_name text,
  p_to_warehouse_id uuid,
  p_to_warehouse_name text,
  p_items jsonb,
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  transfer_id uuid;
  item jsonb;
  item_qty numeric;
  available_qty numeric;
  product_row record;
begin
  perform require_permission('Inventory', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if p_from_warehouse_id is null or p_to_warehouse_id is null or p_from_warehouse_id = p_to_warehouse_id then raise exception 'Transfer requires different source and destination warehouses'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one transfer item is required'; end if;
  if exists (select 1 from inventory_transfers where org_id = current_org and ref = p_ref) then raise exception 'Transfer reference already exists'; end if;

  insert into inventory_transfers (org_id, ref, from_warehouse_id, from_warehouse_name, to_warehouse_id, to_warehouse_name, status, created_by)
  values (current_org, p_ref, p_from_warehouse_id, p_from_warehouse_name, p_to_warehouse_id, p_to_warehouse_name, 'Completed', p_created_by)
  returning id into transfer_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce((item->>'qty')::numeric, 0);
    if nullif(item->>'product_id', '') is null or item_qty <= 0 then raise exception 'Transfer item requires product and positive quantity'; end if;
    select id, name, sku, cost into product_row from products where id = (item->>'product_id')::uuid and org_id = current_org for update;
    if not found then raise exception 'Product was not found for transfer'; end if;
    select coalesce(sum(qty_in - qty_out), 0) into available_qty from inventory_ledger where org_id = current_org and product_id = product_row.id and warehouse_id = p_from_warehouse_id;
    if available_qty < item_qty then raise exception 'Insufficient stock for product %: available %, requested %', product_row.sku, available_qty, item_qty; end if;

    insert into inventory_transfer_items (transfer_id, product_id, product_name, sku, qty, unit_cost)
    values (transfer_id, product_row.id, coalesce(item->>'product_name', product_row.name), product_row.sku, item_qty, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0));
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, p_ref, 'TRANSFER_OUT', product_row.id, coalesce(item->>'product_name', product_row.name), product_row.sku, p_from_warehouse_id, p_from_warehouse_name, 0, item_qty, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), p_created_by),
           (current_org, p_ref, 'TRANSFER_IN', product_row.id, coalesce(item->>'product_name', product_row.name), product_row.sku, p_to_warehouse_id, p_to_warehouse_name, item_qty, 0, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), p_created_by);
  end loop;
  perform append_audit_event('inventory_transfers', 'CREATE', p_ref, null, jsonb_build_object('from_warehouse_id', p_from_warehouse_id, 'to_warehouse_id', p_to_warehouse_id, 'items', p_items));
  return transfer_id;
end;
$$;

grant execute on function create_inventory_adjustment(text, uuid, text, text, jsonb, text) to authenticated;
grant execute on function create_inventory_transfer(text, uuid, text, uuid, text, jsonb, text) to authenticated;

create or replace function reverse_inventory_adjustment(p_ref text, p_created_by text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare current_org uuid := get_org_id(); source_row record; item record; reversal_ref text := 'REV-' || p_ref;
begin
  perform require_permission('Inventory', 'approve');
  select * into source_row from inventory_adjustments where org_id = current_org and ref = p_ref for update;
  if not found then raise exception 'Adjustment was not found'; end if;
  if source_row.status = 'Reversed' then raise exception 'Adjustment is already reversed'; end if;
  for item in select * from inventory_adjustment_items where adjustment_id = source_row.id loop
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
      values (current_org, reversal_ref, case when item.qty_delta > 0 then 'ADJUSTMENT_OUT' else 'ADJUSTMENT_IN' end, item.product_id, item.product_name, item.sku, item.warehouse_id, item.warehouse_name, greatest(-item.qty_delta, 0), greatest(item.qty_delta, 0), item.unit_cost, p_created_by);
  end loop;
  update inventory_adjustments set status = 'Reversed', updated_at = now() where id = source_row.id;
  perform append_audit_event('inventory_adjustments', 'REVERSE', p_ref, jsonb_build_object('status', source_row.status), jsonb_build_object('status', 'Reversed'));
  return source_row.id;
end;
$$;

create or replace function reverse_inventory_transfer(p_ref text, p_created_by text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare current_org uuid := get_org_id(); source_row record; item record; reversal_ref text := 'REV-' || p_ref;
begin
  perform require_permission('Inventory', 'approve');
  select * into source_row from inventory_transfers where org_id = current_org and ref = p_ref for update;
  if not found then raise exception 'Transfer was not found'; end if;
  if source_row.status = 'Reversed' then raise exception 'Transfer is already reversed'; end if;
  for item in select * from inventory_transfer_items where transfer_id = source_row.id loop
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
      values (current_org, reversal_ref, 'TRANSFER_IN', item.product_id, item.product_name, item.sku, source_row.from_warehouse_id, source_row.from_warehouse_name, item.qty, 0, item.unit_cost, p_created_by),
             (current_org, reversal_ref, 'TRANSFER_OUT', item.product_id, item.product_name, item.sku, source_row.to_warehouse_id, source_row.to_warehouse_name, 0, item.qty, item.unit_cost, p_created_by);
  end loop;
  update inventory_transfers set status = 'Reversed', updated_at = now() where id = source_row.id;
  perform append_audit_event('inventory_transfers', 'REVERSE', p_ref, jsonb_build_object('status', source_row.status), jsonb_build_object('status', 'Reversed'));
  return source_row.id;
end;
$$;

grant execute on function reverse_inventory_adjustment(text, text) to authenticated;
grant execute on function reverse_inventory_transfer(text, text) to authenticated;
