-- Category defaults, quotation-line snapshots, and controlled export settings.
-- Apply after 20260922000000_notification_state.sql.

alter table categories
  add column if not exists default_unit_id uuid references units(id),
  add column if not exists default_unit text,
  add column if not exists default_purchase_price numeric(18,4) not null default 0,
  add column if not exists default_sale_price numeric(18,4) not null default 0,
  add column if not exists has_vat boolean not null default false,
  add column if not exists default_vat_rate numeric(5,2) not null default 0;

alter table customers add column if not exists representative text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_default_prices_check'
      and conrelid = 'categories'::regclass
  ) then
    alter table categories add constraint categories_default_prices_check
      check (default_purchase_price >= 0 and default_sale_price >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_default_vat_check'
      and conrelid = 'categories'::regclass
  ) then
    alter table categories add constraint categories_default_vat_check check (
      (has_vat and default_vat_rate > 0 and default_vat_rate <= 100)
      or (not has_vat and default_vat_rate = 0)
    );
  end if;
end $$;

alter table quotation_items
  add column if not exists offered_description text,
  add column if not exists specification_brand text,
  add column if not exists unit_snapshot text,
  add column if not exists reference_purchase_price numeric(18,4),
  add column if not exists reference_sale_price numeric(18,4),
  add column if not exists has_vat boolean not null default false,
  add column if not exists note text,
  add column if not exists reference_type text,
  add column if not exists reference_quotation_item_id uuid references quotation_items(id) on delete set null,
  add column if not exists price_overridden boolean not null default false,
  add column if not exists subtotal_snapshot numeric(18,4) not null default 0,
  add column if not exists vat_amount numeric(18,4) not null default 0,
  add column if not exists total_after_tax numeric(18,4) not null default 0;

-- Existing quotation lines predate the explicit VAT/snapshot columns. Preserve
-- their meaning instead of letting the new false/zero defaults hide old VAT.
update quotation_items set
  offered_description = coalesce(offered_description, category_name, product_name),
  unit_snapshot = coalesce(unit_snapshot, sell_unit),
  has_vat = coalesce(vat_pct, 0) > 0,
  subtotal_snapshot = coalesce(qty, 0) * coalesce(selling_price, 0),
  vat_amount = coalesce(qty, 0) * coalesce(selling_price, 0) * coalesce(vat_pct, 0) / 100,
  total_after_tax = coalesce(qty, 0) * coalesce(selling_price, 0)
    * (1 + coalesce(vat_pct, 0) / 100);

alter table quotations
  add column if not exists quotation_number text,
  add column if not exists title text,
  add column if not exists project text,
  add column if not exists customer_representative text,
  add column if not exists customer_address text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists customer_tax_code text,
  add column if not exists salesperson_phone text,
  add column if not exists payment_terms text,
  add column if not exists delivery_terms text,
  add column if not exists footer_notes text,
  add column if not exists include_shipping boolean not null default true,
  add column if not exists version integer not null default 1;

update quotations quotation set
  title = coalesce(quotation.title, 'BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG'),
  customer_representative = coalesce(quotation.customer_representative, customer.representative),
  customer_address = coalesce(quotation.customer_address, customer.address),
  customer_phone = coalesce(quotation.customer_phone, customer.phone),
  customer_email = coalesce(quotation.customer_email, customer.email),
  customer_tax_code = coalesce(quotation.customer_tax_code, customer.tax_code),
  payment_terms = coalesce(quotation.payment_terms,
    E'Thanh toán 100% trước khi giao hàng.\nThanh toán tiền mặt hoặc chuyển khoản.'),
  delivery_terms = coalesce(quotation.delivery_terms,
    'Nhận hàng từ 05–07 ngày kể từ khi thanh toán.')
from customers customer
where customer.id = quotation.customer_id and customer.org_id = quotation.org_id;

update quotations
set quotation_number = 'QT-' || to_char(date, 'YYYYMMDD') || '-' || upper(left(id::text, 8))
where quotation_number is null;

create unique index if not exists quotations_org_number_idx
  on quotations(org_id, quotation_number) where quotation_number is not null;

alter table company_settings
  add column if not exists english_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text;

create table if not exists quotation_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  default_title text not null default 'BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG',
  default_payment_terms text not null default E'Thanh toán 100% trước khi giao hàng.\nThanh toán tiền mặt hoặc chuyển khoản.',
  default_delivery_terms text not null default 'Nhận hàng từ 05–07 ngày kể từ khi thanh toán.',
  default_validity_days integer not null default 7 check (default_validity_days between 1 and 365),
  default_include_shipping boolean not null default true,
  default_footer_notes text,
  updated_at timestamptz not null default now()
);

insert into quotation_settings (org_id)
select id from organizations
on conflict (org_id) do nothing;

alter table quotation_settings enable row level security;
drop policy if exists "quotation_settings_read" on quotation_settings;
create policy "quotation_settings_read" on quotation_settings for select
  using (org_id = get_org_id());
revoke all on quotation_settings from anon, authenticated;
grant select on quotation_settings to authenticated;

-- Metadata for controlled .xlsx templates. File storage/virus scanning should be
-- provided by the deployment backend; unsafe legacy .xls/.xlsm files never enter
-- the ACTIVE lifecycle represented by this table.
create table if not exists quotation_templates (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  version integer not null check (version > 0),
  file_path text not null,
  file_sha256 text,
  file_size bigint not null default 0 check (file_size between 0 and 5242880),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'VALIDATED', 'ACTIVE', 'ARCHIVED')),
  validation_result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  activated_at timestamptz,
  unique (org_id, name, version)
);

alter table quotations
  add column if not exists template_version_id uuid references quotation_templates(id) on delete set null;

alter table quotation_templates enable row level security;
drop policy if exists "quotation_templates_read" on quotation_templates;
create policy "quotation_templates_read" on quotation_templates for select
  using (org_id = get_org_id());
revoke all on quotation_templates from anon, authenticated;
grant select on quotation_templates to authenticated;

create index if not exists quotation_templates_org_status_idx
  on quotation_templates(org_id, status, created_at desc);

-- Category writes go through these RPCs so unit lookup and VAT validation are
-- identical for the form and the bulk importer. They do not touch stock tables.
create or replace function save_category_defaults(
  p_id uuid, p_code text, p_name text, p_status text,
  p_default_unit text, p_default_purchase_price numeric,
  p_default_sale_price numeric, p_has_vat boolean, p_default_vat_rate numeric
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  category_id_value uuid;
  unit_id_value uuid;
  unit_name_value text;
  code_value text := upper(trim(coalesce(p_code, '')));
  name_value text := trim(coalesce(p_name, ''));
  has_vat_value boolean := coalesce(p_has_vat, false);
  vat_value numeric := greatest(coalesce(p_default_vat_rate, 0), 0);
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  if code_value = '' then raise exception 'Category code is required'; end if;
  if name_value = '' then raise exception 'Category name is required'; end if;
  if coalesce(p_default_purchase_price, 0) < 0 or coalesce(p_default_sale_price, 0) < 0 then
    raise exception 'Category default prices cannot be negative';
  end if;
  if has_vat_value and (vat_value <= 0 or vat_value > 100) then
    raise exception 'VAT rate must be greater than 0 and at most 100 when VAT is enabled';
  end if;
  if not has_vat_value then vat_value := 0; end if;

  if nullif(trim(coalesce(p_default_unit, '')), '') is not null then
    select unit.id, coalesce(unit.name_vi, unit.name_en, unit.code)
    into unit_id_value, unit_name_value
    from units unit
    where unit.org_id = current_org and lower(unit.status) = 'active'
      and lower(trim(p_default_unit)) in (
        lower(trim(unit.code)), lower(trim(unit.name_vi)), lower(trim(unit.name_en))
      )
    order by unit.id limit 1;
    if not found then
      raise exception 'Unit "%" does not exist or is inactive', p_default_unit;
    end if;
  end if;

  if p_id is null then
    perform require_permission('Master Data', 'create');
    insert into categories (
      org_id, code, name_vi, name_en, status, default_unit_id, default_unit,
      default_purchase_price, default_sale_price, has_vat, default_vat_rate
    ) values (
      current_org, code_value, name_value, name_value, canonical_master_status(p_status),
      unit_id_value, unit_name_value, greatest(coalesce(p_default_purchase_price, 0), 0),
      greatest(coalesce(p_default_sale_price, 0), 0), has_vat_value, vat_value
    ) returning id into category_id_value;
  else
    perform require_permission('Master Data', 'update');
    update categories set
      code = code_value, name_vi = name_value, name_en = name_value,
      status = canonical_master_status(p_status), default_unit_id = unit_id_value,
      default_unit = unit_name_value,
      default_purchase_price = greatest(coalesce(p_default_purchase_price, 0), 0),
      default_sale_price = greatest(coalesce(p_default_sale_price, 0), 0),
      has_vat = has_vat_value, default_vat_rate = vat_value
    where id = p_id and org_id = current_org
    returning id into category_id_value;
    if not found then raise exception 'Category was not found in this organization'; end if;
  end if;
  return category_id_value;
end;
$$;

grant execute on function save_category_defaults(
  uuid, text, text, text, text, numeric, numeric, boolean, numeric
) to authenticated;
revoke execute on function save_category_defaults(
  uuid, text, text, text, text, numeric, numeric, boolean, numeric
) from public, anon;

-- Helper used only inside the bulk import CASE expression. PostgreSQL has no
-- inline RAISE expression, so invalid flags are rejected here with a useful
-- row-level message.
create or replace function raise_exception_boolean(p_value text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  raise exception 'VAT flag "%" is invalid', coalesce(p_value, '');
end;
$$;
revoke execute on function raise_exception_boolean(text) from public, anon, authenticated;

create or replace function import_category_defaults(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  row_number integer := 0;
  imported integer := 0;
  has_vat_value boolean;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Category import payload must be an array';
  end if;
  perform require_permission('Master Data', 'create');
  for item in select value from jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    begin
      has_vat_value := case lower(trim(coalesce(item->>'has_vat', 'false')))
        when 'true' then true when '1' then true when 'yes' then true when 'có' then true when 'co' then true
        when 'false' then false when '0' then false when 'no' then false when 'không' then false when 'khong' then false
        else raise_exception_boolean(item->>'has_vat') end;
      perform save_category_defaults(
        null,
        item->>'code', item->>'name', item->>'status', item->>'default_unit',
        coalesce(nullif(trim(item->>'default_purchase_price'), '')::numeric, 0),
        coalesce(nullif(trim(item->>'default_sale_price'), '')::numeric, 0),
        has_vat_value,
        coalesce(nullif(trim(item->>'default_vat_rate'), '')::numeric, 0)
      );
      imported := imported + 1;
    exception when others then
      raise exception 'Category import data row %: %', row_number, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('imported', imported);
end;
$$;
grant execute on function import_category_defaults(jsonb) to authenticated;
revoke execute on function import_category_defaults(jsonb) from public, anon;

-- Add Category Default to the existing durable reference types.
alter table quotation_item_references
  add column if not exists reference_category_id uuid references categories(id) on delete set null;
alter table quotation_item_references
  drop constraint if exists quotation_item_references_reference_type_check;
alter table quotation_item_references
  add constraint quotation_item_references_reference_type_check
  check (reference_type in ('SALE', 'IMPORT', 'CATEGORY_DEFAULT', 'MANUAL'));

update quotation_items quotation_item set
  reference_type = upper(reference.snapshot->>'referenceType'),
  reference_quotation_item_id = nullif(reference.snapshot->>'quotationItemId', '')::uuid,
  reference_purchase_price = nullif(reference.snapshot->>'importPrice', '')::numeric,
  reference_sale_price = nullif(reference.snapshot->>'salePrice', '')::numeric,
  price_overridden = case when nullif(reference.snapshot->>'salePrice', '') is null then false
    else quotation_item.selling_price is distinct from (reference.snapshot->>'salePrice')::numeric end
from quotation_item_references reference
where reference.quotation_item_id = quotation_item.id;

-- Extend the existing history resolver without duplicating its sales/import
-- query. Category Default is returned on every request and becomes primary only
-- when no eligible historical quotation exists.
create or replace function get_quotation_reference_v2(
  p_category_id uuid, p_customer_id uuid default null, p_limit integer default 10
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  context_value jsonb;
  default_record jsonb;
  same_customer_value jsonb;
  recent_sales_value jsonb;
  historical_primary jsonb;
begin
  context_value := get_quotation_reference(p_category_id, p_customer_id, p_limit);
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'quotationLabel', coalesce(quotation.quotation_number, item.value->>'quotationLabel'),
      'importUnit', quotation_item.sell_unit,
      'hasVat', coalesce(quotation_item.vat_pct, 0) > 0
    ) order by item.ordinality
  ), '[]'::jsonb)
  into same_customer_value
  from jsonb_array_elements(coalesce(context_value->'sameCustomer', '[]'::jsonb))
    with ordinality item(value, ordinality)
  left join quotations quotation on quotation.id = (item.value->>'quotationId')::uuid
    and quotation.org_id = get_org_id()
  left join quotation_items quotation_item
    on quotation_item.id = (item.value->>'quotationItemId')::uuid
    and quotation_item.quotation_id = quotation.id
  where lower(coalesce(item.value->>'quotationStatus', '')) not in
    ('draft', 'pending', 'pending approval', 'cancelled', 'rejected');
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'quotationLabel', coalesce(quotation.quotation_number, item.value->>'quotationLabel'),
      'importUnit', quotation_item.sell_unit,
      'hasVat', coalesce(quotation_item.vat_pct, 0) > 0
    ) order by item.ordinality
  ), '[]'::jsonb)
  into recent_sales_value
  from jsonb_array_elements(coalesce(context_value->'recentSales', '[]'::jsonb))
    with ordinality item(value, ordinality)
  left join quotations quotation on quotation.id = (item.value->>'quotationId')::uuid
    and quotation.org_id = get_org_id()
  left join quotation_items quotation_item
    on quotation_item.id = (item.value->>'quotationItemId')::uuid
    and quotation_item.quotation_id = quotation.id
  where lower(coalesce(item.value->>'quotationStatus', '')) not in
    ('draft', 'pending', 'pending approval', 'cancelled', 'rejected');
  historical_primary := coalesce(same_customer_value->0, recent_sales_value->0);
  select jsonb_build_object(
    'referenceType', 'CATEGORY_DEFAULT',
    'categoryId', category.id,
    'categoryName', coalesce(category.name_vi, category.name_en, category.code),
    'importUnit', coalesce(category.default_unit, unit.name_vi, unit.name_en, unit.code),
    'importPrice', category.default_purchase_price,
    'salePrice', category.default_sale_price,
    'vatPct', category.default_vat_rate,
    'hasVat', category.has_vat,
    'referenceDate', null
  ) into default_record
  from categories category
  left join units unit on unit.id = category.default_unit_id and unit.org_id = category.org_id
  where category.id = p_category_id and category.org_id = get_org_id()
    and lower(category.status) = 'active';
  if not found then raise exception 'Quotation category is inactive or outside this organization'; end if;

  return (context_value - 'primary' - 'matchType' - 'sameCustomer' - 'recentSales') || jsonb_build_object(
    'sameCustomer', same_customer_value,
    'recentSales', recent_sales_value,
    'categoryDefault', default_record,
    'primary', coalesce(historical_primary, default_record),
    'matchType', case when jsonb_array_length(same_customer_value) > 0 then 'CUSTOMER_AND_CATEGORY'
      when jsonb_array_length(recent_sales_value) > 0 then 'CATEGORY_ONLY'
      else 'CATEGORY_DEFAULT' end
  );
end;
$$;

grant execute on function get_quotation_reference_v2(uuid, uuid, integer) to authenticated;
revoke execute on function get_quotation_reference_v2(uuid, uuid, integer) from public, anon;

-- Save the extended header and line fields after the established atomic save
-- command succeeds. The nested call runs in this same transaction.
create or replace function save_quotation_v2(
  p_id uuid, p_customer_id uuid, p_customer_name text, p_warehouse_id uuid,
  p_date date, p_valid_until date, p_status text, p_discount_val numeric,
  p_discount_type text, p_notes text, p_items jsonb, p_created_by text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_org uuid := get_org_id();
  quotation_id_value uuid;
  item jsonb;
  base_items jsonb;
  item_category_id uuid;
  quotation_item_id_value uuid;
  reference_snapshot jsonb;
  line_subtotal numeric;
  line_vat numeric;
begin
  select coalesce(jsonb_agg(
    (case when upper(coalesce(value->'reference'->>'referenceType', '')) = 'CATEGORY_DEFAULT'
      then value - 'reference' else value end)
    || jsonb_build_object(
      'vat_pct', case when coalesce((value->>'has_vat')::boolean,
        coalesce(nullif(value->>'vat_pct', '')::numeric, 0) > 0)
        then greatest(coalesce(nullif(value->>'vat_pct', '')::numeric, 0), 0)
        else 0 end
    ) order by ordinality
  ), '[]'::jsonb) into base_items
  from jsonb_array_elements(p_items) with ordinality source(value, ordinality);

  quotation_id_value := save_quotation(
    p_id, p_customer_id, p_customer_name, p_warehouse_id, p_date,
    p_valid_until, p_status, p_discount_val, p_discount_type, p_notes,
    base_items, p_created_by
  );

  for item in select value from jsonb_array_elements(p_items) loop
    quotation_item_id_value := null;
    reference_snapshot := null;
    item_category_id := (item->>'category_id')::uuid;
    if coalesce((item->>'has_vat')::boolean,
      coalesce(nullif(item->>'vat_pct', '')::numeric, 0) > 0)
      and (coalesce(nullif(item->>'vat_pct', '')::numeric, 0) <= 0
        or coalesce(nullif(item->>'vat_pct', '')::numeric, 0) > 100) then
      raise exception 'VAT rate must be greater than 0 and at most 100 when VAT is enabled';
    end if;
    line_subtotal := greatest(coalesce(nullif(item->>'selling_price', '')::numeric, 0), 0)
      * greatest(coalesce(nullif(item->>'qty', '')::numeric, 0), 0);
    line_vat := case when coalesce((item->>'has_vat')::boolean,
        coalesce(nullif(item->>'vat_pct', '')::numeric, 0) > 0)
      then line_subtotal * greatest(coalesce(nullif(item->>'vat_pct', '')::numeric, 0), 0) / 100
      else 0 end;

    select id into quotation_item_id_value from quotation_items
    where quotation_id = quotation_id_value and category_id = item_category_id;
    if quotation_item_id_value is null then
      raise exception 'Saved quotation item was not found for category %', item_category_id;
    end if;

    if upper(coalesce(item->'reference'->>'referenceType', '')) = 'CATEGORY_DEFAULT' then
      insert into quotation_item_references (
        org_id, quotation_item_id, reference_type, reference_entity_id,
        reference_category_id, snapshot
      )
      select current_org, quotation_item_id_value, 'CATEGORY_DEFAULT', category.id,
        category.id,
        jsonb_build_object(
          'referenceType', 'CATEGORY_DEFAULT',
          'categoryId', category.id,
          'categoryName', coalesce(category.name_vi, category.name_en, category.code),
          'importUnit', coalesce(category.default_unit, unit.name_vi, unit.name_en, unit.code),
          'importPrice', category.default_purchase_price,
          'salePrice', category.default_sale_price,
          'vatPct', category.default_vat_rate,
          'hasVat', category.has_vat,
          'referenceDate', current_date
        )
      from categories category
      left join units unit on unit.id = category.default_unit_id and unit.org_id = category.org_id
      where category.id = item_category_id and category.org_id = current_org;
    end if;

    select snapshot into reference_snapshot from quotation_item_references
    where quotation_item_id = quotation_item_id_value;
    update quotation_items set
      offered_description = coalesce(nullif(item->>'offered_description', ''), category_name),
      specification_brand = nullif(item->>'specification_brand', ''),
      unit_snapshot = nullif(item->>'sell_unit', ''),
      has_vat = coalesce((item->>'has_vat')::boolean,
        coalesce(nullif(item->>'vat_pct', '')::numeric, 0) > 0),
      note = nullif(item->>'note', ''),
      subtotal_snapshot = line_subtotal,
      vat_amount = line_vat,
      total_after_tax = line_subtotal + line_vat,
      reference_type = nullif(upper(coalesce(reference_snapshot->>'referenceType', '')), ''),
      reference_quotation_item_id = nullif(reference_snapshot->>'quotationItemId', '')::uuid,
      reference_purchase_price = nullif(reference_snapshot->>'importPrice', '')::numeric,
      reference_sale_price = nullif(reference_snapshot->>'salePrice', '')::numeric,
      price_overridden = case when nullif(reference_snapshot->>'salePrice', '') is null then false
        else selling_price is distinct from (reference_snapshot->>'salePrice')::numeric end
    where id = quotation_item_id_value;
  end loop;

  update quotations quotation set
    quotation_number = coalesce(nullif(trim(p_metadata->>'quotationNumber'), ''),
      quotation.quotation_number,
      'QT-' || to_char(coalesce(p_date, current_date), 'YYYYMMDD') || '-' || upper(left(quotation.id::text, 8))),
    title = coalesce(nullif(trim(p_metadata->>'title'), ''), quotation.title,
      'BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG'),
    project = nullif(trim(p_metadata->>'project'), ''),
    customer_representative = customer.representative,
    customer_address = customer.address,
    customer_phone = customer.phone,
    customer_email = customer.email,
    customer_tax_code = customer.tax_code,
    salesperson_phone = nullif(trim(p_metadata->>'salespersonPhone'), ''),
    payment_terms = nullif(p_metadata->>'paymentTerms', ''),
    delivery_terms = nullif(p_metadata->>'deliveryTerms', ''),
    footer_notes = nullif(p_metadata->>'footerNotes', ''),
    include_shipping = coalesce((p_metadata->>'includeShipping')::boolean, true),
    template_version_id = coalesce(nullif(p_metadata->>'templateVersionId', '')::uuid,
      quotation.template_version_id),
    version = case when p_id is null then quotation.version else quotation.version + 1 end,
    updated_at = now()
  from customers customer
  where quotation.id = quotation_id_value and quotation.org_id = current_org
    and customer.id = quotation.customer_id and customer.org_id = current_org;
  return quotation_id_value;
end;
$$;

grant execute on function save_quotation_v2(
  uuid, uuid, text, uuid, date, date, text, numeric, text, text, jsonb, text, jsonb
) to authenticated;
revoke execute on function save_quotation_v2(
  uuid, uuid, text, uuid, date, date, text, numeric, text, text, jsonb, text, jsonb
) from public, anon;

create or replace function save_quotation_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare current_org uuid := get_org_id(); validity_days integer;
begin
  perform require_permission('Administration', 'update');
  validity_days := coalesce(nullif(p_settings->>'defaultValidityDays', '')::integer, 7);
  if validity_days < 1 or validity_days > 365 then
    raise exception 'Default quotation validity must be between 1 and 365 days';
  end if;
  insert into quotation_settings (
    org_id, default_title, default_payment_terms, default_delivery_terms,
    default_validity_days, default_include_shipping, default_footer_notes, updated_at
  ) values (
    current_org,
    coalesce(nullif(trim(p_settings->>'defaultTitle'), ''), 'BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG'),
    coalesce(p_settings->>'defaultPaymentTerms', ''),
    coalesce(p_settings->>'defaultDeliveryTerms', ''), validity_days,
    coalesce((p_settings->>'defaultIncludeShipping')::boolean, true),
    nullif(p_settings->>'defaultFooterNotes', ''), now()
  ) on conflict (org_id) do update set
    default_title = excluded.default_title,
    default_payment_terms = excluded.default_payment_terms,
    default_delivery_terms = excluded.default_delivery_terms,
    default_validity_days = excluded.default_validity_days,
    default_include_shipping = excluded.default_include_shipping,
    default_footer_notes = excluded.default_footer_notes,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function save_quotation_settings(jsonb) to authenticated;
revoke execute on function save_quotation_settings(jsonb) from public, anon;

-- The UI checks this immediately before exporting an already-saved quotation.
create or replace function assert_quotation_version(p_quotation_id uuid, p_version integer)
returns void
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from quotations
    where id = p_quotation_id and org_id = get_org_id() and version = p_version
  ) then
    raise exception 'Quotation has changed. Refresh the preview before exporting.';
  end if;
end;
$$;

grant execute on function assert_quotation_version(uuid, integer) to authenticated;
revoke execute on function assert_quotation_version(uuid, integer) from public, anon;
