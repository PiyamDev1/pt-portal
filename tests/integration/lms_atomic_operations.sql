\set ON_ERROR_STOP on

do $$
declare
  v_status jsonb;
  v_service jsonb;
  v_replay jsonb;
  v_loan_id uuid;
  v_transaction_count integer;
  v_installment_count integer;
  v_balance numeric;
begin
  select public.lms_schema_status() into v_status;
  if coalesce((v_status ->> 'ready')::boolean, false) is not true then
    raise exception 'LMS schema status is not ready: %', v_status;
  end if;
  if (v_status ->> 'version')::bigint <> 20260812 then
    raise exception 'Unexpected LMS schema version: %', v_status;
  end if;

  insert into public.employees (id, name, email)
  values ('00000000-0000-0000-0000-000000000001', 'Migration Test', 'migration@test.invalid');
  insert into public.loan_customers (id, first_name, last_name, created_by_employee_id)
  values (
    '00000000-0000-0000-0000-000000000002',
    'Atomic',
    'Customer',
    '00000000-0000-0000-0000-000000000001'
  );

  select public.lms_add_service(
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    120,
    30,
    3,
    current_date,
    'database integration service',
    '2026-08-12T09:00:00Z',
    '[{"dueDate":"2026-09-12","amount":30},{"dueDate":"2026-10-12","amount":30},{"dueDate":"2026-11-12","amount":30}]'::jsonb,
    'integration-service-1'
  ) into v_service;
  v_loan_id := (v_service ->> 'createdLoanId')::uuid;

  select current_balance into v_balance from public.loans where id = v_loan_id;
  if v_balance <> 90 then
    raise exception 'Expected service balance 90, received %', v_balance;
  end if;
  select count(*) into v_installment_count from public.loan_installments;
  if v_installment_count <> 3 then
    raise exception 'Expected 3 installments, received %', v_installment_count;
  end if;

  select public.lms_add_service(
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    120,
    30,
    3,
    current_date,
    'database integration service',
    '2026-08-12T09:00:00Z',
    '[{"dueDate":"2026-09-12","amount":30},{"dueDate":"2026-10-12","amount":30},{"dueDate":"2026-11-12","amount":30}]'::jsonb,
    'integration-service-1'
  ) into v_replay;
  if (v_replay ->> 'createdLoanId')::uuid <> v_loan_id
    or coalesce((v_replay ->> 'idempotentReplay')::boolean, false) is not true then
    raise exception 'Service retry was not idempotent: %', v_replay;
  end if;

  select count(*) into v_transaction_count
  from public.loan_transactions
  where loan_id = v_loan_id;
  if v_transaction_count <> 2 then
    raise exception 'Service replay duplicated ledger entries: %', v_transaction_count;
  end if;

  perform public.lms_record_payment(
    v_loan_id,
    '00000000-0000-0000-0000-000000000001',
    20,
    null,
    'database integration payment',
    '2026-08-12T10:00:00Z',
    'integration-payment-1'
  );
  perform public.lms_record_payment(
    v_loan_id,
    '00000000-0000-0000-0000-000000000001',
    20,
    null,
    'database integration payment',
    '2026-08-12T10:00:00Z',
    'integration-payment-1'
  );

  select current_balance into v_balance from public.loans where id = v_loan_id;
  if v_balance <> 70 then
    raise exception 'Expected balance 70 after payment, received %', v_balance;
  end if;
  select count(*) into v_transaction_count
  from public.loan_transactions
  where loan_id = v_loan_id
    and lower(transaction_type::text) = 'payment'
    and remark = 'database integration payment';
  if v_transaction_count <> 1 then
    raise exception 'Payment retry duplicated ledger entries: %', v_transaction_count;
  end if;

  perform public.lms_add_fee(
    '00000000-0000-0000-0000-000000000002',
    v_loan_id,
    '00000000-0000-0000-0000-000000000001',
    5,
    'database integration fee',
    '2026-08-12T11:00:00Z',
    'integration-fee-1'
  );
  select current_balance into v_balance from public.loans where id = v_loan_id;
  if v_balance <> 75 then
    raise exception 'Expected balance 75 after fee, received %', v_balance;
  end if;

  perform public.lms_update_customer(
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '{"phone":"01234567890","dateOfBirth":"1990-01-02"}'::jsonb,
    'verified integration note'
  );
  if not exists (
    select 1 from public.loan_account_notes
    where loan_customer_id = '00000000-0000-0000-0000-000000000002'
      and note = 'verified integration note'
  ) then
    raise exception 'Customer note was not appended atomically';
  end if;

  if (public.lms_list_accounts('active', null, 1, 50) -> 'pagination' ->> 'total')::integer <> 1 then
    raise exception 'Global account listing did not return the seeded active account';
  end if;
end
$$;

-- A reused key with a different payload must fail closed.
do $$
begin
  perform public.lms_record_payment(
    (select id from public.loans limit 1),
    '00000000-0000-0000-0000-000000000001',
    99,
    null,
    'different payload',
    '2026-08-12T10:00:00Z',
    'integration-payment-1'
  );
  raise exception 'Expected idempotency payload mismatch';
exception
  when sqlstate '22023' then null;
end
$$;
