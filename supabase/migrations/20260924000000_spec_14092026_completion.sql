-- Complete the 14/09/2026 quotation specification.
-- Apply after 20260923000000_quotation_category_defaults_export.sql.

-- Quotation labels are allocated atomically per organization and quotation
-- date. The row lock taken by ON CONFLICT prevents concurrent MAX + 1 races.
create table if not exists quotation_daily_sequences (
  org_id uuid not null references organizations(id) on delete cascade,
  sequence_date date not null,
  last_value bigint not null check (last_value > 0),
  primary key (org_id, sequence_date)
);

alter table quotation_daily_sequences enable row level security;
revoke all on quotation_daily_sequences from public, anon, authenticated;

-- Put existing labels in a collision-free temporary namespace before assigning
-- the new deterministic H2T-ddMMyyyy-N format.
update quotations
set quotation_number = 'MIG-' || replace(id::text, '-', '');

with ranked as (
  select id,
    row_number() over (
      partition by org_id, coalesce(date, (created_at at time zone 'Asia/Ho_Chi_Minh')::date)
      order by created_at, id
    ) as sequence_value
  from quotations
)
update quotations quotation
set quotation_number = 'H2T-' ||
  to_char(coalesce(quotation.date, (quotation.created_at at time zone 'Asia/Ho_Chi_Minh')::date), 'DDMMYYYY') ||
  '-' || ranked.sequence_value
from ranked
where ranked.id = quotation.id;

insert into quotation_daily_sequences (org_id, sequence_date, last_value)
select org_id,
  coalesce(date, (created_at at time zone 'Asia/Ho_Chi_Minh')::date),
  count(*)
from quotations
group by org_id, coalesce(date, (created_at at time zone 'Asia/Ho_Chi_Minh')::date)
on conflict (org_id, sequence_date) do update
set last_value = greatest(quotation_daily_sequences.last_value, excluded.last_value);

alter table quotations alter column quotation_number set not null;
create unique index if not exists quotations_org_quotation_number_uidx
  on quotations(org_id, quotation_number);

create or replace function next_quotation_label(p_org_id uuid, p_date date)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sequence_date_value date := coalesce(p_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  sequence_value bigint;
begin
  if p_org_id is null then raise exception 'Organization context is required'; end if;
  if auth.uid() is not null and p_org_id is distinct from get_org_id() then
    raise exception 'Cannot allocate a quotation label for another organization';
  end if;
  insert into quotation_daily_sequences (org_id, sequence_date, last_value)
  values (p_org_id, sequence_date_value, 1)
  on conflict (org_id, sequence_date) do update
    set last_value = quotation_daily_sequences.last_value + 1
  returning last_value into sequence_value;
  return 'H2T-' || to_char(sequence_date_value, 'DDMMYYYY') || '-' || sequence_value;
end;
$$;

revoke execute on function next_quotation_label(uuid, date) from public, anon, authenticated;

create or replace function enforce_quotation_label()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.quotation_number := next_quotation_label(new.org_id, new.date);
  else
    -- A quotation keeps its original public number even when its date changes.
    new.quotation_number := old.quotation_number;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_quotation_label_before_write on quotations;
create trigger enforce_quotation_label_before_write
before insert or update of quotation_number, date on quotations
for each row execute function enforce_quotation_label();
revoke execute on function enforce_quotation_label() from public, anon, authenticated;

-- Keep optimistic-export versions accurate for status-only changes made from
-- the quotation list.
create or replace function set_quotation_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  source_status text;
  normalized_status text := lower(trim(p_status));
begin
  select status into source_status from quotations
  where id = p_id and org_id = current_org for update;
  if not found then raise exception 'Quotation was not found'; end if;
  if lower(source_status) in ('awaiting delivery', 'delivered', 'converted') then
    raise exception 'Use the allocation delivery or cancellation workflow';
  end if;
  if normalized_status not in ('draft', 'sent', 'accepted', 'rejected', 'cancelled') then
    raise exception 'Unsupported quotation status';
  end if;
  if normalized_status = 'accepted' then
    perform require_permission('Sales', 'approve');
  else
    perform require_permission('Sales', 'update');
  end if;
  update quotations set status = initcap(normalized_status),
    version = version + 1, updated_at = now()
  where id = p_id and org_id = current_org;
end;
$$;
grant execute on function set_quotation_status(uuid, text) to authenticated;
revoke execute on function set_quotation_status(uuid, text) from public, anon;

-- Enrich the existing compact lookup with total counts and the fields required
-- by Category defaults / customer snapshots. Dropdowns consume 20 rows at a
-- time and never search only the currently loaded client page.
create or replace function get_lookup_items_v2(
  p_entity text,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_category_id uuid default null,
  p_warehouse_id uuid default null,
  p_include_stock boolean default false,
  p_include_demo boolean default false
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  entity_name text := lower(trim(p_entity));
  search_text text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
  row_limit integer := greatest(1, least(coalesce(p_limit, 20), 200));
  row_offset integer := greatest(coalesce(p_offset, 0), 0);
  result_value jsonb;
  enriched_items jsonb;
  total_value bigint := 0;
begin
  if auth.uid() is null or current_org is null then raise exception 'Authentication is required'; end if;
  result_value := get_lookup_items(
    entity_name, p_search, row_limit, row_offset, p_category_id,
    p_warehouse_id, p_include_stock, p_include_demo
  );

  if entity_name = 'categories' then
    select coalesce(jsonb_agg(
      item.value || jsonb_build_object(
        'defaultUnit', category.default_unit,
        'defaultPurchasePrice', category.default_purchase_price,
        'defaultSalePrice', category.default_sale_price,
        'hasVat', category.has_vat,
        'defaultVatRate', category.default_vat_rate
      ) order by item.ordinality
    ), '[]'::jsonb)
    into enriched_items
    from jsonb_array_elements(coalesce(result_value->'items', '[]'::jsonb))
      with ordinality item(value, ordinality)
    join categories category on category.id = (item.value->>'id')::uuid
      and category.org_id = current_org;
    result_value := jsonb_set(result_value, '{items}', enriched_items, true);
  elsif entity_name = 'customers' then
    select coalesce(jsonb_agg(
      item.value || jsonb_build_object('representative', customer.representative)
      order by item.ordinality
    ), '[]'::jsonb)
    into enriched_items
    from jsonb_array_elements(coalesce(result_value->'items', '[]'::jsonb))
      with ordinality item(value, ordinality)
    join customers customer on customer.id = (item.value->>'id')::uuid
      and customer.org_id = current_org;
    result_value := jsonb_set(result_value, '{items}', enriched_items, true);
  end if;

  if entity_name = 'warehouses' then
    select count(*) into total_value from warehouses
    where org_id = current_org and lower(status) = 'active'
      and (p_include_demo or source <> 'dataDemo')
      and (coalesce(p_search, '') = '' or lower(code) like search_text or lower(name) like search_text);
  elsif entity_name = 'categories' then
    select count(*) into total_value from categories
    where org_id = current_org and lower(status) = 'active'
      and (p_include_demo or source <> 'dataDemo')
      and (coalesce(p_search, '') = '' or lower(code) like search_text
        or lower(name_vi) like search_text or lower(name_en) like search_text);
  elsif entity_name = 'customers' then
    select count(*) into total_value from customers
    where org_id = current_org and lower(status) = 'active'
      and (p_include_demo or source <> 'dataDemo')
      and (coalesce(p_search, '') = '' or lower(code) like search_text or lower(name) like search_text
        or lower(coalesce(phone, '')) like search_text or lower(coalesce(email, '')) like search_text);
  elsif entity_name = 'suppliers' then
    select count(*) into total_value from suppliers
    where org_id = current_org and lower(status) = 'active'
      and (p_include_demo or source <> 'dataDemo')
      and (coalesce(p_search, '') = '' or lower(code) like search_text or lower(name) like search_text
        or lower(coalesce(phone, '')) like search_text or lower(coalesce(email, '')) like search_text);
  elsif entity_name = 'units' then
    select count(*) into total_value from units
    where org_id = current_org and lower(status) = 'active'
      and (p_include_demo or source <> 'dataDemo')
      and (coalesce(p_search, '') = '' or lower(code) like search_text
        or lower(name_vi) like search_text or lower(name_en) like search_text);
  elsif entity_name = 'products' then
    select count(*) into total_value from products product
    where product.org_id = current_org and lower(product.status) = 'active'
      and (p_include_demo or product.source <> 'dataDemo')
      and (p_category_id is null or product.category_id = p_category_id)
      and (coalesce(p_search, '') = '' or lower(product.sku) like search_text
        or lower(product.name) like search_text or lower(coalesce(product.barcode, '')) like search_text);
  else
    raise exception 'Unsupported lookup entity: %', p_entity;
  end if;

  return result_value || jsonb_build_object(
    'total', total_value, 'limit', row_limit, 'offset', row_offset,
    'hasMore', row_offset + jsonb_array_length(coalesce(result_value->'items', '[]'::jsonb)) < total_value
  );
end;
$$;
grant execute on function get_lookup_items_v2(text, text, integer, integer, uuid, uuid, boolean, boolean) to authenticated;
revoke execute on function get_lookup_items_v2(text, text, integer, integer, uuid, uuid, boolean, boolean) from public, anon;

-- Server-paged rows for the master-data screens. These pages keep the complete
-- edit model (unlike compact dropdown lookups) while limiting reads to 20 rows.
create or replace function get_master_data_page(
  p_entity text,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_status text default null,
  p_category text default null
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  entity_name text := lower(trim(p_entity));
  search_text text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
  row_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  row_offset integer := greatest(coalesce(p_offset, 0), 0);
  items_value jsonb := '[]'::jsonb;
  total_value bigint := 0;
begin
  if auth.uid() is null or current_org is null then raise exception 'Authentication is required'; end if;

  if entity_name = 'categories' then
    select count(*) into total_value from categories category
    where category.org_id = current_org
      and (coalesce(p_search, '') = '' or lower(category.code) like search_text
        or lower(category.name_vi) like search_text or lower(category.name_en) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name_vi, item.name_en, item.code), '[]'::jsonb)
    into items_value from (
      select * from categories category
      where category.org_id = current_org
        and (coalesce(p_search, '') = '' or lower(category.code) like search_text
          or lower(category.name_vi) like search_text or lower(category.name_en) like search_text)
      order by category.name_vi, category.name_en, category.code
      limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'customers' then
    select count(*) into total_value from customers customer
    where customer.org_id = current_org
      and (coalesce(p_search, '') = '' or lower(customer.code) like search_text
        or lower(customer.name) like search_text or lower(coalesce(customer.phone, '')) like search_text
        or lower(coalesce(customer.email, '')) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name, item.code), '[]'::jsonb)
    into items_value from (
      select customer.*,
        coalesce((select sum(invoice.outstanding_amount) from invoices invoice
          where invoice.org_id = current_org and invoice.customer_id = customer.id), 0) as debt
      from customers customer
      where customer.org_id = current_org
        and (coalesce(p_search, '') = '' or lower(customer.code) like search_text
          or lower(customer.name) like search_text or lower(coalesce(customer.phone, '')) like search_text
          or lower(coalesce(customer.email, '')) like search_text)
      order by customer.name, customer.code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'suppliers' then
    select count(*) into total_value from suppliers supplier
    where supplier.org_id = current_org
      and (coalesce(p_search, '') = '' or lower(supplier.code) like search_text
        or lower(supplier.name) like search_text or lower(coalesce(supplier.phone, '')) like search_text
        or lower(coalesce(supplier.email, '')) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name, item.code), '[]'::jsonb)
    into items_value from (
      select supplier.*,
        coalesce((select sum(purchase_order.outstanding_amount) from purchase_orders purchase_order
          where purchase_order.org_id = current_org and purchase_order.supplier_id = supplier.id
            and lower(purchase_order.status) not in ('cancelled', 'rejected')), 0) as debt
      from suppliers supplier
      where supplier.org_id = current_org
        and (coalesce(p_search, '') = '' or lower(supplier.code) like search_text
          or lower(supplier.name) like search_text or lower(coalesce(supplier.phone, '')) like search_text
          or lower(coalesce(supplier.email, '')) like search_text)
      order by supplier.name, supplier.code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'warehouses' then
    select count(*) into total_value from warehouses warehouse
    where warehouse.org_id = current_org
      and (coalesce(p_search, '') = '' or lower(warehouse.code) like search_text
        or lower(warehouse.name) like search_text or lower(coalesce(warehouse.address, '')) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name, item.code), '[]'::jsonb)
    into items_value from (
      select * from warehouses warehouse
      where warehouse.org_id = current_org
        and (coalesce(p_search, '') = '' or lower(warehouse.code) like search_text
          or lower(warehouse.name) like search_text or lower(coalesce(warehouse.address, '')) like search_text)
      order by warehouse.name, warehouse.code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'brands' then
    select count(*) into total_value from brands brand
    where brand.org_id = current_org
      and (coalesce(p_search, '') = '' or lower(brand.code) like search_text or lower(brand.name) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name, item.code), '[]'::jsonb)
    into items_value from (
      select * from brands brand
      where brand.org_id = current_org
        and (coalesce(p_search, '') = '' or lower(brand.code) like search_text or lower(brand.name) like search_text)
      order by brand.name, brand.code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'units' then
    select count(*) into total_value from units unit
    where unit.org_id = current_org
      and (coalesce(p_search, '') = '' or lower(unit.code) like search_text
        or lower(unit.name_vi) like search_text or lower(unit.name_en) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name_vi, item.name_en, item.code), '[]'::jsonb)
    into items_value from (
      select * from units unit
      where unit.org_id = current_org
        and (coalesce(p_search, '') = '' or lower(unit.code) like search_text
          or lower(unit.name_vi) like search_text or lower(unit.name_en) like search_text)
      order by unit.name_vi, unit.name_en, unit.code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'products' then
    select count(*) into total_value from products product
    where product.org_id = current_org
      and (coalesce(p_status, '') = '' or lower(product.status) = lower(p_status))
      and (coalesce(p_category, '') = '' or product.category = p_category)
      and (coalesce(p_search, '') = '' or lower(product.sku) like search_text
        or lower(product.name) like search_text or lower(coalesce(product.barcode, '')) like search_text);
    select coalesce(jsonb_agg(to_jsonb(item) order by item.name, item.sku), '[]'::jsonb)
    into items_value from (
      select product.*,
        coalesce((select sum(ledger.qty_in - ledger.qty_out) from inventory_ledger ledger
          where ledger.org_id = current_org and ledger.product_id = product.id), 0) as qty,
        coalesce((select sum(reservation.qty) from inventory_reservations reservation
          where reservation.org_id = current_org and reservation.product_id = product.id
            and reservation.status = 'ACTIVE'), 0) as reserved,
        coalesce((select sum(ledger.qty_in - ledger.qty_out) from inventory_ledger ledger
          where ledger.org_id = current_org and ledger.product_id = product.id), 0)
          - coalesce((select sum(reservation.qty) from inventory_reservations reservation
            where reservation.org_id = current_org and reservation.product_id = product.id
              and reservation.status = 'ACTIVE'), 0) as available,
        coalesce((select sum(layer.remaining_qty * layer.unit_cost) / nullif(sum(layer.remaining_qty), 0)
          from inventory_cost_layers layer where layer.org_id = current_org
            and layer.product_id = product.id and layer.remaining_qty > 0), product.cost, 0) as average_cost
      from products product
      where product.org_id = current_org
        and (coalesce(p_status, '') = '' or lower(product.status) = lower(p_status))
        and (coalesce(p_category, '') = '' or product.category = p_category)
        and (coalesce(p_search, '') = '' or lower(product.sku) like search_text
          or lower(product.name) like search_text or lower(coalesce(product.barcode, '')) like search_text)
      order by product.name, product.sku limit row_limit offset row_offset
    ) item;
  else
    raise exception 'Unsupported master-data entity: %', p_entity;
  end if;

  return jsonb_build_object(
    'items', items_value, 'total', total_value, 'limit', row_limit,
    'offset', row_offset,
    'hasMore', row_offset + jsonb_array_length(items_value) < total_value
  );
end;
$$;
grant execute on function get_master_data_page(text, text, integer, integer, text, text) to authenticated;
revoke execute on function get_master_data_page(text, text, integer, integer, text, text) from public, anon;

-- Independently paged quotation-reference sections. Counts and items are
-- returned at the same JSON level; clients render items.length and use total
-- only to decide whether another page exists.
create or replace function get_quotation_reference_page(
  p_category_id uuid,
  p_customer_id uuid,
  p_section text,
  p_limit integer default 5,
  p_offset integer default 0,
  p_exclude_quotation_id uuid default null
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  section_name text := upper(trim(coalesce(p_section, '')));
  row_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  row_offset integer := greatest(coalesce(p_offset, 0), 0);
  result_value jsonb;
begin
  if auth.uid() is null or current_org is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from categories where id = p_category_id and org_id = current_org) then
    raise exception 'Quotation category is outside this organization';
  end if;

  if section_name in ('SAME_CUSTOMER', 'RECENT_SALES') then
    with sales as (
      select quotation_item.id as quotation_item_id,
        quotation.id as quotation_id,
        quotation.customer_id,
        quotation.date as reference_date,
        quotation.created_at,
        case when lower(quotation.status) in ('accepted', 'converted', 'awaiting delivery', 'delivered')
          then 0 else 1 end as status_priority,
        jsonb_build_object(
          'referenceType', 'SALE',
          'quotationItemId', quotation_item.id,
          'quotationId', quotation.id,
          'quotationLabel', quotation.quotation_number,
          'quotationStatus', quotation.status,
          'productId', product.id,
          'productName', coalesce(product.name, quotation_item.product_name, quotation_item.category_name),
          'sku', product.sku,
          'categoryId', quotation_item.category_id,
          'categoryName', quotation_item.category_name,
          'customerId', quotation.customer_id,
          'customerName', quotation.customer_name,
          'quantity', quotation_item.qty,
          'salePrice', quotation_item.selling_price,
          'importPrice', coalesce(quotation_item.reference_purchase_price,
            receipt_item.unit_cost, quotation_item.cost_price),
          'importUnit', quotation_item.sell_unit,
          'hasVat', quotation_item.has_vat,
          'vatPct', case when quotation_item.has_vat then quotation_item.vat_pct else 0 end,
          'marginPct', case when coalesce(quotation_item.reference_purchase_price,
              receipt_item.unit_cost, quotation_item.cost_price, 0) > 0
            then round((quotation_item.selling_price - coalesce(quotation_item.reference_purchase_price,
              receipt_item.unit_cost, quotation_item.cost_price)) * 100 /
              coalesce(quotation_item.reference_purchase_price, receipt_item.unit_cost,
                quotation_item.cost_price), 2)
            else null end,
          'referenceDate', quotation.date,
          'salesperson', quotation.created_by,
          'supplierId', coalesce(allocation.supplier_id, purchase_order.supplier_id),
          'supplierName', coalesce(supplier.name, receipt.supplier_name),
          'receiptId', receipt.id,
          'receiptRef', receipt.ref
        ) as record
      from quotation_items quotation_item
      join quotations quotation on quotation.id = quotation_item.quotation_id
      left join lateral (
        select source_allocation.* from quotation_allocations source_allocation
        where source_allocation.quotation_item_id = quotation_item.id
        order by source_allocation.created_at desc, source_allocation.id desc limit 1
      ) allocation on true
      left join products product on product.id = coalesce(quotation_item.product_id, allocation.product_id)
      left join goods_receipt_items receipt_item on receipt_item.id = allocation.goods_receipt_item_id
      left join goods_receipts receipt on receipt.id = receipt_item.receipt_id
      left join purchase_orders purchase_order on purchase_order.id = receipt.po_id
      left join suppliers supplier on supplier.id = coalesce(allocation.supplier_id, purchase_order.supplier_id)
      where quotation.org_id = current_org
        and quotation_item.category_id = p_category_id
        and (p_exclude_quotation_id is null or quotation.id <> p_exclude_quotation_id)
        and lower(quotation.status) not in ('draft', 'pending', 'pending approval', 'cancelled', 'rejected')
    ), filtered as (
      select * from sales
      where section_name = 'RECENT_SALES'
        or (section_name = 'SAME_CUSTOMER' and p_customer_id is not null and customer_id = p_customer_id)
    ), page as (
      select * from filtered
      order by status_priority, reference_date desc, created_at desc, quotation_item_id desc
      limit row_limit offset row_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(page.record order by page.status_priority,
        page.reference_date desc, page.created_at desc, page.quotation_item_id desc) from page), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'limit', row_limit, 'offset', row_offset,
      'hasMore', row_offset + (select count(*) from page) < (select count(*) from filtered)
    ) into result_value;
  elsif section_name = 'RECENT_IMPORTS' then
    with imports as (
      select receipt_item.id as receipt_item_id,
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
          'supplierId', coalesce(receipt_item.supplier_id, purchase_order.supplier_id),
          'supplierName', coalesce(receipt_item.supplier_name, supplier.name, receipt.supplier_name),
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
      left join suppliers supplier on supplier.id = coalesce(receipt_item.supplier_id, purchase_order.supplier_id)
      where receipt.org_id = current_org and product.category_id = p_category_id
        and lower(receipt.status) <> 'reversed'
    ), page as (
      select * from imports
      order by reference_date desc, created_at desc, receipt_item_id desc
      limit row_limit offset row_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(page.record order by page.reference_date desc,
        page.created_at desc, page.receipt_item_id desc) from page), '[]'::jsonb),
      'total', (select count(*) from imports),
      'limit', row_limit, 'offset', row_offset,
      'hasMore', row_offset + (select count(*) from page) < (select count(*) from imports)
    ) into result_value;
  else
    raise exception 'Unsupported quotation reference section: %', p_section;
  end if;
  return result_value;
end;
$$;
grant execute on function get_quotation_reference_page(uuid, uuid, text, integer, integer, uuid) to authenticated;
revoke execute on function get_quotation_reference_page(uuid, uuid, text, integer, integer, uuid) from public, anon;

-- quotation_item_references was introduced after the original Demo stamping
-- migration. Bring it into the same ownership/cleanup contract now.
alter table quotation_item_references
  add column if not exists source text not null default 'manual';
alter table quotation_item_references
  add column if not exists demo_run_id uuid references demo_runs(id) on delete set null;
create index if not exists quotation_item_references_demo_run_idx
  on quotation_item_references(demo_run_id) where demo_run_id is not null;

-- Persist the public quotation number in SALE snapshots. Older versions stored
-- the source UUID under quotationLabel, which made reference links confusing
-- after reopening a quotation even though the source relation was still valid.
create or replace function normalize_quotation_reference_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  source_quotation_id uuid := new.reference_quotation_id;
  source_quotation_label text;
begin
  if upper(new.reference_type) <> 'SALE' then return new; end if;
  if source_quotation_id is null and new.reference_quotation_item_id is not null then
    select quotation_item.quotation_id into source_quotation_id
    from quotation_items quotation_item
    where quotation_item.id = new.reference_quotation_item_id;
  end if;
  if source_quotation_id is not null then
    select quotation.quotation_number into source_quotation_label
    from quotations quotation
    where quotation.id = source_quotation_id and quotation.org_id = new.org_id;
  end if;
  if source_quotation_label is not null then
    new.reference_quotation_id := source_quotation_id;
    new.snapshot := coalesce(new.snapshot, '{}'::jsonb)
      || jsonb_build_object('quotationId', source_quotation_id,
        'quotationLabel', source_quotation_label);
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_quotation_reference_before_write on quotation_item_references;
create trigger normalize_quotation_reference_before_write
before insert or update on quotation_item_references
for each row execute function normalize_quotation_reference_snapshot();
revoke execute on function normalize_quotation_reference_snapshot() from public, anon, authenticated;

-- Re-run the normalizer for snapshots persisted before this migration.
update quotation_item_references
set snapshot = snapshot
where upper(reference_type) = 'SALE';

drop trigger if exists stamp_demo_context on quotation_item_references;
create trigger stamp_demo_context before insert or update on quotation_item_references
for each row execute function stamp_demo_context();

-- The Demo screen mirrors the four acceptance scenarios in Spec14092026.md:
-- category defaults, category history, same-customer history, and the complete
-- allocation/delivery flow. All generated rows still carry source=dataDemo and
-- the run id through the existing stamp_demo_context triggers.
create or replace function get_demo_scenarios()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare actor_role text;
begin
  if auth.uid() is null or get_org_id() is null then
    raise exception 'Authentication is required';
  end if;
  select lower(role) into actor_role from profiles
  where id = auth.uid() and org_id = get_org_id();
  if actor_role <> 'admin' then raise exception 'Administrator access is required'; end if;

  return jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object(
      'code', 'REFERENCE_CATEGORY_DEFAULT',
      'name', 'A · Giá mặc định danh mục',
      'description', 'Tạo báo giá mới khi chưa có lịch sử hợp lệ; giá nhập, giá bán, đơn vị và VAT lấy từ cấu hình danh mục.',
      'finalStatus', 'DRAFT'
    ),
    jsonb_build_object(
      'code', 'REFERENCE_CATEGORY_HISTORY',
      'name', 'B · Lịch sử cùng danh mục',
      'description', 'Tạo một báo giá đã chấp thuận cho khách A rồi tạo báo giá nháp cho khách B để kiểm tra nhánh Gần đây.',
      'finalStatus', 'DRAFT'
    ),
    jsonb_build_object(
      'code', 'REFERENCE_CUSTOMER_CATEGORY',
      'name', 'C · Cùng khách và danh mục',
      'description', 'Tạo báo giá mới cho đúng khách hàng và danh mục đã từng báo để kiểm tra ưu tiên Cùng khách.',
      'finalStatus', 'DRAFT'
    ),
    jsonb_build_object(
      'code', 'FULL_E2E',
      'name', 'D · Toàn bộ quy trình',
      'description', 'Chạy báo giá, chấp thuận, phân bổ tồn/lô nhập, giao hàng, hóa đơn và giá vốn thực tế.',
      'finalStatus', 'DELIVERED'
    )
  ));
end;
$$;
grant execute on function get_demo_scenarios() to authenticated;
revoke execute on function get_demo_scenarios() from public, anon;

create or replace function run_demo_scenario_v2(
  p_scenario text,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  scenario_name text := upper(trim(coalesce(p_scenario, '')));
  base_scenario text;
  base_result jsonb;
  run_id uuid;
  run_suffix text;
  actor_role text;
  actor_name text;
  category_id_value uuid;
  category_name_value text;
  unit_id_value uuid;
  unit_name_value text;
  warehouse_id_value uuid;
  customer_id_value uuid;
  target_customer_id uuid;
  history_quotation_id uuid;
  target_quotation_id uuid;
  history_item_id uuid;
  created_value jsonb;
  links_value jsonb;
  verification_value jsonb;
  product_one_id uuid;
  product_two_id uuid;
  supplier_two_id uuid;
  delivery_id_value uuid;
  allocation_payload jsonb;
  ledger_count integer;
begin
  if auth.uid() is null or current_org is null then raise exception 'Authentication is required'; end if;
  select lower(role), coalesce(nullif(trim(full_name), ''), email, auth.uid()::text)
  into actor_role, actor_name
  from profiles where id = auth.uid() and org_id = current_org;
  if actor_role <> 'admin' then raise exception 'Administrator access is required'; end if;

  base_scenario := case scenario_name
    when 'REFERENCE_CATEGORY_DEFAULT' then 'QUOTATION_DRAFT'
    when 'REFERENCE_CATEGORY_HISTORY' then 'QUOTATION_ACCEPTED'
    when 'REFERENCE_CUSTOMER_CATEGORY' then 'QUOTATION_ACCEPTED'
    when 'FULL_E2E' then 'QUOTATION_DRAFT'
    else null
  end;
  if base_scenario is null then raise exception 'Unsupported demo scenario: %', p_scenario; end if;

  base_result := run_demo_scenario(base_scenario, p_idempotency_key);
  if coalesce(base_result->>'status', '') <> 'SUCCESS' then
    return base_result;
  end if;
  if coalesce((base_result->>'idempotentReplay')::boolean, false) then
    return base_result || jsonb_build_object(
      'verification', coalesce((select metadata->'verification' from demo_runs
        where id = (base_result->>'demoRunId')::uuid), '{}'::jsonb)
    );
  end if;

  run_id := (base_result->>'demoRunId')::uuid;
  run_suffix := upper(left(replace(run_id::text, '-', ''), 8));
  perform set_config('app.demo_run_id', run_id::text, true);

  select id, coalesce(name_vi, name_en, code)
  into category_id_value, category_name_value
  from categories where org_id = current_org and demo_run_id = run_id limit 1;
  select id, coalesce(name_vi, name_en, code)
  into unit_id_value, unit_name_value
  from units where org_id = current_org and demo_run_id = run_id limit 1;
  select id into warehouse_id_value from warehouses
  where org_id = current_org and demo_run_id = run_id limit 1;
  select id into customer_id_value from customers
  where org_id = current_org and demo_run_id = run_id order by created_at limit 1;
  select id into history_quotation_id from quotations
  where org_id = current_org and demo_run_id = run_id order by created_at limit 1;

  if category_id_value is null or unit_id_value is null or warehouse_id_value is null
    or customer_id_value is null or history_quotation_id is null then
    raise exception 'The base Demo scenario did not create all quotation fixtures';
  end if;

  update units set name_vi = 'Cây', name_en = 'Length'
  where id = unit_id_value and org_id = current_org;
  unit_name_value := 'Cây';
  update categories set
    default_unit_id = unit_id_value,
    default_unit = unit_name_value,
    default_purchase_price = 100000,
    default_sale_price = 135000,
    has_vat = true,
    default_vat_rate = 8
  where id = category_id_value and org_id = current_org;

  if scenario_name in ('REFERENCE_CATEGORY_DEFAULT', 'FULL_E2E') then
    target_quotation_id := save_quotation_v2(
      history_quotation_id, customer_id_value, null, warehouse_id_value,
      current_date, current_date + 7, 'Draft', 0, 'pct',
      case when scenario_name = 'FULL_E2E'
        then '[DEMO] Full E2E dùng cấu hình danh mục trước khi phân bổ.'
        else '[DEMO] Không có lịch sử hợp lệ; dùng cấu hình mặc định của danh mục.' end,
      jsonb_build_array(jsonb_build_object(
        'category_id', category_id_value,
        'category_name', category_name_value,
        'offered_description', category_name_value || ' theo cấu hình chuẩn',
        'specification_brand', 'Tiêu chuẩn demo',
        'sell_unit', unit_name_value,
        'qty', 12,
        'cost_price', 100000,
        'profit_pct', 35,
        'selling_price', 135000,
        'has_vat', true,
        'vat_pct', 8,
        'note', case when scenario_name = 'FULL_E2E'
          then 'Tham chiếu mặc định trước khi chốt nguồn hàng'
          else 'Tham chiếu mặc định danh mục' end,
        'reference', jsonb_build_object('referenceType', 'CATEGORY_DEFAULT')
      )), actor_name,
      jsonb_build_object(
        'title', 'BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG',
        'project', case when scenario_name = 'FULL_E2E'
          then '[DEMO] Scenario D - toàn bộ quy trình'
          else '[DEMO] Scenario A - giá mặc định danh mục' end,
        'paymentTerms', 'Thanh toán trong vòng 7 ngày.',
        'deliveryTerms', 'Giao hàng theo thỏa thuận.',
        'includeShipping', true
      )
    );
  elsif scenario_name in ('REFERENCE_CATEGORY_HISTORY', 'REFERENCE_CUSTOMER_CATEGORY') then
    select id into history_item_id from quotation_items
    where quotation_id = history_quotation_id and category_id = category_id_value limit 1;
    if history_item_id is null then raise exception 'The reference quotation item was not created'; end if;

    if scenario_name = 'REFERENCE_CATEGORY_HISTORY' then
      insert into customers (
        org_id, code, name, phone, email, tax_code, address, representative, status
      ) values (
        current_org, 'DEMO-CUST-B-' || run_suffix, '[DEMO] Khách hàng B ' || run_suffix,
        '0944444444', 'customer-b-' || lower(run_suffix) || '@demo.local',
        'DEMO-CB-' || run_suffix, 'TP. Hồ Chí Minh — dữ liệu demo',
        'Chị Bình', 'Active'
      ) returning id into target_customer_id;
    else
      target_customer_id := customer_id_value;
    end if;

    target_quotation_id := save_quotation_v2(
      null, target_customer_id, null, warehouse_id_value,
      current_date, current_date + 7, 'Draft', 0, 'pct',
      case when scenario_name = 'REFERENCE_CATEGORY_HISTORY'
        then '[DEMO] Dùng giá bán gần đây của cùng danh mục.'
        else '[DEMO] Ưu tiên giá đã báo gần nhất cho cùng khách và danh mục.' end,
      jsonb_build_array(jsonb_build_object(
        'category_id', category_id_value,
        'category_name', category_name_value,
        'offered_description', category_name_value || ' tham chiếu lịch sử',
        'specification_brand', 'Theo báo giá nguồn',
        'sell_unit', unit_name_value,
        'qty', 12,
        'cost_price', 106250,
        'profit_pct', round((160000 - 106250) * 100.0 / 106250, 2),
        'selling_price', 160000,
        'has_vat', true,
        'vat_pct', 10,
        'note', case when scenario_name = 'REFERENCE_CATEGORY_HISTORY'
          then 'Tham chiếu lịch sử cùng danh mục'
          else 'Tham chiếu lịch sử cùng khách hàng' end,
        'reference', jsonb_build_object(
          'referenceType', 'SALE',
          'quotationItemId', history_item_id
        )
      )), actor_name,
      jsonb_build_object(
        'title', 'BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG',
        'project', case when scenario_name = 'REFERENCE_CATEGORY_HISTORY'
          then '[DEMO] Scenario B - lịch sử cùng danh mục'
          else '[DEMO] Scenario C - cùng khách và danh mục' end,
        'paymentTerms', 'Thanh toán trong vòng 7 ngày.',
        'deliveryTerms', 'Giao hàng theo thỏa thuận.',
        'includeShipping', true
      )
    );
  end if;

  if scenario_name = 'FULL_E2E' then
    perform set_quotation_status(target_quotation_id, 'Sent');
    perform set_quotation_status(target_quotation_id, 'Accepted');
    select id into history_item_id from quotation_items
    where quotation_id = target_quotation_id and category_id = category_id_value limit 1;
    select id into product_one_id from products
    where org_id = current_org and demo_run_id = run_id
    order by cost, id limit 1;
    select id into product_two_id from products
    where org_id = current_org and demo_run_id = run_id
    order by cost, id limit 1 offset 1;
    select supplier_id into supplier_two_id from product_suppliers
    where org_id = current_org and demo_run_id = run_id and product_id = product_two_id
    order by is_preferred desc, created_at desc limit 1;
    if history_item_id is null or product_one_id is null or product_two_id is null
      or supplier_two_id is null then
      raise exception 'The E2E allocation fixtures were not created';
    end if;
    allocation_payload := jsonb_build_array(
      jsonb_build_object(
        'quotation_item_id', history_item_id,
        'source_type', 'STOCK',
        'product_id', product_one_id,
        'qty', 4
      ),
      jsonb_build_object(
        'quotation_item_id', history_item_id,
        'source_type', 'STOCK',
        'product_id', product_two_id,
        'qty', 3
      ),
      jsonb_build_object(
        'quotation_item_id', history_item_id,
        'source_type', 'NEW_STOCK',
        'product_id', product_two_id,
        'qty', 5,
        'supplier_id', supplier_two_id,
        'unit_cost', 115000,
        'batch_number', 'DEMO-NEW-' || run_suffix
      )
    );
    perform convert_quotation_allocations(target_quotation_id, allocation_payload);
    delivery_id_value := deliver_quotation(
      target_quotation_id, 'DEMO-DN-' || run_suffix
    );
  end if;

  verification_value := jsonb_build_object(
    'expectedReference', case scenario_name
      when 'REFERENCE_CATEGORY_DEFAULT' then 'CATEGORY_DEFAULT'
      when 'REFERENCE_CATEGORY_HISTORY' then 'CATEGORY_QUOTATION'
      when 'REFERENCE_CUSTOMER_CATEGORY' then 'CUSTOMER_CATEGORY_QUOTATION'
      else 'CATEGORY_DEFAULT → ALLOCATION → DELIVERY' end,
    'resolvedReference', case
      when scenario_name = 'REFERENCE_CATEGORY_DEFAULT' and exists (
        select 1 from quotation_items quotation_item
        where quotation_item.quotation_id = target_quotation_id
          and quotation_item.category_id = category_id_value
          and quotation_item.reference_type = 'CATEGORY_DEFAULT'
      ) then 'CATEGORY_DEFAULT'
      when scenario_name = 'REFERENCE_CATEGORY_HISTORY' and exists (
        select 1 from quotation_items target_item
        join quotation_item_references reference on reference.quotation_item_id = target_item.id
        join quotation_items source_item on source_item.id = reference.reference_quotation_item_id
        join quotations target_quote on target_quote.id = target_item.quotation_id
        join quotations source_quote on source_quote.id = source_item.quotation_id
        where target_quote.id = target_quotation_id and source_quote.id = history_quotation_id
          and target_quote.customer_id <> source_quote.customer_id
      ) then 'CATEGORY_QUOTATION'
      when scenario_name = 'REFERENCE_CUSTOMER_CATEGORY' and exists (
        select 1 from quotation_items target_item
        join quotation_item_references reference on reference.quotation_item_id = target_item.id
        join quotation_items source_item on source_item.id = reference.reference_quotation_item_id
        join quotations target_quote on target_quote.id = target_item.quotation_id
        join quotations source_quote on source_quote.id = source_item.quotation_id
        where target_quote.id = target_quotation_id and source_quote.id = history_quotation_id
          and target_quote.customer_id = source_quote.customer_id
      ) then 'CUSTOMER_CATEGORY_QUOTATION'
      when scenario_name = 'FULL_E2E' and exists (
        select 1 from quotation_items quotation_item
        join quotations quotation on quotation.id = quotation_item.quotation_id
        where quotation.id = target_quotation_id
          and quotation_item.reference_type = 'CATEGORY_DEFAULT'
          and lower(quotation.status) = 'delivered'
      ) then 'CATEGORY_DEFAULT → ALLOCATION → DELIVERY'
      else 'INVALID'
    end,
    'snapshotType', coalesce((
      select quotation_item.reference_type from quotation_items quotation_item
      where quotation_item.quotation_id = target_quotation_id
        and quotation_item.category_id = category_id_value limit 1
    ), 'NONE'),
    'targetQuotationStatus', (
      select quotation.status from quotations quotation
      where quotation.id = target_quotation_id and quotation.org_id = current_org
    ),
    'source', 'dataDemo'
  );

  created_value := coalesce(base_result->'created', '{}'::jsonb)
    || jsonb_build_object(
      'customers', case when scenario_name = 'REFERENCE_CATEGORY_HISTORY' then 2 else 1 end,
      'quotations', case when scenario_name in ('REFERENCE_CATEGORY_HISTORY', 'REFERENCE_CUSTOMER_CATEGORY') then 2 else 1 end
    );
  if scenario_name = 'FULL_E2E' then
    select count(*) into ledger_count from inventory_ledger
    where org_id = current_org and demo_run_id = run_id;
    created_value := created_value || jsonb_build_object('ledgerEntries', ledger_count);
  end if;
  links_value := coalesce(base_result->'links', '{}'::jsonb)
    || jsonb_build_object(
      'quotationId', target_quotation_id,
      'historyQuotationId', case when target_quotation_id <> history_quotation_id
        then history_quotation_id else null end,
      'categoryId', category_id_value,
      'deliveryId', delivery_id_value
    );

  update demo_runs set
    scenario_code = scenario_name,
    completed_at = now(),
    metadata = jsonb_build_object(
      'created', created_value,
      'links', links_value,
      'verification', verification_value
    )
  where id = run_id and org_id = current_org;

  return jsonb_build_object(
    'demoRunId', run_id,
    'status', 'SUCCESS',
    'created', created_value,
    'links', links_value,
    'verification', verification_value,
    'idempotentReplay', false
  );
end;
$$;
grant execute on function run_demo_scenario_v2(text, uuid) to authenticated;
revoke execute on function run_demo_scenario_v2(text, uuid) from public, anon;
