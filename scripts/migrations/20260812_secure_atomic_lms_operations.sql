-- Secure, atomic LMS ledger operations and globally correct account listing.
--
-- Apply this migration before deploying the LMS API routes that call these RPCs.
-- Every mutation locks the affected loan, updates the ledger and its derived
-- balance in one transaction, and optionally deduplicates caller retries.

create table if not exists public.portal_schema_versions (
  component text primary key,
  version bigint not null,
  applied_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint portal_schema_versions_component_not_blank
    check (length(btrim(component)) between 1 and 100),
  constraint portal_schema_versions_version_positive check (version > 0)
);

alter table public.portal_schema_versions enable row level security;

drop policy if exists "Service role reads portal schema versions"
  on public.portal_schema_versions;
create policy "Service role reads portal schema versions"
  on public.portal_schema_versions
  for select
  to service_role
  using (true);

create table if not exists public.lms_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  action_name text not null,
  actor_id uuid not null,
  idempotency_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint lms_idempotency_keys_key_not_blank
    check (length(btrim(idempotency_key)) between 1 and 200),
  constraint lms_idempotency_keys_unique_action_actor_key
    unique (action_name, actor_id, idempotency_key)
);

create index if not exists lms_idempotency_keys_created_at_idx
  on public.lms_idempotency_keys (created_at desc);

alter table public.lms_idempotency_keys enable row level security;

drop policy if exists "Service role manages LMS idempotency keys"
  on public.lms_idempotency_keys;
create policy "Service role manages LMS idempotency keys"
  on public.lms_idempotency_keys
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_transaction_id uuid not null references public.loan_transactions(id) on delete cascade,
  installment_number integer not null,
  due_date date not null,
  amount numeric not null,
  status text not null default 'pending',
  amount_paid numeric default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint loan_installments_unique_per_transaction
    unique (loan_transaction_id, installment_number)
);

-- Older environments created this table from an API helper. Ratchet those
-- installations to the same uniqueness guarantee as fresh environments.
create unique index if not exists loan_installments_unique_per_transaction
  on public.loan_installments (loan_transaction_id, installment_number);

alter table public.loan_transactions
  add column if not exists installment_id uuid null,
  add column if not exists service_transaction_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loan_transactions_installment_id_fkey'
      and conrelid = 'public.loan_transactions'::regclass
  ) then
    alter table public.loan_transactions
      add constraint loan_transactions_installment_id_fkey
      foreign key (installment_id)
      references public.loan_installments(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'loan_transactions_service_transaction_id_fkey'
      and conrelid = 'public.loan_transactions'::regclass
  ) then
    alter table public.loan_transactions
      add constraint loan_transactions_service_transaction_id_fkey
      foreign key (service_transaction_id)
      references public.loan_transactions(id)
      on delete set null;
  end if;
end
$$;

create index if not exists loan_transactions_installment_id_idx
  on public.loan_transactions (installment_id)
  where installment_id is not null;

create index if not exists loan_transactions_service_transaction_id_idx
  on public.loan_transactions (service_transaction_id)
  where service_transaction_id is not null;

-- Associate legacy plan payments using the stable service prefix already
-- written into their remarks. This makes edits/deletes repair older schedules.
update public.loan_transactions payment
set service_transaction_id = service.id
from public.loan_transactions service
where payment.service_transaction_id is null
  and payment.loan_id = service.loan_id
  and lower(coalesce(payment.transaction_type::text, '')) = 'payment'
  and lower(coalesce(service.transaction_type::text, '')) = 'service'
  and (
    payment.remark like format('Service Plan %s - %%', left(service.id::text, 8))
    or payment.remark = format('Initial deposit - Loan #%s', left(service.id::text, 8))
  );

create or replace function public.lms_recalculate_loan(p_loan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_debt numeric := 0;
  v_total_paid numeric := 0;
  v_balance numeric := 0;
  v_status public.loan_status_type;
begin
  perform 1 from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found' using errcode = 'P0002';
  end if;

  select
    coalesce(sum(case
      when lower(coalesce(transaction_type::text, '')) in ('service', 'fee') then amount
      else 0
    end), 0),
    coalesce(sum(case
      when lower(coalesce(transaction_type::text, '')) = 'payment' then amount
      else 0
    end), 0)
  into v_total_debt, v_total_paid
  from public.loan_transactions
  where loan_id = p_loan_id;

  v_balance := greatest(v_total_debt - v_total_paid, 0);
  v_status := case when v_balance <= 0 then 'Paid Off' else 'Active' end;

  update public.loans
  set current_balance = v_balance,
      total_debt_amount = v_total_debt,
      status = v_status
  where id = p_loan_id;

  return jsonb_build_object(
    'loanId', p_loan_id,
    'newBalance', v_balance,
    'totalDebtAmount', v_total_debt,
    'status', v_status
  );
end
$$;

create or replace function public.lms_sync_installment_plan(p_service_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_amount numeric;
  v_service_paid numeric;
  v_remaining numeric;
  v_remaining_count integer;
begin
  select amount
  into v_service_amount
  from public.loan_transactions
  where id = p_service_transaction_id
    and lower(coalesce(transaction_type::text, '')) = 'service'
  for update;

  if not found then
    raise exception 'Service transaction not found' using errcode = 'P0002';
  end if;

  -- The payment ledger is the source of truth. Rebuild each installment's
  -- amount_paid so edits and deletes cannot leave the schedule stale.
  update public.loan_installments i
  set amount_paid = coalesce((
    select sum(t.amount)
    from public.loan_transactions t
    where t.installment_id = i.id
      and lower(coalesce(t.transaction_type::text, '')) = 'payment'
  ), 0)
  where i.loan_transaction_id = p_service_transaction_id;

  select coalesce(sum(amount), 0)
  into v_service_paid
  from public.loan_transactions
  where service_transaction_id = p_service_transaction_id
    and lower(coalesce(transaction_type::text, '')) = 'payment';

  v_remaining := greatest(v_service_amount - v_service_paid, 0);

  -- Re-open installments whose corrected payment no longer covers them, while
  -- preserving an intentional skipped status.
  update public.loan_installments
  set status = case
    when status = 'skipped' then 'skipped'
    when amount_paid >= amount and amount > 0 then 'paid'
    when amount_paid > 0 then 'partial'
    when due_date < current_date then 'overdue'
    else 'pending'
  end
  where loan_transaction_id = p_service_transaction_id;

  select count(*)
  into v_remaining_count
  from public.loan_installments
  where loan_transaction_id = p_service_transaction_id
    and status not in ('paid', 'skipped');

  if v_remaining_count > 0 then
    update public.loan_installments
    set amount = amount_paid + (v_remaining / v_remaining_count)
    where loan_transaction_id = p_service_transaction_id
      and status not in ('paid', 'skipped');
  end if;

  update public.loan_installments
  set status = case
    when status = 'skipped' then 'skipped'
    when amount_paid >= amount and amount > 0 then 'paid'
    when amount_paid > 0 then 'partial'
    when due_date < current_date then 'overdue'
    else 'pending'
  end
  where loan_transaction_id = p_service_transaction_id;
end
$$;

create or replace function public.lms_record_payment(
  p_loan_id uuid,
  p_employee_id uuid,
  p_amount numeric,
  p_payment_method_id uuid default null,
  p_remark text default null,
  p_transaction_timestamp timestamptz default now(),
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- This function is service-role-only and the route supplies the identity it
  -- resolved from the authenticated staff session.
  v_actor_id uuid := p_employee_id;
  v_payload jsonb;
  v_existing_payload jsonb;
  v_response jsonb;
  v_transaction_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authenticated employee required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'loanId', p_loan_id,
    'amount', p_amount,
    'paymentMethodId', p_payment_method_id,
    'remark', p_remark,
    'transactionTimestamp', p_transaction_timestamp
  );

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('lms.record_payment:' || v_actor_id::text || ':' || p_idempotency_key, 0)
    );
    select request_payload, response_payload
    into v_existing_payload, v_response
    from public.lms_idempotency_keys
    where action_name = 'lms.record_payment'
      and actor_id = v_actor_id
      and idempotency_key = p_idempotency_key;
    if found then
      if v_existing_payload <> v_payload then
        raise exception 'Idempotency key was already used for a different payment'
          using errcode = '22023';
      end if;
      return v_response || jsonb_build_object('idempotentReplay', true);
    end if;
  end if;

  perform 1 from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found' using errcode = 'P0002';
  end if;

  insert into public.loan_transactions (
    loan_id,
    employee_id,
    transaction_type,
    amount,
    payment_method_id,
    remark,
    transaction_timestamp
  ) values (
    p_loan_id,
    v_actor_id,
    'payment',
    p_amount,
    p_payment_method_id,
    p_remark,
    coalesce(p_transaction_timestamp, now())
  )
  returning id into v_transaction_id;

  v_response := public.lms_recalculate_loan(p_loan_id) || jsonb_build_object(
    'recordedPaymentLoanId', p_loan_id,
    'transactionId', v_transaction_id,
    'idempotentReplay', false
  );

  if p_idempotency_key is not null then
    insert into public.lms_idempotency_keys (
      action_name, actor_id, idempotency_key, request_payload, response_payload
    ) values (
      'lms.record_payment', v_actor_id, p_idempotency_key, v_payload, v_response
    );
  end if;

  return v_response;
end
$$;

create or replace function public.lms_record_installment_payment(
  p_installment_id uuid,
  p_loan_id uuid,
  p_service_transaction_id uuid,
  p_employee_id uuid,
  p_amount numeric,
  p_payment_method_id uuid default null,
  p_transaction_timestamp timestamptz default now(),
  p_idempotency_key text default null,
  p_expected_installment_number integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- This function is service-role-only and the route supplies the identity it
  -- resolved from the authenticated staff session.
  v_actor_id uuid := p_employee_id;
  v_payload jsonb;
  v_existing_payload jsonb;
  v_response jsonb;
  v_transaction_id uuid;
  v_installment_number integer;
  v_remark text;
begin
  if v_actor_id is null then
    raise exception 'Authenticated employee required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  if p_installment_id is null and p_expected_installment_number is null then
    raise exception 'Installment number required for a temporary installment'
      using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'installmentId', p_installment_id,
    'installmentNumber', p_expected_installment_number,
    'loanId', p_loan_id,
    'serviceTransactionId', p_service_transaction_id,
    'amount', p_amount,
    'paymentMethodId', p_payment_method_id,
    'transactionTimestamp', p_transaction_timestamp
  );

  if p_idempotency_key is not null then
    if length(btrim(p_idempotency_key)) not between 1 and 200 then
      raise exception 'Invalid idempotency key' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended('lms.record_installment_payment:' || v_actor_id::text || ':' || p_idempotency_key, 0)
    );
    select request_payload, response_payload
    into v_existing_payload, v_response
    from public.lms_idempotency_keys
    where action_name = 'lms.record_installment_payment'
      and actor_id = v_actor_id
      and idempotency_key = p_idempotency_key;
    if found then
      if v_existing_payload <> v_payload then
        raise exception 'Idempotency key was already used for a different installment payment'
          using errcode = '22023';
      end if;
      return v_response || jsonb_build_object('idempotentReplay', true);
    end if;
  end if;

  perform 1 from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.loan_transactions
  where id = p_service_transaction_id
    and loan_id = p_loan_id
    and lower(coalesce(transaction_type::text, '')) = 'service'
  for update;
  if not found then
    raise exception 'Service transaction not found for loan' using errcode = 'P0002';
  end if;

  if p_installment_id is not null then
    select installment_number
    into v_installment_number
    from public.loan_installments
    where id = p_installment_id
      and loan_transaction_id = p_service_transaction_id
    for update;
    if not found then
      raise exception 'Installment not found' using errcode = 'P0002';
    end if;

    update public.loan_installments
    set status = 'skipped', amount_paid = 0
    where loan_transaction_id = p_service_transaction_id
      and installment_number < v_installment_number
      and status = 'pending';
  else
    v_installment_number := p_expected_installment_number;
    update public.loan_installments
    set status = 'skipped', amount_paid = 0
    where loan_transaction_id = p_service_transaction_id
      and installment_number < v_installment_number
      and status = 'pending';
  end if;

  v_remark := case
    when v_installment_number is not null then
      format('Service Plan %s - Installment #%s payment', left(p_service_transaction_id::text, 8), v_installment_number)
    else
      format('Service Plan %s - Payment against installment', left(p_service_transaction_id::text, 8))
  end;

  insert into public.loan_transactions (
    loan_id,
    employee_id,
    transaction_type,
    amount,
    remark,
    transaction_timestamp,
    payment_method_id,
    installment_id,
    service_transaction_id
  ) values (
    p_loan_id,
    v_actor_id,
    'payment',
    p_amount,
    v_remark,
    coalesce(p_transaction_timestamp, now()),
    p_payment_method_id,
    p_installment_id,
    p_service_transaction_id
  )
  returning id into v_transaction_id;

  perform public.lms_sync_installment_plan(p_service_transaction_id);
  v_response := public.lms_recalculate_loan(p_loan_id) || jsonb_build_object(
    'recordedPaymentAmount', p_amount,
    'transactionId', v_transaction_id,
    'idempotentReplay', false
  );

  if p_idempotency_key is not null then
    insert into public.lms_idempotency_keys (
      action_name, actor_id, idempotency_key, request_payload, response_payload
    ) values (
      'lms.record_installment_payment',
      v_actor_id,
      p_idempotency_key,
      v_payload,
      v_response
    );
  end if;

  return v_response;
end
$$;

create or replace function public.lms_update_payment(
  p_transaction_id uuid,
  p_amount numeric default null,
  p_payment_method_id uuid default null,
  p_set_payment_method boolean default false,
  p_transaction_timestamp timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.loan_transactions%rowtype;
  v_response jsonb;
begin
  select *
  into v_payment
  from public.loan_transactions
  where id = p_transaction_id
    and lower(coalesce(transaction_type::text, '')) = 'payment'
  for update;
  if not found then
    raise exception 'Payment transaction not found' using errcode = 'P0002';
  end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  update public.loan_transactions
  set amount = coalesce(p_amount, amount),
      payment_method_id = case when p_set_payment_method then p_payment_method_id else payment_method_id end,
      transaction_timestamp = coalesce(p_transaction_timestamp, transaction_timestamp)
  where id = p_transaction_id;

  if v_payment.service_transaction_id is not null then
    perform public.lms_sync_installment_plan(v_payment.service_transaction_id);
  end if;

  v_response := public.lms_recalculate_loan(v_payment.loan_id);
  return v_response || jsonb_build_object('updatedTransactionId', p_transaction_id);
end
$$;

create or replace function public.lms_delete_payment(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.loan_transactions%rowtype;
  v_response jsonb;
begin
  select *
  into v_payment
  from public.loan_transactions
  where id = p_transaction_id
    and lower(coalesce(transaction_type::text, '')) = 'payment'
  for update;
  if not found then
    raise exception 'Payment transaction not found' using errcode = 'P0002';
  end if;

  delete from public.loan_transactions where id = p_transaction_id;

  if v_payment.service_transaction_id is not null then
    perform public.lms_sync_installment_plan(v_payment.service_transaction_id);
  end if;

  v_response := public.lms_recalculate_loan(v_payment.loan_id);
  return v_response || jsonb_build_object('deletedTransactionId', p_transaction_id);
end
$$;

create or replace function public.lms_delete_installment_plan(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loan_id uuid;
  v_response jsonb;
begin
  select loan_id
  into v_loan_id
  from public.loan_transactions
  where id = p_transaction_id
    and lower(coalesce(transaction_type::text, '')) = 'service'
  for update;
  if not found then
    raise exception 'Service transaction not found' using errcode = 'P0002';
  end if;

  perform 1 from public.loans where id = v_loan_id for update;
  if exists (
    select 1
    from public.loan_transactions
    where service_transaction_id = p_transaction_id
      and lower(coalesce(transaction_type::text, '')) = 'payment'
  ) then
    raise exception 'Cannot delete an installment plan that has payments'
      using errcode = '23503';
  end if;
  delete from public.loan_package_links where loan_transaction_id = p_transaction_id;
  delete from public.loan_installments where loan_transaction_id = p_transaction_id;
  delete from public.loan_transactions where id = p_transaction_id;

  v_response := public.lms_recalculate_loan(v_loan_id);
  return v_response || jsonb_build_object('deletedTransactionId', p_transaction_id);
end
$$;

create or replace function public.lms_skip_installment(p_installment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_transaction_id uuid;
  v_loan_id uuid;
  v_response jsonb;
  v_remaining_count integer;
  v_remaining_balance numeric;
  v_new_amount numeric;
begin
  select i.loan_transaction_id, transaction_row.loan_id
  into v_service_transaction_id, v_loan_id
  from public.loan_installments i
  join public.loan_transactions transaction_row on transaction_row.id = i.loan_transaction_id
  where i.id = p_installment_id
  for update of i, transaction_row;

  if not found then
    raise exception 'Installment not found' using errcode = 'P0002';
  end if;

  perform 1 from public.loans where id = v_loan_id for update;

  update public.loan_installments
  set status = 'skipped', amount_paid = 0
  where id = p_installment_id;

  perform public.lms_sync_installment_plan(v_service_transaction_id);
  v_response := public.lms_recalculate_loan(v_loan_id);

  select count(*), coalesce(max(amount), 0)
  into v_remaining_count, v_new_amount
  from public.loan_installments
  where loan_transaction_id = v_service_transaction_id
    and status not in ('paid', 'partial', 'skipped');

  v_remaining_balance := coalesce((v_response ->> 'newBalance')::numeric, 0);
  return v_response || jsonb_build_object(
    'skippedInstallmentId', p_installment_id,
    'remainingBalance', v_remaining_balance,
    'remainingInstallments', v_remaining_count,
    'newAmountPerInstallment', case when v_remaining_count > 0 then v_new_amount else 0 end
  );
end
$$;

create or replace function public.lms_add_service(
  p_customer_id uuid,
  p_actor_id uuid,
  p_service_amount numeric,
  p_initial_deposit numeric default 0,
  p_term_months integer default 3,
  p_next_due_date date default current_date,
  p_remark text default null,
  p_transaction_timestamp timestamptz default now(),
  p_installment_plan jsonb default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_existing_payload jsonb;
  v_response jsonb;
  v_loan_id uuid;
  v_service_transaction_id uuid;
  v_remaining numeric;
  v_term_months integer := least(greatest(coalesce(p_term_months, 3), 1), 120);
  v_plan_count integer := 0;
  v_plan_total numeric := 0;
  v_item jsonb;
  v_ordinality bigint;
  v_item_amount numeric;
  v_item_due_date date;
begin
  if p_actor_id is null then
    raise exception 'Authenticated employee required' using errcode = '42501';
  end if;
  if p_customer_id is null or p_service_amount is null or p_service_amount <= 0 then
    raise exception 'Valid customer and service amount required' using errcode = '22023';
  end if;
  if coalesce(p_initial_deposit, 0) < 0 or coalesce(p_initial_deposit, 0) > p_service_amount then
    raise exception 'Initial deposit must be between zero and the service amount'
      using errcode = '22023';
  end if;
  if p_installment_plan is not null and jsonb_typeof(p_installment_plan) <> 'array' then
    raise exception 'Installment plan must be an array' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  v_remaining := p_service_amount - coalesce(p_initial_deposit, 0);
  v_payload := jsonb_build_object(
    'customerId', p_customer_id,
    'serviceAmount', p_service_amount,
    'initialDeposit', coalesce(p_initial_deposit, 0),
    'termMonths', v_term_months,
    'nextDueDate', p_next_due_date,
    'remark', p_remark,
    'transactionTimestamp', p_transaction_timestamp,
    'installmentPlan', coalesce(p_installment_plan, '[]'::jsonb)
  );

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('lms.add_service:' || p_actor_id::text || ':' || p_idempotency_key, 0)
    );
    select request_payload, response_payload
    into v_existing_payload, v_response
    from public.lms_idempotency_keys
    where action_name = 'lms.add_service'
      and actor_id = p_actor_id
      and idempotency_key = p_idempotency_key;
    if found then
      if v_existing_payload <> v_payload then
        raise exception 'Idempotency key was already used for a different service'
          using errcode = '22023';
      end if;
      return v_response || jsonb_build_object('idempotentReplay', true);
    end if;
  end if;

  perform 1 from public.loan_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  insert into public.loans (
    loan_customer_id,
    employee_id,
    total_debt_amount,
    current_balance,
    term_months,
    next_due_date,
    status
  ) values (
    p_customer_id,
    p_actor_id,
    p_service_amount,
    v_remaining,
    v_term_months,
    coalesce(p_next_due_date, current_date),
    (case when v_remaining <= 0 then 'Paid Off' else 'Active' end)::public.loan_status_type
  )
  returning id into v_loan_id;

  insert into public.loan_transactions (
    loan_id,
    employee_id,
    transaction_type,
    amount,
    remark,
    transaction_timestamp
  ) values (
    v_loan_id,
    p_actor_id,
    'service',
    p_service_amount,
    p_remark,
    coalesce(p_transaction_timestamp, now())
  )
  returning id into v_service_transaction_id;

  if v_remaining > 0 then
    v_plan_count := jsonb_array_length(coalesce(p_installment_plan, '[]'::jsonb));
    if v_plan_count > 0 then
      for v_item, v_ordinality in
        select value, ordinality
        from jsonb_array_elements(p_installment_plan) with ordinality
      loop
        begin
          v_item_amount := (v_item ->> 'amount')::numeric;
          v_item_due_date := (v_item ->> 'dueDate')::date;
        exception when others then
          raise exception 'Each installment requires a valid dueDate and amount'
            using errcode = '22023';
        end;
        if v_item_amount <= 0 then
          raise exception 'Installment amounts must be greater than zero'
            using errcode = '22023';
        end if;
        v_plan_total := v_plan_total + v_item_amount;
        insert into public.loan_installments (
          loan_transaction_id, installment_number, due_date, amount, status, amount_paid
        ) values (
          v_service_transaction_id,
          v_ordinality::integer,
          v_item_due_date,
          v_item_amount,
          'pending',
          0
        );
      end loop;
      if abs(v_plan_total - v_remaining) > 0.01 then
        raise exception 'Installment total must equal the remaining service balance'
          using errcode = '22023';
      end if;
    else
      insert into public.loan_installments (
        loan_transaction_id, installment_number, due_date, amount, status, amount_paid
      )
      select
        v_service_transaction_id,
        installment_number,
        (coalesce(p_next_due_date, current_date)
          + make_interval(months => installment_number - 1))::date,
        v_remaining / v_term_months,
        'pending',
        0
      from generate_series(1, v_term_months) installment_number;
    end if;
  end if;

  if coalesce(p_initial_deposit, 0) > 0 then
    insert into public.loan_transactions (
      loan_id,
      employee_id,
      transaction_type,
      amount,
      remark,
      transaction_timestamp,
      service_transaction_id
    ) values (
      v_loan_id,
      p_actor_id,
      'payment',
      p_initial_deposit,
      format('Initial deposit - Loan #%s', left(v_service_transaction_id::text, 8)),
      coalesce(p_transaction_timestamp, now()),
      v_service_transaction_id
    );
  end if;

  v_response := jsonb_build_object(
    'createdLoanId', v_loan_id,
    'serviceTransactionId', v_service_transaction_id,
    'idempotentReplay', false
  );
  if p_idempotency_key is not null then
    insert into public.lms_idempotency_keys (
      action_name, actor_id, idempotency_key, request_payload, response_payload
    ) values (
      'lms.add_service', p_actor_id, p_idempotency_key, v_payload, v_response
    );
  end if;
  return v_response;
end
$$;

create or replace function public.lms_add_fee(
  p_customer_id uuid,
  p_loan_id uuid,
  p_actor_id uuid,
  p_amount numeric,
  p_remark text default null,
  p_transaction_timestamp timestamptz default now(),
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_existing_payload jsonb;
  v_response jsonb;
  v_target_loan_id uuid := p_loan_id;
  v_transaction_id uuid;
begin
  if p_actor_id is null then
    raise exception 'Authenticated employee required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valid fee amount required' using errcode = '22023';
  end if;
  if v_target_loan_id is null and p_customer_id is null then
    raise exception 'Customer or loan required for fee' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'customerId', p_customer_id,
    'loanId', p_loan_id,
    'amount', p_amount,
    'remark', p_remark,
    'transactionTimestamp', p_transaction_timestamp
  );
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('lms.add_fee:' || p_actor_id::text || ':' || p_idempotency_key, 0)
    );
    select request_payload, response_payload
    into v_existing_payload, v_response
    from public.lms_idempotency_keys
    where action_name = 'lms.add_fee'
      and actor_id = p_actor_id
      and idempotency_key = p_idempotency_key;
    if found then
      if v_existing_payload <> v_payload then
        raise exception 'Idempotency key was already used for a different fee'
          using errcode = '22023';
      end if;
      return v_response || jsonb_build_object('idempotentReplay', true);
    end if;
  end if;

  if v_target_loan_id is not null then
    perform 1
    from public.loans
    where id = v_target_loan_id
      and (p_customer_id is null or loan_customer_id = p_customer_id)
    for update;
    if not found then
      raise exception 'Loan not found for customer' using errcode = 'P0002';
    end if;
  else
    perform 1 from public.loan_customers where id = p_customer_id for update;
    if not found then
      raise exception 'Customer not found' using errcode = 'P0002';
    end if;
    select id
    into v_target_loan_id
    from public.loans
    where loan_customer_id = p_customer_id
    order by created_at desc
    limit 1
    for update;

    if v_target_loan_id is null then
      insert into public.loans (
        loan_customer_id, employee_id, total_debt_amount, current_balance,
        term_months, next_due_date, status
      ) values (
        p_customer_id, p_actor_id, 0, 0, 12, current_date, 'Active'
      )
      returning id into v_target_loan_id;
    end if;
  end if;

  insert into public.loan_transactions (
    loan_id, employee_id, transaction_type, amount, remark, transaction_timestamp
  ) values (
    v_target_loan_id,
    p_actor_id,
    'fee',
    p_amount,
    coalesce(p_remark, 'Additional fee'),
    coalesce(p_transaction_timestamp, now())
  )
  returning id into v_transaction_id;

  v_response := public.lms_recalculate_loan(v_target_loan_id) || jsonb_build_object(
    'loanId', v_target_loan_id,
    'feeAdded', p_amount,
    'transactionId', v_transaction_id,
    'idempotentReplay', false
  );
  if p_idempotency_key is not null then
    insert into public.lms_idempotency_keys (
      action_name, actor_id, idempotency_key, request_payload, response_payload
    ) values (
      'lms.add_fee', p_actor_id, p_idempotency_key, v_payload, v_response
    );
  end if;
  return v_response;
end
$$;

create or replace function public.lms_create_customer(
  p_actor_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_initial_transaction jsonb default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_existing_payload jsonb;
  v_response jsonb;
  v_customer_id uuid;
  v_loan_id uuid;
  v_initial_type text;
  v_initial_amount numeric;
begin
  if p_actor_id is null then
    raise exception 'Authenticated employee required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_first_name, '')), '') is null
    or nullif(btrim(coalesce(p_last_name, '')), '') is null then
    raise exception 'First and last name are required' using errcode = '22023';
  end if;
  if p_initial_transaction is not null and jsonb_typeof(p_initial_transaction) <> 'object' then
    raise exception 'Initial transaction must be an object' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'firstName', btrim(p_first_name),
    'lastName', btrim(p_last_name),
    'phone', p_phone,
    'email', p_email,
    'address', p_address,
    'initialTransaction', p_initial_transaction
  );
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('lms.create_customer:' || p_actor_id::text || ':' || p_idempotency_key, 0)
    );
    select request_payload, response_payload
    into v_existing_payload, v_response
    from public.lms_idempotency_keys
    where action_name = 'lms.create_customer'
      and actor_id = p_actor_id
      and idempotency_key = p_idempotency_key;
    if found then
      if v_existing_payload <> v_payload then
        raise exception 'Idempotency key was already used for a different customer'
          using errcode = '22023';
      end if;
      return v_response || jsonb_build_object('idempotentReplay', true);
    end if;
  end if;

  if p_initial_transaction is not null then
    begin
      v_initial_type := lower(coalesce(p_initial_transaction ->> 'type', ''));
      v_initial_amount := (p_initial_transaction ->> 'amount')::numeric;
    exception when others then
      raise exception 'Initial transaction amount is invalid' using errcode = '22023';
    end;
    if v_initial_type not in ('service', 'fee') then
      raise exception 'Initial transaction must be a service or fee'
        using errcode = '22023';
    end if;
    if v_initial_amount <= 0 then
      raise exception 'Initial transaction amount must be greater than zero'
        using errcode = '22023';
    end if;
  end if;

  insert into public.loan_customers (
    first_name, last_name, phone_number, email, address,
    created_by_employee_id, link_status
  ) values (
    btrim(p_first_name),
    btrim(p_last_name),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    p_actor_id,
    'New Entry'
  )
  returning id into v_customer_id;

  if p_initial_transaction is not null then
    insert into public.loans (
      loan_customer_id, employee_id, total_debt_amount, current_balance,
      term_months, status, next_due_date
    ) values (
      v_customer_id, p_actor_id, v_initial_amount, v_initial_amount,
      12, 'Active', current_date
    )
    returning id into v_loan_id;

    insert into public.loan_transactions (
      loan_id, employee_id, transaction_type, amount, remark, transaction_timestamp
    ) values (
      v_loan_id,
      p_actor_id,
      v_initial_type::public.loan_transaction_type,
      v_initial_amount,
      coalesce(nullif(btrim(p_initial_transaction ->> 'notes'), ''), 'Initial transaction'),
      now()
    );
  end if;

  v_response := jsonb_build_object(
    'customerId', v_customer_id,
    'createdLoanId', v_loan_id,
    'idempotentReplay', false
  );
  if p_idempotency_key is not null then
    insert into public.lms_idempotency_keys (
      action_name, actor_id, idempotency_key, request_payload, response_payload
    ) values (
      'lms.create_customer', p_actor_id, p_idempotency_key, v_payload, v_response
    );
  end if;
  return v_response;
end
$$;

create or replace function public.lms_update_customer(
  p_customer_id uuid,
  p_actor_id uuid,
  p_updates jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_actor_id is null then
    raise exception 'Authenticated employee required' using errcode = '42501';
  end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' then
    raise exception 'Customer updates must be an object' using errcode = '22023';
  end if;
  update public.loan_customers
  set phone_number = case
        when p_updates ? 'phone' then nullif(btrim(coalesce(p_updates ->> 'phone', '')), '')
        else phone_number
      end,
      email = case
        when p_updates ? 'email' then nullif(btrim(coalesce(p_updates ->> 'email', '')), '')
        else email
      end,
      address = case
        when p_updates ? 'address' then nullif(btrim(coalesce(p_updates ->> 'address', '')), '')
        else address
      end,
      date_of_birth = case
        when p_updates ? 'dateOfBirth'
          then nullif(btrim(coalesce(p_updates ->> 'dateOfBirth', '')), '')::date
        else date_of_birth
      end
  where id = p_customer_id;
  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.loan_account_notes (loan_customer_id, created_by, note)
    values (p_customer_id, p_actor_id, btrim(p_note));
  end if;
  return jsonb_build_object('updatedCustomerId', p_customer_id);
end
$$;

create or replace function public.lms_delete_customer(
  p_customer_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer jsonb;
begin
  select to_jsonb(customer_row)
  into v_customer
  from public.loan_customers customer_row
  where customer_row.id = p_customer_id
  for update;

  if v_customer is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  insert into public.deletion_logs (
    record_type,
    deleted_record_data,
    deleted_by,
    auth_code_used
  ) values (
    'LMS Customer',
    v_customer,
    p_actor_id,
    '[fresh second factor verified]'
  );

  update public.daily_payment_splits
  set clearing_lms_transaction_id = null
  where clearing_lms_transaction_id in (
    select transaction_row.id
    from public.loan_transactions transaction_row
    join public.loans loan_row on loan_row.id = transaction_row.loan_id
    where loan_row.loan_customer_id = p_customer_id
  );

  delete from public.loan_package_links
  where loan_transaction_id in (
    select transaction_row.id
    from public.loan_transactions transaction_row
    join public.loans loan_row on loan_row.id = transaction_row.loan_id
    where loan_row.loan_customer_id = p_customer_id
  );
  delete from public.loan_installments
  where loan_transaction_id in (
    select transaction_row.id
    from public.loan_transactions transaction_row
    join public.loans loan_row on loan_row.id = transaction_row.loan_id
    where loan_row.loan_customer_id = p_customer_id
  );
  delete from public.loan_transactions
  where loan_id in (
    select id from public.loans where loan_customer_id = p_customer_id
  );
  delete from public.loan_collections_log
  where loan_id in (
    select id from public.loans where loan_customer_id = p_customer_id
  );
  delete from public.loans where loan_customer_id = p_customer_id;
  delete from public.loan_account_notes where loan_customer_id = p_customer_id;
  delete from public.loan_customers where id = p_customer_id;

  return jsonb_build_object('deletedCustomerId', p_customer_id);
end
$$;

create or replace function public.lms_clear_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_installments integer;
  v_transactions integer;
  v_loans integer;
  v_customers integer;
begin
  update public.daily_payment_splits
  set clearing_lms_transaction_id = null
  where clearing_lms_transaction_id is not null;

  delete from public.loan_package_links;
  delete from public.loan_installments;
  get diagnostics v_installments = row_count;
  delete from public.loan_transactions;
  get diagnostics v_transactions = row_count;
  delete from public.loan_collections_log;
  delete from public.loans;
  get diagnostics v_loans = row_count;
  delete from public.loan_account_notes;
  delete from public.loan_customers;
  get diagnostics v_customers = row_count;

  return jsonb_build_object(
    'installments', v_installments,
    'transactions', v_transactions,
    'loans', v_loans,
    'customers', v_customers
  );
end
$$;

create or replace function public.lms_wipe_installments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.loan_installments;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deletedInstallmentCount', v_deleted);
end
$$;

create or replace function public.lms_list_accounts(
  p_filter text default 'active',
  p_account_id text default null,
  p_page integer default 1,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with customer_metrics as (
  select
    c.*,
    coalesce((
      select sum(case
        when lower(coalesce(t.transaction_type::text, '')) in ('service', 'fee') then t.amount
        when lower(coalesce(t.transaction_type::text, '')) = 'payment' then -t.amount
        else 0
      end)
      from public.loans l
      join public.loan_transactions t on t.loan_id = l.id
      where l.loan_customer_id = c.id
    ), 0)::numeric as balance,
    (select count(*) from public.loans l where l.loan_customer_id = c.id)::integer as total_loans,
    (select max(t.transaction_timestamp)
      from public.loans l
      join public.loan_transactions t on t.loan_id = l.id
      where l.loan_customer_id = c.id) as last_transaction,
    (select min(due_at)
      from (
        select coalesce(
          (select min(i.due_date::timestamptz)
           from public.loan_installments i
           where i.loan_transaction_id = t.id
             and i.status not in ('paid', 'skipped')),
          case
            when exists (select 1 from public.loan_installments ix where ix.loan_transaction_id = t.id)
              then null
            else t.transaction_timestamp
          end
        ) as due_at
        from public.loans l
        join public.loan_transactions t on t.loan_id = l.id
        where l.loan_customer_id = c.id
          and lower(coalesce(t.transaction_type::text, '')) = 'service'
        union all
        select t.transaction_timestamp
        from public.loans l
        join public.loan_transactions t on t.loan_id = l.id
        where l.loan_customer_id = c.id
          and lower(coalesce(t.transaction_type::text, '')) = 'fee'
      ) due_dates) as next_due,
    (select count(*)
      from public.loans l
      join public.loan_transactions t on t.loan_id = l.id
      where l.loan_customer_id = c.id
        and lower(coalesce(t.transaction_type::text, '')) = 'service'
        and (
          exists (
            select 1 from public.loan_installments i
            where i.loan_transaction_id = t.id
              and i.status not in ('paid', 'skipped')
          )
          or (
            not exists (
              select 1 from public.loan_installments ix
              where ix.loan_transaction_id = t.id
            )
            and coalesce((
              select sum(case
                when lower(coalesce(tx.transaction_type::text, '')) in ('service', 'fee') then tx.amount
                when lower(coalesce(tx.transaction_type::text, '')) = 'payment' then -tx.amount
                else 0
              end)
              from public.loan_transactions tx
              where tx.loan_id = l.id
            ), 0) > 0
          )
        ))::integer as active_loans,
    coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at desc)
      from public.loans l
      where l.loan_customer_id = c.id
    ), '[]'::jsonb) as loans_json,
    coalesce((
      select jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'loan_payment_methods',
          case when pm.name is null then null else jsonb_build_object('name', pm.name) end
        )
        order by t.transaction_timestamp desc
      )
      from public.loans l
      join public.loan_transactions t on t.loan_id = l.id
      left join public.loan_payment_methods pm on pm.id = t.payment_method_id
      where l.loan_customer_id = c.id
    ), '[]'::jsonb) as transactions_json
  from public.loan_customers c
), enriched as (
  select
    cm.*,
    (cm.next_due is not null and cm.next_due < now() and cm.balance > 0) as is_overdue,
    (cm.next_due is not null
      and cm.next_due >= now()
      and cm.next_due <= now() + interval '7 days'
      and cm.balance > 0) as is_due_soon
  from customer_metrics cm
), filtered as (
  select *
  from enriched e
  where case
    when p_account_id is not null then e.id::text = p_account_id
    when lower(coalesce(p_filter, 'active')) = 'active' then e.balance > 0
    when lower(coalesce(p_filter, 'active')) = 'overdue' then e.is_overdue
    when lower(coalesce(p_filter, 'active')) = 'settled' then e.balance <= 0 and e.total_loans > 0
    else true
  end
), page_rows as (
  select *
  from filtered
  order by created_at desc
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_limit, 50), 1), 100)
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
), account_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', concat_ws(' ', p.first_name, p.last_name),
      'firstName', p.first_name,
      'lastName', p.last_name,
      'phone', p.phone_number,
      'email', p.email,
      'address', p.address,
      'balance', p.balance,
      'activeLoans', p.active_loans,
      'totalLoans', p.total_loans,
      'nextDue', p.next_due,
      'isOverdue', p.is_overdue,
      'isDueSoon', p.is_due_soon,
      'lastTransaction', p.last_transaction,
      'transactions', p.transactions_json,
      'loans', p.loans_json
    ) order by p.created_at desc
  ), '[]'::jsonb) as accounts
  from page_rows p
), totals as (
  select
    coalesce(sum(balance), 0) as total_outstanding,
    count(*) filter (where balance > 0) as active_accounts,
    count(*) filter (where is_overdue) as overdue_accounts,
    count(*) filter (where is_due_soon) as due_soon_accounts,
    count(*) filter (where total_loans > 0) as total_accounts
  from enriched
), filtered_count as (
  select count(*)::integer as total from filtered
)
select jsonb_build_object(
  'accounts', a.accounts,
  'stats', jsonb_build_object(
    'totalOutstanding', t.total_outstanding,
    'activeAccounts', t.active_accounts,
    'overdueAccounts', t.overdue_accounts,
    'dueSoonAccounts', t.due_soon_accounts,
    'totalAccounts', t.total_accounts
  ),
  'pagination', jsonb_build_object(
    'page', greatest(coalesce(p_page, 1), 1),
    'limit', least(greatest(coalesce(p_limit, 50), 1), 100),
    'total', f.total,
    'pages', case
      when f.total = 0 then 0
      else ceil(f.total::numeric / least(greatest(coalesce(p_limit, 50), 1), 100))::integer
    end
  )
)
from account_json a
cross join totals t
cross join filtered_count f;
$$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'lms',
  20260812,
  now(),
  jsonb_build_object(
    'migration', '20260812_secure_atomic_lms_operations.sql',
    'capabilities', jsonb_build_array('atomic-ledger', 'idempotency', 'global-pagination')
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details;

create or replace function public.lms_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ready', coalesce(version >= 20260812, false),
    'version', version,
    'requiredVersion', 20260812,
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'lms'
$$;

revoke all on function public.lms_recalculate_loan(uuid) from public, anon, authenticated;
revoke all on function public.lms_sync_installment_plan(uuid) from public, anon, authenticated;
revoke all on function public.lms_record_payment(uuid, uuid, numeric, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.lms_record_installment_payment(uuid, uuid, uuid, uuid, numeric, uuid, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.lms_update_payment(uuid, numeric, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.lms_delete_payment(uuid) from public, anon, authenticated;
revoke all on function public.lms_delete_installment_plan(uuid) from public, anon, authenticated;
revoke all on function public.lms_add_service(uuid, uuid, numeric, numeric, integer, date, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.lms_add_fee(uuid, uuid, uuid, numeric, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.lms_create_customer(uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.lms_update_customer(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.lms_delete_customer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lms_skip_installment(uuid) from public, anon, authenticated;
revoke all on function public.lms_clear_all_data() from public, anon, authenticated;
revoke all on function public.lms_wipe_installments() from public, anon, authenticated;
revoke all on function public.lms_list_accounts(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.lms_schema_status() from public, anon, authenticated;

-- Routes authenticate and authorize staff before using their server-only
-- service client. Keeping these RPCs service-role-only prevents bypassing that
-- route boundary with a direct authenticated PostgREST call.
grant execute on function public.lms_record_payment(uuid, uuid, numeric, uuid, text, timestamptz, text) to service_role;
grant execute on function public.lms_record_installment_payment(uuid, uuid, uuid, uuid, numeric, uuid, timestamptz, text, integer) to service_role;
grant execute on function public.lms_update_payment(uuid, numeric, uuid, boolean, timestamptz) to service_role;
grant execute on function public.lms_delete_payment(uuid) to service_role;
grant execute on function public.lms_delete_installment_plan(uuid) to service_role;
grant execute on function public.lms_add_service(uuid, uuid, numeric, numeric, integer, date, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.lms_add_fee(uuid, uuid, uuid, numeric, text, timestamptz, text) to service_role;
grant execute on function public.lms_create_customer(uuid, text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.lms_update_customer(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.lms_delete_customer(uuid, uuid) to service_role;
grant execute on function public.lms_skip_installment(uuid) to service_role;
grant execute on function public.lms_clear_all_data() to service_role;
grant execute on function public.lms_wipe_installments() to service_role;
grant execute on function public.lms_list_accounts(text, text, integer, integer) to service_role;
grant execute on function public.lms_schema_status() to service_role;

comment on function public.lms_record_payment(uuid, uuid, numeric, uuid, text, timestamptz, text)
  is 'Atomically records an LMS payment, recalculates the loan, and deduplicates retries.';
comment on function public.lms_record_installment_payment(uuid, uuid, uuid, uuid, numeric, uuid, timestamptz, text, integer)
  is 'Atomically records an installment payment and synchronizes installment and loan balances.';
comment on function public.lms_add_service(uuid, uuid, numeric, numeric, integer, date, text, timestamptz, jsonb, text)
  is 'Atomically creates an LMS loan, service ledger entry, installment plan, and initial deposit.';
comment on function public.lms_add_fee(uuid, uuid, uuid, numeric, text, timestamptz, text)
  is 'Atomically creates an LMS fee and recalculates the affected loan.';
comment on function public.lms_create_customer(uuid, text, text, text, text, text, jsonb, text)
  is 'Atomically creates an LMS customer and optional initial debt transaction.';
comment on function public.lms_update_customer(uuid, uuid, jsonb, text)
  is 'Atomically updates LMS customer details and appends an optional account note.';
comment on function public.lms_list_accounts(text, text, integer, integer)
  is 'Filters and paginates LMS accounts after calculating global ledger-derived metrics.';
comment on function public.lms_schema_status()
  is 'Reports whether the required atomic LMS schema migration is installed.';
