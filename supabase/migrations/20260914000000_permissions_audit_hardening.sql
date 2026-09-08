-- Phase 7: action permissions and organization-scoped audit events
create table if not exists audit_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  entity text not null,
  action text not null,
  entity_ref text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

alter table audit_events enable row level security;
drop policy if exists "org_isolation" on audit_events;
create policy "org_isolation" on audit_events using (org_id = get_org_id());

create or replace function require_permission(p_module text, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare current_org uuid := get_org_id(); current_role_id uuid; allowed_action boolean;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  select id into current_role_id from roles where org_id = current_org and lower(code) = lower((select role from profiles where id = auth.uid())) limit 1;
  if current_role_id is null and lower((select role from profiles where id = auth.uid())) = 'admin' then return; end if;
  select allowed into allowed_action from role_permissions where role_id = current_role_id and lower(module) = lower(p_module) and lower(action) = lower(p_action);
  if coalesce(allowed_action, false) is not true then raise exception 'Permission denied: %.%', p_module, p_action; end if;
end;
$$;

grant execute on function require_permission(text, text) to authenticated;

create or replace function append_audit_event(p_entity text, p_action text, p_entity_ref text, p_old_value jsonb default null, p_new_value jsonb default null) returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid;
begin
  insert into audit_events (org_id, actor_id, entity, action, entity_ref, old_value, new_value)
  values (get_org_id(), auth.uid(), p_entity, p_action, p_entity_ref, p_old_value, p_new_value)
  returning id into event_id;
  return event_id;
end;
$$;

grant execute on function append_audit_event(text, text, text, jsonb, jsonb) to authenticated;
