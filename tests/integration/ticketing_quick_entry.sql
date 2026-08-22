\set ON_ERROR_STOP on

-- The foundation fixture intentionally models only the package tables consumed
-- by its own migration. Quick-entry additionally consumes the existing linked
-- family-package membership directory present in the live schema.
create table if not exists public.travel_package_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_package_groups(id) on delete cascade,
  package_id uuid references public.travel_packages(id) on delete cascade,
  is_lead_family boolean not null default false,
  sort_order integer not null default 0,
  check (package_id is not null)
);

create unique index if not exists ticketing_test_group_members_package_unique
  on public.travel_package_group_members (group_id, package_id)
  where package_id is not null;

do $$
declare
  status_value jsonb;
begin
  if not exists (
    select 1 from public.departments where lower(btrim(name)) = 'ticketing'
  ) then
    raise exception 'Ticketing department seed is missing';
  end if;

  if not exists (
    select 1 from public.airlines
    where iata_code::text = 'TK' and name = 'Turkish Airlines' and is_active
  ) or not exists (
    select 1 from public.airlines
    where iata_code::text = 'PK'
      and name = 'Pakistan International Airlines'
      and is_active
  ) or not exists (
    select 1 from public.airlines
    where iata_code::text = 'SV' and name = 'Saudia' and is_active
  ) then
    raise exception 'Minimum active airline directory was not seeded';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_create_quick_tk(uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_create_quick_tk(uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.ticketing_create_quick_tk(uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'TK quick-create RPC grants are incorrect';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.validate_ticket_transaction_owner_alignment()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.validate_ticket_transaction_owner_alignment()',
    'EXECUTE'
  ) then
    raise exception 'Ticket owner-alignment trigger-function grants are incorrect';
  end if;

  if position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.ticketing_create_quick_tk(uuid,text,jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'TK quick-create RPC has no transaction-scoped retry lock';
  end if;

  if position(
    'lock table public.travel_package_reservations'
    in regexp_replace(
      lower(pg_get_functiondef(
        'public.ticketing_create_quick_tk(uuid,text,jsonb)'::regprocedure
      )),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ) = 0 then
    raise exception 'TK quick-create RPC does not stabilize package evidence';
  end if;

  status_value := public.ticketing_schema_status();
  if (status_value ->> 'ready')::boolean is not true
    or (status_value ->> 'version')::bigint <> 2026082201
    or (status_value ->> 'requiredVersion')::bigint <> 2026082201
    or not (
      status_value #> '{details,capabilities}' ?& array[
        'atomic-quick-tk',
        'duplicate-confirmation',
        'automatic-package-match',
        'transaction-owner-alignment',
        'starter-airline-directory'
      ]
    )
  then
    raise exception 'TK quick-entry schema capability status is incorrect: %', status_value;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_schema_status()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_schema_status()',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.ticketing_schema_status()',
    'EXECUTE'
  ) then
    raise exception 'Ticketing schema-status grants are incorrect';
  end if;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'authenticated-bypass',
      '{}'::jsonb
    );
    raise exception 'authenticated executed the server-only TK quick-create RPC';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

insert into public.roles (id, name, level)
values
  ('10000000-0000-0000-0000-000000000002', 'Manager', 5),
  ('10000000-0000-0000-0000-000000000003', 'master_admin', 6)
on conflict (name) do nothing;

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000002', 'manager@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'other-agent@example.test'),
  ('40000000-0000-0000-0000-000000000004', 'outside-agent@example.test'),
  ('40000000-0000-0000-0000-000000000005', 'no-location@example.test'),
  ('40000000-0000-0000-0000-000000000006', 'master-admin@example.test');

insert into public.employees (
  id,
  full_name,
  email,
  role_id,
  location_id,
  is_active
)
values
  (
    '40000000-0000-0000-0000-000000000002',
    'Test Manager',
    'manager@example.test',
    '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    'Other Ticketing Agent',
    'other-agent@example.test',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    'Outside Agent',
    'outside-agent@example.test',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    'No Location Agent',
    'no-location@example.test',
    '10000000-0000-0000-0000-000000000001',
    null,
    true
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    'Test Master Admin',
    'master-admin@example.test',
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    true
  );

insert into public.employee_departments (employee_id, department_id)
values
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001'
  );

do $$
declare
  base_entry jsonb := jsonb_build_object(
    'customerName', 'Access Test',
    'pnr', 'ACCESS-Q1',
    'airlineId', '50000000-0000-0000-0000-000000000001',
    'serviceType', 'TK',
    'operationalStatus', 'held',
    'bookingDate', '2026-08-22',
    'timeLimitAt', '2026-09-01T12:30',
    'issuedAt', null,
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100)
    )
  );
  manager_result jsonb;
  master_admin_result jsonb;
begin
  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000004',
      'outside-agent-denied',
      base_entry
    );
    raise exception 'Non-Ticketing Agent executed TK quick create';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000005',
      'missing-location-denied',
      base_entry
    );
    raise exception 'Ticketing Agent without a location executed TK quick create';
  exception when insufficient_privilege then
    null;
  end;

  manager_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000002',
    'manager-oversight-create',
    base_entry || jsonb_build_object('pnr', 'MANAGER-Q1')
  );

  if manager_result #>> '{booking,ownerEmployeeId}'
      <> '40000000-0000-0000-0000-000000000002'
    or manager_result #>> '{booking,locationId}'
      <> '30000000-0000-0000-0000-000000000001'
  then
    raise exception 'Manager oversight access did not derive owner/location correctly';
  end if;

  master_admin_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000006',
    'master-admin-oversight-create',
    base_entry || jsonb_build_object('pnr', 'MASTER-ADMIN-Q1')
  );

  if master_admin_result #>> '{booking,ownerEmployeeId}'
      <> '40000000-0000-0000-0000-000000000006'
  then
    raise exception 'Underscore oversight role was not normalized like application auth';
  end if;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'identity-field-rejected',
      base_entry || jsonb_build_object(
        'pnr', 'IDENTITY-Q1',
        'ownerEmployeeId', '40000000-0000-0000-0000-000000000003'
      )
    );
    raise exception 'Caller-controlled owner field was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'non-tk-rejected',
      base_entry || jsonb_build_object('pnr', 'NOT-TK-Q1', 'serviceType', 'DC')
    );
    raise exception 'Non-TK service type was accepted by TK quick create';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'fare-group-quantity-limit',
      base_entry || jsonb_build_object(
        'pnr', 'QTY-GROUP-Q1',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT',
            'quantity', 100,
            'unitSupplierCost', 1
          )
        )
      )
    );
    raise exception 'Fare-group quantity above 99 was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'fare-total-quantity-limit',
      base_entry || jsonb_build_object(
        'pnr', 'QTY-TOTAL-Q1',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT',
            'quantity', 50,
            'unitSupplierCost', 1
          ),
          jsonb_build_object(
            'passengerType', 'CHD',
            'quantity', 50,
            'unitSupplierCost', 1
          )
        )
      )
    );
    raise exception 'Total fare quantity above 99 was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'fare-unit-cost-limit',
      base_entry || jsonb_build_object(
        'pnr', 'COST-LIMIT-Q1',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT',
            'quantity', 1,
            'unitSupplierCost', 100000000
          )
        )
      )
    );
    raise exception 'Unit supplier cost above 99,999,999.99 was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'issued-before-booked',
      base_entry || jsonb_build_object(
        'pnr', 'DATE-ORDER-Q1',
        'operationalStatus', 'issued',
        'timeLimitAt', null,
        'issuedAt', '2026-08-21'
      )
    );
    raise exception 'issuedAt earlier than bookingDate was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'time-limit-before-booked',
      base_entry || jsonb_build_object(
        'pnr', 'DATE-ORDER-Q2',
        'bookingDate', '2026-08-22',
        'timeLimitAt', '2026-08-21T18:00'
      )
    );
    raise exception 'timeLimitAt earlier than bookingDate was accepted';
  exception when invalid_parameter_value then
    null;
  end;
end
$$;

do $$
declare
  entry jsonb := jsonb_build_object(
    'customerName', ' Held Customer ',
    'pnr', ' qtk - h1 ',
    'airlineId', '50000000-0000-0000-0000-000000000001',
    'serviceType', 'TK',
    'operationalStatus', 'held',
    'bookingDate', '2026-08-22',
    'timeLimitAt', '2026-09-01T12:30',
    'issuedAt', null,
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object('passengerType', 'CHD', 'quantity', 1, 'unitSupplierCost', 50),
      jsonb_build_object('passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 100)
    )
  );
  first_result jsonb;
  replay_result jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
begin
  first_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'held-create-1',
    entry
  );
  replay_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'held-create-1',
    entry
  );

  booking_id_value := (first_result #>> '{booking,id}')::uuid;
  transaction_id_value := (first_result #>> '{transaction,id}')::uuid;

  if (first_result ->> 'idempotentReplay')::boolean is not false
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or first_result #>> '{booking,id}' is distinct from replay_result #>> '{booking,id}'
    or first_result #>> '{transaction,id}' is distinct from replay_result #>> '{transaction,id}'
  then
    raise exception 'Held TK retry did not return a stable idempotent replay';
  end if;

  if jsonb_typeof(first_result -> 'sourceEvent') <> 'null'
    or first_result #>> '{transaction,passengerTicketCount}' <> '3'
    or first_result #>> '{transaction,supplierCost}' <> '250.00'
    or first_result #>> '{packageMatch,status}' <> 'unmatched'
    or first_result #>> '{packageMatch,scope}' <> 'ticket'
  then
    raise exception 'Held TK response is incorrect';
  end if;

  if not exists (
    select 1
    from public.ticket_bookings booking
    join public.ticket_transactions transaction on transaction.booking_id = booking.id
    where booking.id = booking_id_value
      and booking.owner_employee_id = '40000000-0000-0000-0000-000000000001'
      and booking.location_id = '30000000-0000-0000-0000-000000000001'
      and booking.normalized_pnr = 'QTK-H1'
      and transaction.id = transaction_id_value
      and transaction.owner_employee_id = booking.owner_employee_id
      and transaction.operational_status = 'held'
      and transaction.payment_status = 'unpaid'
      and transaction.passenger_ticket_count = 3
      and transaction.supplier_cost_source = 250
      and transaction.supplier_cost_gbp = 250
      and transaction.time_limit_at = '2026-09-01T11:30:00Z'
      and transaction.time_limit_timezone = 'Europe/London'
  ) then
    raise exception 'Held TK facts or branch-local time conversion are incorrect';
  end if;

  if (select count(*) from public.ticket_passenger_fare_lines
      where transaction_id = transaction_id_value) <> 2
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value and action = 'quick_create_tk') <> 1
    or exists (
      select 1 from public.commission_source_events
      where source_record_id = transaction_id_value
    )
    or (select count(*) from public.ticket_idempotency_keys
        where action_name = 'ticketing.quick_create_tk.v1'
          and actor_employee_id = '40000000-0000-0000-0000-000000000001'
          and idempotency_key = 'held-create-1') <> 1
  then
    raise exception 'Held TK quick create duplicated or omitted atomic child records';
  end if;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'held-create-1',
      entry || jsonb_build_object('customerName', 'Conflicting Customer')
    );
    raise exception 'Conflicting TK idempotency payload was accepted';
  exception when invalid_parameter_value then
    null;
  end;
end
$$;

do $$
declare
  entry jsonb := jsonb_build_object(
    'customerName', 'Duplicate Attempt',
    'pnr', 'QTK-H1',
    'airlineId', '50000000-0000-0000-0000-000000000001',
    'serviceType', 'TK',
    'operationalStatus', 'held',
    'bookingDate', '2026-08-22',
    'timeLimitAt', '2026-09-02T12:30',
    'issuedAt', null,
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100)
    )
  );
  error_message text;
  error_hint text;
  error_detail text;
  detail_payload jsonb;
  confirmed_result jsonb;
  retry_result jsonb;
begin
  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'same-owner-duplicate-blocked',
      entry
    );
    raise exception 'Same-owner duplicate TK was accepted without confirmation';
  exception when unique_violation then
    get stacked diagnostics
      error_message = message_text,
      error_hint = pg_exception_hint,
      error_detail = pg_exception_detail;
    detail_payload := error_detail::jsonb;
    if error_message <> 'Duplicate TK confirmation required'
      or error_hint <> 'TICKETING_DUPLICATE_TK'
      or (detail_payload ->> 'ownedByActor')::boolean is not true
      or detail_payload ->> 'pnr' <> 'QTK-H1'
      or detail_payload ->> 'customerName' <> 'Held Customer'
      or detail_payload ->> 'bookingId' is null
      or (select count(*) from jsonb_object_keys(detail_payload)) <> 4
    then
      raise exception 'Same-owner duplicate confirmation contract is incomplete';
    end if;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000003',
      'other-owner-duplicate-blocked',
      entry
    );
    raise exception 'Agency-wide duplicate TK was accepted without confirmation';
  exception when unique_violation then
    get stacked diagnostics
      error_message = message_text,
      error_hint = pg_exception_hint,
      error_detail = pg_exception_detail;
    detail_payload := error_detail::jsonb;
    if error_message <> 'Duplicate TK confirmation required'
      or error_hint <> 'TICKETING_DUPLICATE_TK'
      or (detail_payload ->> 'ownedByActor')::boolean is not false
      or detail_payload ->> 'pnr' <> 'QTK-H1'
      or detail_payload ? 'customerName'
      or detail_payload ? 'bookingId'
      or (select count(*) from jsonb_object_keys(detail_payload)) <> 2
    then
      raise exception 'Cross-agent duplicate detail leaked another owner context';
    end if;
  end;

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000002',
      'oversight-other-owner-duplicate-blocked',
      entry
    );
    raise exception 'Oversight duplicate TK was accepted without confirmation';
  exception when unique_violation then
    get stacked diagnostics
      error_message = message_text,
      error_hint = pg_exception_hint,
      error_detail = pg_exception_detail;
    detail_payload := error_detail::jsonb;
    if error_message <> 'Duplicate TK confirmation required'
      or error_hint <> 'TICKETING_DUPLICATE_TK'
      or (detail_payload ->> 'ownedByActor')::boolean is not false
      or detail_payload ->> 'pnr' <> 'QTK-H1'
      or detail_payload ? 'customerName'
      or detail_payload ? 'bookingId'
      or (select count(*) from jsonb_object_keys(detail_payload)) <> 2
    then
      raise exception 'Oversight duplicate detail leaked My Ledger owner context';
    end if;
  end;

  confirmed_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000003',
    'other-owner-duplicate-confirmed',
    entry || jsonb_build_object('confirmDuplicate', true)
  );

  -- The confirmation acknowledgement is not a business payload field. If the
  -- successful response is lost, the ordinary retry must replay rather than
  -- conflict simply because confirmDuplicate defaults back to false.
  retry_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000003',
    'other-owner-duplicate-confirmed',
    entry
  );

  if confirmed_result #>> '{booking,ownerEmployeeId}'
      <> '40000000-0000-0000-0000-000000000003'
    or (retry_result ->> 'idempotentReplay')::boolean is not true
    or retry_result #>> '{booking,id}' is distinct from confirmed_result #>> '{booking,id}'
    or (select count(*) from public.ticket_bookings
        where airline_id = '50000000-0000-0000-0000-000000000001'
          and normalized_pnr = 'QTK-H1'
          and archived_at is null) <> 2
  then
    raise exception 'Confirmed duplicate TK creation or lost-response replay failed';
  end if;
end
$$;

insert into public.travel_packages (id, package_reference, package_type, status)
values (
  '60000000-0000-0000-0000-000000000010',
  'PKG-QUICK-1',
  'umrah',
  'selected'
);

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
)
values (
  '70000000-0000-0000-0000-000000000010',
  '60000000-0000-0000-0000-000000000010',
  'flight',
  ' pkg q1 ',
  'confirmed'
);

do $$
declare
  entry jsonb := jsonb_build_object(
    'customerName', 'Package Issued Customer',
    'pnr', 'PKG Q1',
    'airlineId', '50000000-0000-0000-0000-000000000001',
    'serviceType', 'TK',
    'operationalStatus', 'issued',
    'bookingDate', '2026-08-22',
    'timeLimitAt', null,
    'issuedAt', '2026-08-22',
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 300),
      jsonb_build_object('passengerType', 'INF', 'quantity', 1, 'unitSupplierCost', 50)
    )
  );
  first_result jsonb;
  replay_result jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  source_event_id_value uuid;
begin
  first_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'package-issued-create-1',
    entry
  );
  replay_result := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'package-issued-create-1',
    entry
  );

  booking_id_value := (first_result #>> '{booking,id}')::uuid;
  transaction_id_value := (first_result #>> '{transaction,id}')::uuid;
  source_event_id_value := (first_result #>> '{sourceEvent,sourceEventId}')::uuid;

  if first_result #>> '{booking,operationalStatus}' <> 'issued'
    or first_result #>> '{transaction,passengerTicketCount}' <> '3'
    or first_result #>> '{transaction,supplierCost}' <> '650.00'
    or first_result #>> '{packageMatch,status}' <> 'matched'
    or first_result #>> '{packageMatch,scope}' <> 'package'
    or first_result #>> '{packageMatch,packageId}'
      <> '60000000-0000-0000-0000-000000000010'
    or first_result #>> '{packageMatch,reservationId}'
      <> '70000000-0000-0000-0000-000000000010'
    or first_result #>> '{sourceEvent,eventType}' <> 'ticket_issued'
    or (replay_result ->> 'idempotentReplay')::boolean is not true
  then
    raise exception 'Issued package TK response or replay is incorrect';
  end if;

  if first_result ? 'commission'
    or first_result ? 'profit'
    or first_result ? 'margin'
    or first_result #> '{transaction}' ? 'commissionAmount'
    or first_result #> '{transaction}' ? 'profit'
  then
    raise exception 'TK quick-create response exposed commission/profit output';
  end if;

  if not exists (
    select 1
    from public.ticket_transactions transaction
    where transaction.id = transaction_id_value
      and transaction.operational_status = 'issued'
      and transaction.payment_status = 'unpaid'
      and transaction.passenger_ticket_count = 3
      and transaction.supplier_cost_source = 650
      and transaction.supplier_cost_gbp = 650
      and (transaction.issued_at at time zone 'Europe/London')::date = '2026-08-22'
  ) or not exists (
    select 1
    from public.ticket_package_links link
    where link.booking_id = booking_id_value
      and link.package_id = '60000000-0000-0000-0000-000000000010'
      and link.reservation_id = '70000000-0000-0000-0000-000000000010'
      and link.match_status = 'matched'
      and link.package_type_snapshot = 'umrah'
      and link.retired_at is null
  ) then
    raise exception 'Issued package TK operational facts were not persisted';
  end if;

  if (select count(*) from public.commission_source_events
      where source_module = 'ticketing'
        and source_event_id = source_event_id_value
        and source_record_id = transaction_id_value
        and event_type = 'ticket_issued'
        and variables ->> 'service_type' = 'TK'
        and (variables ->> 'passenger_ticket_count')::integer = 3
        and variables ->> 'commission_scope' = 'package'
        and variables ->> 'package_id'
          = '60000000-0000-0000-0000-000000000010') <> 1
    or not exists (
      select 1
      from public.commission_source_events event
      join public.commission_source_event_states state on state.event_id = event.id
      where event.source_event_id = source_event_id_value
        and state.processing_status = 'pending'
    )
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value and action = 'quick_create_tk') <> 1
  then
    raise exception 'Issued TK audit/source event was not appended exactly once';
  end if;

  if exists (
    select 1
    from public.commission_source_events
    where source_event_id = source_event_id_value
      and (
        variables ? 'commission_amount'
        or variables ? 'commission'
        or variables ? 'profit'
        or variables ? 'margin'
      )
  ) then
    raise exception 'Issued TK source event contained calculated commission/profit';
  end if;
end
$$;

insert into public.travel_packages (id, package_reference, package_type, status)
values ('60000000-0000-0000-0000-000000000013', 'PKG-SAME-1', 'holiday', 'selected');

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
)
values
  (
    '70000000-0000-0000-0000-000000000013',
    '60000000-0000-0000-0000-000000000013',
    'flight',
    'SAMEPKG-Q1',
    'confirmed'
  ),
  (
    '70000000-0000-0000-0000-000000000014',
    '60000000-0000-0000-0000-000000000013',
    'flight',
    ' samepkg-q1 ',
    'confirmed'
  );

do $$
declare
  result_value jsonb;
  booking_id_value uuid;
begin
  result_value := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'same-package-create-1',
    jsonb_build_object(
      'customerName', 'Same Package Customer',
      'pnr', 'SAMEPKG-Q1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-22',
      'timeLimitAt', '2026-09-04T12:30',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100)
      )
    )
  );
  booking_id_value := (result_value #>> '{booking,id}')::uuid;

  if result_value #>> '{packageMatch,status}' <> 'matched'
    or result_value #>> '{packageMatch,scope}' <> 'package'
    or result_value #>> '{packageMatch,packageId}'
      <> '60000000-0000-0000-0000-000000000013'
    or result_value #>> '{packageMatch,reservationId}'
      <> '70000000-0000-0000-0000-000000000013'
    or jsonb_typeof(result_value #> '{packageMatch,groupId}') <> 'null'
    or (select count(*) from public.ticket_package_links
        where booking_id = booking_id_value
          and match_status = 'matched'
          and retired_at is null) <> 1
  then
    raise exception 'Multiple reservations for one package did not collapse deterministically';
  end if;
end
$$;

insert into public.travel_packages (id, package_reference, package_type, status)
values
  ('60000000-0000-0000-0000-000000000014', 'PKG-GROUP-1', 'umrah', 'selected'),
  ('60000000-0000-0000-0000-000000000015', 'PKG-GROUP-2', 'umrah', 'selected');

insert into public.travel_package_groups (id, group_reference, status)
values ('80000000-0000-0000-0000-000000000001', 'PKG-GROUP-Q1', 'active');

insert into public.travel_package_group_members (
  id,
  group_id,
  package_id,
  is_lead_family,
  sort_order
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000014',
    false,
    0
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000015',
    true,
    10
  );

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
)
values
  (
    '70000000-0000-0000-0000-000000000015',
    '60000000-0000-0000-0000-000000000014',
    'flight',
    'GROUP-Q1',
    'confirmed'
  ),
  (
    '70000000-0000-0000-0000-000000000016',
    '60000000-0000-0000-0000-000000000015',
    'flight',
    ' group-q1 ',
    'confirmed'
  );

do $$
declare
  result_value jsonb;
  booking_id_value uuid;
  source_event_id_value uuid;
begin
  result_value := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'same-group-create-1',
    jsonb_build_object(
      'customerName', 'Same Group Customer',
      'pnr', 'GROUP-Q1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-22',
      'timeLimitAt', null,
      'issuedAt', '2026-08-22',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100)
      )
    )
  );
  booking_id_value := (result_value #>> '{booking,id}')::uuid;
  source_event_id_value := (result_value #>> '{sourceEvent,sourceEventId}')::uuid;

  if result_value #>> '{packageMatch,status}' <> 'matched'
    or result_value #>> '{packageMatch,scope}' <> 'package'
    or result_value #>> '{packageMatch,groupId}'
      <> '80000000-0000-0000-0000-000000000001'
    or result_value #>> '{packageMatch,packageId}'
      <> '60000000-0000-0000-0000-000000000015'
    or result_value #>> '{packageMatch,reservationId}'
      <> '70000000-0000-0000-0000-000000000016'
    or (select count(*) from public.ticket_package_links
        where booking_id = booking_id_value
          and group_id = '80000000-0000-0000-0000-000000000001'
          and match_status = 'matched'
          and retired_at is null) <> 1
    or not exists (
      select 1
      from public.commission_source_events
      where source_event_id = source_event_id_value
        and variables ->> 'group_id'
          = '80000000-0000-0000-0000-000000000001'
        and variables ->> 'package_id'
          = '60000000-0000-0000-0000-000000000015'
        and variables ->> 'commission_scope' = 'package'
    )
  then
    raise exception 'One common active package group did not collapse to its lead candidate';
  end if;
end
$$;

insert into public.travel_packages (id, package_reference, package_type, status)
values
  ('60000000-0000-0000-0000-000000000011', 'PKG-AMB-1', 'holiday', 'selected'),
  ('60000000-0000-0000-0000-000000000012', 'PKG-AMB-2', 'ziyarat', 'selected');

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
)
values
  (
    '70000000-0000-0000-0000-000000000011',
    '60000000-0000-0000-0000-000000000011',
    'flight',
    'AMB-Q1',
    'confirmed'
  ),
  (
    '70000000-0000-0000-0000-000000000012',
    '60000000-0000-0000-0000-000000000012',
    'flight',
    ' amb-q1 ',
    'confirmed'
  );

do $$
declare
  result_value jsonb;
  booking_id_value uuid;
begin
  result_value := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'ambiguous-package-create-1',
    jsonb_build_object(
      'customerName', 'Ambiguous Package Customer',
      'pnr', 'AMB-Q1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-22',
      'timeLimitAt', '2026-09-03T12:30',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100)
      )
    )
  );
  booking_id_value := (result_value #>> '{booking,id}')::uuid;

  if result_value #>> '{packageMatch,status}' <> 'ambiguous'
    or result_value #>> '{packageMatch,scope}' <> 'unresolved'
    or jsonb_array_length(result_value #> '{packageMatch,linkIds}') <> 2
    or (select count(*) from public.ticket_package_links
        where booking_id = booking_id_value
          and match_status = 'ambiguous'
          and retired_at is null) <> 2
  then
    raise exception 'Unrelated package PNR matches did not produce unresolved scope';
  end if;
end
$$;

do $$
declare
  held_booking_id uuid;
  held_transaction_id uuid;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into held_booking_id, held_transaction_id
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.quick_create_tk.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'held-create-1';

  begin
    update public.ticket_transactions
    set owner_employee_id = '40000000-0000-0000-0000-000000000003'
    where id = held_transaction_id;
    raise exception 'Transaction owner diverged from booking owner';
  exception when check_violation then
    null;
  end;

  begin
    update public.ticket_bookings
    set owner_employee_id = '40000000-0000-0000-0000-000000000003'
    where id = held_booking_id;
    raise exception 'Booking owner diverged from transaction owner';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.ticket_bookings (
      id,
      owner_employee_id,
      location_id,
      airline_id,
      pnr,
      customer_name,
      booking_date,
      created_by,
      updated_by
    ) values (
      '86000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'OWNER-MISMATCH',
      'Owner Mismatch',
      '2026-08-22',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    );
    insert into public.ticket_transactions (
      booking_id,
      service_type,
      owner_employee_id,
      acting_employee_id,
      booking_date
    ) values (
      '86000000-0000-0000-0000-000000000001',
      'TK',
      '40000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000001',
      '2026-08-22'
    );
    raise exception 'Mismatched owner was accepted on transaction insert';
  exception when check_violation then
    delete from public.ticket_bookings
    where id = '86000000-0000-0000-0000-000000000001';
  end;
end
$$;

do $$
declare
  source_key text := 'tkqc:v1:' || encode(
    digest(
      '40000000-0000-0000-0000-000000000001:atomic-event-conflict',
      'sha256'
    ),
    'hex'
  );
begin
  perform public.append_commission_source_event(
    jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', '87000000-0000-0000-0000-000000000001',
      'source_fact_key', 'fixture:atomic-event-conflict',
      'source_record_id', '87000000-0000-0000-0000-000000000002',
      'event_type', 'fixture_conflict',
      'contract_version', 1,
      'event_version', 1,
      'supersedes_event_id', null,
      'employee_id', '40000000-0000-0000-0000-000000000001',
      'owner_employee_id', '40000000-0000-0000-0000-000000000001',
      'location_id', '30000000-0000-0000-0000-000000000001',
      'occurred_at', '2026-08-22T12:00:00Z',
      'effective_on', '2026-08-22',
      'source_path', '/dashboard/ticketing/fixture',
      'variables', '{}'::jsonb,
      'idempotency_key', source_key
    )
  );

  begin
    perform public.ticketing_create_quick_tk(
      '40000000-0000-0000-0000-000000000001',
      'atomic-event-conflict',
      jsonb_build_object(
        'customerName', 'Atomic Rollback Customer',
        'pnr', 'ROLLBACK-Q1',
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'serviceType', 'TK',
        'operationalStatus', 'issued',
        'bookingDate', '2026-08-22',
        'timeLimitAt', null,
        'issuedAt', '2026-08-22',
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100)
        )
      )
    );
    raise exception 'Conflicting issued source event did not abort TK quick create';
  exception when invalid_parameter_value then
    null;
  end;

  if exists (
    select 1 from public.ticket_bookings where normalized_pnr = 'ROLLBACK-Q1'
  ) or exists (
    select 1
    from public.ticket_idempotency_keys
    where action_name = 'ticketing.quick_create_tk.v1'
      and actor_employee_id = '40000000-0000-0000-0000-000000000001'
      and idempotency_key = 'atomic-event-conflict'
  ) or exists (
    select 1
    from public.ticket_audit_events
    where after_state ->> 'source_event_id' = '87000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Failed issued source append left partial TK quick-entry records';
  end if;
end
$$;

-- The shell harness uses this disposable pause hook to hold the quick-entry
-- transaction open after package matching/source emission. A second PostgreSQL
-- session then proves reservation writers cannot acquire their table lock and
-- create a phantom candidate before the atomic response commits.
create or replace function public.ticketing_test_pause_package_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.ticket_bookings booking
    where booking.id = new.booking_id
      and booking.normalized_pnr = 'RACE-LOCK-1'
  ) then
    perform pg_sleep(3);
  end if;
  return new;
end
$$;

drop trigger if exists ticketing_test_pause_package_lock on public.ticket_audit_events;
create trigger ticketing_test_pause_package_lock
before insert on public.ticket_audit_events
for each row execute function public.ticketing_test_pause_package_lock();

select 'Ticketing TK quick-entry integration checks passed.' as result;
