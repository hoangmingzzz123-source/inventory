-- Category quotation reference center and durable reference snapshots.
-- Apply after 20260920000000_master_status_compatibility.sql.

create table if not exists quotation_item_references (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  quotation_item_id uuid not null unique references quotation_items(id) on delete cascade,
  reference_type text not null check (reference_type in ('SALE', 'IMPORT', 'MANUAL')),
  reference_entity_id uuid,
  reference_quotation_id uuid references quotations(id) on delete set null,
  reference_quotation_item_id uuid references quotation_items(id) on delete set null,
  reference_goods_receipt_id uuid references goods_receipts(id) on delete set null,
  reference_goods_receipt_item_id uuid references goods_receipt_items(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists quotation_item_references_org_created_idx
  on quotation_item_references(org_id, created_at desc);
create index if not exists quotation_item_references_source_quote_idx
  on quotation_item_references(reference_quotation_item_id)
  where reference_quotation_item_id is not null;

alter table quotation_item_references enable row level security;
drop policy if exists "org_isolation" on quotation_item_references;
create policy "org_isolation" on quotation_item_references for select
  using (org_id = get_org_id());
revoke all on quotation_item_references from anon, authenticated;
grant select on quotation_item_references to authenticated;

-- Return the recent sales/import history for a category. The primary record is
-- selected by: same customer first, accepted/converted/delivered states first,
-- then quotation date and created_at. Draft/cancelled/rejected rows are ignored.
create or replace function get_quotation_reference(
  p_category_id uuid, p_customer_id uuid default null, p_limit integer default 10
) returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with sales as (
    select
      quotation.customer_id,
      quotation.date as reference_date,
      quotation.created_at,
      case when lower(quotation.status) in ('accepted', 'converted', 'awaiting delivery', 'delivered')
        then 0 else 1 end as status_priority,
      jsonb_build_object(
        'referenceType', 'SALE',
        'quotationItemId', quotation_item.id,
        'quotationId', quotation.id,
        'quotationLabel', quotation.id::text,
        'quotationStatus', quotation.status,
        'productId', product.id,
        'productName', coalesce(product.name, quotation_item.product_name, quotation_item.category_name),
        'sku', product.sku,
        'categoryId', quotation_item.category_id,
        'categoryName', quotation_item.category_name,
        'customerId', quotation.customer_id,
        'customerName', quotation.customer_name,
        'quantity', coalesce(allocation.qty, quotation_item.qty),
        'salePrice', quotation_item.selling_price,
        'importPrice', coalesce(receipt_item.unit_cost, quotation_item.cost_price),
        'vatPct', quotation_item.vat_pct,
        'marginPct', case when coalesce(receipt_item.unit_cost, quotation_item.cost_price, 0) > 0
          then round((quotation_item.selling_price - coalesce(receipt_item.unit_cost, quotation_item.cost_price))
            * 100 / coalesce(receipt_item.unit_cost, quotation_item.cost_price), 2)
          else null end,
        'referenceDate', quotation.date,
        'warehouseId', quotation.warehouse_id,
        'warehouseName', warehouse.name,
        'salesperson', quotation.created_by,
        'supplierId', coalesce(allocation.supplier_id, purchase_order.supplier_id),
        'supplierName', coalesce(supplier.name, receipt.supplier_name),
        'deliveryId', delivery.id,
        'deliveryRef', delivery.ref,
        'invoiceId', invoice.id,
        'invoiceRef', invoice.ref,
        'receiptId', receipt.id,
        'receiptRef', receipt.ref
      ) as record
    from quotation_items quotation_item
    join quotations quotation on quotation.id = quotation_item.quotation_id
    left join quotation_allocations allocation
      on allocation.quotation_item_id = quotation_item.id
    left join products product
      on product.id = coalesce(quotation_item.product_id, allocation.product_id)
    left join goods_receipt_items receipt_item
      on receipt_item.id = allocation.goods_receipt_item_id
    left join goods_receipts receipt on receipt.id = receipt_item.receipt_id
    left join purchase_orders purchase_order on purchase_order.id = receipt.po_id
    left join suppliers supplier
      on supplier.id = coalesce(allocation.supplier_id, purchase_order.supplier_id)
    left join warehouses warehouse on warehouse.id = quotation.warehouse_id
    left join lateral (
      select delivery_note.id, delivery_note.ref
      from delivery_notes delivery_note
      where delivery_note.org_id = quotation.org_id
        and delivery_note.quotation_id = quotation.id
        and lower(delivery_note.status) <> 'reversed'
      order by delivery_note.created_at desc, delivery_note.id
      limit 1
    ) delivery on true
    left join lateral (
      select source_invoice.id, source_invoice.ref
      from invoices source_invoice
      where source_invoice.org_id = quotation.org_id
        and source_invoice.delivery_id = delivery.id
        and lower(source_invoice.status) <> 'cancelled'
      order by source_invoice.created_at desc, source_invoice.id
      limit 1
    ) invoice on true
    where quotation.org_id = get_org_id()
      and quotation_item.category_id = p_category_id
      and lower(quotation.status) not in ('draft', 'pending', 'cancelled', 'rejected')
  ),
  recent_imports as (
    select
      receipt.created_at as reference_date,
      receipt_item.created_at,
      jsonb_build_object(
        'referenceType', 'IMPORT',
        'receiptItemId', receipt_item.id,
        'receiptId', receipt.id,
        'receiptRef', receipt.ref,
        'productId', product.id,
        'productName', product.name,
        'sku', product.sku,
        'categoryId', product.category_id,
        'categoryName', coalesce(category.name_vi, category.name_en, category.code),
        'supplierId', purchase_order.supplier_id,
        'supplierName', coalesce(supplier.name, receipt.supplier_name),
        'quantity', receipt_item.qty,
        'importPrice', receipt_item.unit_cost,
        'importUnit', receipt_item.unit,
        'referenceDate', receipt.created_at,
        'warehouseId', receipt.warehouse_id,
        'warehouseName', receipt.warehouse_name
      ) as record
    from goods_receipt_items receipt_item
    join goods_receipts receipt on receipt.id = receipt_item.receipt_id
    join products product on product.id = receipt_item.product_id
    left join categories category on category.id = product.category_id
    left join purchase_orders purchase_order on purchase_order.id = receipt.po_id
    left join suppliers supplier on supplier.id = purchase_order.supplier_id
    where receipt.org_id = get_org_id()
      and product.category_id = p_category_id
      and lower(receipt.status) <> 'reversed'
  ),
  primary_sale as (
    select sales.record,
      case when p_customer_id is not null and sales.customer_id = p_customer_id
        then 'CUSTOMER_AND_CATEGORY' else 'CATEGORY_ONLY' end as match_type
    from sales
    order by case when p_customer_id is not null and sales.customer_id = p_customer_id then 0 else 1 end,
      sales.status_priority, sales.reference_date desc, sales.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'primary', (select record from primary_sale),
    'matchType', coalesce((select match_type from primary_sale), 'NONE'),
    'sameCustomer', coalesce((
      select jsonb_agg(selected.record)
      from (
        select sales.record from sales
        where p_customer_id is not null and sales.customer_id = p_customer_id
        order by sales.status_priority, sales.reference_date desc, sales.created_at desc
        limit least(greatest(coalesce(p_limit, 10), 1), 20)
      ) selected
    ), '[]'::jsonb),
    'recentSales', coalesce((
      select jsonb_agg(selected.record)
      from (
        select sales.record from sales
        order by sales.status_priority, sales.reference_date desc, sales.created_at desc
        limit least(greatest(coalesce(p_limit, 10), 1), 20)
      ) selected
    ), '[]'::jsonb),
    'recentImports', coalesce((
      select jsonb_agg(selected.record)
      from (
        select recent_imports.record from recent_imports
        order by recent_imports.reference_date desc, recent_imports.created_at desc
        limit least(greatest(coalesce(p_limit, 10), 1), 20)
      ) selected
    ), '[]'::jsonb)
  )
$$;

grant execute on function get_quotation_reference(uuid, uuid, integer) to authenticated;
revoke execute on function get_quotation_reference(uuid, uuid, integer) from public;

-- Validate a selected source again at save time and build the immutable snapshot
-- from organization-owned rows. The client cannot forge cross-organization IDs
-- or rewrite the historical prices kept as the reference.
create or replace function persist_quotation_item_reference(
  p_quotation_item_id uuid, p_category_id uuid, p_reference jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  reference_type_value text := upper(coalesce(nullif(trim(p_reference->>'referenceType'), ''), ''));
  source_item_id uuid;
begin
  if p_reference is null or p_reference = 'null'::jsonb then return; end if;
  if current_org is null then raise exception 'Organization context is required'; end if;
  if not exists (
    select 1 from quotation_items quotation_item
    join quotations quotation on quotation.id = quotation_item.quotation_id
    where quotation_item.id = p_quotation_item_id and quotation.org_id = current_org
      and quotation_item.category_id = p_category_id
  ) then raise exception 'Quotation item reference target is invalid'; end if;

  if reference_type_value = 'SALE' then
    begin
      source_item_id := nullif(p_reference->>'quotationItemId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Sale reference identifier is invalid';
    end;
    insert into quotation_item_references (
      org_id, quotation_item_id, reference_type, reference_entity_id,
      reference_quotation_id, reference_quotation_item_id, product_id,
      customer_id, supplier_id, snapshot
    )
    select current_org, p_quotation_item_id, 'SALE', source_item.id,
      source_quotation.id, source_item.id,
      coalesce(source_product.id, allocation.product_id), source_quotation.customer_id,
      allocation.supplier_id,
      jsonb_build_object(
        'referenceType', 'SALE',
        'quotationItemId', source_item.id,
        'quotationId', source_quotation.id,
        'quotationLabel', source_quotation.id::text,
        'quotationStatus', source_quotation.status,
        'productId', coalesce(source_product.id, allocation.product_id),
        'productName', coalesce(source_product.name, allocated_product.name,
          source_item.product_name, source_item.category_name),
        'sku', coalesce(source_product.sku, allocated_product.sku),
        'categoryId', source_item.category_id,
        'categoryName', source_item.category_name,
        'customerId', source_quotation.customer_id,
        'customerName', source_quotation.customer_name,
        'quantity', source_item.qty,
        'salePrice', source_item.selling_price,
        'importPrice', source_item.cost_price,
        'vatPct', source_item.vat_pct,
        'marginPct', case when source_item.cost_price > 0
          then round((source_item.selling_price - source_item.cost_price) * 100 / source_item.cost_price, 2)
          else null end,
        'referenceDate', source_quotation.date,
        'warehouseId', source_quotation.warehouse_id,
        'warehouseName', warehouse.name,
        'salesperson', source_quotation.created_by
      )
    from quotation_items source_item
    join quotations source_quotation on source_quotation.id = source_item.quotation_id
    left join products source_product on source_product.id = source_item.product_id
    left join lateral (
      select quotation_allocation.product_id, quotation_allocation.supplier_id
      from quotation_allocations quotation_allocation
      where quotation_allocation.quotation_item_id = source_item.id
      order by case when quotation_allocation.product_id::text = p_reference->>'productId' then 0 else 1 end,
        quotation_allocation.created_at desc
      limit 1
    ) allocation on true
    left join products allocated_product on allocated_product.id = allocation.product_id
    left join warehouses warehouse on warehouse.id = source_quotation.warehouse_id
    where source_item.id = source_item_id
      and source_quotation.org_id = current_org
      and source_item.category_id = p_category_id
      and lower(source_quotation.status) not in ('draft', 'pending', 'cancelled', 'rejected');
    if not found then raise exception 'Sale reference is unavailable for this category'; end if;
  elsif reference_type_value = 'IMPORT' then
    begin
      source_item_id := nullif(p_reference->>'receiptItemId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Import reference identifier is invalid';
    end;
    insert into quotation_item_references (
      org_id, quotation_item_id, reference_type, reference_entity_id,
      reference_goods_receipt_id, reference_goods_receipt_item_id,
      product_id, supplier_id, snapshot
    )
    select current_org, p_quotation_item_id, 'IMPORT', receipt_item.id,
      receipt.id, receipt_item.id, product.id, purchase_order.supplier_id,
      jsonb_build_object(
        'referenceType', 'IMPORT',
        'receiptItemId', receipt_item.id,
        'receiptId', receipt.id,
        'receiptRef', receipt.ref,
        'productId', product.id,
        'productName', product.name,
        'sku', product.sku,
        'categoryId', product.category_id,
        'categoryName', coalesce(category.name_vi, category.name_en, category.code),
        'supplierId', purchase_order.supplier_id,
        'supplierName', coalesce(supplier.name, receipt.supplier_name),
        'quantity', receipt_item.qty,
        'importPrice', receipt_item.unit_cost,
        'importUnit', receipt_item.unit,
        'referenceDate', receipt.created_at,
        'warehouseId', receipt.warehouse_id,
        'warehouseName', receipt.warehouse_name
      )
    from goods_receipt_items receipt_item
    join goods_receipts receipt on receipt.id = receipt_item.receipt_id
    join products product on product.id = receipt_item.product_id
    left join categories category on category.id = product.category_id
    left join purchase_orders purchase_order on purchase_order.id = receipt.po_id
    left join suppliers supplier on supplier.id = purchase_order.supplier_id
    where receipt_item.id = source_item_id and receipt.org_id = current_org
      and product.category_id = p_category_id and lower(receipt.status) <> 'reversed';
    if not found then raise exception 'Import reference is unavailable for this category'; end if;
  elsif reference_type_value = 'MANUAL' then
    insert into quotation_item_references (
      org_id, quotation_item_id, reference_type, snapshot
    ) values (
      current_org, p_quotation_item_id, 'MANUAL',
      jsonb_build_object(
        'referenceType', 'MANUAL',
        'importPrice', greatest(coalesce(nullif(p_reference->>'importPrice', '')::numeric, 0), 0),
        'salePrice', greatest(coalesce(nullif(p_reference->>'salePrice', '')::numeric, 0), 0),
        'referenceDate', current_date
      )
    );
  else
    raise exception 'Quotation reference type must be SALE, IMPORT, or MANUAL';
  end if;
end;
$$;

revoke execute on function persist_quotation_item_reference(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Replace the category-first save function so the selected reference is saved
-- in the same transaction as its quotation line.
create or replace function save_quotation(
  p_id uuid, p_customer_id uuid, p_customer_name text, p_warehouse_id uuid,
  p_date date, p_valid_until date, p_status text, p_discount_val numeric,
  p_discount_type text, p_notes text, p_items jsonb, p_created_by text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  quotation_id uuid;
  source_row quotations%rowtype;
  item jsonb;
  product_row products%rowtype;
  category_row categories%rowtype;
  item_category_id uuid;
  quotation_item_id_value uuid;
  seen_categories uuid[] := array[]::uuid[];
  customer_name_value text;
  warehouse_name_value text;
  computed_subtotal numeric := 0;
  computed_tax numeric := 0;
  computed_total numeric := 0;
  line_total numeric;
  discount_value numeric := greatest(coalesce(p_discount_val, 0), 0);
  normalized_status text := lower(coalesce(nullif(trim(p_status), ''), 'draft'));
  actor_name text;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  if normalized_status not in ('draft', 'sent', 'accepted', 'rejected', 'cancelled') then
    raise exception 'Unsupported quotation status';
  end if;
  if p_discount_type not in ('pct', 'amount') then raise exception 'Discount is invalid'; end if;
  if p_discount_type = 'pct' and discount_value > 100 then
    raise exception 'Percentage discount cannot exceed 100';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one quotation category is required';
  end if;

  select name into customer_name_value from customers
  where id = p_customer_id and org_id = current_org and lower(status) = 'active';
  if not found then raise exception 'A valid customer is required'; end if;
  select name into warehouse_name_value from warehouses
  where id = p_warehouse_id and org_id = current_org and lower(status) = 'active';
  if not found then raise exception 'A valid fulfillment warehouse is required'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email)
     from profiles where id = auth.uid() and org_id = current_org), auth.uid()::text
  );

  if p_id is null then
    perform require_permission('Sales', 'create');
    if normalized_status = 'accepted' then perform require_permission('Sales', 'approve'); end if;
    insert into quotations (
      org_id, customer_id, customer_name, warehouse_id, date, valid_until,
      status, discount_val, discount_type, notes, total, created_by
    ) values (
      current_org, p_customer_id, customer_name_value, p_warehouse_id,
      coalesce(p_date, current_date), p_valid_until, initcap(normalized_status),
      discount_value, p_discount_type, p_notes, 0, actor_name
    ) returning id into quotation_id;
  else
    select * into source_row from quotations
    where id = p_id and org_id = current_org for update;
    if not found then raise exception 'Quotation was not found'; end if;
    if lower(source_row.status) in ('awaiting delivery', 'delivered', 'converted') then
      raise exception 'An allocated quotation cannot be edited';
    end if;
    if exists (select 1 from quotation_allocations where quotation_id = source_row.id) then
      raise exception 'A quotation with allocations cannot be edited';
    end if;
    if normalized_status = 'accepted' and lower(source_row.status) <> 'accepted' then
      perform require_permission('Sales', 'approve');
    else
      perform require_permission('Sales', 'update');
    end if;
    update quotations set customer_id = p_customer_id, customer_name = customer_name_value,
      warehouse_id = p_warehouse_id, date = coalesce(p_date, date), valid_until = p_valid_until,
      status = initcap(normalized_status), discount_val = discount_value,
      discount_type = p_discount_type, notes = p_notes, updated_at = now()
    where id = source_row.id;
    quotation_id := source_row.id;
    delete from quotation_items where quotation_id = source_row.id;
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    item_category_id := null;
    if nullif(item->>'category_id', '') is not null then
      begin item_category_id := (item->>'category_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Quotation category identifier is invalid';
      end;
    elsif nullif(item->>'product_id', '') is not null then
      begin
        select * into product_row from products
        where id = (item->>'product_id')::uuid and org_id = current_org;
      exception when invalid_text_representation then
        raise exception 'Quotation product identifier is invalid';
      end;
      if found then item_category_id := product_row.category_id; end if;
    end if;
    if item_category_id is null then raise exception 'Every quotation line requires a category'; end if;
    select * into category_row from categories
    where id = item_category_id and org_id = current_org and lower(status) = 'active';
    if not found then raise exception 'Quotation category is inactive or outside this organization'; end if;
    if item_category_id = any(seen_categories) then
      raise exception 'A category can appear only once in a quotation';
    end if;
    seen_categories := array_append(seen_categories, item_category_id);
    if coalesce(nullif(item->>'qty', '')::numeric, 0) <= 0 then
      raise exception 'Quotation quantity must be greater than zero';
    end if;
    if greatest(coalesce(nullif(item->>'selling_price', '')::numeric, 0), 0) = 0 then
      raise exception 'Quotation selling price must be greater than zero';
    end if;
    line_total := (item->>'qty')::numeric
      * greatest(coalesce(nullif(item->>'selling_price', '')::numeric, 0), 0);
    insert into quotation_items (
      quotation_id, product_id, product_name, supplier_id, supplier_name,
      import_unit, sell_unit, qty, cost_price, profit_pct, selling_price,
      vat_pct, total, category_id, category_name
    ) values (
      quotation_id, null,
      coalesce(nullif(item->>'category_name', ''), category_row.name_vi,
        category_row.name_en, category_row.code),
      null, null, null, nullif(item->>'sell_unit', ''),
      (item->>'qty')::numeric,
      greatest(coalesce(nullif(item->>'cost_price', '')::numeric, 0), 0),
      coalesce(nullif(item->>'profit_pct', '')::numeric, 0),
      greatest(coalesce(nullif(item->>'selling_price', '')::numeric, 0), 0),
      greatest(coalesce(nullif(item->>'vat_pct', '')::numeric, 0), 0),
      line_total, category_row.id,
      coalesce(category_row.name_vi, category_row.name_en, category_row.code)
    ) returning id into quotation_item_id_value;
    if item ? 'reference' and item->'reference' is not null
      and item->'reference' <> 'null'::jsonb then
      perform persist_quotation_item_reference(
        quotation_item_id_value, item_category_id, item->'reference'
      );
    end if;
    computed_subtotal := computed_subtotal + line_total;
    computed_tax := computed_tax + line_total
      * greatest(coalesce(nullif(item->>'vat_pct', '')::numeric, 0), 0) / 100;
  end loop;

  if p_discount_type = 'pct' then
    computed_total := (computed_subtotal + computed_tax) * (1 - discount_value / 100);
  else
    if discount_value > computed_subtotal then
      raise exception 'Fixed discount cannot exceed quotation subtotal';
    end if;
    computed_total := case when computed_subtotal > 0 then
      (computed_subtotal + computed_tax) * (computed_subtotal - discount_value) / computed_subtotal
      else 0 end;
  end if;
  update quotations set total = round(computed_total), updated_at = now()
  where id = quotation_id;
  return quotation_id;
end;
$$;

grant execute on function save_quotation(
  uuid, uuid, text, uuid, date, date, text, numeric, text, text, jsonb, text
) to authenticated;
revoke execute on function save_quotation(
  uuid, uuid, text, uuid, date, date, text, numeric, text, text, jsonb, text
) from public;

-- Notification sources must be present in the realtime publication. Existing
-- entries are left untouched so this migration remains repeatable.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['products', 'quotations'] loop
      if not exists (
        select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
