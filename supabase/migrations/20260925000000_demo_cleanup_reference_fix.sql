-- Fix Demo E2E cleanup after Category quotation defaults and reference
-- snapshots were introduced. Keep already-applied migrations immutable.

-- Keep a failed extension scenario visible in Demo history. run_demo_scenario_v2
-- extends a successful base run; without this outer subtransaction, an error in
-- that extension rolls the base demo_runs row back together with its fixtures.
create or replace function run_demo_scenario_v3(
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
  actor_role text;
  result_value jsonb;
  failed_run_id uuid;
  error_state text;
  error_message_value text;
  error_detail text;
begin
  if current_user_id is null or current_org is null then
    raise exception 'Authentication is required';
  end if;
  select lower(role) into actor_role from profiles
  where id = current_user_id and org_id = current_org;
  if actor_role <> 'admin' then raise exception 'Administrator access is required'; end if;

  begin
    result_value := run_demo_scenario_v2(scenario_name, p_idempotency_key);

    -- The four documented scenarios must never report success with an invalid
    -- reference chain. Roll back that run and retain a FAILED diagnostic row.
    if coalesce(result_value->>'status', '') = 'SUCCESS'
      and not coalesce((result_value->>'idempotentReplay')::boolean, false)
      and coalesce(result_value->'verification'->>'resolvedReference', 'INVALID') = 'INVALID'
    then
      raise exception 'Demo verification failed for scenario %', scenario_name;
    end if;

    if coalesce(result_value->>'status', '') = 'FAILED'
      and nullif(result_value->>'demoRunId', '') is not null
    then
      update demo_runs set scenario_code = scenario_name
      where id = (result_value->>'demoRunId')::uuid and org_id = current_org;
    end if;
  exception when others then
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message_value = message_text,
      error_detail = pg_exception_detail;

    insert into demo_runs (
      org_id, scenario_code, status, created_by, idempotency_key,
      completed_at, error_message, metadata
    ) values (
      current_org, scenario_name, 'FAILED', current_user_id, p_idempotency_key,
      now(), concat_ws(' · ', error_state, error_message_value, nullif(error_detail, '')),
      jsonb_build_object('created', '{}'::jsonb, 'links', '{}'::jsonb,
        'verification', jsonb_build_object('resolvedReference', 'INVALID'))
    ) returning id into failed_run_id;

    return jsonb_build_object(
      'demoRunId', failed_run_id,
      'status', 'FAILED',
      'error', concat_ws(' · ', error_state, error_message_value, nullif(error_detail, '')),
      'created', '{}'::jsonb,
      'links', '{}'::jsonb,
      'verification', jsonb_build_object('resolvedReference', 'INVALID'),
      'idempotentReplay', false
    );
  end;

  return result_value;
end;
$$;

grant execute on function run_demo_scenario_v3(text, uuid) to authenticated;
revoke execute on function run_demo_scenario_v3(text, uuid) from public, anon;

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
  if run_count = 0 then
    return jsonb_build_object('success', true, 'deletedRuns', 0, 'deletedRecords', 0);
  end if;
  perform set_config('app.demo_run_id', run_ids[1]::text, true);

  -- Break the intentional delivery/invoice cycle first.
  update delivery_notes set invoice_id = null
  where demo_run_id = any(run_ids) and source = 'dataDemo';
  update invoices set delivery_id = null
  where demo_run_id = any(run_ids) and source = 'dataDemo';

  delete from sales_return_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from sales_returns where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_return_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_returns where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from finance_transactions where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from cash_book where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from invoices where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from delivery_note_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from delivery_notes where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  -- Reference snapshots must be removed before their quotation items. This is
  -- explicit even though the target FK cascades, so cleanup counts are clear
  -- and future source-reference constraints cannot reintroduce this failure.
  delete from quotation_item_references where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_reservations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from quotation_allocations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  delete from inventory_cost_allocations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_cost_layers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_ledger where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  delete from goods_receipt_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from goods_receipts where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from quotation_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from quotations where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  delete from sales_order_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from sales_orders where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_order_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from purchase_orders where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_adjustment_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_adjustments where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_transfer_items where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_transfers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;

  delete from product_suppliers where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from inventory_balance where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from products where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from brands where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  -- Categories must go before their default Units. Keep the FK restrictive so
  -- cleanup cannot silently alter real or cross-run Category configuration.
  delete from categories where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
  delete from units where demo_run_id = any(run_ids) and source = 'dataDemo'; get diagnostics affected = row_count; deleted_count := deleted_count + affected;
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
