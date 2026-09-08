-- Phase 7: apply action guards and audit triggers to already-created workflow tables
create or replace function enforce_workflow_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare module_name text; action_name text;
begin
  module_name := case
    when tg_table_name in ('inventory_adjustments', 'inventory_adjustment_items', 'inventory_transfers', 'inventory_transfer_items') then 'Inventory'
    when tg_table_name in ('delivery_notes', 'delivery_note_items', 'sales_returns', 'sales_return_items', 'sales_order_items') then 'Sales'
    when tg_table_name in ('finance_transactions', 'cash_book') then 'Finance'
    when tg_table_name = 'inventory_ledger' then case
      when coalesce((to_jsonb(new)->>'movement_type'), '') in ('SALE', 'RETURN_IN', 'RETURN_OUT') then 'Sales'
      when coalesce((to_jsonb(new)->>'movement_type'), '') = 'RECEIPT' then 'Purchase'
      else 'Inventory'
    end
    else null
  end;
  if module_name is null then return coalesce(new, old); end if;
  action_name := case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end;
  perform require_permission(module_name, action_name);
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
  entity_ref := coalesce(to_jsonb(new)->>'ref', to_jsonb(old)->>'ref', to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  perform append_audit_event(tg_table_name, tg_op, entity_ref, to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['inventory_adjustments','inventory_transfers','delivery_notes','sales_returns','finance_transactions','cash_book'] loop
    execute format('drop trigger if exists %I on %I', 'permission_guard_' || table_name, table_name);
    execute format('create trigger %I before insert or update or delete on %I for each row execute function enforce_workflow_permission()', 'permission_guard_' || table_name, table_name);
    execute format('drop trigger if exists %I on %I', 'audit_change_' || table_name, table_name);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_workflow_change()', 'audit_change_' || table_name, table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['inventory_ledger'] loop
    execute format('drop trigger if exists %I on %I', 'permission_guard_' || table_name, table_name);
    execute format('create trigger %I before insert on %I for each row execute function enforce_workflow_permission()', 'permission_guard_' || table_name, table_name);
    execute format('drop trigger if exists %I on %I', 'audit_change_' || table_name, table_name);
    execute format('create trigger %I after insert on %I for each row execute function audit_workflow_change()', 'audit_change_' || table_name, table_name);
  end loop;
end $$;
