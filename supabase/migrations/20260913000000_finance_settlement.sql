-- Phase 6 completion: settle invoices and purchase orders from finance transactions
alter table invoices add column if not exists paid_amount numeric(18,0) not null default 0;
alter table invoices add column if not exists outstanding_amount numeric(18,0) not null default 0;
alter table purchase_orders add column if not exists paid_amount numeric(18,0) not null default 0;
alter table purchase_orders add column if not exists outstanding_amount numeric(18,0) not null default 0;

update invoices set outstanding_amount = greatest(total - paid_amount, 0) where outstanding_amount = 0 and total > 0;
update purchase_orders set outstanding_amount = greatest(total - paid_amount, 0) where outstanding_amount = 0 and total > 0;

create or replace function record_finance_transaction(
  p_ref text,
  p_transaction_type text,
  p_source_ref text,
  p_customer_id uuid,
  p_customer_name text,
  p_supplier_id uuid,
  p_supplier_name text,
  p_amount numeric,
  p_method text default 'Cash',
  p_description text default null,
  p_created_by text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_org uuid := get_org_id();
  transaction_id uuid;
  cash_type text;
  cash_description text;
  source_total numeric;
  source_paid numeric;
  applied_amount numeric;
begin
  perform require_permission('Finance', 'create');
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null then raise exception 'Finance reference is required'; end if;
  if p_transaction_type not in ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT') then raise exception 'Unsupported finance transaction type'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Finance amount must be greater than zero'; end if;
  if exists (select 1 from finance_transactions where org_id = current_org and ref = p_ref) then raise exception 'Finance reference already exists'; end if;

  if p_transaction_type = 'CUSTOMER_RECEIPT' and nullif(trim(p_source_ref), '') is not null then
    select total, paid_amount into source_total, source_paid from invoices where org_id = current_org and ref = p_source_ref for update;
    if not found then raise exception 'Invoice source reference was not found'; end if;
    applied_amount := least(p_amount, greatest(source_total - source_paid, 0));
    if applied_amount <= 0 or applied_amount < p_amount then raise exception 'Receipt exceeds invoice outstanding amount'; end if;
  elsif p_transaction_type = 'SUPPLIER_PAYMENT' and nullif(trim(p_source_ref), '') is not null then
    select total, paid_amount into source_total, source_paid from purchase_orders where org_id = current_org and ref = p_source_ref for update;
    if not found then raise exception 'Purchase order source reference was not found'; end if;
    applied_amount := least(p_amount, greatest(source_total - source_paid, 0));
    if applied_amount <= 0 or applied_amount < p_amount then raise exception 'Payment exceeds purchase order outstanding amount'; end if;
  end if;

  insert into finance_transactions (org_id, ref, transaction_type, source_ref, customer_id, customer_name, supplier_id, supplier_name, amount, method, description, created_by)
  values (current_org, p_ref, p_transaction_type, p_source_ref, p_customer_id, p_customer_name, p_supplier_id, p_supplier_name, p_amount, coalesce(p_method, 'Cash'), p_description, p_created_by)
  returning id into transaction_id;

  cash_type := case when p_transaction_type = 'CUSTOMER_RECEIPT' then 'Receipt' else 'Payment' end;
  cash_description := coalesce(p_description, cash_type || ' ' || p_ref);
  insert into cash_book (org_id, ref, type, description, amount, balance, created_at)
  values (current_org, p_ref, cash_type, cash_description, p_amount, p_amount, now());

  if p_transaction_type = 'CUSTOMER_RECEIPT' and nullif(trim(p_source_ref), '') is not null then
    update invoices
      set paid_amount = paid_amount + p_amount,
          outstanding_amount = greatest(total - paid_amount - p_amount, 0),
          status = case when paid_amount + p_amount >= total then 'Paid' else 'Partial' end
      where org_id = current_org and ref = p_source_ref;
  elsif p_transaction_type = 'SUPPLIER_PAYMENT' and nullif(trim(p_source_ref), '') is not null then
    update purchase_orders
      set paid_amount = paid_amount + p_amount,
          outstanding_amount = greatest(total - paid_amount - p_amount, 0),
          status = case when paid_amount + p_amount >= total then 'Paid' else 'Partial' end
      where org_id = current_org and ref = p_source_ref;
  end if;

  perform append_audit_event('finance_transactions', 'CREATE', p_ref, null,
    jsonb_build_object('transaction_type', p_transaction_type, 'source_ref', p_source_ref, 'amount', p_amount));

  return transaction_id;
end;
$$;

grant execute on function record_finance_transaction(text, text, text, uuid, text, uuid, text, numeric, text, text, text) to authenticated;
