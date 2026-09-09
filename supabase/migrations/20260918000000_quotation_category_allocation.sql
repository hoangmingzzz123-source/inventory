-- Category-first quotation allocation for databases already migrated through
-- 20260917000000. A quotation promises a category and quantity; concrete SKUs
-- are selected atomically when the accepted quotation is converted.
--
-- Conversion reserves stock but does not issue it. Inventory is issued only by
-- deliver_quotation(), so on-hand, reserved, and available stock stay distinct.

alter table products add column if not exists category_id uuid references categories(id);
alter table quotation_items add column if not exists category_id uuid references categories(id);
alter table quotation_items add column if not exists category_name text;
alter table quotations add column if not exists converted_at timestamptz;
alter table quotations add column if not exists delivered_at timestamptz;
alter table quotations add column if not exists cancelled_at timestamptz;
alter table delivery_notes add column if not exists quotation_id uuid references quotations(id);
alter table inventory_ledger add column if not exists quotation_id uuid references quotations(id);

-- Link legacy product category text to the organization-owned category row.
-- Ambiguous legacy labels deliberately choose the stable smallest UUID; the
-- deployment reconciliation query below reports anything that remains unlinked.
update products product
set category_id = (
  select category.id
  from categories category
  where category.org_id = product.org_id
    and lower(trim(product.category)) in (
      lower(trim(category.code)), lower(trim(category.name_vi)), lower(trim(category.name_en))
    )
  order by category.id
  limit 1
)
where product.category_id is null
  and nullif(trim(product.category), '') is not null
  and exists (
    select 1 from categories category
    where category.org_id = product.org_id
      and lower(trim(product.category)) in (
        lower(trim(category.code)), lower(trim(category.name_vi)), lower(trim(category.name_en))
      )
  );

update quotation_items quotation_item
set category_id = product.category_id,
  category_name = coalesce(category.name_vi, category.name_en, category.code, product.category)
from products product
left join categories category on category.id = product.category_id
where quotation_item.category_id is null
  and quotation_item.product_id = product.id;

create table if not exists product_suppliers (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  last_unit_cost numeric(18,4) not null default 0 check (last_unit_cost >= 0),
  is_preferred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, product_id, supplier_id)
);

create table if not exists quotation_allocations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  quotation_id uuid not null references quotations(id) on delete cascade,
  quotation_item_id uuid not null references quotation_items(id) on delete cascade,
  category_id uuid not null references categories(id),
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  source_type text not null check (source_type in ('STOCK', 'NEW_STOCK')),
  qty numeric(18,2) not null check (qty > 0),
  supplier_id uuid references suppliers(id),
  goods_receipt_item_id uuid references goods_receipt_items(id),
  created_by text,
  created_at timestamptz not null default now(),
  unique (quotation_item_id, product_id, source_type)
);

create table if not exists inventory_reservations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  quotation_id uuid not null references quotations(id) on delete cascade,
  quotation_allocation_id uuid not null unique
    references quotation_allocations(id) on delete cascade,
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  qty numeric(18,2) not null check (qty > 0),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'CONSUMED', 'RELEASED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_org_category_idx
  on products(org_id, category_id) where category_id is not null;
create index if not exists quotation_items_category_idx
  on quotation_items(category_id) where category_id is not null;
create index if not exists quotation_allocations_quote_item_idx
  on quotation_allocations(quotation_id, quotation_item_id);
create index if not exists quotation_allocations_product_warehouse_idx
  on quotation_allocations(org_id, product_id, warehouse_id);
create index if not exists inventory_reservations_active_stock_idx
  on inventory_reservations(org_id, product_id, warehouse_id)
  where status = 'ACTIVE';
create index if not exists delivery_notes_org_quotation_idx
  on delivery_notes(org_id, quotation_id) where quotation_id is not null;
create index if not exists inventory_ledger_org_quotation_idx
  on inventory_ledger(org_id, quotation_id) where quotation_id is not null;

alter table product_suppliers enable row level security;
alter table quotation_allocations enable row level security;
alter table inventory_reservations enable row level security;

drop policy if exists "org_isolation" on product_suppliers;
drop policy if exists "org_isolation" on quotation_allocations;
drop policy if exists "org_isolation" on inventory_reservations;
create policy "org_isolation" on product_suppliers for select
  using (org_id = get_org_id());
create policy "org_isolation" on quotation_allocations for select
  using (org_id = get_org_id());
create policy "org_isolation" on inventory_reservations for select
  using (org_id = get_org_id());

revoke all on product_suppliers, quotation_allocations, inventory_reservations
  from anon, authenticated;
grant select on product_suppliers, quotation_allocations, inventory_reservations
  to authenticated;

-- Existing product forms submit the category label. Resolve that label to its
-- stable UUID at the database boundary so old clients remain compatible.
create or replace function resolve_product_category_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_category categories%rowtype;
begin
  -- The legacy product RPC sends only the category label. If that label was
  -- changed, discard the old UUID and resolve the new organization category.
  if tg_op = 'UPDATE'
    and new.category is distinct from old.category
    and new.category_id is not distinct from old.category_id then
    new.category_id := null;
  end if;
  if new.category_id is not null then
    select * into resolved_category from categories
    where id = new.category_id and org_id = new.org_id;
    if not found then raise exception 'Product category is outside this organization'; end if;
    new.category := coalesce(resolved_category.name_vi,
      resolved_category.name_en, resolved_category.code);
    return new;
  end if;
  if nullif(trim(new.category), '') is null then return new; end if;
  select * into resolved_category from categories
  where org_id = new.org_id
    and lower(trim(new.category)) in (
      lower(trim(code)), lower(trim(name_vi)), lower(trim(name_en))
    )
  order by id limit 1;
  if found then
    new.category_id := resolved_category.id;
    new.category := coalesce(resolved_category.name_vi,
      resolved_category.name_en, resolved_category.code);
  elsif auth.uid() is not null then
    raise exception 'Product category was not found in this organization';
  end if;
  return new;
end;
$$;

drop trigger if exists resolve_product_category_id on products;
create trigger resolve_product_category_id
before insert or update of category, category_id on products
for each row execute function resolve_product_category_id();

-- New quotation writes are category-first. Legacy rows remain readable, while
-- every newly saved line receives an immutable category snapshot.
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

  select name into customer_name_value
  from customers where id = p_customer_id and org_id = current_org;
  if not found then raise exception 'A valid customer is required'; end if;
  select name into warehouse_name_value
  from warehouses where id = p_warehouse_id and org_id = current_org
    and lower(status) = 'active';
  if not found then raise exception 'A valid fulfillment warehouse is required'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email)
     from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
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
    update quotations set
      customer_id = p_customer_id,
      customer_name = customer_name_value,
      warehouse_id = p_warehouse_id,
      date = coalesce(p_date, date),
      valid_until = p_valid_until,
      status = initcap(normalized_status),
      discount_val = discount_value,
      discount_type = p_discount_type,
      notes = p_notes,
      updated_at = now()
    where id = source_row.id;
    quotation_id := source_row.id;
    delete from quotation_items where quotation_id = source_row.id;
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    item_category_id := null;
    if nullif(item->>'category_id', '') is not null then
      begin
        item_category_id := (item->>'category_id')::uuid;
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
    where id = item_category_id and org_id = current_org
      and lower(status) = 'active';
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
    );
    computed_subtotal := computed_subtotal + line_total;
    computed_tax := computed_tax + line_total
      * greatest(coalesce(nullif(item->>'vat_pct', '')::numeric, 0), 0) / 100;
  end loop;

  if p_discount_type = 'pct' then
    computed_total := (computed_subtotal + computed_tax)
      * (1 - discount_value / 100);
  else
    if discount_value > computed_subtotal then
      raise exception 'Fixed discount cannot exceed quotation subtotal';
    end if;
    -- The UI distributes a fixed discount proportionally across all lines
    -- before VAT, so the server applies the same ratio to subtotal and tax.
    computed_total := case when computed_subtotal > 0 then
      (computed_subtotal + computed_tax)
        * (computed_subtotal - discount_value) / computed_subtotal
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

-- One read model supplies the conversion dialog with a transactionally
-- recomputed view of on-hand, reserved, and available inventory.
create or replace function get_quotation_allocation_context(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  quotation_row quotations%rowtype;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  select * into quotation_row from quotations
  where id = p_quotation_id and org_id = current_org;
  if not found then raise exception 'Quotation was not found'; end if;

  return jsonb_build_object(
    'quotation', jsonb_build_object(
      'id', quotation_row.id,
      'status', quotation_row.status,
      'customer_id', quotation_row.customer_id,
      'customer_name', quotation_row.customer_name,
      'warehouse_id', quotation_row.warehouse_id,
      'warehouse_name', (
        select warehouse.name from warehouses warehouse
        where warehouse.id = quotation_row.warehouse_id
      ),
      'total', quotation_row.total
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', quotation_item.id,
        'category_id', quotation_item.category_id,
        'category_name', quotation_item.category_name,
        'qty', quotation_item.qty,
        'sell_unit', quotation_item.sell_unit,
        'selling_price', quotation_item.selling_price,
        'vat_pct', quotation_item.vat_pct
      ) order by quotation_item.created_at, quotation_item.id)
      from quotation_items quotation_item
      where quotation_item.quotation_id = quotation_row.id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id,
        'category_id', product.category_id,
        'sku', product.sku,
        'name', product.name,
        'unit', product.unit,
        'price', product.price,
        'reference_cost', product.cost,
        'track_batch', product.track_batch,
        'on_hand', stock.on_hand,
        'reserved', stock.reserved,
        'available', stock.on_hand - stock.reserved,
        'average_cost', stock.average_cost
      ) order by product.name, product.sku)
      from products product
      cross join lateral (
        select
          coalesce((
            select sum(ledger.qty_in - ledger.qty_out)
            from inventory_ledger ledger
            where ledger.org_id = current_org
              and ledger.product_id = product.id
              and ledger.warehouse_id is not distinct from quotation_row.warehouse_id
          ), 0) as on_hand,
          coalesce((
            select sum(reservation.qty)
            from inventory_reservations reservation
            where reservation.org_id = current_org
              and reservation.product_id = product.id
              and reservation.warehouse_id = quotation_row.warehouse_id
              and reservation.status = 'ACTIVE'
          ), 0) as reserved,
          coalesce((
            select sum(layer.remaining_qty * layer.unit_cost)
              / nullif(sum(layer.remaining_qty), 0)
            from inventory_cost_layers layer
            where layer.org_id = current_org
              and layer.product_id = product.id
              and layer.warehouse_id is not distinct from quotation_row.warehouse_id
              and layer.remaining_qty > 0
          ), product.cost, 0) as average_cost
      ) stock
      where product.org_id = current_org
        and product.category_id is not null
        and lower(product.status) = 'active'
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', allocation.id,
        'quotation_item_id', allocation.quotation_item_id,
        'category_id', allocation.category_id,
        'product_id', allocation.product_id,
        'warehouse_id', allocation.warehouse_id,
        'source_type', allocation.source_type,
        'qty', allocation.qty,
        'supplier_id', allocation.supplier_id,
        'goods_receipt_item_id', allocation.goods_receipt_item_id,
        'reservation_status', reservation.status
      ) order by allocation.created_at, allocation.id)
      from quotation_allocations allocation
      left join inventory_reservations reservation
        on reservation.quotation_allocation_id = allocation.id
      where allocation.quotation_id = quotation_row.id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_quotation_allocation_context(uuid) to authenticated;
revoke execute on function get_quotation_allocation_context(uuid) from public;

-- The older receipt RPC accepted a quotation UUID as p_po_ref and immediately
-- marked it converted. After this migration, that bypass would skip allocation
-- and reservations, so quotation-sourced receipts are accepted only inside the
-- guarded conversion transaction below.
create or replace function guard_quotation_receipt_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_quotation_id uuid;
begin
  if new.po_id is null
    and coalesce(trim(new.po_ref), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    source_quotation_id := trim(new.po_ref)::uuid;
    if exists (
      select 1 from quotations quotation
      where quotation.id = source_quotation_id and quotation.org_id = new.org_id
    ) and current_setting('app.quotation_allocation_convert', true)
      is distinct from source_quotation_id::text then
      raise exception 'Use quotation allocation conversion before receiving quotation stock';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_quotation_receipt_conversion on goods_receipts;
create trigger guard_quotation_receipt_conversion
before insert on goods_receipts
for each row execute function guard_quotation_receipt_conversion();

-- The legacy AFTER INSERT trigger is intentionally retired. Conversion status
-- now changes only after every category allocation and reservation succeeds.
drop trigger if exists mark_quotation_converted on goods_receipts;

create or replace function convert_quotation_allocations(
  p_quotation_id uuid, p_allocations jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  quotation_row quotations%rowtype;
  quotation_item_row quotation_items%rowtype;
  product_row products%rowtype;
  category_row categories%rowtype;
  supplier_row suppliers%rowtype;
  allocation jsonb;
  new_product jsonb;
  allocation_id uuid;
  product_id_value uuid;
  lock_product_id uuid;
  receipt_id uuid;
  receipt_item_id uuid;
  receipt_ref text;
  receipt_item_count integer := 0;
  source_type_value text;
  item_qty numeric;
  item_cost numeric;
  on_hand_qty numeric;
  reserved_qty numeric;
  available_qty numeric;
  batch_value text;
  manufacture_value date;
  expiry_value date;
  actor_name text;
begin
  perform require_permission('Sales', 'approve');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) = 0 then
    raise exception 'At least one allocation is required';
  end if;

  select * into quotation_row from quotations
  where id = p_quotation_id and org_id = current_org for update;
  if not found then raise exception 'Quotation was not found'; end if;
  if lower(quotation_row.status) <> 'accepted' then
    raise exception 'Only an accepted quotation can be converted';
  end if;
  if quotation_row.warehouse_id is null then
    raise exception 'Quotation fulfillment warehouse is required';
  end if;
  if not exists (
    select 1 from warehouses
    where id = quotation_row.warehouse_id and org_id = current_org
      and lower(status) = 'active'
  ) then raise exception 'Quotation fulfillment warehouse is inactive or unavailable'; end if;
  if exists (select 1 from quotation_allocations where quotation_id = quotation_row.id) then
    raise exception 'Quotation has already been allocated';
  end if;
  if exists (
    select 1 from quotation_items
    where quotation_id = quotation_row.id and category_id is null
  ) then raise exception 'All quotation lines must have a category before conversion'; end if;

  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email)
     from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  -- Consistent lock ordering prevents two conversions from spending the same
  -- product availability and avoids lock-order deadlocks.
  for lock_product_id in
    select distinct nullif(value->>'product_id', '')::uuid
    from jsonb_array_elements(p_allocations) value
    where coalesce(value->>'product_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    order by 1
  loop
    -- Existing sales/receiving functions lock the product row before taking
    -- the stock advisory lock. Keep the same order to avoid lock inversion.
    perform 1 from products
    where id = lock_product_id and org_id = current_org
    for update;
    perform pg_advisory_xact_lock(hashtextextended(
      current_org::text || ':' || lock_product_id::text || ':' || quotation_row.warehouse_id::text, 0
    ));
  end loop;

  perform set_config('app.quotation_allocation_convert', quotation_row.id::text, true);

  for allocation in select * from jsonb_array_elements(p_allocations) loop
    begin
      select * into quotation_item_row from quotation_items
      where id = (allocation->>'quotation_item_id')::uuid
        and quotation_id = quotation_row.id for update;
    exception when invalid_text_representation then
      raise exception 'Allocation quotation line identifier is invalid';
    end;
    if not found then raise exception 'Allocation quotation line was not found'; end if;

    source_type_value := upper(coalesce(nullif(trim(allocation->>'source_type'), ''), ''));
    if source_type_value not in ('STOCK', 'NEW_STOCK') then
      raise exception 'Allocation source must be STOCK or NEW_STOCK';
    end if;
    item_qty := coalesce(nullif(allocation->>'qty', '')::numeric, 0);
    if item_qty <= 0 then raise exception 'Allocation quantity must be greater than zero'; end if;
    new_product := allocation->'new_product';
    product_id_value := null;

    if nullif(allocation->>'product_id', '') is not null then
      begin
        product_id_value := (allocation->>'product_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Allocation product identifier is invalid';
      end;
      select * into product_row from products
      where id = product_id_value and org_id = current_org
        and lower(status) = 'active' for update;
      if not found then raise exception 'Allocation product was not found'; end if;
      if product_row.category_id is distinct from quotation_item_row.category_id then
        raise exception 'Product % does not belong to quotation category %',
          product_row.sku, quotation_item_row.category_name;
      end if;
    elsif new_product is not null and jsonb_typeof(new_product) = 'object' then
      if source_type_value <> 'NEW_STOCK' then
        raise exception 'A new product can only be allocated as NEW_STOCK';
      end if;
      perform require_permission('Master Data', 'create');
      select * into category_row from categories
      where id = quotation_item_row.category_id and org_id = current_org;
      if not found then raise exception 'Quotation category was not found'; end if;
      if nullif(trim(new_product->>'sku'), '') is null
        or nullif(trim(new_product->>'name'), '') is null
        or nullif(trim(new_product->>'unit'), '') is null then
        raise exception 'New product requires SKU, name, and unit';
      end if;
      perform pg_advisory_xact_lock(hashtextextended(
        'product-sku:' || current_org::text || ':' || lower(trim(new_product->>'sku')), 0
      ));
      if exists (
        select 1 from products
        where org_id = current_org and lower(sku) = lower(trim(new_product->>'sku'))
      ) then raise exception 'New product SKU already exists'; end if;
      insert into products (
        org_id, sku, barcode, name, category_id, category, brand, unit,
        cost, price, qty, status, updated_by, tax_pct, min_qty, max_qty,
        description, track_inventory, track_serial, track_batch, allow_negative
      ) values (
        current_org, trim(new_product->>'sku'), nullif(trim(new_product->>'barcode'), ''),
        trim(new_product->>'name'), category_row.id,
        coalesce(category_row.name_vi, category_row.name_en, category_row.code),
        nullif(trim(new_product->>'brand'), ''), trim(new_product->>'unit'),
        greatest(coalesce(nullif(new_product->>'cost', '')::numeric, 0), 0),
        greatest(coalesce(nullif(new_product->>'price', '')::numeric,
          quotation_item_row.selling_price, 0), 0),
        0, 'Active', actor_name,
        greatest(coalesce(nullif(new_product->>'tax_pct', '')::numeric,
          quotation_item_row.vat_pct, 0), 0),
        greatest(coalesce(nullif(new_product->>'min_qty', '')::numeric, 0), 0),
        greatest(coalesce(nullif(new_product->>'max_qty', '')::numeric, 0), 0),
        nullif(trim(new_product->>'description'), ''), true,
        coalesce(nullif(new_product->>'track_serial', '')::boolean, false),
        coalesce(nullif(new_product->>'track_batch', '')::boolean, false), false
      ) returning * into product_row;
      product_id_value := product_row.id;
      perform pg_advisory_xact_lock(hashtextextended(
        current_org::text || ':' || product_id_value::text || ':' || quotation_row.warehouse_id::text, 0
      ));
    else
      raise exception 'Allocation requires an existing or new product';
    end if;

    if source_type_value = 'STOCK' then
      select coalesce(sum(ledger.qty_in - ledger.qty_out), 0)
      into on_hand_qty from inventory_ledger ledger
      where ledger.org_id = current_org
        and ledger.product_id = product_id_value
        and ledger.warehouse_id is not distinct from quotation_row.warehouse_id;
      select coalesce(sum(reservation.qty), 0)
      into reserved_qty from inventory_reservations reservation
      where reservation.org_id = current_org
        and reservation.product_id = product_id_value
        and reservation.warehouse_id = quotation_row.warehouse_id
        and reservation.status = 'ACTIVE';
      available_qty := on_hand_qty - reserved_qty;
      if available_qty < item_qty then
        raise exception 'Insufficient available stock for product %: available %, requested %',
          product_row.sku, available_qty, item_qty;
      end if;
    else
      if nullif(allocation->>'supplier_id', '') is null then
        raise exception 'NEW_STOCK allocation requires a supplier';
      end if;
      begin
        select * into supplier_row from suppliers
        where id = (allocation->>'supplier_id')::uuid and org_id = current_org
          and lower(status) = 'active';
      exception when invalid_text_representation then
        raise exception 'Allocation supplier identifier is invalid';
      end;
      if not found then raise exception 'Allocation supplier was not found'; end if;
      item_cost := nullif(allocation->>'unit_cost', '')::numeric;
      if item_cost is null or item_cost < 0 then
        raise exception 'NEW_STOCK allocation requires a non-negative actual unit cost';
      end if;
      batch_value := nullif(trim(allocation->>'batch_number'), '');
      manufacture_value := nullif(allocation->>'manufacture_date', '')::date;
      expiry_value := nullif(allocation->>'expiry_date', '')::date;
      if product_row.track_batch and batch_value is null then
        raise exception 'Batch number is required for product %', product_row.sku;
      end if;
      if manufacture_value is not null and expiry_value is not null
        and expiry_value < manufacture_value then
        raise exception 'Expiry date cannot precede manufacture date';
      end if;

      if receipt_id is null then
        receipt_ref := 'ALLOC-IN-' || left(quotation_row.id::text, 8)
          || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
        insert into goods_receipts (
          org_id, ref, po_id, po_ref, supplier_name, warehouse_id,
          warehouse_name, status, items, created_by
        ) values (
          current_org, receipt_ref, null, quotation_row.id::text,
          'Allocation suppliers', quotation_row.warehouse_id,
          (select name from warehouses where id = quotation_row.warehouse_id),
          'Completed', 0, actor_name
        ) returning id into receipt_id;
      end if;
      insert into goods_receipt_items (
        receipt_id, product_id, product_name, sku, qty, unit_cost, unit,
        supplier_id, supplier_name, batch_number, manufacture_date, expiry_date
      ) values (
        receipt_id, product_row.id, product_row.name, product_row.sku,
        item_qty, item_cost, product_row.unit, supplier_row.id, supplier_row.name,
        batch_value, manufacture_value, expiry_value
      ) returning id into receipt_item_id;
      insert into inventory_ledger (
        org_id, ref, movement_type, product_id, product_name, sku,
        warehouse_id, warehouse_name, qty_in, qty_out, unit_cost, created_by,
        batch_number, manufacture_date, expiry_date, source_item_id, quotation_id
      ) values (
        current_org, receipt_ref, 'RECEIPT', product_row.id, product_row.name,
        product_row.sku, quotation_row.warehouse_id,
        (select name from warehouses where id = quotation_row.warehouse_id),
        item_qty, 0, item_cost, actor_name, batch_value, manufacture_value,
        expiry_value, receipt_item_id, quotation_row.id
      );
      insert into product_suppliers (
        org_id, product_id, supplier_id, last_unit_cost, is_preferred
      ) values (
        current_org, product_row.id, supplier_row.id, item_cost, false
      ) on conflict (org_id, product_id, supplier_id) do update set
        last_unit_cost = excluded.last_unit_cost,
        updated_at = now();
      receipt_item_count := receipt_item_count + 1;
    end if;

    insert into quotation_allocations (
      org_id, quotation_id, quotation_item_id, category_id, product_id,
      warehouse_id, source_type, qty, supplier_id, goods_receipt_item_id,
      created_by
    ) values (
      current_org, quotation_row.id, quotation_item_row.id,
      quotation_item_row.category_id, product_id_value,
      quotation_row.warehouse_id, source_type_value, item_qty,
      case when source_type_value = 'NEW_STOCK' then supplier_row.id else null end,
      case when source_type_value = 'NEW_STOCK' then receipt_item_id else null end,
      actor_name
    ) returning id into allocation_id;

    insert into inventory_reservations (
      org_id, quotation_id, quotation_allocation_id, product_id,
      warehouse_id, qty, status
    ) values (
      current_org, quotation_row.id, allocation_id, product_id_value,
      quotation_row.warehouse_id, item_qty, 'ACTIVE'
    );
    receipt_item_id := null;
  end loop;

  if exists (
    select 1
    from quotation_items quotation_item
    left join quotation_allocations allocation
      on allocation.quotation_item_id = quotation_item.id
    where quotation_item.quotation_id = quotation_row.id
    group by quotation_item.id, quotation_item.qty
    having coalesce(sum(allocation.qty), 0) <> quotation_item.qty
  ) then raise exception 'Every quotation category must be allocated exactly'; end if;

  if receipt_id is not null then
    update goods_receipts set items = receipt_item_count where id = receipt_id;
  end if;
  update quotations set status = 'Awaiting Delivery', converted_at = now(),
    cancelled_at = null, updated_at = now()
  where id = quotation_row.id;
  perform append_audit_event(
    'quotations', 'ALLOCATE', quotation_row.id::text,
    jsonb_build_object('status', quotation_row.status),
    jsonb_build_object('status', 'Awaiting Delivery', 'allocations', p_allocations)
  );
  return quotation_row.id;
end;
$$;

grant execute on function convert_quotation_allocations(uuid, jsonb) to authenticated;
revoke execute on function convert_quotation_allocations(uuid, jsonb) from public;

-- Any stock-out must preserve quantities already promised to other active
-- reservations. During quotation delivery, reservations belonging to that same
-- quotation are excluded because they are precisely the stock being issued.
create or replace function enforce_nonnegative_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty numeric;
  reserved_other_qty numeric;
  projected_qty numeric;
  negative_allowed boolean;
  delivering_quotation text := nullif(
    current_setting('app.delivering_quotation_id', true), ''
  );
begin
  if coalesce(new.qty_out, 0) <= coalesce(new.qty_in, 0) then return new; end if;
  select coalesce(allow_negative, false) into negative_allowed
  from products where id = new.product_id and org_id = new.org_id;
  perform pg_advisory_xact_lock(hashtextextended(
    new.org_id::text || ':' || new.product_id::text || ':'
      || coalesce(new.warehouse_id::text, ''), 0
  ));
  select coalesce(sum(qty_in - qty_out), 0) into current_qty
  from inventory_ledger
  where org_id = new.org_id and product_id = new.product_id
    and warehouse_id is not distinct from new.warehouse_id;
  select coalesce(sum(reservation.qty), 0) into reserved_other_qty
  from inventory_reservations reservation
  where reservation.org_id = new.org_id
    and reservation.product_id = new.product_id
    and reservation.warehouse_id is not distinct from new.warehouse_id
    and reservation.status = 'ACTIVE'
    and (delivering_quotation is null
      or reservation.quotation_id::text <> delivering_quotation);
  projected_qty := current_qty + coalesce(new.qty_in, 0) - coalesce(new.qty_out, 0);
  if reserved_other_qty > 0 and projected_qty < reserved_other_qty then
    raise exception 'Insufficient available stock for product %: on hand %, reserved %, requested %',
      new.sku, current_qty, reserved_other_qty, new.qty_out;
  end if;
  if projected_qty < 0 and not coalesce(negative_allowed, false) then
    raise exception 'Insufficient stock for product %: available %, requested %',
      new.sku, current_qty, new.qty_out;
  end if;
  return new;
end;
$$;

create or replace function deliver_quotation(p_quotation_id uuid, p_ref text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  quotation_row quotations%rowtype;
  fulfillment record;
  delivery_id uuid;
  delivery_item_id uuid;
  created_invoice_id uuid;
  actual_unit_cost numeric;
  raw_subtotal numeric := 0;
  invoice_amount numeric := 0;
  delivery_ref text := nullif(trim(p_ref), '');
  actor_name text;
begin
  perform require_permission('Sales', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if delivery_ref is null then raise exception 'Delivery reference is required'; end if;
  if exists (select 1 from delivery_notes where org_id = current_org and ref = delivery_ref) then
    raise exception 'Delivery reference already exists';
  end if;
  select * into quotation_row from quotations
  where id = p_quotation_id and org_id = current_org for update;
  if not found then raise exception 'Quotation was not found'; end if;
  if lower(quotation_row.status) <> 'awaiting delivery' then
    raise exception 'Quotation is not awaiting delivery';
  end if;
  if not exists (
    select 1 from inventory_reservations
    where quotation_id = quotation_row.id and status = 'ACTIVE'
  ) then raise exception 'Quotation has no active inventory reservation'; end if;
  if exists (
    select 1
    from quotation_allocations allocation
    left join inventory_reservations reservation
      on reservation.quotation_allocation_id = allocation.id
      and reservation.status = 'ACTIVE'
    where allocation.quotation_id = quotation_row.id
    group by allocation.id, allocation.qty
    having coalesce(sum(reservation.qty), 0) <> allocation.qty
  ) then raise exception 'Quotation reservations are incomplete'; end if;

  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email)
     from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  perform set_config('app.delivering_quotation_id', quotation_row.id::text, true);

  insert into delivery_notes (
    org_id, ref, quotation_id, sales_order_id, sales_order_ref,
    customer_id, customer_name, warehouse_id, warehouse_name,
    status, note, created_by
  ) values (
    current_org, delivery_ref, quotation_row.id, null,
    'QT-' || left(quotation_row.id::text, 8), quotation_row.customer_id,
    quotation_row.customer_name, quotation_row.warehouse_id,
    (select name from warehouses where id = quotation_row.warehouse_id),
    'Completed', 'Quotation allocation delivery', actor_name
  ) returning id into delivery_id;

  -- A product belongs to one category, so allocations for the same product can
  -- be collapsed to a single delivery line even when STOCK and NEW_STOCK were
  -- combined. This also records one unambiguous FIFO/moving-average COGS value.
  for fulfillment in
    select allocation.product_id, product.name as product_name, product.sku,
      product.unit, sum(allocation.qty) as qty,
      max(quotation_item.selling_price) as unit_price
    from quotation_allocations allocation
    join quotation_items quotation_item on quotation_item.id = allocation.quotation_item_id
    join products product on product.id = allocation.product_id
    where allocation.quotation_id = quotation_row.id
    group by allocation.product_id, product.name, product.sku, product.unit
    order by product.sku, allocation.product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      current_org::text || ':' || fulfillment.product_id::text || ':'
        || quotation_row.warehouse_id::text, 0
    ));
    insert into delivery_note_items (
      delivery_id, product_id, product_name, sku, qty, unit_cost, unit_price
    ) values (
      delivery_id, fulfillment.product_id, fulfillment.product_name,
      fulfillment.sku, fulfillment.qty, 0, fulfillment.unit_price
    ) returning id into delivery_item_id;
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku,
      warehouse_id, warehouse_name, qty_in, qty_out, unit_cost,
      created_by, quotation_id
    ) values (
      current_org, delivery_ref, 'SALE', fulfillment.product_id,
      fulfillment.product_name, fulfillment.sku, quotation_row.warehouse_id,
      (select name from warehouses where id = quotation_row.warehouse_id),
      0, fulfillment.qty, 0, actor_name, quotation_row.id
    ) returning unit_cost into actual_unit_cost;
    update delivery_note_items set unit_cost = actual_unit_cost
    where id = delivery_item_id;
  end loop;

  update inventory_reservations set status = 'CONSUMED', updated_at = now()
  where quotation_id = quotation_row.id and status = 'ACTIVE';

  select coalesce(sum(quotation_item.total), 0)
  into raw_subtotal
  from quotation_items quotation_item
  where quotation_item.quotation_id = quotation_row.id;
  if quotation_row.discount_type = 'pct' then
    invoice_amount := raw_subtotal
      * (1 - greatest(coalesce(quotation_row.discount_val, 0), 0) / 100);
  elsif raw_subtotal > 0 then
    invoice_amount := greatest(raw_subtotal - coalesce(quotation_row.discount_val, 0), 0);
  end if;

  insert into invoices (
    org_id, ref, so_id, so_ref, customer_id, customer_name,
    amount, tax, total, status, delivery_id, delivery_ref,
    paid_amount, outstanding_amount, due_date
  ) values (
    current_org, 'INV-' || delivery_ref, null,
    'QT-' || left(quotation_row.id::text, 8), quotation_row.customer_id,
    quotation_row.customer_name, round(invoice_amount),
    greatest(quotation_row.total - round(invoice_amount), 0),
    quotation_row.total, 'Unpaid', delivery_id, delivery_ref,
    0, quotation_row.total, current_date + 30
  ) returning id into created_invoice_id;
  update delivery_notes set invoice_id = created_invoice_id,
    invoice_ref = 'INV-' || delivery_ref
  where id = delivery_id;
  update quotations set status = 'Delivered', delivered_at = now(),
    updated_at = now()
  where id = quotation_row.id;
  return delivery_id;
end;
$$;

grant execute on function deliver_quotation(uuid, text) to authenticated;
revoke execute on function deliver_quotation(uuid, text) from public;

create or replace function cancel_quotation_conversion(p_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  quotation_row quotations%rowtype;
begin
  perform require_permission('Sales', 'approve');
  select * into quotation_row from quotations
  where id = p_quotation_id and org_id = current_org for update;
  if not found then raise exception 'Quotation was not found'; end if;
  if lower(quotation_row.status) <> 'awaiting delivery' then
    raise exception 'Only an awaiting-delivery quotation can release reservations';
  end if;
  if exists (
    select 1 from delivery_notes
    where quotation_id = quotation_row.id and status <> 'Reversed'
  ) then raise exception 'Reverse the quotation delivery before cancellation'; end if;
  update inventory_reservations set status = 'RELEASED', updated_at = now()
  where quotation_id = quotation_row.id and status = 'ACTIVE';
  update quotations set status = 'Cancelled', cancelled_at = now(),
    updated_at = now()
  where id = quotation_row.id;
end;
$$;

grant execute on function cancel_quotation_conversion(uuid) to authenticated;
revoke execute on function cancel_quotation_conversion(uuid) from public;

-- Generic status changes cannot bypass reservation lifecycle rules.
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
  update quotations set status = initcap(normalized_status), updated_at = now()
  where id = p_id and org_id = current_org;
end;
$$;

-- Reversing a quotation delivery restores both the physical stock (handled by
-- reverse_delivery_note) and its promises, making it available for redelivery
-- or explicit cancellation.
create or replace function restore_quotation_after_delivery_reversal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quotation_id is not null
    and lower(new.status) = 'reversed'
    and lower(old.status) <> 'reversed' then
    update inventory_reservations set status = 'ACTIVE', updated_at = now()
    where quotation_id = new.quotation_id and status = 'CONSUMED';
    update quotations set status = 'Awaiting Delivery', delivered_at = null,
      updated_at = now()
    where id = new.quotation_id and org_id = new.org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists restore_quotation_after_delivery_reversal on delivery_notes;
create trigger restore_quotation_after_delivery_reversal
after update of status on delivery_notes
for each row execute function restore_quotation_after_delivery_reversal();

-- Extend the deployment health report with category and reservation invariants.
create or replace function reconciliation_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'negative_stock_rows', (
      select count(*) from (
        select product_id, warehouse_id from inventory_ledger where org_id = get_org_id()
        group by product_id, warehouse_id having sum(qty_in - qty_out) < 0
      ) negative
    ),
    'legacy_products_without_ledger', (
      select count(*) from products product
      where product.org_id = get_org_id() and coalesce(product.qty, 0) > 0
        and not exists (
          select 1 from inventory_ledger ledger
          where ledger.org_id = product.org_id and ledger.product_id = product.id
        )
    ),
    'invoice_payment_mismatches', (
      select count(*) from invoices where org_id = get_org_id()
        and outstanding_amount <> greatest(total - paid_amount, 0)
    ),
    'purchase_payment_mismatches', (
      select count(*) from purchase_orders where org_id = get_org_id()
        and outstanding_amount <> greatest(total - paid_amount, 0)
    ),
    'inventory_balance_mismatches', (
      select count(*) from (
        select coalesce(balance.product_id, ledger.product_id) as product_id,
          coalesce(balance.warehouse_id, ledger.warehouse_id) as warehouse_id
        from (
          select product_id, warehouse_id, sum(qty) as qty
          from inventory_balance where org_id = get_org_id()
          group by product_id, warehouse_id
        ) balance
        full join (
          select product_id, warehouse_id, sum(qty_in - qty_out) as qty
          from inventory_ledger where org_id = get_org_id()
          group by product_id, warehouse_id
        ) ledger on ledger.product_id = balance.product_id
          and ledger.warehouse_id is not distinct from balance.warehouse_id
        where coalesce(balance.qty, 0) <> coalesce(ledger.qty, 0)
      ) mismatch
    ),
    'cost_layer_quantity_mismatches', (
      select count(*) from (
        select coalesce(stock.product_id, cost.product_id) as product_id,
          coalesce(stock.warehouse_id, cost.warehouse_id) as warehouse_id
        from (
          select product_id, warehouse_id, sum(qty_in - qty_out) as qty
          from inventory_ledger where org_id = get_org_id()
          group by product_id, warehouse_id
        ) stock
        full join (
          select product_id, warehouse_id, sum(remaining_qty) as qty
          from inventory_cost_layers where org_id = get_org_id()
          group by product_id, warehouse_id
        ) cost on cost.product_id = stock.product_id
          and cost.warehouse_id is not distinct from stock.warehouse_id
        where coalesce(stock.qty, 0) <> coalesce(cost.qty, 0)
      ) mismatch
    ),
    'unlinked_product_categories', (
      select count(*) from products product
      where product.org_id = get_org_id() and product.category_id is null
    ),
    'unlinked_quotation_categories', (
      select count(*) from quotation_items quotation_item
      join quotations quotation on quotation.id = quotation_item.quotation_id
      where quotation.org_id = get_org_id()
        and quotation_item.category_id is null
        and lower(quotation.status) not in ('cancelled', 'rejected')
    ),
    'allocation_quantity_mismatches', (
      select count(*) from (
        select quotation_item.id
        from quotation_items quotation_item
        join quotations quotation on quotation.id = quotation_item.quotation_id
        left join quotation_allocations allocation
          on allocation.quotation_item_id = quotation_item.id
        where quotation.org_id = get_org_id()
          and (lower(quotation.status) in ('awaiting delivery', 'delivered')
            or exists (
              select 1 from quotation_allocations existing
              where existing.quotation_id = quotation.id
            ))
        group by quotation_item.id, quotation_item.qty
        having coalesce(sum(allocation.qty), 0) <> quotation_item.qty
      ) mismatch
    ),
    'over_reserved_stock_rows', (
      select count(*) from (
        select reservation.product_id, reservation.warehouse_id
        from inventory_reservations reservation
        where reservation.org_id = get_org_id() and reservation.status = 'ACTIVE'
        group by reservation.product_id, reservation.warehouse_id
        having sum(reservation.qty) > coalesce((
          select sum(ledger.qty_in - ledger.qty_out)
          from inventory_ledger ledger
          where ledger.org_id = get_org_id()
            and ledger.product_id = reservation.product_id
            and ledger.warehouse_id is not distinct from reservation.warehouse_id
        ), 0)
      ) mismatch
    )
  )
$$;

grant execute on function set_quotation_status(uuid, text) to authenticated;
grant execute on function reconciliation_summary() to authenticated;
revoke execute on function set_quotation_status(uuid, text) from public;
revoke execute on function reconciliation_summary() from public;

revoke execute on function guard_quotation_receipt_conversion() from public, authenticated;
revoke execute on function resolve_product_category_id() from public, authenticated;
revoke execute on function restore_quotation_after_delivery_reversal() from public, authenticated;
revoke execute on function enforce_nonnegative_inventory() from public, authenticated;
