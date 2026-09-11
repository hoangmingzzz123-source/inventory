-- Keep master-data status values canonical while accepting localized imports.
-- Existing quotation functions compare status with "active", so normalizing at
-- the write boundary keeps lookups, save, allocation, and conversion consistent.

create or replace function canonical_master_status(p_status text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_status is null or btrim(p_status) = '' then 'Active'
    when lower(regexp_replace(btrim(p_status), '[[:space:]]+', ' ', 'g')) in (
      'active',
      'enabled',
      'enable',
      'hoạt động',
      'đang hoạt động',
      'hoat dong',
      'dang hoat dong',
      'kích hoạt',
      'đã kích hoạt',
      'kich hoat',
      'da kich hoat'
    ) then 'Active'
    when lower(regexp_replace(btrim(p_status), '[[:space:]]+', ' ', 'g')) in (
      'inactive',
      'disabled',
      'disable',
      'không hoạt động',
      'ngừng hoạt động',
      'ngưng hoạt động',
      'tạm ngưng',
      'khong hoat dong',
      'ngung hoat dong',
      'tam ngung'
    ) then 'Inactive'
    else btrim(p_status)
  end
$$;

create or replace function normalize_master_status_on_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.status := canonical_master_status(new.status);
  return new;
end;
$$;

-- Normalize records that were created before this compatibility migration.
-- Blank values came from the former master-data form default and follow the
-- schema's intended default of Active.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'categories', 'brands', 'units', 'warehouses', 'customers', 'suppliers'
  ] loop
    execute format(
      'update public.%I set status = public.canonical_master_status(status) where status is distinct from public.canonical_master_status(status)',
      table_name
    );

    execute format(
      'drop trigger if exists normalize_master_status_before_write on public.%I',
      table_name
    );
    execute format(
      'create trigger normalize_master_status_before_write before insert or update of status on public.%I for each row execute function public.normalize_master_status_on_write()',
      table_name
    );
  end loop;
end $$;

-- These functions are implementation details. Table triggers can execute them,
-- but API roles must not expose them as arbitrary RPC endpoints.
revoke execute on function canonical_master_status(text) from public, anon, authenticated;
revoke execute on function normalize_master_status_on_write() from public, anon, authenticated;
