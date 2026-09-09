-- Production-readiness pass for databases already migrated through 20260915000000.
-- Keep previously applied migrations immutable; all review fixes are consolidated here.
-- Close signup/RBAC gaps and make document writes atomic.

-- SECURITY DEFINER functions below resolve application tables from public.
-- Keep that schema usable but prevent API roles from creating shadow objects.
revoke create on schema public from public;

alter table products add column if not exists tax_pct numeric(5,2) not null default 0;
alter table products add column if not exists min_qty numeric(18,2) not null default 0;
alter table products add column if not exists max_qty numeric(18,2) not null default 0;
alter table products add column if not exists description text;
alter table products add column if not exists track_inventory boolean not null default true;
alter table products add column if not exists track_serial boolean not null default false;
alter table products add column if not exists track_batch boolean not null default false;
alter table products add column if not exists allow_negative boolean not null default false;

-- purchase_order_items.total is a stored generated column that depends on qty.
-- PostgreSQL cannot change qty's type while that dependency exists, so rebuild
-- the derived column around the type change. No source data is lost: total is
-- recalculated from qty * unit_cost when the column is added again.
alter table purchase_order_items drop column if exists total;
alter table purchase_order_items alter column qty type numeric(18,2) using qty::numeric;
alter table purchase_order_items
  add column if not exists total numeric(18,0)
  generated always as (qty * unit_cost) stored;

alter table inventory_balance alter column qty type numeric(18,2) using qty::numeric;
alter table inventory_balance alter column min_qty type numeric(18,2) using min_qty::numeric;
alter table inventory_balance alter column max_qty type numeric(18,2) using max_qty::numeric;
alter table quotations add column if not exists warehouse_id uuid references warehouses(id);
alter table purchase_orders add column if not exists expected_date date;
alter table purchase_orders add column if not exists due_date date;
alter table purchase_orders add column if not exists payment_status text not null default 'Unpaid';
alter table invoices add column if not exists due_date date;
alter table invoices add column if not exists customer_id uuid references customers(id);

create table if not exists organization_invitations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null,
  token uuid not null default uuid_generate_v4() unique,
  invited_by uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists organization_invitations_org_email_idx
  on organization_invitations(org_id, lower(email), created_at desc);

update purchase_orders
set payment_status = case
  when total > 0 and paid_amount >= total then 'Paid'
  when paid_amount > 0 then 'Partial'
  else 'Unpaid'
end;

update invoices
set due_date = (created_at at time zone 'Asia/Ho_Chi_Minh')::date + 30
where due_date is null;

update invoices invoice
set customer_id = sales_order.customer_id
from sales_orders sales_order
where invoice.customer_id is null and invoice.so_id = sales_order.id
  and invoice.org_id = sales_order.org_id;

-- RLS helper: fixed search path and authenticated-only execution prevent an
-- untrusted schema from changing how the SECURITY DEFINER function resolves.
create or replace function get_org_id()
returns uuid
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select org_id from profiles where id = auth.uid()
$$;
revoke execute on function get_org_id() from public, anon;
grant execute on function get_org_id() to authenticated;

-- Repair the base migration's generic CRUD policies without modifying that
-- already-applied migration. Child tables do not have org_id, so their checks
-- must follow the organization-owned parent row instead.
do $$
declare table_name text;
begin
  foreach table_name in array array['roles','products','categories','brands','units','warehouses','customers','suppliers',
    'quotations','purchase_orders','goods_receipts','sales_orders','inventory_balance','invoices','cash_book'] loop
    execute format('drop policy if exists "org_isolation" on %I', table_name);
    execute format('drop policy if exists %I on %I', 'org_insert_' || table_name, table_name);
    execute format('drop policy if exists %I on %I', 'org_update_' || table_name, table_name);
    execute format('drop policy if exists %I on %I', 'org_delete_' || table_name, table_name);
    execute format('create policy "org_isolation" on %I for select using (org_id = get_org_id())', table_name);
    execute format('create policy %I on %I for insert with check (org_id = get_org_id())',
      'org_insert_' || table_name, table_name);
    execute format('create policy %I on %I for update using (org_id = get_org_id()) with check (org_id = get_org_id())',
      'org_update_' || table_name, table_name);
    execute format('create policy %I on %I for delete using (org_id = get_org_id())',
      'org_delete_' || table_name, table_name);
  end loop;
end $$;

drop policy if exists "org_isolation" on role_permissions;
drop policy if exists "org_insert_role_permissions" on role_permissions;
drop policy if exists "org_update_role_permissions" on role_permissions;
drop policy if exists "org_delete_role_permissions" on role_permissions;
create policy "org_isolation" on role_permissions for select using (
  role_id in (select id from roles where org_id = get_org_id())
);
create policy "org_insert_role_permissions" on role_permissions for insert with check (
  role_id in (select id from roles where org_id = get_org_id())
);
create policy "org_update_role_permissions" on role_permissions for update using (
  role_id in (select id from roles where org_id = get_org_id())
) with check (
  role_id in (select id from roles where org_id = get_org_id())
);
create policy "org_delete_role_permissions" on role_permissions for delete using (
  role_id in (select id from roles where org_id = get_org_id())
);

drop policy if exists "org_isolation" on quotation_items;
drop policy if exists "org_insert_quotation_items" on quotation_items;
drop policy if exists "org_update_quotation_items" on quotation_items;
drop policy if exists "org_delete_quotation_items" on quotation_items;
create policy "org_isolation" on quotation_items for select using (
  quotation_id in (select id from quotations where org_id = get_org_id())
);
create policy "org_insert_quotation_items" on quotation_items for insert with check (
  quotation_id in (select id from quotations where org_id = get_org_id())
);
create policy "org_update_quotation_items" on quotation_items for update using (
  quotation_id in (select id from quotations where org_id = get_org_id())
) with check (
  quotation_id in (select id from quotations where org_id = get_org_id())
);
create policy "org_delete_quotation_items" on quotation_items for delete using (
  quotation_id in (select id from quotations where org_id = get_org_id())
);

drop policy if exists "org_isolation" on purchase_order_items;
drop policy if exists "org_insert_purchase_order_items" on purchase_order_items;
drop policy if exists "org_update_purchase_order_items" on purchase_order_items;
drop policy if exists "org_delete_purchase_order_items" on purchase_order_items;
create policy "org_isolation" on purchase_order_items for select using (
  po_id in (select id from purchase_orders where org_id = get_org_id())
);
create policy "org_insert_purchase_order_items" on purchase_order_items for insert with check (
  po_id in (select id from purchase_orders where org_id = get_org_id())
);
create policy "org_update_purchase_order_items" on purchase_order_items for update using (
  po_id in (select id from purchase_orders where org_id = get_org_id())
) with check (
  po_id in (select id from purchase_orders where org_id = get_org_id())
);
create policy "org_delete_purchase_order_items" on purchase_order_items for delete using (
  po_id in (select id from purchase_orders where org_id = get_org_id())
);

drop policy if exists "company_settings_read" on company_settings;
drop policy if exists "company_settings_insert" on company_settings;
drop policy if exists "company_settings_update" on company_settings;
drop policy if exists "company_settings_delete" on company_settings;
create policy "company_settings_read" on company_settings for select using (org_id = get_org_id());
create policy "company_settings_insert" on company_settings for insert with check (org_id = get_org_id());
create policy "company_settings_update" on company_settings for update using (org_id = get_org_id())
  with check (org_id = get_org_id());
create policy "company_settings_delete" on company_settings for delete using (org_id = get_org_id());

alter table organization_invitations enable row level security;
drop policy if exists "org_invitation_read" on organization_invitations;
create policy "org_invitation_read" on organization_invitations for select
using (org_id = get_org_id());
revoke all on organization_invitations from anon, authenticated;

-- Every organization needs stable role codes for require_permission().
insert into roles (org_id, code, name_vi, name_en, is_system, description)
select organization.id, seed.code, seed.name_vi, seed.name_en, true, seed.description
from organizations organization
cross join (values
  ('admin', 'Quản trị viên', 'Administrator', 'Full organization access'),
  ('manager', 'Quản lý', 'Manager', 'Operational management access'),
  ('staff', 'Nhân viên', 'Staff', 'Day-to-day operational access')
) as seed(code, name_vi, name_en, description)
on conflict (org_id, code) do nothing;

insert into role_permissions (role_id, module, action, allowed)
select role.id, module_name, action_name, true
from roles role
cross join unnest(array['Dashboard','Master Data','Inventory','Purchase','Sales','Finance','Reports']) module_name
cross join unnest(array['view','create','update','approve','export']) action_name
where lower(role.code) = 'manager'
on conflict (role_id, module, action) do nothing;

insert into role_permissions (role_id, module, action, allowed)
select role.id, module_name, action_name, true
from roles role
cross join unnest(array['Dashboard','Master Data','Inventory','Purchase','Sales','Reports']) module_name
cross join unnest(array['view','create','export']) action_name
where lower(role.code) = 'staff'
on conflict (role_id, module, action) do nothing;

-- Administrators are intentionally permission-row independent. This also makes
-- the bootstrap administrator usable before custom permissions are configured.
create or replace function require_permission(p_module text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  current_profile_role text;
  current_role_id uuid;
  allowed_action boolean;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  select lower(role) into current_profile_role from profiles where id = auth.uid() and org_id = current_org;
  if current_profile_role = 'admin' then return; end if;
  select id into current_role_id from roles
  where org_id = current_org and lower(code) = current_profile_role limit 1;
  select allowed into allowed_action from role_permissions
  where role_id = current_role_id and lower(module) = lower(trim(p_module))
    and lower(action) = lower(trim(p_action));
  if coalesce(allowed_action, false) is not true then
    raise exception 'Permission denied: %.%', p_module, p_action;
  end if;
end;
$$;
grant execute on function require_permission(text, text) to authenticated;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_org_id uuid;
  new_role_id uuid;
  invitation organization_invitations%rowtype;
  invite_token_text text := nullif(trim(new.raw_user_meta_data->>'invite_token'), '');
  org_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'org_name'), ''), 'My Organization');
begin
  if invite_token_text is not null then
    if invite_token_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invitation token is invalid';
    end if;
    select * into invitation from organization_invitations
    where token = invite_token_text::uuid for update;
    if not found or invitation.accepted_at is not null or invitation.expires_at <= now() then
      raise exception 'Invitation is invalid or expired';
    end if;
    if lower(trim(invitation.email)) <> lower(trim(coalesce(new.email, ''))) then
      raise exception 'Sign up with the email address that received this invitation';
    end if;
    if not exists (
      select 1 from roles where org_id = invitation.org_id and lower(code) = lower(invitation.role)
    ) then raise exception 'Invitation role is no longer available'; end if;
    insert into profiles (id, email, full_name, role, org_id)
    values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''),
      lower(invitation.role), invitation.org_id);
    update organization_invitations set accepted_at = now() where id = invitation.id;
    return new;
  end if;

  insert into organizations (name) values (org_name) returning id into new_org_id;
  insert into profiles (id, email, full_name, role, org_id)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''), 'admin', new_org_id);

  insert into roles (org_id, code, name_vi, name_en, is_system, description)
  values
    (new_org_id, 'admin', 'Quản trị viên', 'Administrator', true, 'Full organization access'),
    (new_org_id, 'manager', 'Quản lý', 'Manager', true, 'Operational management access'),
    (new_org_id, 'staff', 'Nhân viên', 'Staff', true, 'Day-to-day operational access')
  on conflict (org_id, code) do nothing;

  select id into new_role_id from roles where org_id = new_org_id and code = 'manager';
  insert into role_permissions (role_id, module, action, allowed)
  select new_role_id, module_name, action_name, true
  from unnest(array['Dashboard','Master Data','Inventory','Purchase','Sales','Finance','Reports']) module_name
  cross join unnest(array['view','create','update','approve','export']) action_name
  on conflict (role_id, module, action) do nothing;

  select id into new_role_id from roles where org_id = new_org_id and code = 'staff';
  insert into role_permissions (role_id, module, action, allowed)
  select new_role_id, module_name, action_name, true
  from unnest(array['Dashboard','Master Data','Inventory','Purchase','Sales','Reports']) module_name
  cross join unnest(array['view','create','export']) action_name
  on conflict (role_id, module, action) do nothing;
  return new;
end;
$$;

-- Users may edit their display name, but never their own role. Role changes use
-- the guarded function below.
drop policy if exists "org_profiles_read" on profiles;
create policy "org_profiles_read" on profiles for select using (org_id = get_org_id());
revoke update on profiles from authenticated;
grant update (full_name) on profiles to authenticated;

create or replace function set_organization_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  target_profile profiles%rowtype;
  admin_count integer;
  actor_role text;
  normalized_role text := lower(trim(p_role));
begin
  perform require_permission('Administration', 'update');
  perform pg_advisory_xact_lock(hashtextextended('role-admin:' || current_org::text, 0));
  select * into target_profile from profiles where id = p_user_id and org_id = current_org for update;
  if not found then raise exception 'User was not found in this organization'; end if;
  select lower(role) into actor_role from profiles where id = auth.uid() and org_id = current_org;
  if normalized_role = 'admin' and actor_role <> 'admin' then
    raise exception 'Only an administrator can assign the administrator role';
  end if;
  if lower(target_profile.role) = 'admin' and actor_role <> 'admin' then
    raise exception 'Only an administrator can change another administrator';
  end if;
  if not exists (select 1 from roles where org_id = current_org and lower(code) = normalized_role) then
    raise exception 'Role was not found in this organization';
  end if;
  if lower(target_profile.role) = 'admin' and normalized_role <> 'admin' then
    select count(*) into admin_count from profiles where org_id = current_org and lower(role) = 'admin';
    if admin_count <= 1 then raise exception 'The last administrator cannot be demoted'; end if;
  end if;
  update profiles set role = normalized_role where id = p_user_id and org_id = current_org;
  perform append_audit_event('profiles', 'ROLE_CHANGE', p_user_id::text,
    jsonb_build_object('role', target_profile.role), jsonb_build_object('role', normalized_role));
end;
$$;
grant execute on function set_organization_user_role(uuid, text) to authenticated;

create or replace function create_organization_invitation(p_email text, p_role text default 'staff')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  invitation_token uuid;
  normalized_email text := lower(trim(p_email));
  normalized_role text := lower(trim(p_role));
  actor_role text;
begin
  perform require_permission('Administration', 'create');
  if normalized_email = '' or position('@' in normalized_email) <= 1 then
    raise exception 'A valid invitation email is required';
  end if;
  if exists (select 1 from profiles where org_id = current_org and lower(email) = normalized_email) then
    raise exception 'This email already belongs to the organization';
  end if;
  if not exists (select 1 from roles where org_id = current_org and lower(code) = normalized_role) then
    raise exception 'Invitation role was not found in this organization';
  end if;
  select lower(role) into actor_role from profiles where id = auth.uid() and org_id = current_org;
  if normalized_role = 'admin' and actor_role <> 'admin' then
    raise exception 'Only an administrator can invite another administrator';
  end if;
  update organization_invitations set expires_at = now()
  where org_id = current_org and lower(email) = normalized_email
    and accepted_at is null and expires_at > now();
  insert into organization_invitations (org_id, email, role, invited_by)
  values (current_org, normalized_email, normalized_role, auth.uid())
  returning token into invitation_token;
  perform append_audit_event('organization_invitations', 'CREATE', normalized_email, null,
    jsonb_build_object('role', normalized_role, 'expires_in_days', 7));
  return invitation_token;
end;
$$;
grant execute on function create_organization_invitation(text, text) to authenticated;

-- Internal helpers must not be callable as arbitrary cross-organization write APIs.
revoke execute on function append_inventory_movement(uuid, text, text, uuid, text, text, uuid, text, numeric, numeric, numeric, text) from public, authenticated;
revoke execute on function append_audit_event(text, text, text, jsonb, jsonb) from public, authenticated;

create or replace function upsert_product_with_opening_stock(
  p_id uuid, p_sku text, p_barcode text, p_name text, p_category text, p_brand text, p_unit text,
  p_cost numeric, p_price numeric, p_status text, p_initial_qty numeric, p_warehouse_id uuid,
  p_warehouse_name text, p_updated_by text, p_tax_pct numeric, p_min_qty numeric, p_max_qty numeric,
  p_description text, p_track_inventory boolean, p_track_serial boolean, p_track_batch boolean,
  p_allow_negative boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  product_id uuid;
  is_new boolean := false;
  receipt_id uuid;
  receipt_ref text;
  actor_name text;
  warehouse_name_value text;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_sku), '') is null then raise exception 'Product SKU is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if coalesce(p_initial_qty, 0) < 0 then raise exception 'Opening quantity cannot be negative'; end if;
  if coalesce(p_initial_qty, 0) > 0 and p_warehouse_id is null then raise exception 'Opening warehouse is required'; end if;
  if p_warehouse_id is not null then
    select name into warehouse_name_value from warehouses where id = p_warehouse_id and org_id = current_org;
    if not found then raise exception 'Warehouse was not found in this organization'; end if;
  end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  if p_id is not null then
    perform require_permission('Master Data', 'update');
    select id into product_id from products where id = p_id and org_id = current_org for update;
    if not found then raise exception 'Product was not found in this organization'; end if;
  else
    select id into product_id from products where org_id = current_org and sku = trim(p_sku) for update;
    if product_id is null then
      perform require_permission('Master Data', 'create');
      insert into products (org_id, sku, barcode, name, category, brand, unit, cost, price, qty, status,
        updated_by, tax_pct, min_qty, max_qty, description, track_inventory, track_serial, track_batch, allow_negative)
      values (current_org, trim(p_sku), nullif(trim(p_barcode), ''), trim(p_name), nullif(trim(p_category), ''),
        nullif(trim(p_brand), ''), nullif(trim(p_unit), ''), greatest(coalesce(p_cost, 0), 0),
        greatest(coalesce(p_price, 0), 0), 0, coalesce(nullif(trim(p_status), ''), 'Active'), actor_name,
        greatest(coalesce(p_tax_pct, 0), 0), greatest(coalesce(p_min_qty, 0), 0), greatest(coalesce(p_max_qty, 0), 0),
        nullif(trim(p_description), ''), coalesce(p_track_inventory, true), coalesce(p_track_serial, false),
        coalesce(p_track_batch, false), coalesce(p_allow_negative, false))
      returning id into product_id;
      is_new := true;
    else
      perform require_permission('Master Data', 'update');
    end if;
  end if;

  if not is_new then
    update products set sku = trim(p_sku), barcode = nullif(trim(p_barcode), ''), name = trim(p_name),
      category = nullif(trim(p_category), ''), brand = nullif(trim(p_brand), ''), unit = nullif(trim(p_unit), ''),
      cost = greatest(coalesce(p_cost, 0), 0), price = greatest(coalesce(p_price, 0), 0),
      status = coalesce(nullif(trim(p_status), ''), status), updated_at = now(), updated_by = actor_name,
      tax_pct = greatest(coalesce(p_tax_pct, 0), 0), min_qty = greatest(coalesce(p_min_qty, 0), 0),
      max_qty = greatest(coalesce(p_max_qty, 0), 0), description = nullif(trim(p_description), ''),
      track_inventory = coalesce(p_track_inventory, track_inventory), track_serial = coalesce(p_track_serial, track_serial),
      track_batch = coalesce(p_track_batch, track_batch), allow_negative = coalesce(p_allow_negative, allow_negative)
    where id = product_id and org_id = current_org;
  end if;

  if is_new and coalesce(p_initial_qty, 0) > 0 then
    perform require_permission('Inventory', 'create');
    receipt_ref := 'INIT-' || trim(p_sku) || '-' || left(product_id::text, 8);
    insert into goods_receipts (org_id, ref, supplier_name, warehouse_id, warehouse_name, items, status, created_by)
    values (current_org, receipt_ref, 'Opening Balance', p_warehouse_id, warehouse_name_value, 1, 'Completed', actor_name)
    returning id into receipt_id;
    insert into goods_receipt_items (receipt_id, product_id, product_name, sku, qty, unit_cost, unit)
    select receipt_id, id, name, sku, p_initial_qty, cost, unit from products where id = product_id;
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    select current_org, receipt_ref, 'OPENING_BALANCE', id, name, sku, p_warehouse_id, warehouse_name_value,
      p_initial_qty, 0, cost, actor_name from products where id = product_id;
  end if;
  return product_id;
end;
$$;
grant execute on function upsert_product_with_opening_stock(uuid, text, text, text, text, text, text, numeric, numeric, text, numeric, uuid, text, text, numeric, numeric, numeric, text, boolean, boolean, boolean, boolean) to authenticated;

-- Explicit operational tool for legacy products whose old quantity predates
-- inventory_ledger. A real warehouse must be chosen; the function never guesses.
create or replace function backfill_legacy_product_opening_stock(p_product_id uuid, p_warehouse_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  product_row products%rowtype;
  warehouse_name_value text;
  receipt_id uuid;
  receipt_ref text;
  actor_name text;
begin
  perform require_permission('Inventory', 'approve');
  select * into product_row from products
  where id = p_product_id and org_id = current_org for update;
  if not found then raise exception 'Product was not found in this organization'; end if;
  if coalesce(product_row.qty, 0) <= 0 then raise exception 'The legacy product quantity is not positive'; end if;
  if exists (select 1 from inventory_ledger where org_id = current_org and product_id = product_row.id) then
    raise exception 'This product already has ledger history; use an inventory adjustment instead';
  end if;
  select name into warehouse_name_value from warehouses
  where id = p_warehouse_id and org_id = current_org;
  if not found then raise exception 'A valid opening warehouse is required'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  receipt_ref := 'LEGACY-INIT-' || product_row.sku || '-' || left(product_row.id::text, 8);
  insert into goods_receipts (
    org_id, ref, supplier_name, warehouse_id, warehouse_name, items, status, created_by
  ) values (
    current_org, receipt_ref, 'Legacy Opening Balance', p_warehouse_id,
    warehouse_name_value, 1, 'Completed', actor_name
  ) returning id into receipt_id;
  insert into goods_receipt_items (receipt_id, product_id, product_name, sku, qty, unit_cost, unit)
  values (receipt_id, product_row.id, product_row.name, product_row.sku, product_row.qty,
    greatest(coalesce(product_row.cost, 0), 0), product_row.unit);
  insert into inventory_ledger (
    org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
    warehouse_name, qty_in, qty_out, unit_cost, created_by
  ) values (
    current_org, receipt_ref, 'OPENING_BALANCE', product_row.id, product_row.name,
    product_row.sku, p_warehouse_id, warehouse_name_value, product_row.qty, 0,
    greatest(coalesce(product_row.cost, 0), 0), actor_name
  );
  return receipt_id;
end;
$$;
grant execute on function backfill_legacy_product_opening_stock(uuid, uuid) to authenticated;

create or replace function save_purchase_order(
  p_id uuid, p_ref text, p_supplier_id uuid, p_supplier_name text, p_warehouse_id uuid,
  p_warehouse_name text, p_status text, p_total numeric, p_notes text, p_expected_date date,
  p_items jsonb, p_created_by text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  order_id uuid;
  source_row purchase_orders%rowtype;
  item jsonb;
  product_row products%rowtype;
  computed_total numeric := 0;
  supplier_name_value text;
  warehouse_name_value text;
  actor_name text;
begin
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  if lower(coalesce(nullif(trim(p_status), ''), 'draft')) not in ('draft', 'pending approval', 'approved', 'cancelled') then
    raise exception 'Unsupported purchase order status';
  end if;
  if p_items is not null and exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if p_supplier_id is not null then
    select name into supplier_name_value from suppliers where id = p_supplier_id and org_id = current_org;
    if not found then raise exception 'A valid supplier is required'; end if;
  end if;
  if p_warehouse_id is not null then
    select name into warehouse_name_value from warehouses where id = p_warehouse_id and org_id = current_org;
    if not found then raise exception 'A valid warehouse is required'; end if;
  end if;
  if p_id is null then
    perform require_permission('Purchase', 'create');
    if lower(coalesce(p_status, 'draft')) = 'approved' then
      perform require_permission('Purchase', 'approve');
    end if;
    if nullif(trim(p_ref), '') is null then p_ref := 'PO-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'); end if;
    if p_supplier_id is null then raise exception 'A valid supplier is required'; end if;
    if p_warehouse_id is null then raise exception 'A valid warehouse is required'; end if;
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one purchase order item is required'; end if;
    insert into purchase_orders (org_id, ref, supplier_id, supplier_name, warehouse_id, warehouse_name, status,
      total, notes, expected_date, due_date, outstanding_amount, payment_status, created_by)
    values (current_org, trim(p_ref), p_supplier_id, supplier_name_value, p_warehouse_id, warehouse_name_value,
      initcap(lower(coalesce(nullif(trim(p_status), ''), 'Draft'))), 0, p_notes, p_expected_date, coalesce(p_expected_date, current_date) + 30,
      0, 'Unpaid', actor_name) returning id into order_id;
  else
    select * into source_row from purchase_orders where id = p_id and org_id = current_org for update;
    if not found then raise exception 'Purchase order was not found'; end if;
    if lower(source_row.status) in ('receiving', 'completed') then raise exception 'A received purchase order cannot be edited'; end if;
    if lower(coalesce(p_status, '')) = 'approved' and lower(source_row.status) <> 'approved' then
      perform require_permission('Purchase', 'approve');
    else
      perform require_permission('Purchase', 'update');
    end if;
    if p_items is not null and exists (select 1 from goods_receipts where org_id = current_org and po_id = p_id) then
      raise exception 'Items cannot be changed after receiving has started';
    end if;
    update purchase_orders set ref = coalesce(nullif(trim(p_ref), ''), ref),
      supplier_id = coalesce(p_supplier_id, supplier_id), supplier_name = case when p_supplier_id is not null then supplier_name_value else supplier_name end,
      warehouse_id = coalesce(p_warehouse_id, warehouse_id), warehouse_name = case when p_warehouse_id is not null then warehouse_name_value else warehouse_name end,
      status = case when nullif(trim(p_status), '') is null then status else initcap(lower(trim(p_status))) end, notes = coalesce(p_notes, notes),
      expected_date = coalesce(p_expected_date, expected_date), due_date = coalesce(p_expected_date + 30, due_date), updated_at = now()
    where id = p_id and org_id = current_org;
    order_id := p_id;
  end if;

  if p_items is not null then
    delete from purchase_order_items where po_id = order_id;
    for item in select * from jsonb_array_elements(p_items) loop
      select * into product_row from products where org_id = current_org and
        (id = nullif(item->>'product_id', '')::uuid or sku = nullif(item->>'sku', '')) limit 1;
      if not found then raise exception 'A purchase order product was not found'; end if;
      if coalesce((item->>'qty')::numeric, 0) <= 0 then raise exception 'Purchase quantity must be greater than zero'; end if;
      insert into purchase_order_items (po_id, product_id, product_name, sku, qty, unit_cost)
      values (order_id, product_row.id, product_row.name, product_row.sku, (item->>'qty')::numeric,
        greatest(coalesce((item->>'unit_cost')::numeric, (item->>'price')::numeric, 0), 0));
      computed_total := computed_total + (item->>'qty')::numeric * greatest(coalesce((item->>'unit_cost')::numeric, (item->>'price')::numeric, 0), 0);
    end loop;
    update purchase_orders set total = computed_total, outstanding_amount = greatest(computed_total - paid_amount, 0),
      payment_status = case when paid_amount >= computed_total and computed_total > 0 then 'Paid' when paid_amount > 0 then 'Partial' else 'Unpaid' end,
      updated_at = now() where id = order_id;
  end if;
  return order_id;
end;
$$;
grant execute on function save_purchase_order(uuid, text, uuid, text, uuid, text, text, numeric, text, date, jsonb, text) to authenticated;

create or replace function save_sales_order(
  p_id uuid, p_ref text, p_customer_id uuid, p_customer_name text, p_warehouse_id uuid,
  p_warehouse_name text, p_status text, p_subtotal numeric, p_tax numeric, p_total numeric,
  p_notes text, p_items jsonb, p_created_by text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  order_id uuid;
  source_row sales_orders%rowtype;
  item jsonb;
  product_row products%rowtype;
  computed_subtotal numeric := 0;
  customer_name_value text;
  warehouse_name_value text;
  actor_name text;
begin
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  if lower(coalesce(nullif(trim(p_status), ''), 'draft')) not in ('draft', 'pending approval', 'approved', 'cancelled') then
    raise exception 'Unsupported sales order status';
  end if;
  if p_items is not null and exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if p_customer_id is not null then
    select name into customer_name_value from customers where id = p_customer_id and org_id = current_org;
    if not found then raise exception 'A valid customer is required'; end if;
  end if;
  if p_warehouse_id is not null then
    select name into warehouse_name_value from warehouses where id = p_warehouse_id and org_id = current_org;
    if not found then raise exception 'A valid warehouse is required'; end if;
  end if;
  if p_id is null then
    perform require_permission('Sales', 'create');
    if lower(coalesce(p_status, 'draft')) = 'approved' then
      perform require_permission('Sales', 'approve');
    end if;
    if nullif(trim(p_ref), '') is null then p_ref := 'SO-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'); end if;
    if p_customer_id is null then raise exception 'A valid customer is required'; end if;
    if p_warehouse_id is null then raise exception 'A valid warehouse is required'; end if;
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one sales order item is required'; end if;
    insert into sales_orders (org_id, ref, customer_id, customer_name, warehouse_id, warehouse_name, status,
      subtotal, tax, total, notes, created_by)
    values (current_org, trim(p_ref), p_customer_id, customer_name_value, p_warehouse_id, warehouse_name_value,
      initcap(lower(coalesce(nullif(trim(p_status), ''), 'Draft'))), 0, greatest(coalesce(p_tax, 0), 0), 0, p_notes, actor_name)
    returning id into order_id;
  else
    select * into source_row from sales_orders where id = p_id and org_id = current_org for update;
    if not found then raise exception 'Sales order was not found'; end if;
    if lower(source_row.status) in ('partial', 'delivered') then raise exception 'A delivered sales order cannot be edited'; end if;
    if lower(coalesce(p_status, '')) = 'approved' and lower(source_row.status) <> 'approved' then
      perform require_permission('Sales', 'approve');
    else
      perform require_permission('Sales', 'update');
    end if;
    if p_items is not null and exists (select 1 from delivery_notes where org_id = current_org and sales_order_id = p_id) then
      raise exception 'Items cannot be changed after delivery has started';
    end if;
    update sales_orders set ref = coalesce(nullif(trim(p_ref), ''), ref),
      customer_id = coalesce(p_customer_id, customer_id), customer_name = case when p_customer_id is not null then customer_name_value else customer_name end,
      warehouse_id = coalesce(p_warehouse_id, warehouse_id), warehouse_name = case when p_warehouse_id is not null then warehouse_name_value else warehouse_name end,
      status = case when nullif(trim(p_status), '') is null then status else initcap(lower(trim(p_status))) end, notes = coalesce(p_notes, notes), updated_at = now()
    where id = p_id and org_id = current_org;
    order_id := p_id;
  end if;
  if p_items is not null then
    delete from sales_order_items where sales_order_id = order_id;
    for item in select * from jsonb_array_elements(p_items) loop
      select * into product_row from products where id = nullif(item->>'product_id', '')::uuid and org_id = current_org;
      if not found then raise exception 'A sales order product was not found'; end if;
      if coalesce((item->>'qty')::numeric, 0) <= 0 then raise exception 'Sales quantity must be greater than zero'; end if;
      insert into sales_order_items (sales_order_id, product_id, product_name, sku, qty, unit_price, unit_cost)
      values (order_id, product_row.id, product_row.name, product_row.sku, (item->>'qty')::numeric,
        greatest(coalesce((item->>'unit_price')::numeric, 0), 0), greatest(coalesce((item->>'unit_cost')::numeric, product_row.cost, 0), 0));
      computed_subtotal := computed_subtotal + (item->>'qty')::numeric * greatest(coalesce((item->>'unit_price')::numeric, 0), 0);
    end loop;
    update sales_orders set subtotal = computed_subtotal, tax = greatest(coalesce(p_tax, 0), 0),
      total = computed_subtotal + greatest(coalesce(p_tax, 0), 0), updated_at = now() where id = order_id;
  end if;
  return order_id;
end;
$$;
grant execute on function save_sales_order(uuid, text, uuid, text, uuid, text, text, numeric, numeric, numeric, text, jsonb, text) to authenticated;

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
  purchase_order_row purchase_orders%rowtype;
  quotation_row quotations%rowtype;
  item jsonb;
  product_row products%rowtype;
  item_qty numeric;
  item_cost numeric;
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
    if not found or lower(quotation_row.status) <> 'accepted' then
      raise exception 'An accepted quotation source is required';
    end if;
    if quotation_row.warehouse_id is distinct from p_warehouse_id then
      raise exception 'Receipt warehouse must match the quotation warehouse';
    end if;
    if exists (select 1 from goods_receipts where org_id = current_org and po_id is null and po_ref = quotation_row.id::text) then
      raise exception 'Quotation has already been converted';
    end if;
  end if;

  insert into goods_receipts (org_id, ref, po_id, po_ref, warehouse_id, warehouse_name, supplier_name, items, status, created_by)
  values (current_org, trim(p_ref), purchase_order_row.id, nullif(trim(p_po_ref), ''), p_warehouse_id,
    warehouse_name_value, coalesce(purchase_order_row.supplier_name, nullif(trim(p_supplier_name), ''), 'Unknown Supplier'),
    jsonb_array_length(p_items), 'Completed', actor_name)
  returning id into new_receipt_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    item_cost := greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, 0), 0);
    if item_qty <= 0 then raise exception 'Receipt quantity must be greater than zero'; end if;
    select * into product_row from products where org_id = current_org and
      (id = nullif(item->>'product_id', '')::uuid or sku = nullif(item->>'sku', '')) limit 1;
    if not found then raise exception 'Product was not found for receipt item'; end if;

    if purchase_order_row.id is not null then
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
      select coalesce(sum(qty), 0) into quoted_qty from quotation_items
      where quotation_id = quotation_row.id and product_id = product_row.id;
      select coalesce(sum(receipt_item.qty), 0) into received_qty
      from goods_receipt_items receipt_item
      where receipt_item.receipt_id = new_receipt_id and receipt_item.product_id = product_row.id;
      if quoted_qty <= 0 or received_qty + item_qty > quoted_qty then
        raise exception 'Receipt exceeds quotation quantity for product %', product_row.sku;
      end if;
    end if;

    insert into goods_receipt_items (receipt_id, product_id, product_name, sku, qty, unit_cost, unit)
    values (new_receipt_id, product_row.id, product_row.name, product_row.sku, item_qty,
      case when item_cost > 0 then item_cost else product_row.cost end, coalesce(nullif(item->>'unit', ''), product_row.unit));
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, trim(p_ref), 'RECEIPT', product_row.id, product_row.name, product_row.sku, p_warehouse_id,
      warehouse_name_value, item_qty, 0, case when item_cost > 0 then item_cost else product_row.cost end, actor_name);
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
      select product_id, sum(qty) as quoted_qty from quotation_items
      where quotation_id = quotation_row.id group by product_id
    ) quoted
    where quoted.quoted_qty > coalesce((
      select sum(receipt_item.qty) from goods_receipt_items receipt_item
      where receipt_item.receipt_id = new_receipt_id and receipt_item.product_id = quoted.product_id
    ), 0)
  ) then
    raise exception 'All quotation quantities must be received in one conversion';
  end if;
  return new_receipt_id;
end;
$$;
grant execute on function receive_goods_receipt(text, text, uuid, text, text, jsonb) to authenticated;

create or replace function deliver_sales_order(
  p_ref text, p_sales_order_id uuid, p_sales_order_ref text, p_customer_id uuid,
  p_customer_name text, p_warehouse_id uuid, p_warehouse_name text, p_items jsonb,
  p_created_by text default null, p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  delivery_id uuid;
  created_invoice_id uuid;
  sales_order_row sales_orders%rowtype;
  item jsonb;
  product_row products%rowtype;
  item_product_id uuid;
  item_qty numeric;
  available_qty numeric;
  ordered_qty numeric;
  delivered_qty numeric;
  invoice_amount numeric := 0;
  has_remaining boolean := false;
  delivery_status text;
  actor_name text;
begin
  perform require_permission('Sales', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null then raise exception 'Delivery reference is required'; end if;
  if p_warehouse_id is null or not exists (select 1 from warehouses where id = p_warehouse_id and org_id = current_org) then raise exception 'A valid delivery warehouse is required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one delivery item is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if exists (select 1 from delivery_notes where org_id = current_org and ref = trim(p_ref)) then raise exception 'Delivery reference already exists'; end if;
  if p_sales_order_id is null then raise exception 'A source sales order is required'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  select * into sales_order_row from sales_orders where id = p_sales_order_id and org_id = current_org for update;
  if not found then raise exception 'Sales order was not found'; end if;
  if lower(sales_order_row.status) not in ('approved', 'partial') then raise exception 'Sales order is not approved for delivery'; end if;
  if sales_order_row.warehouse_id is distinct from p_warehouse_id then raise exception 'Delivery warehouse must match the sales order warehouse'; end if;

  insert into delivery_notes (org_id, ref, sales_order_id, sales_order_ref, customer_id, customer_name,
    warehouse_id, warehouse_name, status, note, created_by)
  values (current_org, trim(p_ref), p_sales_order_id, sales_order_row.ref,
    sales_order_row.customer_id, sales_order_row.customer_name,
    p_warehouse_id, sales_order_row.warehouse_name, 'Completed', p_note, actor_name)
  returning id into delivery_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_product_id := nullif(item->>'product_id', '')::uuid;
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    if item_product_id is null or item_qty <= 0 then raise exception 'Delivery item requires a positive quantity and product'; end if;
    select * into product_row from products where id = item_product_id and org_id = current_org for update;
    if not found then raise exception 'Product was not found for delivery'; end if;
    select coalesce(sum(qty_in - qty_out), 0) into available_qty from inventory_ledger
    where org_id = current_org and product_id = item_product_id and warehouse_id = p_warehouse_id;
    if available_qty < item_qty and not product_row.allow_negative then
      raise exception 'Insufficient stock for product %: available %, requested %', product_row.sku, available_qty, item_qty;
    end if;
    if sales_order_row.id is not null then
      select coalesce(sum(qty), 0) into ordered_qty from sales_order_items
      where sales_order_id = sales_order_row.id and product_id = item_product_id;
      select coalesce(sum(delivery_item.qty), 0) into delivered_qty from delivery_note_items delivery_item
      join delivery_notes delivery on delivery.id = delivery_item.delivery_id
      where delivery.sales_order_id = sales_order_row.id and delivery_item.product_id = item_product_id
        and delivery.status <> 'Reversed';
      if ordered_qty <= 0 or delivered_qty + item_qty > ordered_qty then
        raise exception 'Delivery exceeds remaining ordered quantity for product %', product_row.sku;
      end if;
    end if;
    insert into delivery_note_items (delivery_id, product_id, product_name, sku, qty, unit_cost, unit_price)
    values (delivery_id, product_row.id, product_row.name, product_row.sku, item_qty,
      greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0),
      greatest(coalesce(nullif(item->>'unit_price', '')::numeric, 0), 0));
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, trim(p_ref), 'SALE', product_row.id, product_row.name, product_row.sku, p_warehouse_id,
      p_warehouse_name, 0, item_qty, greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0), actor_name);
    invoice_amount := invoice_amount + item_qty * greatest(coalesce(nullif(item->>'unit_price', '')::numeric, 0), 0);
  end loop;

  if sales_order_row.id is not null then
    select exists (
      select 1 from sales_order_items order_item
      where order_item.sales_order_id = sales_order_row.id
        and order_item.qty > coalesce((
          select sum(delivery_item.qty) from delivery_note_items delivery_item
          join delivery_notes delivery on delivery.id = delivery_item.delivery_id
          where delivery.sales_order_id = sales_order_row.id and delivery.status <> 'Reversed'
            and delivery_item.product_id = order_item.product_id
        ), 0)
    ) into has_remaining;
  end if;
  delivery_status := case when has_remaining then 'Partial' else 'Completed' end;
  update delivery_notes set status = delivery_status where id = delivery_id;
  insert into invoices (org_id, ref, so_id, so_ref, customer_id, customer_name, amount, tax, total, status,
    delivery_id, delivery_ref, paid_amount, outstanding_amount, due_date)
  values (current_org, 'INV-' || trim(p_ref), p_sales_order_id, sales_order_row.ref,
    sales_order_row.customer_id, sales_order_row.customer_name, invoice_amount, 0,
    invoice_amount, 'Unpaid', delivery_id, trim(p_ref), 0, invoice_amount, current_date + 30)
  returning id into created_invoice_id;
  update delivery_notes set invoice_id = created_invoice_id, invoice_ref = 'INV-' || trim(p_ref) where id = delivery_id;
  if sales_order_row.id is not null then
    update sales_orders set status = case when has_remaining then 'Partial' else 'Delivered' end,
      updated_at = now() where id = sales_order_row.id;
  end if;
  return delivery_id;
end;
$$;
grant execute on function deliver_sales_order(text, uuid, text, uuid, text, uuid, text, jsonb, text, text) to authenticated;

create or replace function reverse_delivery_note(p_ref text, p_created_by text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  source_delivery delivery_notes%rowtype;
  source_invoice invoices%rowtype;
  item delivery_note_items%rowtype;
  actor_name text;
  has_active_delivery boolean;
  has_remaining boolean;
begin
  perform require_permission('Sales', 'approve');
  select * into source_delivery from delivery_notes
  where org_id = current_org and ref = trim(p_ref) for update;
  if not found then raise exception 'Delivery note was not found'; end if;
  if source_delivery.status = 'Reversed' then raise exception 'Delivery note is already reversed'; end if;
  if exists (select 1 from sales_returns where delivery_id = source_delivery.id and status <> 'Reversed') then
    raise exception 'Reverse active sales returns before reversing this delivery';
  end if;
  select * into source_invoice from invoices
  where org_id = current_org and delivery_id = source_delivery.id for update;
  if found and coalesce(source_invoice.paid_amount, 0) > 0 then
    raise exception 'A paid delivery invoice cannot be reversed';
  end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  for item in select * from delivery_note_items where delivery_id = source_delivery.id loop
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, 'REV-' || trim(p_ref), 'RETURN_IN', item.product_id, item.product_name, item.sku,
      source_delivery.warehouse_id, source_delivery.warehouse_name, item.qty, 0, item.unit_cost, actor_name);
  end loop;
  update delivery_notes set status = 'Reversed' where id = source_delivery.id;
  if source_invoice.id is not null then
    update invoices set status = 'Cancelled', outstanding_amount = 0 where id = source_invoice.id;
  end if;
  if source_delivery.sales_order_id is not null then
    select exists (
      select 1 from delivery_notes
      where sales_order_id = source_delivery.sales_order_id and status <> 'Reversed'
    ) into has_active_delivery;
    select exists (
      select 1 from sales_order_items order_item
      where order_item.sales_order_id = source_delivery.sales_order_id
        and order_item.qty > coalesce((
          select sum(delivery_item.qty) from delivery_note_items delivery_item
          join delivery_notes delivery on delivery.id = delivery_item.delivery_id
          where delivery.sales_order_id = source_delivery.sales_order_id and delivery.status <> 'Reversed'
            and delivery_item.product_id = order_item.product_id
        ), 0)
    ) into has_remaining;
    update sales_orders set status = case
      when not has_active_delivery then 'Approved'
      when has_remaining then 'Partial'
      else 'Delivered'
    end, updated_at = now()
    where id = source_delivery.sales_order_id and org_id = current_org;
  end if;
  return source_delivery.id;
end;
$$;
grant execute on function reverse_delivery_note(text, text) to authenticated;

create table if not exists purchase_returns (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  ref text not null,
  receipt_id uuid not null references goods_receipts(id),
  receipt_ref text not null,
  supplier_name text not null,
  warehouse_id uuid not null references warehouses(id),
  warehouse_name text not null,
  status text not null default 'Completed',
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ref)
);

create table if not exists purchase_return_items (
  id uuid primary key default uuid_generate_v4(),
  return_id uuid not null references purchase_returns(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  sku text not null,
  qty numeric(18,2) not null check (qty > 0),
  unit_cost numeric(18,0) not null default 0,
  created_at timestamptz not null default now()
);

alter table purchase_returns enable row level security;
alter table purchase_return_items enable row level security;

create or replace function create_purchase_return(
  p_ref text, p_receipt_ref text, p_items jsonb, p_reason text default null, p_created_by text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  source_receipt goods_receipts%rowtype;
  return_id uuid;
  item jsonb;
  source_item record;
  item_qty numeric;
  returned_qty numeric;
  available_qty numeric;
  actor_name text;
begin
  perform require_permission('Purchase', 'create');
  if nullif(trim(p_ref), '') is null or nullif(trim(p_receipt_ref), '') is null then raise exception 'Return and receipt references are required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one return item is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  select * into source_receipt from goods_receipts where org_id = current_org and ref = trim(p_receipt_ref) for update;
  if not found then raise exception 'Goods receipt was not found'; end if;
  if exists (select 1 from purchase_returns where org_id = current_org and ref = trim(p_ref)) then raise exception 'Purchase return reference already exists'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  insert into purchase_returns (org_id, ref, receipt_id, receipt_ref, supplier_name, warehouse_id,
    warehouse_name, reason, created_by)
  values (current_org, trim(p_ref), source_receipt.id, source_receipt.ref, source_receipt.supplier_name,
    source_receipt.warehouse_id, source_receipt.warehouse_name, p_reason, actor_name)
  returning id into return_id;
  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    select receipt_item.* into source_item from goods_receipt_items receipt_item
    where receipt_item.receipt_id = source_receipt.id and receipt_item.product_id = nullif(item->>'product_id', '')::uuid;
    if not found or item_qty <= 0 then raise exception 'Purchase return item is invalid'; end if;
    select coalesce(sum(return_item.qty), 0) into returned_qty from purchase_return_items return_item
    join purchase_returns return_header on return_header.id = return_item.return_id
    where return_header.receipt_id = source_receipt.id and return_header.status <> 'Reversed'
      and return_item.product_id = source_item.product_id;
    if returned_qty + item_qty > source_item.qty then raise exception 'Return quantity exceeds received quantity for product %', source_item.sku; end if;
    select coalesce(sum(qty_in - qty_out), 0) into available_qty from inventory_ledger
    where org_id = current_org and product_id = source_item.product_id and warehouse_id = source_receipt.warehouse_id;
    if available_qty < item_qty then raise exception 'Insufficient stock to return product %', source_item.sku; end if;
    insert into purchase_return_items (return_id, product_id, product_name, sku, qty, unit_cost)
    values (return_id, source_item.product_id, source_item.product_name, source_item.sku, item_qty, source_item.unit_cost);
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, trim(p_ref), 'RETURN_OUT', source_item.product_id, source_item.product_name,
      source_item.sku, source_receipt.warehouse_id, source_receipt.warehouse_name, 0, item_qty,
      source_item.unit_cost, actor_name);
  end loop;
  return return_id;
end;
$$;
grant execute on function create_purchase_return(text, text, jsonb, text, text) to authenticated;

create or replace function reverse_purchase_return(p_ref text, p_created_by text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare current_org uuid := get_org_id(); source_row purchase_returns%rowtype; item purchase_return_items%rowtype; actor_name text;
begin
  perform require_permission('Purchase', 'approve');
  select * into source_row from purchase_returns where org_id = current_org and ref = p_ref for update;
  if not found then raise exception 'Purchase return was not found'; end if;
  if source_row.status = 'Reversed' then raise exception 'Purchase return is already reversed'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  for item in select * from purchase_return_items where return_id = source_row.id loop
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, 'REV-' || p_ref, 'RETURN_IN', item.product_id, item.product_name, item.sku,
      source_row.warehouse_id, source_row.warehouse_name, item.qty, 0, item.unit_cost, actor_name);
  end loop;
  update purchase_returns set status = 'Reversed', updated_at = now() where id = source_row.id;
  return source_row.id;
end;
$$;
grant execute on function reverse_purchase_return(text, text) to authenticated;

-- Sales returns must be tied to their source delivery and account for earlier
-- non-reversed returns before adding stock back.
alter table sales_returns add column if not exists updated_at timestamptz default now();

create or replace function create_sales_return(
  p_ref text, p_delivery_ref text, p_warehouse_id uuid, p_warehouse_name text,
  p_items jsonb, p_reason text default null, p_created_by text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  return_id uuid;
  source_delivery delivery_notes%rowtype;
  item jsonb;
  source_item delivery_note_items%rowtype;
  item_qty numeric;
  returned_qty numeric;
  actor_name text;
begin
  perform require_permission('Sales', 'create');
  if nullif(trim(p_ref), '') is null or nullif(trim(p_delivery_ref), '') is null then
    raise exception 'Return and delivery references are required';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one return item is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  select * into source_delivery from delivery_notes
  where org_id = current_org and ref = trim(p_delivery_ref) for update;
  if not found or source_delivery.status = 'Reversed' then raise exception 'An active delivery note was not found'; end if;
  if p_warehouse_id is distinct from source_delivery.warehouse_id then
    raise exception 'Return warehouse must match the delivery warehouse';
  end if;
  if exists (select 1 from sales_returns where org_id = current_org and ref = trim(p_ref)) then
    raise exception 'Return reference already exists';
  end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  insert into sales_returns (org_id, ref, delivery_id, delivery_ref, customer_id, customer_name,
    warehouse_id, warehouse_name, reason, created_by)
  values (current_org, trim(p_ref), source_delivery.id, source_delivery.ref, source_delivery.customer_id,
    source_delivery.customer_name, source_delivery.warehouse_id, source_delivery.warehouse_name,
    p_reason, actor_name) returning id into return_id;
  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    select * into source_item from delivery_note_items
    where delivery_id = source_delivery.id and product_id = nullif(item->>'product_id', '')::uuid;
    if not found or item_qty <= 0 then raise exception 'Sales return item is invalid'; end if;
    select coalesce(sum(return_item.qty), 0) into returned_qty
    from sales_return_items return_item
    join sales_returns return_header on return_header.id = return_item.return_id
    where return_header.delivery_id = source_delivery.id and return_header.status <> 'Reversed'
      and return_item.product_id = source_item.product_id;
    if returned_qty + item_qty > source_item.qty then
      raise exception 'Return quantity exceeds delivered quantity for product %', source_item.sku;
    end if;
    insert into sales_return_items (return_id, product_id, product_name, sku, qty, unit_cost)
    values (return_id, source_item.product_id, source_item.product_name, source_item.sku, item_qty, source_item.unit_cost);
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, trim(p_ref), 'RETURN_IN', source_item.product_id, source_item.product_name,
      source_item.sku, source_delivery.warehouse_id, source_delivery.warehouse_name, item_qty, 0,
      source_item.unit_cost, actor_name);
  end loop;
  return return_id;
end;
$$;
grant execute on function create_sales_return(text, text, uuid, text, jsonb, text, text) to authenticated;

create or replace function reverse_sales_return(p_ref text, p_created_by text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  source_row sales_returns%rowtype;
  item sales_return_items%rowtype;
  available_qty numeric;
  actor_name text;
begin
  perform require_permission('Sales', 'approve');
  select * into source_row from sales_returns where org_id = current_org and ref = trim(p_ref) for update;
  if not found then raise exception 'Sales return was not found'; end if;
  if source_row.status = 'Reversed' then raise exception 'Sales return is already reversed'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  for item in select * from sales_return_items where return_id = source_row.id loop
    select coalesce(sum(qty_in - qty_out), 0) into available_qty from inventory_ledger
    where org_id = current_org and product_id = item.product_id and warehouse_id = source_row.warehouse_id;
    if available_qty < item.qty then raise exception 'Insufficient stock to reverse return for product %', item.sku; end if;
    insert into inventory_ledger (org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by)
    values (current_org, 'REV-' || trim(p_ref), 'RETURN_OUT', item.product_id, item.product_name, item.sku,
      source_row.warehouse_id, source_row.warehouse_name, 0, item.qty, item.unit_cost, actor_name);
  end loop;
  update sales_returns set status = 'Reversed', updated_at = now() where id = source_row.id;
  return source_row.id;
end;
$$;
grant execute on function reverse_sales_return(text, text) to authenticated;

-- Finance settlement changes payment state only. Purchase operational status
-- remains Draft/Approved/Receiving/Completed and is never overwritten by Paid.
create or replace function record_finance_transaction(
  p_ref text, p_transaction_type text, p_source_ref text, p_customer_id uuid,
  p_customer_name text, p_supplier_id uuid, p_supplier_name text, p_amount numeric,
  p_method text default 'Cash', p_description text default null, p_created_by text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  transaction_id uuid;
  source_total numeric;
  source_paid numeric;
  source_customer_id uuid;
  source_customer_name text;
  source_supplier_id uuid;
  source_supplier_name text;
  cash_type text;
  previous_balance numeric := 0;
  next_balance numeric;
  actor_name text;
begin
  perform require_permission('Finance', 'create');
  if nullif(trim(p_ref), '') is null then raise exception 'Finance reference is required'; end if;
  if nullif(trim(p_source_ref), '') is null then raise exception 'A source invoice or purchase order is required'; end if;
  if p_transaction_type not in ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT') then raise exception 'Unsupported finance transaction type'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Finance amount must be greater than zero'; end if;
  if exists (select 1 from finance_transactions where org_id = current_org and ref = trim(p_ref)) then raise exception 'Finance reference already exists'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  if p_transaction_type = 'CUSTOMER_RECEIPT' then
    select total, paid_amount, customer_id, customer_name
    into source_total, source_paid, source_customer_id, source_customer_name
    from invoices where org_id = current_org and ref = trim(p_source_ref)
      and lower(status) <> 'cancelled' for update;
    if not found then raise exception 'Invoice source reference was not found'; end if;
  else
    select total, paid_amount, supplier_id, supplier_name
    into source_total, source_paid, source_supplier_id, source_supplier_name
    from purchase_orders
    where org_id = current_org and ref = trim(p_source_ref)
      and lower(status) in ('approved', 'receiving', 'completed') for update;
    if not found then raise exception 'An approved purchase order source was not found'; end if;
  end if;
  if p_amount > greatest(source_total - source_paid, 0) then raise exception 'Amount exceeds the source outstanding balance'; end if;

  insert into finance_transactions (org_id, ref, transaction_type, source_ref, customer_id, customer_name,
    supplier_id, supplier_name, amount, method, description, created_by)
  values (current_org, trim(p_ref), p_transaction_type, trim(p_source_ref), source_customer_id,
    source_customer_name, source_supplier_id, source_supplier_name, p_amount,
    coalesce(nullif(trim(p_method), ''), 'Cash'), p_description, actor_name)
  returning id into transaction_id;

  perform pg_advisory_xact_lock(hashtextextended(current_org::text, 0));
  select coalesce(balance, 0) into previous_balance from cash_book
  where org_id = current_org order by created_at desc, id desc limit 1 for update;
  previous_balance := coalesce(previous_balance, 0);
  cash_type := case when p_transaction_type = 'CUSTOMER_RECEIPT' then 'Receipt' else 'Payment' end;
  next_balance := previous_balance + case when cash_type = 'Receipt' then p_amount else -p_amount end;
  insert into cash_book (org_id, ref, type, description, amount, balance, created_at)
  values (current_org, trim(p_ref), cash_type, coalesce(p_description, cash_type || ' ' || trim(p_ref)),
    p_amount, next_balance, now());

  if p_transaction_type = 'CUSTOMER_RECEIPT' then
    update invoices set paid_amount = paid_amount + p_amount,
      outstanding_amount = greatest(total - paid_amount - p_amount, 0),
      status = case when paid_amount + p_amount >= total then 'Paid' else 'Partial' end
    where org_id = current_org and ref = trim(p_source_ref);
  else
    update purchase_orders set paid_amount = paid_amount + p_amount,
      outstanding_amount = greatest(total - paid_amount - p_amount, 0),
      payment_status = case when paid_amount + p_amount >= total then 'Paid' else 'Partial' end,
      updated_at = now()
    where org_id = current_org and ref = trim(p_source_ref);
  end if;
  return transaction_id;
end;
$$;
grant execute on function record_finance_transaction(text, text, text, uuid, text, uuid, text, numeric, text, text, text) to authenticated;

-- Quotations are saved as one transaction so a failed line item never leaves a
-- partial header. Status approval is separated from ordinary edits.
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
  supplier_id_value uuid;
  supplier_name_value text;
  customer_name_value text;
  warehouse_name_value text;
  computed_total numeric := 0;
  line_total numeric;
  actor_name text;
begin
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  if lower(coalesce(nullif(trim(p_status), ''), 'draft')) not in ('draft', 'sent', 'accepted', 'rejected', 'cancelled') then raise exception 'Unsupported quotation status'; end if;
  select name into customer_name_value from customers where id = p_customer_id and org_id = current_org;
  if not found then raise exception 'A valid customer is required'; end if;
  select name into warehouse_name_value from warehouses where id = p_warehouse_id and org_id = current_org;
  if not found then raise exception 'A valid receiving warehouse is required'; end if;
  if p_discount_type not in ('pct', 'amount') or coalesce(p_discount_val, 0) < 0 then raise exception 'Discount is invalid'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one quotation item is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if p_id is null then
    perform require_permission('Sales', 'create');
    if lower(coalesce(p_status, 'draft')) in ('accepted', 'approved') then
      perform require_permission('Sales', 'approve');
    end if;
    insert into quotations (org_id, customer_id, customer_name, warehouse_id, date, valid_until,
      status, discount_val, discount_type, notes, total, created_by)
    values (current_org, p_customer_id, customer_name_value, p_warehouse_id, coalesce(p_date, current_date),
      p_valid_until, initcap(lower(coalesce(nullif(trim(p_status), ''), 'Draft'))), coalesce(p_discount_val, 0),
      p_discount_type, p_notes, 0, actor_name) returning id into quotation_id;
  else
    select * into source_row from quotations where id = p_id and org_id = current_org for update;
    if not found then raise exception 'Quotation was not found'; end if;
    if lower(coalesce(p_status, '')) in ('accepted', 'approved') and lower(source_row.status) not in ('accepted', 'approved') then
      perform require_permission('Sales', 'approve');
    else
      perform require_permission('Sales', 'update');
    end if;
    if lower(source_row.status) = 'converted' then raise exception 'A converted quotation cannot be edited'; end if;
    update quotations set customer_id = p_customer_id, customer_name = customer_name_value,
      warehouse_id = p_warehouse_id, date = coalesce(p_date, date), valid_until = p_valid_until,
      status = case when nullif(trim(p_status), '') is null then status else initcap(lower(trim(p_status))) end, discount_val = coalesce(p_discount_val, 0),
      discount_type = p_discount_type, notes = p_notes, updated_at = now()
    where id = p_id and org_id = current_org;
    quotation_id := p_id;
    delete from quotation_items where quotation_id = p_id;
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    select * into product_row from products where id = nullif(item->>'product_id', '')::uuid and org_id = current_org;
    if not found then raise exception 'A quotation product was not found'; end if;
    supplier_id_value := null;
    supplier_name_value := null;
    if nullif(item->>'supplier_id', '') is not null then
      select id, name into supplier_id_value, supplier_name_value
      from suppliers where id = (item->>'supplier_id')::uuid and org_id = current_org;
      if not found then raise exception 'A quotation supplier was not found'; end if;
    end if;
    if coalesce(nullif(item->>'qty', '')::numeric, 0) <= 0 then raise exception 'Quotation quantity must be greater than zero'; end if;
    line_total := coalesce(nullif(item->>'qty', '')::numeric, 0) * greatest(coalesce(nullif(item->>'selling_price', '')::numeric, 0), 0);
    insert into quotation_items (quotation_id, product_id, product_name, supplier_id, supplier_name,
      import_unit, sell_unit, qty, cost_price, profit_pct, selling_price, vat_pct, total)
    values (quotation_id, product_row.id, product_row.name, supplier_id_value, supplier_name_value,
      nullif(item->>'import_unit', ''), nullif(item->>'sell_unit', ''), (item->>'qty')::numeric,
      greatest(coalesce(nullif(item->>'cost_price', '')::numeric, 0), 0),
      coalesce(nullif(item->>'profit_pct', '')::numeric, 0),
      greatest(coalesce(nullif(item->>'selling_price', '')::numeric, 0), 0),
      greatest(coalesce(nullif(item->>'vat_pct', '')::numeric, 0), 0), line_total);
    computed_total := computed_total + line_total * (1 + greatest(coalesce(nullif(item->>'vat_pct', '')::numeric, 0), 0) / 100);
  end loop;
  if p_discount_type = 'pct' then computed_total := computed_total * (1 - least(p_discount_val, 100) / 100);
  else computed_total := greatest(computed_total - p_discount_val, 0); end if;
  update quotations set total = round(computed_total), updated_at = now() where id = quotation_id;
  return quotation_id;
end;
$$;
grant execute on function save_quotation(uuid, uuid, text, uuid, date, date, text, numeric, text, text, jsonb, text) to authenticated;

create or replace function set_quotation_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_org uuid := get_org_id(); source_status text;
begin
  select status into source_status from quotations where id = p_id and org_id = current_org for update;
  if not found then raise exception 'Quotation was not found'; end if;
  if lower(source_status) = 'converted' then raise exception 'A converted quotation cannot be changed'; end if;
  if lower(trim(p_status)) not in ('draft', 'sent', 'accepted', 'rejected', 'cancelled') then
    raise exception 'Unsupported quotation status';
  end if;
  if lower(trim(p_status)) = 'accepted' then perform require_permission('Sales', 'approve');
  else perform require_permission('Sales', 'update'); end if;
  update quotations set status = initcap(lower(trim(p_status))), updated_at = now()
  where id = p_id and org_id = current_org;
end;
$$;
grant execute on function set_quotation_status(uuid, text) to authenticated;

create or replace function delete_draft_document(p_entity text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_org uuid := get_org_id(); current_status text;
begin
  if p_entity = 'purchase_order' then
    perform require_permission('Purchase', 'delete');
    select status into current_status from purchase_orders where id = p_id and org_id = current_org for update;
    if not found or lower(current_status) <> 'draft' then raise exception 'Only a draft purchase order can be deleted'; end if;
    delete from purchase_orders where id = p_id and org_id = current_org;
  elsif p_entity = 'sales_order' then
    perform require_permission('Sales', 'delete');
    select status into current_status from sales_orders where id = p_id and org_id = current_org for update;
    if not found or lower(current_status) <> 'draft' then raise exception 'Only a draft sales order can be deleted'; end if;
    delete from sales_orders where id = p_id and org_id = current_org;
  elsif p_entity = 'quotation' then
    perform require_permission('Sales', 'delete');
    select status into current_status from quotations where id = p_id and org_id = current_org for update;
    if not found or lower(current_status) not in ('draft', 'rejected') then raise exception 'Only a draft or rejected quotation can be deleted'; end if;
    delete from quotations where id = p_id and org_id = current_org;
  else
    raise exception 'Unsupported document type';
  end if;
end;
$$;
grant execute on function delete_draft_document(text, uuid) to authenticated;

-- Replace the phase-3 inventory RPCs so document actor and warehouse/product
-- labels come from authenticated organization data instead of client payloads.
create or replace function create_inventory_adjustment(
  p_ref text, p_warehouse_id uuid, p_warehouse_name text, p_reason text,
  p_items jsonb, p_created_by text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  adjustment_id uuid;
  item jsonb;
  delta numeric;
  product_row products%rowtype;
  warehouse_name_value text;
  actor_name text;
begin
  perform require_permission('Inventory', 'create');
  if nullif(trim(p_ref), '') is null then raise exception 'Adjustment reference is required'; end if;
  select name into warehouse_name_value from warehouses where id = p_warehouse_id and org_id = current_org;
  if not found then raise exception 'A valid adjustment warehouse is required'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'At least one adjustment item is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item_value
    group by item_value->>'product_id' having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;
  if exists (select 1 from inventory_adjustments where org_id = current_org and ref = trim(p_ref)) then
    raise exception 'Adjustment reference already exists';
  end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  insert into inventory_adjustments (org_id, ref, warehouse_id, warehouse_name, reason, status, created_by)
  values (current_org, trim(p_ref), p_warehouse_id, warehouse_name_value,
    coalesce(nullif(trim(p_reason), ''), 'Manual adjustment'), 'Completed', actor_name)
  returning id into adjustment_id;

  for item in select * from jsonb_array_elements(p_items) loop
    delta := coalesce(nullif(item->>'qty_delta', '')::numeric, 0);
    if nullif(item->>'product_id', '') is null or delta = 0 then
      raise exception 'Adjustment item requires product and non-zero delta';
    end if;
    select * into product_row from products
    where id = (item->>'product_id')::uuid and org_id = current_org for update;
    if not found then raise exception 'Product was not found for adjustment'; end if;
    insert into inventory_adjustment_items (
      adjustment_id, product_id, product_name, sku, warehouse_id, warehouse_name, qty_delta, unit_cost
    ) values (
      adjustment_id, product_row.id, product_row.name, product_row.sku, p_warehouse_id,
      warehouse_name_value, delta, greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0)
    );
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values (
      current_org, trim(p_ref), case when delta > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
      product_row.id, product_row.name, product_row.sku, p_warehouse_id, warehouse_name_value,
      greatest(delta, 0), greatest(-delta, 0),
      greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0), actor_name
    );
  end loop;
  perform append_audit_event('inventory_adjustments', 'CREATE', trim(p_ref), null,
    jsonb_build_object('warehouse_id', p_warehouse_id, 'items', p_items));
  return adjustment_id;
end;
$$;
grant execute on function create_inventory_adjustment(text, uuid, text, text, jsonb, text) to authenticated;

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
  available_qty numeric;
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
  if exists (select 1 from inventory_transfers where org_id = current_org and ref = trim(p_ref)) then
    raise exception 'Transfer reference already exists';
  end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );

  insert into inventory_transfers (
    org_id, ref, from_warehouse_id, from_warehouse_name, to_warehouse_id,
    to_warehouse_name, status, created_by
  ) values (
    current_org, trim(p_ref), p_from_warehouse_id, from_name_value, p_to_warehouse_id,
    to_name_value, 'Completed', actor_name
  ) returning id into transfer_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_qty := coalesce(nullif(item->>'qty', '')::numeric, 0);
    if nullif(item->>'product_id', '') is null or item_qty <= 0 then
      raise exception 'Transfer item requires product and positive quantity';
    end if;
    select * into product_row from products
    where id = (item->>'product_id')::uuid and org_id = current_org for update;
    if not found then raise exception 'Product was not found for transfer'; end if;
    select coalesce(sum(qty_in - qty_out), 0) into available_qty from inventory_ledger
    where org_id = current_org and product_id = product_row.id and warehouse_id = p_from_warehouse_id;
    if available_qty < item_qty and not product_row.allow_negative then
      raise exception 'Insufficient stock for product %: available %, requested %', product_row.sku, available_qty, item_qty;
    end if;
    insert into inventory_transfer_items (transfer_id, product_id, product_name, sku, qty, unit_cost)
    values (transfer_id, product_row.id, product_row.name, product_row.sku, item_qty,
      greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0));
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values
      (current_org, trim(p_ref), 'TRANSFER_OUT', product_row.id, product_row.name, product_row.sku,
        p_from_warehouse_id, from_name_value, 0, item_qty,
        greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0), actor_name),
      (current_org, trim(p_ref), 'TRANSFER_IN', product_row.id, product_row.name, product_row.sku,
        p_to_warehouse_id, to_name_value, item_qty, 0,
        greatest(coalesce(nullif(item->>'unit_cost', '')::numeric, product_row.cost, 0), 0), actor_name);
  end loop;
  perform append_audit_event('inventory_transfers', 'CREATE', trim(p_ref), null,
    jsonb_build_object('from_warehouse_id', p_from_warehouse_id, 'to_warehouse_id', p_to_warehouse_id, 'items', p_items));
  return transfer_id;
end;
$$;
grant execute on function create_inventory_transfer(text, uuid, text, uuid, text, jsonb, text) to authenticated;

create or replace function reverse_inventory_adjustment(p_ref text, p_created_by text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  source_row inventory_adjustments%rowtype;
  item inventory_adjustment_items%rowtype;
  reversal_ref text := 'REV-' || trim(p_ref);
  actor_name text;
begin
  perform require_permission('Inventory', 'approve');
  select * into source_row from inventory_adjustments
  where org_id = current_org and ref = trim(p_ref) for update;
  if not found then raise exception 'Adjustment was not found'; end if;
  if lower(source_row.status) = 'reversed' then raise exception 'Adjustment is already reversed'; end if;
  actor_name := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from profiles where id = auth.uid() and org_id = current_org),
    auth.uid()::text
  );
  for item in select * from inventory_adjustment_items where adjustment_id = source_row.id loop
    insert into inventory_ledger (
      org_id, ref, movement_type, product_id, product_name, sku, warehouse_id,
      warehouse_name, qty_in, qty_out, unit_cost, created_by
    ) values (
      current_org, reversal_ref, case when item.qty_delta > 0 then 'ADJUSTMENT_OUT' else 'ADJUSTMENT_IN' end,
      item.product_id, item.product_name, item.sku, item.warehouse_id, item.warehouse_name,
      greatest(-item.qty_delta, 0), greatest(item.qty_delta, 0), item.unit_cost, actor_name
    );
  end loop;
  update inventory_adjustments set status = 'Reversed', updated_at = now() where id = source_row.id;
  perform append_audit_event('inventory_adjustments', 'REVERSE', trim(p_ref),
    jsonb_build_object('status', source_row.status), jsonb_build_object('status', 'Reversed'));
  return source_row.id;
end;
$$;
grant execute on function reverse_inventory_adjustment(text, text) to authenticated;

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
    ) values
      (current_org, reversal_ref, 'TRANSFER_IN', item.product_id, item.product_name, item.sku,
        source_row.from_warehouse_id, source_row.from_warehouse_name, item.qty, 0, item.unit_cost, actor_name),
      (current_org, reversal_ref, 'TRANSFER_OUT', item.product_id, item.product_name, item.sku,
        source_row.to_warehouse_id, source_row.to_warehouse_name, 0, item.qty, item.unit_cost, actor_name);
  end loop;
  update inventory_transfers set status = 'Reversed', updated_at = now() where id = source_row.id;
  perform append_audit_event('inventory_transfers', 'REVERSE', trim(p_ref),
    jsonb_build_object('status', source_row.status), jsonb_build_object('status', 'Reversed'));
  return source_row.id;
end;
$$;
grant execute on function reverse_inventory_transfer(text, text) to authenticated;

-- A quotation conversion is complete in the same transaction as its receipt.
-- p_po_ref stores the quotation UUID for this workflow.
create or replace function mark_converted_quotation_from_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.po_id is null and nullif(trim(new.po_ref), '') is not null then
    update quotations set status = 'Converted', updated_at = now()
    where id::text = trim(new.po_ref) and org_id = new.org_id and lower(status) in ('accepted', 'approved');
  end if;
  return new;
end;
$$;
drop trigger if exists mark_quotation_converted on goods_receipts;
create trigger mark_quotation_converted after insert on goods_receipts
for each row execute function mark_converted_quotation_from_receipt();

-- Workflow history is append-only through guarded SECURITY DEFINER functions.
-- Reads remain organization-scoped through RLS.
revoke insert, update, delete on goods_receipts, goods_receipt_items, inventory_ledger,
  inventory_balance, inventory_adjustments, inventory_adjustment_items, inventory_transfers, inventory_transfer_items,
  purchase_orders, purchase_order_items, quotations, quotation_items, sales_orders, sales_order_items,
  delivery_notes, delivery_note_items, sales_returns, sales_return_items, purchase_returns,
  purchase_return_items, invoices, finance_transactions, cash_book, audit_events from authenticated;
revoke insert, update on products from authenticated;
grant select on products to authenticated;
grant select on goods_receipts, goods_receipt_items, inventory_ledger, inventory_balance,
  inventory_adjustments, inventory_adjustment_items, inventory_transfers, inventory_transfer_items,
  purchase_orders, purchase_order_items, quotations, quotation_items, sales_orders, sales_order_items,
  delivery_notes, delivery_note_items, sales_returns, sales_return_items, purchase_returns,
  purchase_return_items, invoices, finance_transactions, cash_book, audit_events to authenticated;

drop policy if exists "org_isolation" on purchase_returns;
drop policy if exists "org_isolation" on purchase_return_items;
create policy "org_isolation" on purchase_returns for select using (org_id = get_org_id());
create policy "org_isolation" on purchase_return_items for select using (
  return_id in (select id from purchase_returns where org_id = get_org_id())
);
grant select on purchase_returns, purchase_return_items, sales_returns, sales_return_items to authenticated;

-- The RPCs above are the permission boundary for workflow writes. Remove the
-- older row triggers so an internal status update does not incorrectly require
-- a second permission (for example create + update for one delivery).
drop trigger if exists permission_guard_inventory_adjustments on inventory_adjustments;
drop trigger if exists permission_guard_inventory_transfers on inventory_transfers;
drop trigger if exists permission_guard_delivery_notes on delivery_notes;
drop trigger if exists permission_guard_sales_returns on sales_returns;
drop trigger if exists permission_guard_finance_transactions on finance_transactions;
drop trigger if exists permission_guard_cash_book on cash_book;
drop trigger if exists permission_guard_inventory_ledger on inventory_ledger;

create or replace function enforce_master_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare module_name text; action_name text; actor_role text;
begin
  -- Trusted database/bootstrap work has no end-user JWT. Client writes still
  -- require an authenticated UID and pass through require_permission below.
  if auth.uid() is null then return coalesce(new, old); end if;
  module_name := case when tg_table_name in ('roles', 'role_permissions', 'company_settings')
    then 'Administration' else 'Master Data' end;
  action_name := case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end;
  perform require_permission(module_name, action_name);
  if tg_table_name = 'roles' then
    select lower(role) into actor_role from profiles where id = auth.uid() and org_id = get_org_id();
    if tg_op in ('INSERT', 'UPDATE') then
      if nullif(trim(new.code), '') is null then raise exception 'Role code is required'; end if;
      if exists (
        select 1 from roles existing_role
        where existing_role.org_id = new.org_id and lower(existing_role.code) = lower(trim(new.code))
          and existing_role.id <> new.id
      ) then raise exception 'Role code already exists (case-insensitive)'; end if;
      if coalesce(new.is_system, false) and actor_role <> 'admin' then
        raise exception 'Only an administrator can create or update system roles';
      end if;
    end if;
    if tg_op = 'UPDATE' then
      if old.is_system and (new.code is distinct from old.code or new.is_system is distinct from old.is_system) then
        raise exception 'System role code and type cannot be changed';
      end if;
      if lower(new.code) is distinct from lower(old.code) and exists (
        select 1 from profiles where org_id = old.org_id and lower(role) = lower(old.code)
      ) then raise exception 'A role assigned to users cannot change its code'; end if;
    elsif tg_op = 'DELETE' then
      if old.is_system then raise exception 'System roles cannot be deleted'; end if;
      if exists (select 1 from profiles where org_id = old.org_id and lower(role) = lower(old.code)) then
        raise exception 'A role assigned to users cannot be deleted';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function audit_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare entity_ref text;
begin
  if auth.uid() is null or get_org_id() is null then return coalesce(new, old); end if;
  entity_ref := coalesce(to_jsonb(new)->>'ref', to_jsonb(old)->>'ref',
    to_jsonb(new)->>'code', to_jsonb(old)->>'code', to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  perform append_audit_event(tg_table_name, tg_op, entity_ref, to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['products','categories','brands','units','warehouses','customers','suppliers',
    'roles','role_permissions','company_settings'] loop
    execute format('drop trigger if exists %I on %I', 'master_permission_guard_' || table_name, table_name);
    execute format('create trigger %I before insert or update or delete on %I for each row execute function enforce_master_permission()',
      'master_permission_guard_' || table_name, table_name);
  end loop;
end $$;

-- Persist header/master changes without exposing append_audit_event to clients.
do $$
declare table_name text;
begin
  foreach table_name in array array['products','categories','brands','units','warehouses','customers','suppliers',
    'roles','role_permissions','company_settings','quotations','purchase_orders','goods_receipts','sales_orders','delivery_notes',
    'sales_returns','purchase_returns','invoices','finance_transactions','inventory_adjustments','inventory_transfers'] loop
    execute format('drop trigger if exists %I on %I', 'audit_change_' || table_name, table_name);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_workflow_change()',
      'audit_change_' || table_name, table_name);
  end loop;
end $$;

-- These two legacy RPCs already append one semantic CREATE/REVERSE event.
-- Avoid duplicating that event with a second header-row trigger event.
drop trigger if exists audit_change_inventory_adjustments on inventory_adjustments;
drop trigger if exists audit_change_inventory_transfers on inventory_transfers;

-- One ledger guard covers every current and future stock-out path. The
-- transaction-scoped advisory lock prevents two concurrent requests from both
-- spending the same available quantity.
create or replace function enforce_nonnegative_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty numeric;
  negative_allowed boolean;
begin
  if coalesce(new.qty_out, 0) <= coalesce(new.qty_in, 0) then return new; end if;
  select coalesce(allow_negative, false) into negative_allowed
  from products where id = new.product_id and org_id = new.org_id;
  if coalesce(negative_allowed, false) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    new.org_id::text || ':' || new.product_id::text || ':' || coalesce(new.warehouse_id::text, ''), 0
  ));
  select coalesce(sum(qty_in - qty_out), 0) into current_qty
  from inventory_ledger
  where org_id = new.org_id and product_id = new.product_id
    and warehouse_id is not distinct from new.warehouse_id;
  if current_qty + coalesce(new.qty_in, 0) - coalesce(new.qty_out, 0) < 0 then
    raise exception 'Insufficient stock for product %: available %, requested %', new.sku, current_qty, new.qty_out;
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_negative_inventory on inventory_ledger;
create trigger prevent_negative_inventory before insert on inventory_ledger
for each row execute function enforce_nonnegative_inventory();

-- Keep the legacy inventory_balance cache aligned with the append-only ledger.
-- The application reads stock from inventory_ledger, but older integrations may
-- still read this table. One trigger covers every current and future movement.
create or replace function sync_inventory_balance_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_min numeric := 0;
  product_max numeric := 0;
begin
  select coalesce(min_qty, 0), coalesce(max_qty, 0)
  into product_min, product_max
  from products where id = new.product_id and org_id = new.org_id;

  insert into inventory_balance (
    org_id, product_id, product_name, sku, warehouse_id, warehouse_name,
    qty, min_qty, max_qty, unit_cost, updated_at
  ) values (
    new.org_id, new.product_id, new.product_name, new.sku, new.warehouse_id,
    new.warehouse_name, coalesce(new.qty_in, 0) - coalesce(new.qty_out, 0),
    product_min, product_max, coalesce(new.unit_cost, 0), coalesce(new.created_at, now())
  )
  on conflict (org_id, sku, warehouse_id) do update set
    product_id = excluded.product_id,
    product_name = excluded.product_name,
    warehouse_name = excluded.warehouse_name,
    qty = inventory_balance.qty + excluded.qty,
    min_qty = excluded.min_qty,
    max_qty = excluded.max_qty,
    unit_cost = case when coalesce(new.qty_in, 0) > 0 then excluded.unit_cost else inventory_balance.unit_cost end,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists sync_inventory_balance_after_ledger on inventory_ledger;
create trigger sync_inventory_balance_after_ledger after insert on inventory_ledger
for each row execute function sync_inventory_balance_from_ledger();

-- A product can be renamed or receive a new SKU without changing stock. Keep
-- cache metadata on its existing product_id instead of leaving an obsolete SKU
-- row that the next movement would duplicate.
create or replace function sync_product_inventory_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update inventory_balance
  set sku = new.sku,
    product_name = new.name,
    min_qty = new.min_qty,
    max_qty = new.max_qty,
    updated_at = now()
  where org_id = new.org_id and product_id = new.id;
  return new;
end;
$$;
drop trigger if exists sync_product_metadata_to_inventory_balance on products;
create trigger sync_product_metadata_to_inventory_balance
after update of sku, name, min_qty, max_qty on products
for each row execute function sync_product_inventory_metadata();

-- Correct existing cache rows wherever ledger history is available. Rows with
-- no ledger history are deliberately left untouched for the deployment audit.
delete from inventory_balance balance
where exists (
  select 1 from inventory_ledger ledger
  where ledger.org_id = balance.org_id
    and ledger.product_id is not distinct from balance.product_id
    and (ledger.product_id is not null or ledger.sku = balance.sku)
    and ledger.warehouse_id is not distinct from balance.warehouse_id
);

insert into inventory_balance (
  org_id, product_id, product_name, sku, warehouse_id, warehouse_name,
  qty, min_qty, max_qty, unit_cost, updated_at
)
select ledger.org_id, ledger.product_id, coalesce(max(product.name), max(ledger.product_name)),
  coalesce(max(product.sku), max(ledger.sku)),
  ledger.warehouse_id, max(ledger.warehouse_name), sum(ledger.qty_in - ledger.qty_out),
  max(coalesce(product.min_qty, 0)), max(coalesce(product.max_qty, 0)),
  case when sum(ledger.qty_in - ledger.qty_out) = 0 then max(ledger.unit_cost)
    else sum((ledger.qty_in - ledger.qty_out) * ledger.unit_cost) / sum(ledger.qty_in - ledger.qty_out) end,
  max(ledger.created_at)
from inventory_ledger ledger
left join products product on product.id = ledger.product_id and product.org_id = ledger.org_id
group by ledger.org_id, ledger.product_id, ledger.warehouse_id,
  case when ledger.product_id is null then ledger.sku end
on conflict (org_id, sku, warehouse_id) do update set
  product_id = excluded.product_id,
  product_name = excluded.product_name,
  warehouse_name = excluded.warehouse_name,
  qty = excluded.qty,
  min_qty = excluded.min_qty,
  max_qty = excluded.max_qty,
  unit_cost = excluded.unit_cost,
  updated_at = excluded.updated_at;

-- Audit calls are internal only; table triggers execute as the database owner.
revoke execute on function append_audit_event(text, text, text, jsonb, jsonb) from public, authenticated;

-- PostgreSQL grants function execution to PUBLIC by default. Only authenticated
-- users may call the guarded application RPCs; trigger/internal helpers remain
-- unavailable as direct API endpoints.
revoke execute on function require_permission(text, text) from public;
revoke execute on function handle_new_user() from public;
revoke execute on function set_organization_user_role(uuid, text) from public;
revoke execute on function create_organization_invitation(text, text) from public;
revoke execute on function upsert_product_with_opening_stock(uuid, text, text, text, text, text, text, numeric, numeric, text, numeric, uuid, text, text, numeric, numeric, numeric, text, boolean, boolean, boolean, boolean) from public;
revoke execute on function backfill_legacy_product_opening_stock(uuid, uuid) from public;
revoke execute on function save_purchase_order(uuid, text, uuid, text, uuid, text, text, numeric, text, date, jsonb, text) from public;
revoke execute on function save_sales_order(uuid, text, uuid, text, uuid, text, text, numeric, numeric, numeric, text, jsonb, text) from public;
revoke execute on function receive_goods_receipt(text, text, uuid, text, text, jsonb) from public;
revoke execute on function deliver_sales_order(text, uuid, text, uuid, text, uuid, text, jsonb, text, text) from public;
revoke execute on function reverse_delivery_note(text, text) from public;
revoke execute on function create_purchase_return(text, text, jsonb, text, text) from public;
revoke execute on function reverse_purchase_return(text, text) from public;
revoke execute on function create_sales_return(text, text, uuid, text, jsonb, text, text) from public;
revoke execute on function reverse_sales_return(text, text) from public;
revoke execute on function record_finance_transaction(text, text, text, uuid, text, uuid, text, numeric, text, text, text) from public;
revoke execute on function save_quotation(uuid, uuid, text, uuid, date, date, text, numeric, text, text, jsonb, text) from public;
revoke execute on function set_quotation_status(uuid, text) from public;
revoke execute on function delete_draft_document(text, uuid) from public;
revoke execute on function create_inventory_adjustment(text, uuid, text, text, jsonb, text) from public;
revoke execute on function create_inventory_transfer(text, uuid, text, uuid, text, jsonb, text) from public;
revoke execute on function reverse_inventory_adjustment(text, text) from public;
revoke execute on function reverse_inventory_transfer(text, text) from public;
revoke execute on function append_inventory_movement(uuid, text, text, uuid, text, text, uuid, text, numeric, numeric, numeric, text) from public, authenticated;
revoke execute on function enforce_master_permission() from public;
revoke execute on function audit_workflow_change() from public;
revoke execute on function enforce_nonnegative_inventory() from public;
revoke execute on function sync_inventory_balance_from_ledger() from public, authenticated;
revoke execute on function sync_product_inventory_metadata() from public, authenticated;
revoke execute on function mark_converted_quotation_from_receipt() from public;

-- Useful indexes for the ledger-derived screens and source-document lookups.
create index if not exists inventory_ledger_org_product_warehouse_created_idx
  on inventory_ledger(org_id, product_id, warehouse_id, created_at);
create index if not exists inventory_ledger_org_created_idx on inventory_ledger(org_id, created_at);
create index if not exists goods_receipts_org_po_idx on goods_receipts(org_id, po_id);
create index if not exists delivery_notes_org_so_idx on delivery_notes(org_id, sales_order_id);
create index if not exists finance_transactions_org_source_idx on finance_transactions(org_id, source_ref);
create index if not exists invoices_org_outstanding_due_idx on invoices(org_id, outstanding_amount, due_date);
create index if not exists purchase_orders_org_outstanding_due_idx on purchase_orders(org_id, outstanding_amount, due_date);

-- Live notification badges refresh after inventory, purchasing, sales, or
-- invoice changes. Add only missing tables so the migration stays repeatable.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['inventory_ledger','purchase_orders','sales_orders','invoices'] loop
      if not exists (
        select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

-- Lightweight integrity report used by deployment checks and support tooling.
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
    )
  )
$$;
grant execute on function reconciliation_summary() to authenticated;
revoke execute on function reconciliation_summary() from public;
