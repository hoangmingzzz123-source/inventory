-- Authenticated lookup read models and isolated business-demo scenarios.
-- This migration assumes the quotation allocation workflow through 20260918000000.

create table if not exists demo_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  scenario_code text not null,
  status text not null default 'RUNNING'
    check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  created_by uuid not null references auth.users(id),
  idempotency_key uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists demo_runs_idempotency_idx
  on demo_runs(org_id, created_by, idempotency_key)
  where idempotency_key is not null;
create index if not exists demo_runs_org_started_idx
  on demo_runs(org_id, started_at desc);

alter table demo_runs enable row level security;
drop policy if exists "org_isolation" on demo_runs;
create policy "org_isolation" on demo_runs for select
  using (org_id = get_org_id());
revoke all on demo_runs from anon, authenticated;
grant select on demo_runs to authenticated;

-- Every entity that can be produced by a scenario receives the same context.
-- Existing records are classified as manual and remain untouched by cleanup.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'products','categories','brands','units','warehouses','customers','suppliers',
    'quotations','quotation_items','purchase_orders','purchase_order_items',
    'goods_receipts','goods_receipt_items','sales_orders','sales_order_items',
    'delivery_notes','delivery_note_items','inventory_balance','inventory_ledger',
    'invoices','cash_book','finance_transactions','audit_events',
    'inventory_adjustments','inventory_adjustment_items','inventory_transfers',
    'inventory_transfer_items','sales_returns','sales_return_items',
    'purchase_returns','purchase_return_items','inventory_cost_layers',
    'inventory_cost_allocations','product_suppliers','quotation_allocations',
    'inventory_reservations'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'alter table %I add column if not exists source text not null default %L',
        table_name, 'manual'
      );
      execute format(
        'alter table %I add column if not exists demo_run_id uuid references demo_runs(id) on delete set null',
        table_name
      );
      execute format(
        'create index if not exists %I on %I(demo_run_id) where demo_run_id is not null',
        left(table_name || '_demo_run_idx', 63), table_name
      );
    end if;
  end loop;
end $$;

create or replace function stamp_demo_context()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare context_run_id text := nullif(current_setting('app.demo_run_id', true), '');
begin
  if context_run_id is not null then
    new.source := 'dataDemo';
    new.demo_run_id := context_run_id::uuid;
  elsif tg_op = 'INSERT' then
    -- API callers cannot forge Demo ownership by submitting these columns.
    new.source := 'manual';
    new.demo_run_id := null;
  else
    -- Classification is immutable outside a trusted Demo transaction.
    new.source := old.source;
    new.demo_run_id := old.demo_run_id;
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'products','categories','brands','units','warehouses','customers','suppliers',
    'quotations','quotation_items','purchase_orders','purchase_order_items',
    'goods_receipts','goods_receipt_items','sales_orders','sales_order_items',
    'delivery_notes','delivery_note_items','inventory_balance','inventory_ledger',
    'invoices','cash_book','finance_transactions','audit_events',
    'inventory_adjustments','inventory_adjustment_items','inventory_transfers',
    'inventory_transfer_items','sales_returns','sales_return_items',
    'purchase_returns','purchase_return_items','inventory_cost_layers',
    'inventory_cost_allocations','product_suppliers','quotation_allocations',
    'inventory_reservations'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists stamp_demo_context on %I', table_name);
      execute format(
        'create trigger stamp_demo_context before insert or update on %I for each row execute function stamp_demo_context()',
        table_name
      );
    end if;
  end loop;
end $$;

-- Compact, searchable lookup contract used by every quotation dropdown.
-- Tenant scope comes exclusively from the authenticated profile, never input.
create or replace function get_lookup_items(
  p_entity text,
  p_search text default null,
  p_limit integer default 50,
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
  row_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  row_offset integer := greatest(coalesce(p_offset, 0), 0);
  items jsonb;
begin
  if auth.uid() is null or current_org is null then
    raise exception 'Authentication is required';
  end if;

  if entity_name = 'warehouses' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id, 'code', item.code, 'label', item.name,
      'source', item.source, 'demoRunId', item.demo_run_id
    ) order by item.name, item.code), '[]'::jsonb) into items
    from (
      select * from warehouses
      where org_id = current_org and lower(status) = 'active'
        and (p_include_demo or source <> 'dataDemo')
        and (coalesce(p_search, '') = '' or lower(code) like search_text or lower(name) like search_text)
      order by name, code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'categories' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id, 'code', item.code,
      'label', coalesce(item.name_vi, item.name_en, item.code),
      'source', item.source, 'demoRunId', item.demo_run_id
    ) order by coalesce(item.name_vi, item.name_en, item.code)), '[]'::jsonb) into items
    from (
      select * from categories
      where org_id = current_org and lower(status) = 'active'
        and (p_include_demo or source <> 'dataDemo')
        and (coalesce(p_search, '') = '' or lower(code) like search_text
          or lower(name_vi) like search_text or lower(name_en) like search_text)
      order by name_vi, name_en, code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'customers' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id, 'code', item.code, 'label', item.name,
      'phone', item.phone, 'email', item.email, 'taxCode', item.tax_code,
      'address', item.address, 'source', item.source, 'demoRunId', item.demo_run_id
    ) order by item.name, item.code), '[]'::jsonb) into items
    from (
      select * from customers
      where org_id = current_org and lower(status) = 'active'
        and (p_include_demo or source <> 'dataDemo')
        and (coalesce(p_search, '') = '' or lower(code) like search_text
          or lower(name) like search_text or lower(coalesce(phone, '')) like search_text
          or lower(coalesce(email, '')) like search_text)
      order by name, code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'suppliers' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id, 'code', item.code, 'label', item.name,
      'phone', item.phone, 'email', item.email, 'taxCode', item.tax_code,
      'address', item.address, 'source', item.source, 'demoRunId', item.demo_run_id
    ) order by item.name, item.code), '[]'::jsonb) into items
    from (
      select * from suppliers
      where org_id = current_org and lower(status) = 'active'
        and (p_include_demo or source <> 'dataDemo')
        and (coalesce(p_search, '') = '' or lower(code) like search_text
          or lower(name) like search_text or lower(coalesce(phone, '')) like search_text
          or lower(coalesce(email, '')) like search_text)
      order by name, code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'units' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id, 'code', item.code,
      'label', coalesce(item.name_vi, item.name_en, item.code),
      'source', item.source, 'demoRunId', item.demo_run_id
    ) order by coalesce(item.name_vi, item.name_en, item.code)), '[]'::jsonb) into items
    from (
      select * from units
      where org_id = current_org and lower(status) = 'active'
        and (p_include_demo or source <> 'dataDemo')
        and (coalesce(p_search, '') = '' or lower(code) like search_text
          or lower(name_vi) like search_text or lower(name_en) like search_text)
      order by name_vi, name_en, code limit row_limit offset row_offset
    ) item;
  elsif entity_name = 'products' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', item.id, 'code', item.sku, 'label', item.name,
      'categoryId', item.category_id, 'unit', item.unit, 'price', item.price,
      'referenceCost', item.cost, 'averageCost', item.average_cost,
      'trackBatch', item.track_batch, 'source', item.source,
      'demoRunId', item.demo_run_id,
      'onHand', case when p_include_stock then item.on_hand else null end,
      'reserved', case when p_include_stock then item.reserved else null end,
      'available', case when p_include_stock then item.on_hand - item.reserved else null end
    )) order by item.name, item.sku), '[]'::jsonb) into items
    from (
      select product.*,
        coalesce((
          select sum(ledger.qty_in - ledger.qty_out)
          from inventory_ledger ledger
          where ledger.org_id = current_org and ledger.product_id = product.id
            and (p_warehouse_id is null or ledger.warehouse_id is not distinct from p_warehouse_id)
        ), 0) as on_hand,
        coalesce((
          select sum(reservation.qty)
          from inventory_reservations reservation
          where reservation.org_id = current_org and reservation.product_id = product.id
            and reservation.status = 'ACTIVE'
            and (p_warehouse_id is null or reservation.warehouse_id is not distinct from p_warehouse_id)
        ), 0) as reserved,
        coalesce((
          select sum(layer.remaining_qty * layer.unit_cost) / nullif(sum(layer.remaining_qty), 0)
          from inventory_cost_layers layer
          where layer.org_id = current_org and layer.product_id = product.id
            and layer.remaining_qty > 0
            and (p_warehouse_id is null or layer.warehouse_id is not distinct from p_warehouse_id)
        ), product.cost, 0) as average_cost
      from products product
      where product.org_id = current_org and lower(product.status) = 'active'
        and (p_include_demo or product.source <> 'dataDemo')
        and (p_category_id is null or product.category_id = p_category_id)
        and (coalesce(p_search, '') = '' or lower(product.sku) like search_text
          or lower(product.name) like search_text or lower(coalesce(product.barcode, '')) like search_text)
      order by product.name, product.sku limit row_limit offset row_offset
    ) item;
  else
    raise exception 'Unsupported lookup entity: %', p_entity;
  end if;

  return jsonb_build_object('items', items);
end;
$$;

grant execute on function get_lookup_items(text, text, integer, integer, uuid, uuid, boolean, boolean)
  to authenticated;
revoke execute on function get_lookup_items(text, text, integer, integer, uuid, uuid, boolean, boolean)
  from public, anon;

-- Keep allocation choices isolated too: normal quotations never consume Demo
-- products, while a Demo quotation sees products from its own run only.
create or replace function get_quotation_allocation_context_v2(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  quotation_source text;
  quotation_demo_run_id uuid;
  context_value jsonb;
  filtered_products jsonb;
begin
  if auth.uid() is null or current_org is null then raise exception 'Authentication is required'; end if;
  select source, demo_run_id into quotation_source, quotation_demo_run_id
  from quotations where id = p_quotation_id and org_id = current_org;
  if not found then raise exception 'Quotation was not found'; end if;
  context_value := get_quotation_allocation_context(p_quotation_id);
  select coalesce(jsonb_agg(product_json.value || jsonb_build_object(
    'source', product.source, 'demoRunId', product.demo_run_id
  ) order by product_json.ordinality), '[]'::jsonb)
  into filtered_products
  from jsonb_array_elements(coalesce(context_value->'products', '[]'::jsonb))
    with ordinality product_json(value, ordinality)
  join products product on product.id = (product_json.value->>'id')::uuid
  where product.org_id = current_org and (
    (quotation_source = 'dataDemo' and product.source = 'dataDemo'
      and product.demo_run_id = quotation_demo_run_id)
    or (quotation_source <> 'dataDemo' and product.source <> 'dataDemo')
  );
  context_value := jsonb_set(context_value, '{products}', filtered_products, true);
  context_value := jsonb_set(context_value, '{quotation}',
    (context_value->'quotation') || jsonb_build_object(
      'source', quotation_source, 'demoRunId', quotation_demo_run_id
    ), true);
  return context_value;
end;
$$;

grant execute on function get_quotation_allocation_context_v2(uuid) to authenticated;
revoke execute on function get_quotation_allocation_context_v2(uuid) from public, anon;

create or replace function get_demo_scenarios()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or get_org_id() is null then raise exception 'Authentication is required'; end if;
  return jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('code','MASTER_DATA','name','Master Data','description','Tạo kho, danh mục, nhà cung cấp, khách hàng, sản phẩm và tồn đầu.','finalStatus','MASTER_DATA'),
    jsonb_build_object('code','QUOTATION_DRAFT','name','Báo giá nháp','description','Tạo dữ liệu nền và một báo giá ở trạng thái Nháp.','finalStatus','DRAFT'),
    jsonb_build_object('code','QUOTATION_ACCEPTED','name','Báo giá đã chấp thuận','description','Chạy lịch sử Nháp → Đã gửi → Chấp thuận.','finalStatus','ACCEPTED'),
    jsonb_build_object('code','CONVERT_STOCK_ONLY','name','Chỉ lấy tồn kho','description','Phân bổ đủ 12 sản phẩm hoàn toàn từ tồn khả dụng.','finalStatus','AWAITING_DELIVERY'),
    jsonb_build_object('code','CONVERT_NEW_STOCK_ONLY','name','Chỉ nhập hàng mới','description','Nhập đủ hàng mới, tạo ledger IN và giữ chỗ.','finalStatus','AWAITING_DELIVERY'),
    jsonb_build_object('code','CONVERT_MIXED','name','Tồn kho + nhập mới','description','Kết hợp tồn sẵn và lô nhập mới trong một lần Convert.','finalStatus','AWAITING_DELIVERY'),
    jsonb_build_object('code','AWAITING_DELIVERY','name','Chờ giao hàng','description','Tạo scenario hỗn hợp và dừng sau khi giữ chỗ.','finalStatus','AWAITING_DELIVERY'),
    jsonb_build_object('code','DELIVERED','name','Đã giao hàng','description','Convert, xuất kho, tạo phiếu giao và hóa đơn.','finalStatus','DELIVERED'),
    jsonb_build_object('code','FULL_E2E','name','Full E2E','description','Chạy toàn bộ luồng báo giá đến giao hàng và ghi nhận COGS.','finalStatus','DELIVERED')
  ));
end;
$$;

grant execute on function get_demo_scenarios() to authenticated;
revoke execute on function get_demo_scenarios() from public, anon;

-- Scenario orchestration reuses the real quotation commands. The inner block is
-- a PL/pgSQL subtransaction: a failure rolls back every business row while the
-- outer demo_runs row is retained as FAILED for diagnostics.
create or replace function run_demo_scenario(
  p_scenario text,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  current_user_id uuid := auth.uid();
  scenario_name text := upper(trim(coalesce(p_scenario, '')));
  run_id uuid;
  existing_run demo_runs%rowtype;
  run_suffix text;
  actor_name text;
  warehouse_id_value uuid;
  category_id_value uuid;
  brand_id_value uuid;
  unit_id_value uuid;
  customer_id_value uuid;
  supplier_one_id uuid;
  supplier_two_id uuid;
  product_one_id uuid;
  product_two_id uuid;
  receipt_id_value uuid;
  receipt_item_id_value uuid;
  quotation_id_value uuid;
  quotation_item_id_value uuid;
  delivery_id_value uuid;
  allocation_payload jsonb;
  result_metadata jsonb := '{}'::jsonb;
  error_state text;
  error_message text;
  error_detail text;
  ledger_count integer := 0;
begin
  if current_user_id is null or current_org is null then raise exception 'Authentication is required'; end if;
  if scenario_name not in (
    'MASTER_DATA','QUOTATION_DRAFT','QUOTATION_ACCEPTED','CONVERT_STOCK_ONLY',
    'CONVERT_NEW_STOCK_ONLY','CONVERT_MIXED','AWAITING_DELIVERY','DELIVERED','FULL_E2E'
  ) then raise exception 'Unsupported demo scenario: %', p_scenario; end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'demo:' || current_org::text || ':' || current_user_id::text || ':' || p_idempotency_key::text, 0
    ));
    select * into existing_run from demo_runs
    where org_id = current_org and created_by = current_user_id
      and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'demoRunId', existing_run.id,
        'status', existing_run.status,
        'error', existing_run.error_message,
        'created', coalesce(existing_run.metadata->'created', '{}'::jsonb),
        'links', coalesce(existing_run.metadata->'links', '{}'::jsonb),
        'idempotentReplay', true
      );
    end if;
  end if;

  insert into demo_runs (org_id, scenario_code, created_by, idempotency_key)
  values (current_org, scenario_name, current_user_id, p_idempotency_key)
  returning id into run_id;
  run_suffix := upper(left(replace(run_id::text, '-', ''), 8));
  select coalesce(nullif(trim(full_name), ''), email, current_user_id::text)
  into actor_name from profiles where id = current_user_id and org_id = current_org;

  begin
    perform set_config('app.demo_run_id', run_id::text, true);

    insert into warehouses (org_id, code, name, address, phone, status)
    values (current_org, 'DEMO-WH-' || run_suffix, '[DEMO] Kho Hà Nội ' || run_suffix,
      'Hà Nội — dữ liệu demo', '0900000000', 'Active')
    returning id into warehouse_id_value;

    insert into categories (org_id, code, name_vi, name_en, description, status)
    values (current_org, 'DEMO-CAT-' || run_suffix, '[DEMO] Ống kẽm ' || run_suffix,
      '[DEMO] Steel Pipe ' || run_suffix, 'Danh mục do Demo nghiệp vụ tạo', 'Active')
    returning id into category_id_value;

    insert into brands (org_id, code, name, country, status)
    values (current_org, 'DEMO-BRAND-' || run_suffix, '[DEMO] Thương hiệu ' || run_suffix,
      'Vietnam', 'Active') returning id into brand_id_value;

    insert into units (org_id, code, name_vi, name_en, type, status)
    values (current_org, 'DEMO-PCS-' || run_suffix, 'Cái', 'Piece', 'Quantity', 'Active')
    returning id into unit_id_value;

    insert into customers (org_id, code, name, phone, email, tax_code, address, status)
    values (current_org, 'DEMO-CUST-' || run_suffix, '[DEMO] Công ty ABC ' || run_suffix,
      '0911111111', 'customer-' || lower(run_suffix) || '@demo.local',
      'DEMO-C-' || run_suffix, 'Hà Nội — dữ liệu demo', 'Active')
    returning id into customer_id_value;

    insert into suppliers (org_id, code, name, phone, email, tax_code, address, status)
    values (current_org, 'DEMO-SUP1-' || run_suffix, '[DEMO] Hòa Phát ' || run_suffix,
      '0922222222', 'supplier-hp-' || lower(run_suffix) || '@demo.local',
      'DEMO-S1-' || run_suffix, 'Hà Nội — dữ liệu demo', 'Active')
    returning id into supplier_one_id;
    insert into suppliers (org_id, code, name, phone, email, tax_code, address, status)
    values (current_org, 'DEMO-SUP2-' || run_suffix, '[DEMO] Tân Việt ' || run_suffix,
      '0933333333', 'supplier-tv-' || lower(run_suffix) || '@demo.local',
      'DEMO-S2-' || run_suffix, 'Hà Nội — dữ liệu demo', 'Active')
    returning id into supplier_two_id;

    insert into products (
      org_id, sku, barcode, name, category_id, category, brand, unit,
      cost, price, qty, status, updated_by, track_inventory, track_batch
    ) values (
      current_org, 'DEMO-PROD-HP-' || run_suffix, 'DEMO-HP-' || run_suffix,
      '[DEMO] Ống kẽm Hòa Phát ' || run_suffix, category_id_value,
      '[DEMO] Ống kẽm ' || run_suffix, '[DEMO] Thương hiệu ' || run_suffix,
      'Cái', 100000, 150000, 0, 'Active', actor_name, true, true
    ) returning id into product_one_id;
    insert into products (
      org_id, sku, barcode, name, category_id, category, brand, unit,
      cost, price, qty, status, updated_by, track_inventory, track_batch
    ) values (
      current_org, 'DEMO-PROD-TV-' || run_suffix, 'DEMO-TV-' || run_suffix,
      '[DEMO] Ống kẽm Tân Việt ' || run_suffix, category_id_value,
      '[DEMO] Ống kẽm ' || run_suffix, '[DEMO] Thương hiệu ' || run_suffix,
      'Cái', 110000, 160000, 0, 'Active', actor_name, true, true
    ) returning id into product_two_id;

    insert into product_suppliers (org_id, product_id, supplier_id, last_unit_cost, is_preferred)
    values
      (current_org, product_one_id, supplier_one_id, 100000, true),
      (current_org, product_two_id, supplier_two_id, 110000, true);

    perform require_permission('Inventory', 'create');
    insert into goods_receipts (
      org_id, ref, po_ref, supplier_name, warehouse_id, warehouse_name,
      status, items, created_by
    ) values (
      current_org, 'DEMO-OPEN-' || run_suffix, null, '[DEMO] Tồn đầu',
      warehouse_id_value, '[DEMO] Kho Hà Nội ' || run_suffix,
      'Completed', 2, actor_name
    ) returning id into receipt_id_value;

    insert into goods_receipt_items (
      receipt_id, product_id, product_name, sku, qty, unit_cost, unit,
      supplier_id, supplier_name, batch_number
    ) values (
      receipt_id_value, product_one_id, '[DEMO] Ống kẽm Hòa Phát ' || run_suffix,
      'DEMO-PROD-HP-' || run_suffix, 6, 100000, 'Cái', supplier_one_id,
      '[DEMO] Hòa Phát ' || run_suffix, 'DEMO-HP-BATCH-' || run_suffix
    ) returning id into receipt_item_id_value;
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku,
      warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by,
      source_item_id, batch_number
    ) values (
      current_org, 'DEMO-OPEN-' || run_suffix, 'OPENING_BALANCE', product_one_id,
      '[DEMO] Ống kẽm Hòa Phát ' || run_suffix, 'DEMO-PROD-HP-' || run_suffix,
      warehouse_id_value, '[DEMO] Kho Hà Nội ' || run_suffix, 6, 0, 100000,
      actor_name, receipt_item_id_value, 'DEMO-HP-BATCH-' || run_suffix
    );

    insert into goods_receipt_items (
      receipt_id, product_id, product_name, sku, qty, unit_cost, unit,
      supplier_id, supplier_name, batch_number
    ) values (
      receipt_id_value, product_two_id, '[DEMO] Ống kẽm Tân Việt ' || run_suffix,
      'DEMO-PROD-TV-' || run_suffix, 10, 110000, 'Cái', supplier_two_id,
      '[DEMO] Tân Việt ' || run_suffix, 'DEMO-TV-BATCH-' || run_suffix
    ) returning id into receipt_item_id_value;
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku,
      warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by,
      source_item_id, batch_number
    ) values (
      current_org, 'DEMO-OPEN-' || run_suffix, 'OPENING_BALANCE', product_two_id,
      '[DEMO] Ống kẽm Tân Việt ' || run_suffix, 'DEMO-PROD-TV-' || run_suffix,
      warehouse_id_value, '[DEMO] Kho Hà Nội ' || run_suffix, 10, 0, 110000,
      actor_name, receipt_item_id_value, 'DEMO-TV-BATCH-' || run_suffix
    );

    if scenario_name <> 'MASTER_DATA' then
      quotation_id_value := save_quotation(
        null, customer_id_value, '[DEMO] Công ty ABC ' || run_suffix,
        warehouse_id_value, current_date, current_date + 7, 'Draft', 0, 'pct',
        '[DEMO] Scenario ' || scenario_name,
        jsonb_build_array(jsonb_build_object(
          'category_id', category_id_value,
          'category_name', '[DEMO] Ống kẽm ' || run_suffix,
          'sell_unit', 'Cái', 'qty', 12, 'cost_price', 106250,
          'profit_pct', 50, 'selling_price', 160000, 'vat_pct', 10
        )), actor_name
      );

      if scenario_name <> 'QUOTATION_DRAFT' then
        perform set_quotation_status(quotation_id_value, 'Sent');
        perform set_quotation_status(quotation_id_value, 'Accepted');
      end if;

      if scenario_name not in ('QUOTATION_DRAFT', 'QUOTATION_ACCEPTED') then
        select id into quotation_item_id_value from quotation_items
        where quotation_id = quotation_id_value limit 1;
        if scenario_name = 'CONVERT_STOCK_ONLY' then
          allocation_payload := jsonb_build_array(
            jsonb_build_object('quotation_item_id',quotation_item_id_value,'source_type','STOCK','product_id',product_one_id,'qty',6),
            jsonb_build_object('quotation_item_id',quotation_item_id_value,'source_type','STOCK','product_id',product_two_id,'qty',6)
          );
        elsif scenario_name = 'CONVERT_NEW_STOCK_ONLY' then
          allocation_payload := jsonb_build_array(
            jsonb_build_object('quotation_item_id',quotation_item_id_value,'source_type','NEW_STOCK','product_id',product_two_id,'qty',12,
              'supplier_id',supplier_two_id,'unit_cost',115000,'batch_number','DEMO-NEW-' || run_suffix)
          );
        else
          allocation_payload := jsonb_build_array(
            jsonb_build_object('quotation_item_id',quotation_item_id_value,'source_type','STOCK','product_id',product_one_id,'qty',4),
            jsonb_build_object('quotation_item_id',quotation_item_id_value,'source_type','STOCK','product_id',product_two_id,'qty',3),
            jsonb_build_object('quotation_item_id',quotation_item_id_value,'source_type','NEW_STOCK','product_id',product_two_id,'qty',5,
              'supplier_id',supplier_two_id,'unit_cost',115000,'batch_number','DEMO-NEW-' || run_suffix)
          );
        end if;
        perform convert_quotation_allocations(quotation_id_value, allocation_payload);

        if scenario_name in ('DELIVERED', 'FULL_E2E') then
          delivery_id_value := deliver_quotation(
            quotation_id_value, 'DEMO-DN-' || run_suffix
          );
        end if;
      end if;
    end if;

    select count(*) into ledger_count from inventory_ledger where demo_run_id = run_id;
    result_metadata := jsonb_build_object(
      'created', jsonb_build_object(
        'warehouses', 1, 'categories', 1, 'brands', 1, 'units', 1,
        'suppliers', 2, 'customers', 1, 'products', 2,
        'quotations', case when quotation_id_value is null then 0 else 1 end,
        'ledgerEntries', ledger_count
      ),
      'links', jsonb_build_object(
        'quotationId', quotation_id_value,
        'warehouseId', warehouse_id_value,
        'deliveryId', delivery_id_value
      )
    );
    update demo_runs set status = 'SUCCESS', completed_at = now(),
      metadata = result_metadata where id = run_id;
  exception when others then
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message = message_text,
      error_detail = pg_exception_detail;
    update demo_runs set status = 'FAILED', completed_at = now(),
      error_message = concat_ws(' · ', error_state, error_message, nullif(error_detail, '')),
      metadata = jsonb_build_object('created', '{}'::jsonb, 'links', '{}'::jsonb)
    where id = run_id;
    return jsonb_build_object(
      'demoRunId', run_id, 'status', 'FAILED',
      'error', concat_ws(' · ', error_state, error_message, nullif(error_detail, '')),
      'created', '{}'::jsonb, 'links', '{}'::jsonb
    );
  end;

  return jsonb_build_object(
    'demoRunId', run_id, 'status', 'SUCCESS',
    'created', result_metadata->'created', 'links', result_metadata->'links'
  );
end;
$$;

grant execute on function run_demo_scenario(text, uuid) to authenticated;
revoke execute on function run_demo_scenario(text, uuid) from public, anon;

-- Bulk cleanup is limited to the caller's runs. An organization administrator
-- may also remove one explicitly selected run created by another user. FK
-- checks make the operation roll back if real data depends on Demo records.
create or replace function cleanup_demo_data(p_demo_run_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  current_user_id uuid := auth.uid();
  run_ids uuid[];
  run_count integer := 0;
  affected integer := 0;
  deleted_count integer := 0;
  actor_is_admin boolean := false;
begin
  if current_user_id is null or current_org is null then raise exception 'Authentication is required'; end if;
  perform require_permission('Administration', 'delete');
  select lower(role) = 'admin' into actor_is_admin
  from profiles where id = current_user_id and org_id = current_org;
  select coalesce(array_agg(id), array[]::uuid[]), count(*)
  into run_ids, run_count
  from demo_runs
  where org_id = current_org and (
    (p_demo_run_id is null and created_by = current_user_id)
    or (p_demo_run_id is not null and id = p_demo_run_id
      and (created_by = current_user_id or coalesce(actor_is_admin, false)))
  );
  if run_count = 0 then return jsonb_build_object('success', true, 'deletedRuns', 0, 'deletedRecords', 0); end if;
  perform set_config('app.demo_run_id', run_ids[1]::text, true);

  -- Break the intentionally bidirectional delivery/invoice links first.
  update delivery_notes set invoice_id = null
  where demo_run_id = any(run_ids) and source = 'dataDemo';
  update invoices set delivery_id = null
  where demo_run_id = any(run_ids) and source = 'dataDemo';

  -- Returns, payments, and outbound documents are the outermost dependants.
  delete from sales_return_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from sales_returns where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_return_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_returns where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from finance_transactions where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from cash_book where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from invoices where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from delivery_note_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from delivery_notes where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  -- Reservations and allocations must be removed before quotation/item rows.
  delete from inventory_reservations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from quotation_allocations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  -- Cost allocations/layers reference ledger rows. Ledger also references the
  -- source quotation, so all three are removed before quotations below.
  delete from inventory_cost_allocations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_cost_layers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_ledger where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  delete from goods_receipt_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from goods_receipts where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from quotation_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from quotations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  -- These modules are not created by today's built-in scenarios, but remain
  -- covered so future scenarios cannot leave tagged rows behind.
  delete from sales_order_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from sales_orders where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_order_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_orders where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_adjustment_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_adjustments where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_transfer_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_transfers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  -- Finally remove inventory caches and master data.
  delete from product_suppliers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_balance where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from products where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from brands where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from units where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from categories where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from suppliers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from customers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from warehouses where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from audit_events where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from demo_runs where id = any(run_ids) and org_id = current_org;

  return jsonb_build_object(
    'success', true, 'deletedRuns', run_count, 'deletedRecords', deleted_count
  );
end;
$$;

grant execute on function cleanup_demo_data(uuid) to authenticated;
revoke execute on function cleanup_demo_data(uuid) from public, anon;
revoke execute on function stamp_demo_context() from public, anon, authenticated;
