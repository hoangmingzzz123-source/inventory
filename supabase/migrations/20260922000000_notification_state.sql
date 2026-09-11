-- Durable per-user notification read/dismiss state. Notifications themselves
-- remain derived from current business data; only interaction state is stored.

create table if not exists notification_states (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  signature text not null check (length(signature) between 1 and 2000),
  state text not null check (state in ('READ', 'DISMISSED')),
  updated_at timestamptz not null default now(),
  primary key (user_id, signature)
);

create index if not exists notification_states_org_user_updated_idx
  on notification_states(org_id, user_id, updated_at desc);

alter table notification_states enable row level security;
drop policy if exists "notification_states_read" on notification_states;
create policy "notification_states_read" on notification_states for select
  using (user_id = auth.uid() and org_id = get_org_id());

revoke all on notification_states from anon, authenticated;
grant select on notification_states to authenticated;

create or replace function set_notification_states(
  p_signatures text[], p_state text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid := get_org_id();
  normalized_state text := upper(trim(p_state));
begin
  if auth.uid() is null or current_org is null then
    raise exception 'Authenticated organization context is required';
  end if;
  if normalized_state not in ('READ', 'DISMISSED') then
    raise exception 'Notification state must be READ or DISMISSED';
  end if;
  if coalesce(array_length(p_signatures, 1), 0) = 0 then return; end if;

  insert into notification_states (org_id, user_id, signature, state, updated_at)
  select current_org, auth.uid(), source.signature, normalized_state, now()
  from (
    select distinct trim(value) as signature
    from unnest(p_signatures) value
    where nullif(trim(value), '') is not null and length(trim(value)) <= 2000
  ) source
  on conflict (user_id, signature) do update set
    org_id = excluded.org_id,
    state = excluded.state,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function set_notification_states(text[], text) to authenticated;
revoke execute on function set_notification_states(text[], text) from public, anon;

