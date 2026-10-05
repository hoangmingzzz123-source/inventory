-- Temporary fixed-code confirmation for the admin reset action.
-- Replace this with Supabase MFA or another server-managed factor before production.
drop function if exists public.reset_organization_data();

create or replace function public.reset_organization_data(p_confirmation_code text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  current_org_id uuid;
  replacement_org_id uuid;
  current_org_name text;
  actor_role text;
  affected_tables regclass[];
  affected_table regclass;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select profile.org_id, profile.role
    into current_org_id, actor_role
  from public.profiles profile
  where profile.id = actor_id;

  if current_org_id is null or lower(trim(coalesce(actor_role, ''))) <> 'admin' then
    raise exception 'Only an organization administrator can clear organization data';
  end if;

  if p_confirmation_code is distinct from 'WHR-7K9Q-2M8X-5P3D' then
    raise exception 'The reset confirmation code is incorrect';
  end if;

  select organization.name
    into current_org_name
  from public.organizations organization
  where organization.id = current_org_id
  for update;

  if current_org_name is null then
    raise exception 'The active organization was not found';
  end if;

  insert into public.organizations (name)
  values (current_org_name)
  returning id into replacement_org_id;

  -- Keep existing member profiles and auth accounts in the new empty org.
  update public.profiles
  set org_id = replacement_org_id
  where org_id = current_org_id;

  -- Find public tables that reference the organization, directly or through a
  -- dependent table. Disable only user triggers during the cascade so audit
  -- and business-rule triggers cannot block this privileged reset. PostgreSQL
  -- internal foreign-key triggers remain enabled, preserving tenant cascades.
  with recursive organization_dependents(table_oid) as (
    select 'public.organizations'::regclass::oid
    union
    select constraint_row.conrelid
    from pg_catalog.pg_constraint constraint_row
    join organization_dependents parent_table
      on constraint_row.confrelid = parent_table.table_oid
    join pg_catalog.pg_class child_table
      on child_table.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace child_schema
      on child_schema.oid = child_table.relnamespace
    where constraint_row.contype = 'f'
      and child_schema.nspname = 'public'
  )
  select coalesce(array_agg(table_oid::regclass order by table_oid::regclass::text), '{}'::regclass[])
    into affected_tables
  from organization_dependents
  join pg_catalog.pg_class relation on relation.oid = table_oid
  where table_oid <> 'public.organizations'::regclass::oid
    and relation.relkind in ('r', 'p');

  foreach affected_table in array affected_tables loop
    execute format('alter table %s disable trigger user', affected_table);
  end loop;

  delete from public.organizations
  where id = current_org_id;

  foreach affected_table in array affected_tables loop
    execute format('alter table %s enable trigger user', affected_table);
  end loop;

  return replacement_org_id;
end;
$$;

revoke all on function public.reset_organization_data(text) from public, anon;
grant execute on function public.reset_organization_data(text) to authenticated;
