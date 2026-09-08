-- Complete sales workflow: partial delivery, invoice linkage, reversal, and returns
alter table delivery_notes add column if not exists invoice_id uuid references invoices(id);
alter table delivery_notes add column if not exists invoice_ref text;
alter table invoices add column if not exists delivery_id uuid references delivery_notes(id);
alter table invoices add column if not exists delivery_ref text;

create table if not exists sales_returns (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  ref text not null,
  delivery_id uuid references delivery_notes(id),
  delivery_ref text,
  customer_id uuid references customers(id),
  customer_name text not null,
  warehouse_id uuid references warehouses(id),
  warehouse_name text not null,
  status text not null default 'Completed',
  reason text,
  created_by text,
  created_at timestamptz default now(),
  unique (org_id, ref)
);

create table if not exists sales_return_items (
  id uuid primary key default uuid_generate_v4(),
  return_id uuid not null references sales_returns(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  sku text,
  qty numeric(18,2) not null default 0,
  unit_cost numeric(18,0) not null default 0,
  created_at timestamptz default now()
);

alter table sales_returns enable row level security;
alter table sales_return_items enable row level security;
drop policy if exists "org_isolation" on sales_returns;
drop policy if exists "org_insert_sales_returns" on sales_returns;
drop policy if exists "org_update_sales_returns" on sales_returns;
drop policy if exists "org_delete_sales_returns" on sales_returns;
drop policy if exists "org_isolation" on sales_return_items;
drop policy if exists "org_insert_sales_return_items" on sales_return_items;
drop policy if exists "org_update_sales_return_items" on sales_return_items;
drop policy if exists "org_delete_sales_return_items" on sales_return_items;
create policy "org_isolation" on sales_returns using (org_id = get_org_id());
create policy "org_insert_sales_returns" on sales_returns for insert with check (org_id = get_org_id());
create policy "org_update_sales_returns" on sales_returns for update using (org_id = get_org_id());
create policy "org_delete_sales_returns" on sales_returns for delete using (org_id = get_org_id());
create policy "org_isolation" on sales_return_items using (return_id in (select id from sales_returns where org_id = get_org_id()));
create policy "org_insert_sales_return_items" on sales_return_items for insert with check (return_id in (select id from sales_returns where org_id = get_org_id()));
create policy "org_update_sales_return_items" on sales_return_items for update using (return_id in (select id from sales_returns where org_id = get_org_id()));
create policy "org_delete_sales_return_items" on sales_return_items for delete using (return_id in (select id from sales_returns where org_id = get_org_id()));

create or replace function deliver_sales_order(
  p_ref text, p_sales_order_id uuid, p_sales_order_ref text, p_customer_id uuid,
  p_customer_name text, p_warehouse_id uuid, p_warehouse_name text, p_items jsonb,
  p_created_by text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_org uuid := get_org_id(); delivery_id uuid; created_invoice_id uuid; item jsonb; product_row record;
  item_product_id uuid; item_qty numeric; available_qty numeric; ordered_qty numeric; delivered_qty numeric;
  invoice_amount numeric := 0; invoice_tax numeric := 0; delivery_status text := 'Completed';
begin
  perform require_permission('Sales', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null or p_warehouse_id is null then raise exception 'Delivery reference and warehouse are required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one delivery item is required'; end if;
  if exists (select 1 from delivery_notes where org_id = current_org and ref = p_ref) then raise exception 'Delivery reference already exists'; end if;
  insert into delivery_notes (org_id, ref, sales_order_id, sales_order_ref, customer_id, customer_name, warehouse_id, warehouse_name, status, note, created_by)
    values (current_org, p_ref, p_sales_order_id, p_sales_order_ref, p_customer_id, coalesce(p_customer_name, ''), p_warehouse_id, p_warehouse_name, 'Completed', p_note, p_created_by) returning id into delivery_id;
  for item in select * from jsonb_array_elements(p_items) loop
    item_product_id := nullif(item->>'product_id', '')::uuid; item_qty := coalesce((item->>'qty')::numeric, 0);
    if item_product_id is null or item_qty <= 0 then raise exception 'Delivery item requires a positive quantity and product'; end if;
    select id, name, sku, cost into product_row from products where id = item_product_id and org_id = current_org for update;
    if not found then raise exception 'Product was not found for delivery'; end if;
    select coalesce(sum(qty_in - qty_out), 0) into available_qty from inventory_ledger where org_id = current_org and product_id = item_product_id and warehouse_id = p_warehouse_id;
    if available_qty < item_qty then raise exception 'Insufficient stock for product %: available %, requested %', product_row.sku, available_qty, item_qty; end if;
    if p_sales_order_id is not null then
      select coalesce(sum(qty), 0) into ordered_qty from sales_order_items where sales_order_id = p_sales_order_id and product_id = item_product_id;
      select coalesce(sum(dni.qty), 0) into delivered_qty from delivery_note_items dni join delivery_notes dn on dn.id = dni.delivery_id where dn.sales_order_id = p_sales_order_id and dni.product_id = item_product_id and dn.status <> 'Reversed';
      if ordered_qty = 0 or delivered_qty + item_qty > ordered_qty then raise exception 'Delivery exceeds remaining ordered quantity for product %', product_row.sku; end if;
      if delivered_qty + item_qty < ordered_qty then delivery_status := 'Partial'; end if;
    end if;
    insert into delivery_note_items (delivery_id, product_id, product_name, sku, qty, unit_cost, unit_price)
      values (delivery_id, item_product_id, coalesce(item->>'product_name', product_row.name), product_row.sku, item_qty, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), coalesce((item->>'unit_price')::numeric, 0));
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
      values (current_org, p_ref, 'SALE', item_product_id, coalesce(item->>'product_name', product_row.name), product_row.sku, p_warehouse_id, p_warehouse_name, 0, item_qty, coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), p_created_by);
    invoice_amount := invoice_amount + item_qty * coalesce((item->>'unit_price')::numeric, 0);
  end loop;
  update delivery_notes set status = delivery_status where id = delivery_id;
  insert into invoices (org_id, ref, so_id, so_ref, customer_name, amount, tax, total, status, delivery_id, delivery_ref)
    values (current_org, 'INV-' || p_ref, p_sales_order_id, p_sales_order_ref, coalesce(p_customer_name, ''), invoice_amount, invoice_tax, invoice_amount + invoice_tax, 'Draft', delivery_id, p_ref)
    returning id into created_invoice_id;
  update delivery_notes set invoice_id = created_invoice_id, invoice_ref = 'INV-' || p_ref where id = delivery_id;
  if p_sales_order_id is not null then update sales_orders set status = case when delivery_status = 'Partial' then 'Partial' else 'Delivered' end, updated_at = now() where id = p_sales_order_id and org_id = current_org; end if;
  perform append_audit_event('delivery_notes', 'CREATE', p_ref, null, jsonb_build_object('sales_order_ref', p_sales_order_ref, 'status', delivery_status, 'items', p_items));
  return delivery_id;
end;
$$;

grant execute on function deliver_sales_order(text, uuid, text, uuid, text, uuid, text, jsonb, text, text) to authenticated;

create or replace function reverse_delivery_note(p_ref text, p_created_by text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare current_org uuid := get_org_id(); dn record; item record; reversal_ref text := 'REV-' || p_ref; result_id uuid;
begin
  perform require_permission('Sales', 'approve');
  select * into dn from delivery_notes where org_id = current_org and ref = p_ref for update;
  if not found then raise exception 'Delivery note was not found'; end if;
  if dn.status = 'Reversed' then raise exception 'Delivery note is already reversed'; end if;
  for item in select * from delivery_note_items where delivery_id = dn.id loop
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by)
      values (current_org, reversal_ref, 'RETURN_IN', item.product_id, item.product_name, item.sku, dn.warehouse_id, dn.warehouse_name, item.qty, 0, item.unit_cost, p_created_by);
  end loop;
  update delivery_notes set status = 'Reversed' where id = dn.id returning id into result_id;
  perform append_audit_event('delivery_notes', 'REVERSE', p_ref, jsonb_build_object('status', dn.status), jsonb_build_object('status', 'Reversed'));
  return result_id;
end;
$$;
grant execute on function reverse_delivery_note(text, text) to authenticated;

create or replace function create_sales_return(p_ref text, p_delivery_ref text, p_warehouse_id uuid, p_warehouse_name text, p_items jsonb, p_reason text default null, p_created_by text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare current_org uuid := get_org_id(); return_id uuid; dn record; item jsonb; src record; qty numeric;
begin
  perform require_permission('Sales', 'create');
  select * into dn from delivery_notes where org_id = current_org and ref = p_delivery_ref;
  if not found then raise exception 'Delivery note was not found'; end if;
  if exists (select 1 from sales_returns where org_id = current_org and ref = p_ref) then raise exception 'Return reference already exists'; end if;
  insert into sales_returns (org_id, ref, delivery_id, delivery_ref, customer_id, customer_name, warehouse_id, warehouse_name, reason, created_by) values (current_org, p_ref, dn.id, dn.ref, dn.customer_id, dn.customer_name, p_warehouse_id, p_warehouse_name, p_reason, p_created_by) returning id into return_id;
  for item in select * from jsonb_array_elements(p_items) loop
    qty := coalesce((item->>'qty')::numeric, 0); select * into src from delivery_note_items where delivery_id = dn.id and product_id = nullif(item->>'product_id', '')::uuid;
    if not found or qty <= 0 or qty > src.qty then raise exception 'Return quantity exceeds delivered quantity'; end if;
    insert into sales_return_items (return_id, product_id, product_name, sku, qty, unit_cost) values (return_id, src.product_id, src.product_name, src.sku, qty, src.unit_cost);
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by) values (current_org, p_ref, 'RETURN_IN', src.product_id, src.product_name, src.sku, p_warehouse_id, p_warehouse_name, qty, 0, src.unit_cost, p_created_by);
  end loop;
  perform append_audit_event('sales_returns', 'CREATE', p_ref, null, jsonb_build_object('delivery_ref', p_delivery_ref, 'items', p_items));
  return return_id;
end;
$$;
grant execute on function create_sales_return(text, text, uuid, text, jsonb, text, text) to authenticated;
