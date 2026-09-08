-- Phase 6: finance transaction foundation
create table if not exists finance_transactions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  ref text not null,
  transaction_type text not null check (transaction_type in ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT')),
  source_ref text,
  customer_id uuid references customers(id),
  customer_name text,
  supplier_id uuid references suppliers(id),
  supplier_name text,
  amount numeric(18,0) not null check (amount > 0),
  method text not null default 'Cash',
  description text,
  created_by text,
  created_at timestamptz default now(),
  unique (org_id, ref)
);

alter table finance_transactions enable row level security;
drop policy if exists "org_isolation" on finance_transactions;
drop policy if exists "org_insert_finance_transactions" on finance_transactions;
drop policy if exists "org_update_finance_transactions" on finance_transactions;
drop policy if exists "org_delete_finance_transactions" on finance_transactions;
create policy "org_isolation" on finance_transactions using (org_id = get_org_id());
create policy "org_insert_finance_transactions" on finance_transactions for insert with check (org_id = get_org_id());
create policy "org_update_finance_transactions" on finance_transactions for update using (org_id = get_org_id());
create policy "org_delete_finance_transactions" on finance_transactions for delete using (org_id = get_org_id());

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
declare current_org uuid := get_org_id(); transaction_id uuid; cash_type text; cash_description text;
begin
  if current_org is null then raise exception 'Organization context is required'; end if;
  if nullif(trim(p_ref), '') is null then raise exception 'Finance reference is required'; end if;
  if p_transaction_type not in ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT') then raise exception 'Unsupported finance transaction type'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Finance amount must be greater than zero'; end if;
  if exists (select 1 from finance_transactions where org_id = current_org and ref = p_ref) then raise exception 'Finance reference already exists'; end if;

  insert into finance_transactions (org_id, ref, transaction_type, source_ref, customer_id, customer_name, supplier_id, supplier_name, amount, method, description, created_by)
  values (current_org, p_ref, p_transaction_type, p_source_ref, p_customer_id, p_customer_name, p_supplier_id, p_supplier_name, p_amount, coalesce(p_method, 'Cash'), p_description, p_created_by)
  returning id into transaction_id;

  cash_type := case when p_transaction_type = 'CUSTOMER_RECEIPT' then 'Receipt' else 'Payment' end;
  cash_description := coalesce(p_description, cash_type || ' ' || p_ref);
  insert into cash_book (org_id, ref, type, description, amount, balance, created_at)
  values (current_org, p_ref, cash_type, cash_description, p_amount, p_amount, now());
  return transaction_id;
end;
$$;

grant execute on function record_finance_transaction(text, text, text, uuid, text, uuid, text, numeric, text, text, text) to authenticated;
