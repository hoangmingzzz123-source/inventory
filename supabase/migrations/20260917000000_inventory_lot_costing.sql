-- FIFO/moving-average inventory valuation for databases already migrated
-- through 20260916000000. Existing migrations remain immutable.
--
-- Receipt prices remain the historical purchase prices. Open cost layers drive
-- inventory valuation and outbound COGS; customer-facing selling prices remain
-- independent snapshots on quotations, sales orders, deliveries, and invoices.

alter table company_settings
  add column if not exists costing_method text not null default 'FIFO';

update company_settings
set costing_method = upper(trim(costing_method))
where costing_method is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_settings_costing_method_check'
      and conrelid = 'company_settings'::regclass
  ) then
    alter table company_settings
      add constraint company_settings_costing_method_check
      check (costing_method in ('FIFO', 'MOVING_AVERAGE'));
  end if;
end $$;

alter table goods_receipt_items add column if not exists batch_number text;
alter table goods_receipt_items add column if not exists manufacture_date date;
alter table goods_receipt_items add column if not exists expiry_date date;
alter table goods_receipt_items add column if not exists supplier_id uuid references suppliers(id);
alter table goods_receipt_items add column if not exists supplier_name text;

update goods_receipt_items item
set supplier_id = purchase_order.supplier_id,
  supplier_name = coalesce(purchase_order.supplier_name, receipt.supplier_name)
from goods_receipts receipt
join purchase_orders purchase_order on purchase_order.id = receipt.po_id
where item.receipt_id = receipt.id
  and (item.supplier_id is null or item.supplier_name is null);

update goods_receipt_items item
set supplier_id = quotation_item.supplier_id,
  supplier_name = coalesce(quotation_item.supplier_name, receipt.supplier_name)
from goods_receipts receipt
join quotation_items quotation_item
  on quotation_item.quotation_id::text = receipt.po_ref
where item.receipt_id = receipt.id and receipt.po_id is null
  and quotation_item.product_id = item.product_id
  and (item.supplier_id is null or item.supplier_name is null);

alter table inventory_ledger add column if not exists batch_number text;
alter table inventory_ledger add column if not exists manufacture_date date;
alter table inventory_ledger add column if not exists expiry_date date;
alter table inventory_ledger add column if not exists source_item_id uuid;

-- Weighted outbound costs can contain decimals even when source purchase prices
-- are whole VND amounts.
alter table inventory_ledger alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table inventory_balance alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table sales_order_items alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table delivery_note_items alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table inventory_adjustment_items alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table inventory_transfer_items alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table sales_return_items alter column unit_cost type numeric(18,4) using unit_cost::numeric;
alter table purchase_return_items alter column unit_cost type numeric(18,4) using unit_cost::numeric;

create table if not exists inventory_cost_layers (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id),
  warehouse_id uuid references warehouses(id),
  source_ledger_id uuid references inventory_ledger(id),
  source_item_id uuid,
  origin_layer_id uuid references inventory_cost_layers(id),
  source_ref text not null,
  source_type text not null,
  batch_number text,
  manufacture_date date,
  expiry_date date,
  received_qty numeric(18,2) not null check (received_qty > 0),
  remaining_qty numeric(18,2) not null check (remaining_qty >= 0 and remaining_qty <= received_qty),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists inventory_cost_allocations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  outbound_ledger_id uuid not null references inventory_ledger(id)
    deferrable initially deferred,
  cost_layer_id uuid not null references inventory_cost_layers(id),
  qty numeric(18,2) not null check (qty > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (outbound_ledger_id, cost_layer_id)
);

create index if not exists inventory_cost_layers_fifo_idx
  on inventory_cost_layers(org_id, product_id, warehouse_id, received_at, id)
  where remaining_qty > 0;
create index if not exists inventory_cost_layers_source_item_idx
  on inventory_cost_layers(org_id, source_item_id, warehouse_id)
  where remaining_qty > 0;
create index if not exists inventory_cost_allocations_outbound_idx
  on inventory_cost_allocations(outbound_ledger_id);
create index if not exists inventory_cost_allocations_layer_idx
  on inventory_cost_allocations(cost_layer_id);

alter table inventory_cost_layers enable row level security;
alter table inventory_cost_allocations enable row level security;
drop policy if exists "org_isolation" on inventory_cost_layers;
drop policy if exists "org_isolation" on inventory_cost_allocations;
create policy "org_isolation" on inventory_cost_layers for select
  using (org_id = get_org_id());
create policy "org_isolation" on inventory_cost_allocations for select
  using (org_id = get_org_id());
revoke all on inventory_cost_layers, inventory_cost_allocations from anon, authenticated;
grant select on inventory_cost_layers, inventory_cost_allocations to authenticated;

-- Existing databases do not have enough allocation history to reconstruct each
-- old FIFO layer reliably. Seed one auditable baseline layer per positive stock
-- balance; all receipts after this migration retain their individual costs.
insert into inventory_cost_layers (
  org_id, product_id, warehouse_id, source_ref, source_type,
  received_qty, remaining_qty, unit_cost, received_at
)
select stock.org_id, stock.product_id, stock.warehouse_id,
  'MIGRATION-BASELINE-' || coalesce(stock.warehouse_id::text, 'NO-WAREHOUSE'),
  'LEGACY_BASELINE', stock.qty, stock.qty,
  case
    when stock.inventory_value > 0 then stock.inventory_value / stock.qty
    else greatest(coalesce(product.cost, 0), 0)
  end,
  stock.first_movement_at
from (
  select ledger.org_id, ledger.product_id, ledger.warehouse_id,
    sum(ledger.qty_in - ledger.qty_out) as qty,
    sum((ledger.qty_in - ledger.qty_out) * ledger.unit_cost) as inventory_value,
    min(coalesce(ledger.created_at, now())) as first_movement_at
  from inventory_ledger ledger
  where ledger.product_id is not null
  group by ledger.org_id, ledger.product_id, ledger.warehouse_id
) stock
join products product on product.id = stock.product_id and product.org_id = stock.org_id
where stock.qty > 0
  and not exists (
    select 1 from inventory_cost_layers layer
    where layer.org_id = stock.org_id
      and layer.product_id = stock.product_id
      and layer.warehouse_id is not distinct from stock.warehouse_id
      and layer.source_type = 'LEGACY_BASELINE'
  );

create or replace function inventory_costing_method(p_org_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select settings.costing_method
    from company_settings settings
    where settings.org_id = p_org_id
  ), 'FIFO')
$$;

create or replace function estimate_inventory_cost_value(
  p_org_id uuid, p_product_id uuid, p_warehouse_id uuid, p_qty numeric
) returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  requested_qty numeric := greatest(coalesce(p_qty, 0), 0);
  remaining_qty numeric := greatest(coalesce(p_qty, 0), 0);
  available_qty numeric := 0;
  available_value numeric := 0;
  layer record;
  take_qty numeric;
  estimated_value numeric := 0;
  fallback_cost numeric := 0;
begin
  if requested_qty = 0 then return 0; end if;
  if inventory_costing_method(p_org_id) = 'MOVING_AVERAGE' then
    select coalesce(sum(cost_layer.remaining_qty), 0),
      coalesce(sum(cost_layer.remaining_qty * cost_layer.unit_cost), 0)
    into available_qty, available_value
    from inventory_cost_layers cost_layer
    where cost_layer.org_id = p_org_id
      and cost_layer.product_id = p_product_id
      and cost_layer.warehouse_id is not distinct from p_warehouse_id
      and cost_layer.remaining_qty > 0;
    take_qty := least(requested_qty, available_qty);
    if available_qty > 0 then
      estimated_value := take_qty * available_value / available_qty;
    end if;
    remaining_qty := requested_qty - take_qty;
    if remaining_qty > 0 then
      select greatest(coalesce(cost, 0), 0) into fallback_cost
      from products where id = p_product_id and org_id = p_org_id;
      estimated_value := estimated_value + remaining_qty * coalesce(fallback_cost, 0);
    end if;
    return estimated_value;
  end if;
  for layer in
    select remaining_qty as available_qty, unit_cost
    from inventory_cost_layers
    where org_id = p_org_id and product_id = p_product_id
      and warehouse_id is not distinct from p_warehouse_id
      and remaining_qty > 0
    order by received_at, id
  loop
    exit when remaining_qty <= 0;
    take_qty := least(remaining_qty, layer.available_qty);
    estimated_value := estimated_value + take_qty * layer.unit_cost;
    remaining_qty := remaining_qty - take_qty;
  end loop;
  if remaining_qty > 0 then
    select greatest(coalesce(cost, 0), 0) into fallback_cost
    from products where id = p_product_id and org_id = p_org_id;
    estimated_value := estimated_value + remaining_qty * coalesce(fallback_cost, 0);
  end if;
  return estimated_value;
end;
$$;

-- Internal quotation helper: purchase history remains supplier-specific while
-- the FIFO estimate is warehouse- and quantity-specific.
create or replace function get_product_pricing(
  p_product_id uuid,
  p_supplier_id uuid default null,
  p_customer_id uuid default null,
  p_warehouse_id uuid default null,
  p_qty numeric default 1
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  product_row products%rowtype;
  supplier_name_value text;
  latest_import record;
  previous_import record;
  latest_sale record;
  open_qty numeric := 0;
  open_value numeric := 0;
  average_cost numeric := 0;
  estimated_cost numeric := 0;
  reference_cost numeric := 0;
  suggested_price numeric := 0;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  select * into product_row from products
  where id = p_product_id and org_id = current_org;
  if not found then raise exception 'Product was not found in this organization'; end if;

  if p_supplier_id is not null then
    select name into supplier_name_value from suppliers
    where id = p_supplier_id and org_id = current_org;
    if not found then raise exception 'Supplier was not found in this organization'; end if;
  end if;

  select receipt_item.unit_cost, receipt_item.unit, receipt_item.qty,
    receipt_item.batch_number, receipt_item.manufacture_date, receipt_item.expiry_date,
    receipt.ref as receipt_ref, receipt.created_at as receipt_date,
    coalesce(receipt_item.supplier_name, receipt.supplier_name) as supplier_name,
    receipt.po_ref
  into latest_import
  from goods_receipt_items receipt_item
  join goods_receipts receipt on receipt.id = receipt_item.receipt_id
  left join purchase_orders purchase_order on purchase_order.id = receipt.po_id
  where receipt.org_id = current_org and receipt_item.product_id = p_product_id
    and (
      p_supplier_id is null
      or receipt_item.supplier_id = p_supplier_id
      or purchase_order.supplier_id = p_supplier_id
      or lower(trim(receipt_item.supplier_name)) = lower(trim(supplier_name_value))
      or lower(trim(receipt.supplier_name)) = lower(trim(supplier_name_value))
    )
  order by coalesce(receipt.created_at, receipt_item.created_at) desc, receipt_item.id desc
  limit 1;

  select receipt_item.unit_cost, receipt.created_at as receipt_date
  into previous_import
  from goods_receipt_items receipt_item
  join goods_receipts receipt on receipt.id = receipt_item.receipt_id
  left join purchase_orders purchase_order on purchase_order.id = receipt.po_id
  where receipt.org_id = current_org and receipt_item.product_id = p_product_id
    and (
      p_supplier_id is null
      or receipt_item.supplier_id = p_supplier_id
      or purchase_order.supplier_id = p_supplier_id
      or lower(trim(receipt_item.supplier_name)) = lower(trim(supplier_name_value))
      or lower(trim(receipt.supplier_name)) = lower(trim(supplier_name_value))
    )
  order by coalesce(receipt.created_at, receipt_item.created_at) desc, receipt_item.id desc
  offset 1 limit 1;

  if p_customer_id is not null then
    select quotation_item.selling_price, quotation.id as quotation_id,
      quotation.date as quotation_date
    into latest_sale
    from quotation_items quotation_item
    join quotations quotation on quotation.id = quotation_item.quotation_id
    where quotation.org_id = current_org
      and quotation.customer_id = p_customer_id
      and quotation_item.product_id = p_product_id
      and lower(quotation.status) not in ('cancelled', 'rejected')
    order by quotation.date desc, quotation.created_at desc, quotation_item.id desc
    limit 1;
  end if;

  select coalesce(sum(remaining_qty), 0),
    coalesce(sum(remaining_qty * unit_cost), 0)
  into open_qty, open_value
  from inventory_cost_layers
  where org_id = current_org and product_id = p_product_id
    and (p_warehouse_id is null or warehouse_id = p_warehouse_id)
    and remaining_qty > 0;

  average_cost := case when open_qty > 0 then open_value / open_qty else 0 end;
  if p_warehouse_id is not null and coalesce(p_qty, 0) > 0 then
    estimated_cost := estimate_inventory_cost_value(
      current_org, p_product_id, p_warehouse_id, p_qty
    ) / p_qty;
  end if;
  reference_cost := coalesce(
    latest_import.unit_cost,
    nullif(estimated_cost, 0),
    nullif(average_cost, 0),
    product_row.cost,
    0
  );
  suggested_price := case
    when coalesce(product_row.price, 0) > 0 then product_row.price
    else round(reference_cost * 1.2)
  end;

  return jsonb_build_object(
    'product_id', product_row.id,
    'product_name', product_row.name,
    'sku', product_row.sku,
    'unit', product_row.unit,
    'list_price', product_row.price,
    'costing_method', inventory_costing_method(current_org),
    'available_qty', open_qty,
    'average_cost', round(average_cost, 4),
    'estimated_cost', round(estimated_cost, 4),
    'reference_cost', round(reference_cost, 4),
    'suggested_price', suggested_price,
    'latest_cost', latest_import.unit_cost,
    'previous_cost', previous_import.unit_cost,
    'cost_change_pct', case
      when coalesce(previous_import.unit_cost, 0) > 0
      then round((latest_import.unit_cost - previous_import.unit_cost) * 100 / previous_import.unit_cost, 2)
      else null
    end,
    'receipt_ref', latest_import.receipt_ref,
    'receipt_date', latest_import.receipt_date,
    'supplier_name', latest_import.supplier_name,
    'receipt_qty', latest_import.qty,
    'receipt_unit', latest_import.unit,
    'batch_number', latest_import.batch_number,
    'manufacture_date', latest_import.manufacture_date,
    'expiry_date', latest_import.expiry_date,
    'quotation_source_ref', latest_import.po_ref,
    'latest_customer_price', latest_sale.selling_price,
    'latest_customer_quotation_id', latest_sale.quotation_id,
    'latest_customer_quotation_date', latest_sale.quotation_date
  );
end;
$$;

-- Consume open layers atomically before every outbound ledger movement. The
-- computed weighted cost replaces any client-provided cost on that movement.
create or replace function apply_inventory_outbound_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_qty numeric := greatest(coalesce(new.qty_out, 0) - coalesce(new.qty_in, 0), 0);
  remaining_to_allocate numeric;
  layer record;
  take_qty numeric;
  total_cost numeric := 0;
  fallback_cost numeric := 0;
  negative_allowed boolean := false;
  method_name text;
  moving_average numeric := 0;
  restricted_source_item uuid;
begin
  if required_qty <= 0 or new.product_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    new.org_id::text || ':' || new.product_id::text || ':' || coalesce(new.warehouse_id::text, ''), 0
  ));
  select coalesce(allow_negative, false), greatest(coalesce(cost, 0), 0)
  into negative_allowed, fallback_cost
  from products where id = new.product_id and org_id = new.org_id;

  method_name := inventory_costing_method(new.org_id);
  if method_name = 'MOVING_AVERAGE' then
    select case when sum(remaining_qty) > 0
      then sum(remaining_qty * unit_cost) / sum(remaining_qty) else 0 end
    into moving_average
    from inventory_cost_layers
    where org_id = new.org_id and product_id = new.product_id
      and warehouse_id is not distinct from new.warehouse_id
      and remaining_qty > 0;
    if coalesce(moving_average, 0) > 0 then
      update inventory_cost_layers set unit_cost = moving_average
      where org_id = new.org_id and product_id = new.product_id
        and warehouse_id is not distinct from new.warehouse_id
        and remaining_qty > 0;
    end if;
  end if;

  if new.movement_type = 'RETURN_OUT' and new.source_item_id is null then
    select receipt_item.id into new.source_item_id
    from purchase_returns return_header
    join purchase_return_items return_item on return_item.return_id = return_header.id
    join goods_receipt_items receipt_item on receipt_item.receipt_id = return_header.receipt_id
      and receipt_item.product_id = return_item.product_id
    where return_header.org_id = new.org_id and return_header.ref = new.ref
      and return_item.product_id = new.product_id
    limit 1;
    if new.source_item_id is null and left(new.ref, 4) = 'REV-' then
      select return_item.id into new.source_item_id
      from sales_returns return_header
      join sales_return_items return_item on return_item.return_id = return_header.id
      where return_header.org_id = new.org_id
        and 'REV-' || return_header.ref = new.ref
        and return_item.product_id = new.product_id
      limit 1;
    end if;
  end if;

  if new.movement_type = 'RETURN_OUT' and new.source_item_id is not null
    and exists (
      select 1 from inventory_cost_layers
      where org_id = new.org_id and product_id = new.product_id
        and warehouse_id is not distinct from new.warehouse_id
        and source_item_id = new.source_item_id and remaining_qty > 0
    ) then
    restricted_source_item := new.source_item_id;
  end if;

  remaining_to_allocate := required_qty;
  for layer in
    select id, remaining_qty, unit_cost
    from inventory_cost_layers
    where org_id = new.org_id and product_id = new.product_id
      and warehouse_id is not distinct from new.warehouse_id
      and remaining_qty > 0
      and (restricted_source_item is null or source_item_id = restricted_source_item)
    order by received_at, id
    for update
  loop
    exit when remaining_to_allocate <= 0;
    take_qty := least(remaining_to_allocate, layer.remaining_qty);
    update inventory_cost_layers
    set remaining_qty = remaining_qty - take_qty
    where id = layer.id;
    insert into inventory_cost_allocations (
      org_id, outbound_ledger_id, cost_layer_id, qty, unit_cost
    ) values (
      new.org_id, new.id, layer.id, take_qty, layer.unit_cost
    );
    total_cost := total_cost + take_qty * layer.unit_cost;
    remaining_to_allocate := remaining_to_allocate - take_qty;
  end loop;

  if remaining_to_allocate > 0 and not negative_allowed then
    raise exception 'Insufficient cost-layer stock for product %: missing %',
      new.sku, remaining_to_allocate;
  end if;
  if remaining_to_allocate > 0 then
    total_cost := total_cost + remaining_to_allocate * fallback_cost;
  end if;
  new.unit_cost := round(total_cost / required_qty, 4);
  return new;
end;
$$;

-- Create inbound layers after the ledger row exists. Transfers preserve the
-- source FIFO split; other inbound movements create one new layer.
create or replace function apply_inventory_inbound_cost_and_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inbound_qty numeric := greatest(coalesce(new.qty_in, 0) - coalesce(new.qty_out, 0), 0);
  allocated_qty numeric := 0;
  source_item_value uuid := new.source_item_id;
  source_batch text := new.batch_number;
  source_manufacture_date date := new.manufacture_date;
  source_expiry_date date := new.expiry_date;
  allocation record;
  method_name text;
  average_cost numeric := 0;
begin
  if new.product_id is null then return new; end if;

  if source_item_value is null and new.movement_type in ('RECEIPT', 'OPENING_BALANCE') then
    select item.id, item.batch_number, item.manufacture_date, item.expiry_date
    into source_item_value, source_batch, source_manufacture_date, source_expiry_date
    from goods_receipt_items item
    join goods_receipts receipt on receipt.id = item.receipt_id
    where receipt.org_id = new.org_id and receipt.ref = new.ref
      and item.product_id = new.product_id
    order by item.created_at desc, item.id desc limit 1;
  elsif source_item_value is null and new.movement_type = 'RETURN_IN' then
    select item.id into source_item_value
    from sales_return_items item
    join sales_returns return_header on return_header.id = item.return_id
    where return_header.org_id = new.org_id and return_header.ref = new.ref
      and item.product_id = new.product_id
    order by item.created_at desc, item.id desc limit 1;
    if source_item_value is null and left(new.ref, 4) = 'REV-' then
      select receipt_item.id into source_item_value
      from purchase_returns return_header
      join purchase_return_items return_item on return_item.return_id = return_header.id
      join goods_receipt_items receipt_item on receipt_item.receipt_id = return_header.receipt_id
        and receipt_item.product_id = return_item.product_id
      where return_header.org_id = new.org_id
        and 'REV-' || return_header.ref = new.ref
        and return_item.product_id = new.product_id
      limit 1;
    end if;
  end if;

  if inbound_qty > 0 then
    perform pg_advisory_xact_lock(hashtextextended(
      new.org_id::text || ':' || new.product_id::text || ':' || coalesce(new.warehouse_id::text, ''), 0
    ));
    if new.movement_type = 'TRANSFER_IN' then
      for allocation in
        select cost_allocation.qty, cost_allocation.unit_cost,
          source_layer.id as source_layer_id, source_layer.source_item_id,
          source_layer.batch_number, source_layer.manufacture_date, source_layer.expiry_date
        from inventory_ledger outbound
        join inventory_cost_allocations cost_allocation
          on cost_allocation.outbound_ledger_id = outbound.id
        join inventory_cost_layers source_layer
          on source_layer.id = cost_allocation.cost_layer_id
        where outbound.org_id = new.org_id and outbound.ref = new.ref
          and outbound.product_id = new.product_id
          and outbound.movement_type = 'TRANSFER_OUT'
        order by source_layer.received_at, source_layer.id
      loop
        insert into inventory_cost_layers (
          org_id, product_id, warehouse_id, source_ledger_id, source_item_id,
          origin_layer_id, source_ref, source_type, batch_number,
          manufacture_date, expiry_date, received_qty, remaining_qty,
          unit_cost, received_at
        ) values (
          new.org_id, new.product_id, new.warehouse_id, new.id,
          allocation.source_item_id, allocation.source_layer_id, new.ref,
          new.movement_type, allocation.batch_number,
          allocation.manufacture_date, allocation.expiry_date,
          allocation.qty, allocation.qty, allocation.unit_cost,
          coalesce(new.created_at, now())
        );
        allocated_qty := allocated_qty + allocation.qty;
      end loop;
    end if;

    if inbound_qty > allocated_qty then
      insert into inventory_cost_layers (
        org_id, product_id, warehouse_id, source_ledger_id, source_item_id,
        source_ref, source_type, batch_number, manufacture_date, expiry_date,
        received_qty, remaining_qty, unit_cost, received_at
      ) values (
        new.org_id, new.product_id, new.warehouse_id, new.id,
        source_item_value, new.ref, new.movement_type, source_batch,
        source_manufacture_date, source_expiry_date,
        inbound_qty - allocated_qty, inbound_qty - allocated_qty,
        greatest(coalesce(new.unit_cost, 0), 0), coalesce(new.created_at, now())
      );
    end if;

    method_name := inventory_costing_method(new.org_id);
    if method_name = 'MOVING_AVERAGE' then
      select case when sum(remaining_qty) > 0
        then sum(remaining_qty * unit_cost) / sum(remaining_qty) else 0 end
      into average_cost
      from inventory_cost_layers
      where org_id = new.org_id and product_id = new.product_id
        and warehouse_id is not distinct from new.warehouse_id
        and remaining_qty > 0;
      update inventory_cost_layers set unit_cost = coalesce(average_cost, 0)
      where org_id = new.org_id and product_id = new.product_id
        and warehouse_id is not distinct from new.warehouse_id
        and remaining_qty > 0;
    end if;
  end if;

  select case when sum(remaining_qty) > 0
    then sum(remaining_qty * unit_cost) / sum(remaining_qty) else 0 end
  into average_cost
  from inventory_cost_layers
  where org_id = new.org_id and product_id = new.product_id
    and warehouse_id is not distinct from new.warehouse_id
    and remaining_qty > 0;
  update inventory_balance
  set unit_cost = coalesce(average_cost, 0), updated_at = now()
  where org_id = new.org_id and product_id = new.product_id
    and warehouse_id is not distinct from new.warehouse_id;

  -- Keep document-line COGS aligned with the server-computed ledger COGS.
  if new.movement_type = 'SALE' then
    update delivery_note_items item set unit_cost = new.unit_cost
    from delivery_notes header
    where header.id = item.delivery_id and header.org_id = new.org_id
      and header.ref = new.ref and item.product_id = new.product_id;
  elsif new.movement_type = 'TRANSFER_OUT' then
    update inventory_transfer_items item set unit_cost = new.unit_cost
    from inventory_transfers header
    where header.id = item.transfer_id and header.org_id = new.org_id
      and header.ref = new.ref and item.product_id = new.product_id;
  elsif new.movement_type in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') then
    update inventory_adjustment_items item set unit_cost = new.unit_cost
    from inventory_adjustments header
    where header.id = item.adjustment_id and header.org_id = new.org_id
      and header.ref = new.ref and item.product_id = new.product_id;
  elsif new.movement_type = 'RETURN_OUT' then
    update purchase_return_items item set unit_cost = new.unit_cost
    from purchase_returns header
    where header.id = item.return_id and header.org_id = new.org_id
      and header.ref = new.ref and item.product_id = new.product_id;
  elsif new.movement_type = 'RETURN_IN' then
    update sales_return_items item set unit_cost = new.unit_cost
    from sales_returns header
    where header.id = item.return_id and header.org_id = new.org_id
      and header.ref = new.ref and item.product_id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cost_inventory_outbound_before_ledger on inventory_ledger;
create trigger cost_inventory_outbound_before_ledger
before insert on inventory_ledger
for each row execute function apply_inventory_outbound_cost();

drop trigger if exists zz_cost_inventory_after_ledger on inventory_ledger;
create trigger zz_cost_inventory_after_ledger
after insert on inventory_ledger
for each row execute function apply_inventory_inbound_cost_and_sync();

-- Sales-order cost is an internal estimate. The actual COGS is recomputed from
-- cost layers only when goods are delivered.
create or replace function set_sales_order_estimated_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_org uuid;
  order_warehouse uuid;
  estimated_value numeric := 0;
  fallback_cost numeric := 0;
begin
  select org_id, warehouse_id into order_org, order_warehouse
  from sales_orders where id = new.sales_order_id;
  if order_org is null or new.product_id is null or coalesce(new.qty, 0) <= 0 then
    return new;
  end if;
  estimated_value := estimate_inventory_cost_value(
    order_org, new.product_id, order_warehouse, new.qty
  );
  select greatest(coalesce(cost, 0), 0) into fallback_cost
  from products where id = new.product_id and org_id = order_org;
  new.unit_cost := case when estimated_value > 0
    then round(estimated_value / new.qty, 4)
    else coalesce(fallback_cost, 0)
  end;
  return new;
end;
$$;

drop trigger if exists sales_order_estimated_cost on sales_order_items;
create trigger sales_order_estimated_cost
before insert or update of product_id, qty on sales_order_items
for each row execute function set_sales_order_estimated_cost();

-- Extend the receipt RPC without changing its signature. New lot fields travel
-- inside p_items, keeping existing frontend and integrations compatible.
create or replace function receive_goods_receipt(
  p_ref text, p_po_ref text, p_warehouse_id uuid, p_warehouse_name text,
  p_supplier_name text, p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  new_receipt_id uuid;
  new_receipt_item_id uuid;
  purchase_order_row purchase_orders%rowtype;
  quotation_row quotations%rowtype;
  item jsonb;
  product_row products%rowtype;
  item_qty numeric;
  item_cost numeric;
  item_supplier_id uuid;
  item_supplier_name text;
  ordered_qty numeric;
  received_qty numeric;
  quoted_qty numeric;
  has_remaining boolean;
  actor_name text;
  warehouse_name_value text;
begin
  perform require_permission('Purchase', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null then raise exception 'Receipt reference is required'; end if;
  select name into warehouse_name_value from warehouses where id = p_warehouse_id and org_id = current_org;
  if not found then raise exception 'A valid receiving warehouse is required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one receipt item is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if exists (select 1 from goods_receipts where org_id = current_org and ref = trim(p_ref)) then raise exception 'Goods receipt already exists'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  select * into purchase_order_row from purchase_orders
  where org_id = current_org and ref = nullif(trim(p_po_ref), '') for update;
  if found then
    if purchase_order_row.warehouse_id is distinct from p_warehouse_id then raise exception 'Receipt warehouse must match the purchase order warehouse'; end if;
    if lower(purchase_order_row.status) in ('draft', 'pending approval', 'cancelled', 'rejected') then raise exception 'Purchase order is not approved for receiving'; end if;
  else
    if coalesce(trim(p_po_ref), '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'A valid purchase order or accepted quotation source is required';
    end if;
    select * into quotation_row from quotations
    where org_id = current_org and id = trim(p_po_ref)::uuid for update;
    if not found or lower(quotation_row.status) <> 'accepted' then raise exception 'An accepted quotation source is required'; end if;
    if quotation_row.warehouse_id is distinct from p_warehouse_id then raise exception 'Receipt warehouse must match the quotation warehouse'; end if;
    if exists (select 1 from goods_receipts where org_id = current_org and po_id is null and po_ref = quotation_row.id::text) then raise exception 'Quotation has already been converted'; end if;
  end if;

  insert into goods_receipts (org_id, ref, po_id, po_ref, warehouse_id, warehouse_name, supplier_name, items, status, created_by)
  values (current_org, trim(p_ref), purchase_order_row.id, nullif(trim(p_po_ref), ''), p_warehouse_id,
    warehouse_name_value, coalesce(purchase_order_row.supplier_name, nullif(trim(p_supplier_name), ''), 'Unknown Supplier'),
    jsonb_array_length(p_items), 'Completed', actor_name)
  returning id into new_receipt_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    item_cost := nullif(item->>'unit_cost', '')::numeric;
    if item_qty <= 0 then raise exception 'Receipt quantity must be greater than zero'; end if;
    select * into product_row from products where org_id = current_org and
      (id = nullif(item->>'product_id', '')::uuid or sku = nullif(item->>'sku', '')) limit 1;
    if not found then raise exception 'Product was not found for receipt item'; end if;
    item_cost := greatest(coalesce(item_cost, product_row.cost, 0), 0);
    if product_row.track_batch and nullif(trim(item->>'batch_number'), '') is null then
      raise exception 'Batch number is required for product %', product_row.sku;
    end if;
    if nullif(item->>'manufacture_date', '') is not null
      and nullif(item->>'expiry_date', '') is not null
      and (item->>'expiry_date')::date < (item->>'manufacture_date')::date then
      raise exception 'Batch expiry date cannot be before manufacture date';
    end if;

    if purchase_order_row.id is not null then
      item_supplier_id := purchase_order_row.supplier_id;
      item_supplier_name := purchase_order_row.supplier_name;
      select coalesce(sum(qty), 0) into ordered_qty from purchase_order_items
      where po_id = purchase_order_row.id and product_id = product_row.id;
      select coalesce(sum(receipt_item.qty), 0) into received_qty
      from goods_receipt_items receipt_item
      join goods_receipts receipt on receipt.id = receipt_item.receipt_id
      where receipt.org_id = current_org and receipt.po_id = purchase_order_row.id
        and receipt_item.product_id = product_row.id;
      if ordered_qty <= 0 or received_qty + item_qty > ordered_qty then
        raise exception 'Receipt exceeds remaining purchase quantity for product %', product_row.sku;
      end if;
    elsif quotation_row.id is not null then
      select quotation_item.supplier_id,
        coalesce(quotation_item.supplier_name, supplier.name)
      into item_supplier_id, item_supplier_name
      from quotation_items quotation_item
      left join suppliers supplier on supplier.id = quotation_item.supplier_id
        and supplier.org_id = current_org
      where quotation_item.quotation_id = quotation_row.id
        and quotation_item.product_id = product_row.id
      limit 1;
      select coalesce(sum(qty), 0) into quoted_qty from quotation_items
      where quotation_id = quotation_row.id and product_id = product_row.id;
      if quoted_qty <= 0 or item_qty > quoted_qty then
        raise exception 'Receipt exceeds quotation quantity for product %', product_row.sku;
      end if;
    end if;

    insert into goods_receipt_items (
      receipt_id, product_id, product_name, sku, qty, unit_cost, unit,
      batch_number, manufacture_date, expiry_date, supplier_id, supplier_name
    ) values (
      new_receipt_id, product_row.id, product_row.name, product_row.sku,
      item_qty, item_cost,
      coalesce(nullif(item->>'unit', ''), product_row.unit),
      nullif(trim(item->>'batch_number'), ''),
      nullif(item->>'manufacture_date', '')::date,
      nullif(item->>'expiry_date', '')::date,
      item_supplier_id, item_supplier_name
    ) returning id into new_receipt_item_id;
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by, source_item_id,
      batch_number, manufacture_date, expiry_date
    ) values (
      current_org, trim(p_ref), 'RECEIPT', product_row.id, product_row.name,
      product_row.sku, p_warehouse_id, warehouse_name_value, item_qty, 0,
      item_cost,
      actor_name, new_receipt_item_id, nullif(trim(item->>'batch_number'), ''),
      nullif(item->>'manufacture_date', '')::date,
      nullif(item->>'expiry_date', '')::date
    );
  end loop;

  if purchase_order_row.id is not null then
    select exists (
      select 1 from purchase_order_items order_item
      where order_item.po_id = purchase_order_row.id
        and order_item.qty > coalesce((
          select sum(receipt_item.qty) from goods_receipt_items receipt_item
          join goods_receipts receipt on receipt.id = receipt_item.receipt_id
          where receipt.po_id = purchase_order_row.id and receipt_item.product_id = order_item.product_id
        ), 0)
    ) into has_remaining;
    update purchase_orders set status = case when has_remaining then 'Receiving' else 'Completed' end,
      updated_at = now() where id = purchase_order_row.id;
  elsif quotation_row.id is not null and exists (
    select 1 from (
      select product_id, sum(qty) as quoted_qty
      from quotation_items where quotation_id = quotation_row.id
      group by product_id
    ) quoted
    where quoted.quoted_qty > coalesce((
      select sum(receipt_item.qty)
      from goods_receipt_items receipt_item
      where receipt_item.receipt_id = new_receipt_id
        and receipt_item.product_id = quoted.product_id
    ), 0)
  ) then
    raise exception 'All quotation quantities must be received in one conversion';
  end if;
  return new_receipt_id;
end;
$$;

-- Use separate statements so the outbound cost is finalized before the
-- destination layer is created, including when a transfer is reversed.
create or replace function create_inventory_transfer(
  p_ref text, p_from_warehouse_id uuid, p_from_warehouse_name text,
  p_to_warehouse_id uuid, p_to_warehouse_name text, p_items jsonb,
  p_created_by text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  transfer_id uuid;
  item jsonb;
  item_qty numeric;
  actual_unit_cost numeric;
  product_row products%rowtype;
  from_name_value text;
  to_name_value text;
  actor_name text;
begin
  perform require_permission('Inventory', 'create');
  if nullif(trim(p_ref), '') is null then raise exception 'Transfer reference is required'; end if;
  if p_from_warehouse_id is null or p_to_warehouse_id is null or p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'Transfer requires different source and destination warehouses';
  end if;
  select name into from_name_value from warehouses where id = p_from_warehouse_id and org_id = current_org;
  if not found then raise exception 'A valid source warehouse is required'; end if;
  select name into to_name_value from warehouses where id = p_to_warehouse_id and org_id = current_org;
  if not found then raise exception 'A valid destination warehouse is required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one transfer item is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if exists (select 1 from inventory_transfers where org_id = current_org and ref = trim(p_ref)) then raise exception 'Transfer reference already exists'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  insert into inventory_transfers (
    org_id, ref, from_warehouse_id, from_warehouse_name, to_warehouse_id,
    to_warehouse_name, status, created_by
  ) values (
    current_org, trim(p_ref), p_from_warehouse_id, from_name_value,
    p_to_warehouse_id, to_name_value, 'Completed', actor_name
  ) returning id into transfer_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    if nullif(item->>'product_id', '') is null or item_qty <= 0 then raise exception 'Transfer item requires product and positive quantity'; end if;
    select * into product_row from products
    where id = (item->>'product_id')::uuid and org_id = current_org for update;
    if not found then raise exception 'Product was not found for transfer'; end if;
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values (
      current_org, trim(p_ref), 'TRANSFER_OUT', product_row.id, product_row.name,
      product_row.sku, p_from_warehouse_id, from_name_value, 0, item_qty, 0, actor_name
    ) returning unit_cost into actual_unit_cost;
    insert into inventory_transfer_items (
      transfer_id, product_id, product_name, sku, qty, unit_cost
    ) values (
      transfer_id, product_row.id, product_row.name, product_row.sku,
      item_qty, actual_unit_cost
    );
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values (
      current_org, trim(p_ref), 'TRANSFER_IN', product_row.id, product_row.name,
      product_row.sku, p_to_warehouse_id, to_name_value, item_qty, 0,
      actual_unit_cost, actor_name
    );
  end loop;
  perform append_audit_event('inventory_transfers', 'CREATE', trim(p_ref), null,
    jsonb_build_object('from_warehouse_id', p_from_warehouse_id, 'to_warehouse_id', p_to_warehouse_id, 'items', p_items));
  return transfer_id;
end;
$$;

create or replace function reverse_inventory_transfer(p_ref text, p_created_by text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  source_row inventory_transfers%rowtype;
  item inventory_transfer_items%rowtype;
  reversal_ref text := 'REV-' || trim(p_ref);
  actor_name text;
  actual_unit_cost numeric;
begin
  perform require_permission('Inventory', 'approve');
  select * into source_row from inventory_transfers
  where org_id = current_org and ref = trim(p_ref) for update;
  if not found then raise exception 'Transfer was not found'; end if;
  if lower(source_row.status) = 'reversed' then raise exception 'Transfer is already reversed'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  for item in select * from inventory_transfer_items where transfer_id = source_row.id loop
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values (
      current_org, reversal_ref, 'TRANSFER_OUT', item.product_id,
      item.product_name, item.sku, source_row.to_warehouse_id,
      source_row.to_warehouse_name, 0, item.qty, 0, actor_name
    ) returning unit_cost into actual_unit_cost;
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values (
      current_org, reversal_ref, 'TRANSFER_IN', item.product_id,
      item.product_name, item.sku, source_row.from_warehouse_id,
      source_row.from_warehouse_name, item.qty, 0, actual_unit_cost, actor_name
    );
  end loop;
  update inventory_transfers set status = 'Reversed', updated_at = now()
  where id = source_row.id;
  perform append_audit_event('inventory_transfers', 'REVERSE', trim(p_ref),
    jsonb_build_object('status', source_row.status), jsonb_build_object('status', 'Reversed'));
  return source_row.id;
end;
$$;

-- Add cost-layer health to the deployment reconciliation report.
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
    )
  )
$$;

-- Only authenticated users can request organization-scoped pricing. All other
-- functions are internal helpers or trigger entry points.
grant execute on function get_product_pricing(uuid, uuid, uuid, uuid, numeric) to authenticated;
grant execute on function receive_goods_receipt(text, text, uuid, text, text, jsonb) to authenticated;
grant execute on function create_inventory_transfer(text, uuid, text, uuid, text, jsonb, text) to authenticated;
grant execute on function reverse_inventory_transfer(text, text) to authenticated;
grant execute on function reconciliation_summary() to authenticated;
revoke execute on function get_product_pricing(uuid, uuid, uuid, uuid, numeric) from public;
revoke execute on function inventory_costing_method(uuid) from public, anon, authenticated;
revoke execute on function estimate_inventory_cost_value(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function apply_inventory_outbound_cost() from public, anon, authenticated;
revoke execute on function apply_inventory_inbound_cost_and_sync() from public, anon, authenticated;
revoke execute on function set_sales_order_estimated_cost() from public, anon, authenticated;
revoke execute on function receive_goods_receipt(text, text, uuid, text, text, jsonb) from public;
revoke execute on function create_inventory_transfer(text, uuid, text, uuid, text, jsonb, text) from public;
revoke execute on function reverse_inventory_transfer(text, text) from public;
revoke execute on function reconciliation_summary() from public;

-- Refresh cached unit costs from the new source of truth.
update inventory_balance balance
set unit_cost = cost.average_cost, updated_at = now()
from (
  select org_id, product_id, warehouse_id,
    case when sum(remaining_qty) > 0
      then sum(remaining_qty * unit_cost) / sum(remaining_qty) else 0 end as average_cost
  from inventory_cost_layers
  group by org_id, product_id, warehouse_id
) cost
where balance.org_id = cost.org_id and balance.product_id = cost.product_id
  and balance.warehouse_id is not distinct from cost.warehouse_id;
