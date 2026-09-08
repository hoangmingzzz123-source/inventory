-- Atomic goods receipt creation. All receipt, balance, and ledger writes share one transaction.
create or replace function receive_goods_receipt(
  p_ref text,
  p_po_ref text,
  p_warehouse_id uuid,
  p_warehouse_name text,
  p_supplier_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_org_id uuid := get_org_id();
  receipt_id uuid;
  item jsonb;
  product_row record;
  item_qty numeric;
  item_cost numeric;
  existing_balance record;
begin
  if current_org_id is null then
    raise exception 'Authenticated organization is required';
  end if;
  if coalesce(trim(p_ref), '') = '' then
    raise exception 'Receipt reference is required';
  end if;
  if coalesce(trim(p_warehouse_name), '') = '' then
    raise exception 'Receiving warehouse is required';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one receipt item is required';
  end if;
  if exists (select 1 from goods_receipts where org_id = current_org_id and ref = p_ref) then
    raise exception 'Goods receipt already exists';
  end if;

  insert into goods_receipts (org_id, ref, po_ref, warehouse_id, warehouse_name, supplier_name, items, status)
  values (current_org_id, p_ref, nullif(p_po_ref, ''), p_warehouse_id, p_warehouse_name, coalesce(nullif(p_supplier_name, ''), 'Unknown Supplier'), jsonb_array_length(p_items), 'Completed')
  returning id into receipt_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_qty := coalesce((item->>'qty')::numeric, 0);
    item_cost := coalesce((item->>'unit_cost')::numeric, 0);
    if item_qty <= 0 then
      raise exception 'Receipt quantity must be greater than zero';
    end if;

    select id, name, sku, unit, cost
      into product_row
      from products
     where org_id = current_org_id
       and (id = nullif(item->>'product_id', '')::uuid or sku = nullif(item->>'sku', ''))
     limit 1;
    if not found then
      raise exception 'Product was not found for receipt item';
    end if;

    insert into goods_receipt_items (receipt_id, product_id, product_name, sku, qty, unit_cost, unit)
    values (receipt_id, product_row.id, product_row.name, product_row.sku, item_qty, item_cost, nullif(item->>'unit', ''));

    update products
       set qty = coalesce(qty, 0) + item_qty,
           updated_at = now()
     where id = product_row.id and org_id = current_org_id;

    select id, qty
      into existing_balance
      from inventory_balance
     where org_id = current_org_id
       and sku = product_row.sku
       and warehouse_id is not distinct from p_warehouse_id
     limit 1;

    if found then
      update inventory_balance
         set qty = coalesce(existing_balance.qty, 0) + item_qty,
             unit_cost = item_cost,
             updated_at = now()
       where id = existing_balance.id and org_id = current_org_id;
    else
      insert into inventory_balance (org_id, product_id, product_name, sku, warehouse_id, warehouse_name, qty, unit_cost)
      values (current_org_id, product_row.id, product_row.name, product_row.sku, p_warehouse_id, p_warehouse_name, item_qty, item_cost);
    end if;

    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id, warehouse_name, qty_in, qty_out, unit_cost)
    values (current_org_id, p_ref, 'RECEIPT', product_row.id, product_row.name, product_row.sku, p_warehouse_id, p_warehouse_name, item_qty, 0, item_cost);
  end loop;

  return receipt_id;
end;
$$;

grant execute on function receive_goods_receipt(text, text, uuid, text, text, jsonb) to authenticated;
