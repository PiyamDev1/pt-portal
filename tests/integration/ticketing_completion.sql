\set ON_ERROR_STOP on

do $$
declare
  status_value jsonb;
begin
  status_value := public.ticketing_schema_status();
  if (status_value ->> 'ready')::boolean is not true
    or (status_value ->> 'version')::bigint <> 2026082202
    or (status_value ->> 'requiredVersion')::bigint <> 2026082202
    or not (status_value #> '{details,capabilities}' ?& array[
      'atomic-tk-completion',
      'stable-passenger-slots',
      'optimistic-ticket-versions',
      'ticket-sale-and-payment-events'
    ])
  then
    raise exception 'TK completion capability is incorrect: %', status_value;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ticket_transaction_passengers'
      and column_name = 'position'
      and is_nullable = 'NO'
  ) then
    raise exception 'Stable Ticketing passenger position is missing or nullable';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ticket_transaction_passengers'::regclass
      and conname = 'ticket_transaction_passengers_position_check'
      and convalidated
  ) then
    raise exception 'Stable Ticketing passenger position constraint is not validated';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_complete_tk_details(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_complete_tk_details(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.ticketing_complete_tk_details(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'TK completion RPC grants are incorrect';
  end if;

  if position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.ticketing_complete_tk_details(uuid,uuid,text,jsonb)'::regprocedure
    )
  ) = 0 or position(
    'for update'
    in lower(pg_get_functiondef(
      'public.ticketing_complete_tk_details(uuid,uuid,text,jsonb)'::regprocedure
    ))
  ) = 0 then
    raise exception 'TK completion RPC lacks transaction/concurrency locks';
  end if;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      'authenticated-completion-bypass',
      '{}'::jsonb
    );
    raise exception 'authenticated executed the server-only completion RPC';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

-- Create a Held TK with three authoritative passenger slots.
do $$
declare
  created jsonb;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'completion-held-create',
    jsonb_build_object(
      'customerName', 'Completion Held Customer',
      'pnr', 'COMP-H1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-22',
      'timeLimitAt', '2026-09-10T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 100),
        jsonb_build_object('passengerType', 'CHD', 'quantity', 1, 'unitSupplierCost', 75)
      )
    )
  );

  if created #>> '{transaction,operationalStatus}' <> 'held' then
    raise exception 'Held completion fixture was not created';
  end if;
end
$$;

-- Partial non-financial save: one passenger slot and contact/date only.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  details jsonb;
  first_result jsonb;
  replay_result jsonb;
  audit_count_before integer;
  source_count_before integer;
  error_hint text;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, transaction_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.quick_create_tk.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'completion-held-create';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.id = booking_id_value and transaction.id = transaction_id_value;

  details := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'contactPhone', ' +44 7000 111222 ',
    'departureDate', '2026-10-01',
    'returnDate', null,
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', null),
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
    ),
    'passengers', jsonb_build_array(
      jsonb_build_object(
        'passengerType', 'ADT',
        'position', 1,
        'fullName', ' Lead Passenger ',
        'contactPhone', null,
        'dateOfBirth', null,
        'ticketNumber', null
      )
    )
  );

  select count(*) into audit_count_before
  from public.ticket_audit_events where transaction_id = transaction_id_value;
  select count(*) into source_count_before
  from public.commission_source_events where source_record_id = transaction_id_value;

  first_result := public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'completion-held-partial',
    details
  );
  replay_result := public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'completion-held-partial',
    details
  );

  if (first_result ->> 'changed')::boolean is not true
    or first_result #>> '{booking,detailsStatus}' <> 'needs_details'
    or first_result #>> '{booking,contactPhone}' <> '+44 7000 111222'
    or jsonb_array_length(first_result -> 'passengers') <> 3
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or first_result #>> '{booking,id}' is distinct from replay_result #>> '{booking,id}'
  then
    raise exception 'Partial completion or retry response is incorrect';
  end if;

  if (select count(*) from public.ticket_transaction_passengers
      where transaction_id = transaction_id_value) <> 1
    or not exists (
      select 1
      from public.ticket_transaction_passengers allocation
      join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
      where allocation.transaction_id = transaction_id_value
        and allocation.position = 1
        and passenger.passenger_type = 'ADT'
        and passenger.full_name = 'Lead Passenger'
    )
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value) <> audit_count_before + 1
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> source_count_before
  then
    raise exception 'Partial completion did not persist one audited, non-financial change';
  end if;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'completion-held-partial',
      details || jsonb_build_object('contactPhone', '+44 7000 999999')
    );
    raise exception 'Conflicting completion idempotency payload was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'Idempotency conflict hint is incorrect: %', error_hint;
    end if;
  end;
end
$$;

-- Own-record privacy, stale versions and slot/type bounds fail closed.
do $$
declare
  booking_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  base_details jsonb;
  error_hint text;
  error_detail text;
begin
  select (response_payload #>> '{booking,id}')::uuid
  into booking_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.quick_create_tk.v1'
    and idempotency_key = 'completion-held-create';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.id = booking_id_value and transaction.service_type = 'TK';

  base_details := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'contactPhone', '+44 7000 111222',
    'departureDate', '2026-10-01',
    'returnDate', null,
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null),
      jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', null)
    ),
    'passengers', '[]'::jsonb
  );

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000002',
      booking_id_value,
      'completion-other-owner',
      base_details
    );
    raise exception 'Manager completed another employee private ticket';
  exception when no_data_found then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_RECORD_NOT_FOUND' then
      raise exception 'Other-owner error did not preserve private not-found semantics';
    end if;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'completion-stale-version',
      base_details || jsonb_build_object(
        'expectedBookingVersion', booking_version_value - 1,
        'expectedTransactionVersion', transaction_version_value - 1
      )
    );
    raise exception 'Stale completion versions were accepted';
  exception when serialization_failure then
    get stacked diagnostics error_hint = pg_exception_hint, error_detail = pg_exception_detail;
    if error_hint <> 'TICKETING_VERSION_CONFLICT'
      or (error_detail::jsonb ->> 'bookingVersion')::bigint <> booking_version_value
      or (error_detail::jsonb ->> 'transactionVersion')::bigint <> transaction_version_value
    then
      raise exception 'Version-conflict metadata is incorrect';
    end if;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'completion-invalid-slot',
      jsonb_set(
        base_details,
        '{passengers}',
        jsonb_build_array(jsonb_build_object(
          'passengerType', 'CHD',
          'position', 2,
          'fullName', 'Outside Slot',
          'contactPhone', null,
          'dateOfBirth', null,
          'ticketNumber', null
        ))
      )
    );
    raise exception 'Passenger slot outside fare quantity was accepted';
  exception when invalid_parameter_value then
    null;
  end;
end
$$;

-- Strict JSON boundaries reject malformed root/nested payloads before writes.
do $$
declare
  booking_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  base_details jsonb;
begin
  select (response_payload #>> '{booking,id}')::uuid
  into booking_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.quick_create_tk.v1'
    and idempotency_key = 'completion-held-create';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.id = booking_id_value and transaction.service_type = 'TK';

  base_details := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'contactPhone', '+44 7000 111222',
    'departureDate', '2026-10-01',
    'returnDate', null,
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null),
      jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', null)
    ),
    'passengers', '[]'::jsonb
  );

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-missing-root', base_details - 'contactPhone'
    );
    raise exception 'Missing root completion field was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-unknown-root', base_details || jsonb_build_object('unknownRoot', true)
    );
    raise exception 'Unknown root completion field was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-unknown-nested', jsonb_set(
        base_details,
        '{fareSales,0}',
        (base_details #> '{fareSales,0}') || jsonb_build_object('unknownFareField', true)
      )
    );
    raise exception 'Unknown nested completion field was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-duplicate-fare', jsonb_set(
        base_details,
        '{fareSales}',
        jsonb_build_array(
          jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null),
          jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
        )
      )
    );
    raise exception 'Duplicate fare passenger type was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-duplicate-slot', jsonb_set(
        base_details,
        '{passengers}',
        jsonb_build_array(
          jsonb_build_object('passengerType', 'ADT', 'position', 1, 'fullName', 'One',
            'contactPhone', null, 'dateOfBirth', null, 'ticketNumber', null),
          jsonb_build_object('passengerType', 'ADT', 'position', 1, 'fullName', 'Two',
            'contactPhone', null, 'dateOfBirth', null, 'ticketNumber', null)
        )
      )
    );
    raise exception 'Duplicate passenger slot was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-invalid-date', base_details || jsonb_build_object(
        'departureDate', '2026-02-30'
      )
    );
    raise exception 'Invalid completion date was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-invalid-type', jsonb_set(
        base_details,
        '{passengers}',
        jsonb_build_array(jsonb_build_object(
          'passengerType', 'ADT', 'position', '1', 'fullName', null,
          'contactPhone', null, 'dateOfBirth', null, 'ticketNumber', null
        ))
      )
    );
    raise exception 'Invalid completion value type was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-fare-group-mismatch', jsonb_set(
        base_details,
        '{fareSales}',
        jsonb_build_array(
          jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
        )
      )
    );
    raise exception 'Incomplete authoritative fare groups were accepted';
  exception when invalid_parameter_value then
    null;
  end;
end
$$;

-- Complete all Held details. Held financial drafts emit no Commission fact.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  details jsonb;
  result_value jsonb;
  noop_value jsonb;
  audit_count integer;
  source_count integer;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, transaction_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.quick_create_tk.v1'
    and idempotency_key = 'completion-held-create';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.id = booking_id_value and transaction.id = transaction_id_value;

  details := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'contactPhone', '+44 7000 111222',
    'departureDate', '2026-10-01',
    'returnDate', '2026-10-20',
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 140),
      jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', 100)
    ),
    'passengers', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'position', 1, 'fullName', 'Lead Passenger',
        'contactPhone', null, 'dateOfBirth', null, 'ticketNumber', 'TK-ADT-1'),
      jsonb_build_object('passengerType', 'ADT', 'position', 2, 'fullName', 'Second Adult',
        'contactPhone', null, 'dateOfBirth', null, 'ticketNumber', 'TK-ADT-2'),
      jsonb_build_object('passengerType', 'CHD', 'position', 1, 'fullName', 'Child Passenger',
        'contactPhone', null, 'dateOfBirth', '2015-01-02', 'ticketNumber', 'TK-CHD-1')
    )
  );

  result_value := public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'completion-held-complete',
    details
  );

  if result_value #>> '{booking,detailsStatus}' <> 'complete'
    or result_value #>> '{transaction,salePrice}' <> '380.00'
    or jsonb_array_length(result_value -> 'passengers') <> 3
    or jsonb_array_length(result_value -> 'sourceEvents') <> 0
    or exists (
      select 1
      from public.ticket_transactions transaction
      where transaction.id = transaction_id_value
        and (
          transaction.sale_price_source is not null
          or transaction.sale_price_gbp is not null
        )
    )
  then
    raise exception 'Held completion result is incorrect: %', result_value;
  end if;

  if exists (
    select 1 from public.commission_source_events event
    where event.source_record_id = transaction_id_value
  ) then
    raise exception 'Held completion emitted a Commission source fact';
  end if;

  select count(*) into audit_count
  from public.ticket_audit_events where transaction_id = transaction_id_value;
  select count(*) into source_count
  from public.commission_source_events where source_record_id = transaction_id_value;

  details := details || jsonb_build_object(
    'expectedBookingVersion', (result_value #>> '{booking,version}')::bigint,
    'expectedTransactionVersion', (result_value #>> '{transaction,version}')::bigint
  );
  noop_value := public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'completion-held-noop',
    details
  );

  if (noop_value ->> 'changed')::boolean is not false
    or jsonb_typeof(noop_value -> 'auditEventId') <> 'null'
    or jsonb_array_length(noop_value -> 'sourceEvents') <> 0
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value) <> audit_count
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> source_count
  then
    raise exception 'No-op completion created audit/source side effects';
  end if;
end
$$;

-- A duplicate normalized ticket number aborts the entire passenger/detail save.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  audit_count_before integer;
  duplicate_failed boolean := false;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, transaction_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.quick_create_tk.v1'
    and idempotency_key = 'completion-held-create';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.id = booking_id_value and transaction.id = transaction_id_value;

  select count(*) into audit_count_before
  from public.ticket_audit_events
  where transaction_id = transaction_id_value;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'completion-duplicate-ticket-number',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedTransactionVersion', transaction_version_value,
        'contactPhone', '+44 7000 000000',
        'departureDate', '2026-10-01',
        'returnDate', '2026-10-20',
        'paymentStatus', 'unpaid',
        'paidAt', null,
        'fareSales', jsonb_build_array(
          jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 140),
          jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', 100)
        ),
        'passengers', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT',
            'position', 2,
            'fullName', 'Must Roll Back',
            'contactPhone', null,
            'dateOfBirth', null,
            'ticketNumber', 'tk-adt-1'
          )
        )
      )
    );
  exception when unique_violation then
    duplicate_failed := true;
  end;

  if not duplicate_failed
    or (select contact_phone from public.ticket_bookings where id = booking_id_value)
      <> '+44 7000 111222'
    or not exists (
      select 1
      from public.ticket_transaction_passengers allocation
      join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
      where allocation.transaction_id = transaction_id_value
        and allocation.position = 2
        and passenger.full_name = 'Second Adult'
        and allocation.ticket_number = 'TK-ADT-2'
    )
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value) <> audit_count_before
    or exists (
      select 1
      from public.ticket_idempotency_keys
      where action_name = 'ticketing.complete_tk_details.v1'
        and idempotency_key = 'completion-duplicate-ticket-number'
    )
  then
    raise exception 'Duplicate ticket number did not roll back atomically';
  end if;
end
$$;

-- Issued sales must be populated together, are immutable afterward, and Paid
-- appends a separate source fact while synchronising both status snapshots.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  details jsonb;
  sale_result jsonb;
  paid_result jsonb;
  booking_version_value bigint;
  transaction_version_value bigint;
  error_hint text;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'completion-issued-create',
    jsonb_build_object(
      'customerName', 'Completion Issued Customer',
      'pnr', 'COMP-I1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-22',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 200),
        jsonb_build_object('passengerType', 'CHD', 'quantity', 1, 'unitSupplierCost', 150)
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;

  -- The booking branch, rather than the owner's newly assigned branch,
  -- controls local lifecycle dates and Commission source attribution.
  insert into public.locations (id, name, branch_code, timezone)
  values (
    '30000000-0000-0000-0000-000000000099',
    'Transferred Branch',
    'TRN',
    'America/Los_Angeles'
  ) on conflict (id) do update set timezone = excluded.timezone;

  update public.employees
  set location_id = '30000000-0000-0000-0000-000000000099'
  where id = '40000000-0000-0000-0000-000000000001';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.id = booking_id_value and transaction.id = transaction_id_value;

  details := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'contactPhone', null,
    'departureDate', null,
    'returnDate', null,
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 250),
      jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', null)
    ),
    'passengers', '[]'::jsonb
  );

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-issued-mixed', details
    );
    raise exception 'Issued partial sale set was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  details := jsonb_set(details, '{fareSales}', jsonb_build_array(
    jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 250),
    jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', 190)
  ));
  sale_result := public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001', booking_id_value,
    'completion-issued-sale', details
  );

  if sale_result #>> '{transaction,salePrice}' <> '440.00'
    or sale_result #>> '{sourceEvents,0,eventType}' <> 'ticket_sale_completed'
    or (sale_result #>> '{sourceEvents,0,eventVersion}')::integer <> 1
    or jsonb_array_length(sale_result -> 'sourceEvents') <> 1
    or (
      select count(*)
      from public.commission_source_events event
      where event.source_record_id = transaction_id_value
        and event.source_fact_key = 'transaction:' || transaction_id_value::text || ':sale-completed'
        and event.event_type = 'ticket_sale_completed'
        and event.event_version = 1
        and event.supersedes_event_id is null
        and event.effective_on = '2026-08-23'
        and event.location_id = '30000000-0000-0000-0000-000000000001'
        and (event.variables ->> 'sale_price_gbp')::numeric = 440
    ) <> 1
  then
    raise exception 'Issued sale completion is incorrect';
  end if;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-issued-rewrite',
      details || jsonb_build_object(
        'expectedBookingVersion', (sale_result #>> '{booking,version}')::bigint,
        'expectedTransactionVersion', (sale_result #>> '{transaction,version}')::bigint,
        'fareSales', jsonb_build_array(
          jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 251),
          jsonb_build_object('passengerType', 'CHD', 'unitSalePrice', 190)
        )
      )
    );
    raise exception 'Posted sale value was rewritten';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_CORRECTION_REQUIRED' then
      raise exception 'Immutable sale rewrite hint is incorrect: %', error_hint;
    end if;
  end;

  details := details || jsonb_build_object(
    'expectedBookingVersion', (sale_result #>> '{booking,version}')::bigint,
    'expectedTransactionVersion', (sale_result #>> '{transaction,version}')::bigint,
    'paymentStatus', 'paid',
    'paidAt', '2026-08-24'
  );
  paid_result := public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001', booking_id_value,
    'completion-issued-paid', details
  );

  if paid_result #>> '{transaction,paymentStatus}' <> 'paid'
    or paid_result #>> '{booking,paymentStatus}' <> 'paid'
    or paid_result #>> '{sourceEvents,0,eventType}' <> 'ticket_paid'
    or (select paid_at from public.ticket_transactions where id = transaction_id_value)
      <> '2026-08-23 23:00:00+00'::timestamptz
    or not exists (
      select 1 from public.commission_source_events event
      where event.source_record_id = transaction_id_value
        and event.source_fact_key = 'transaction:' || transaction_id_value::text || ':paid'
        and event.event_type = 'ticket_paid'
        and event.event_version = 1
        and event.variables ->> 'operational_status' = 'issued'
        and event.variables ->> 'payment_status' = 'paid'
        and (event.variables ->> 'sale_price_gbp')::numeric = 440
    )
  then
    raise exception 'Paid completion/source fact is incorrect: %', paid_result;
  end if;

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'completion-issued-unpay',
      details || jsonb_build_object(
        'expectedBookingVersion', (paid_result #>> '{booking,version}')::bigint,
        'expectedTransactionVersion', (paid_result #>> '{transaction,version}')::bigint,
        'paymentStatus', 'unpaid',
        'paidAt', null
      )
    );
    raise exception 'Paid TK moved backward to unpaid';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_CORRECTION_REQUIRED' then
      raise exception 'Backward payment transition hint is incorrect: %', error_hint;
    end if;
  end;

  update public.employees
  set location_id = '30000000-0000-0000-0000-000000000001'
  where id = '40000000-0000-0000-0000-000000000001';
end
$$;

-- A downstream source-event conflict must roll back fares, audit and retry state.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  conflict_key constant text := 'completion-source-rollback';
  source_key text;
  details jsonb;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'completion-rollback-create',
    jsonb_build_object(
      'customerName', 'Completion Rollback',
      'pnr', 'COMP-R1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-22',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 50)
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;
  source_key := 'tktc:v1:' || encode(digest(
    '40000000-0000-0000-0000-000000000001:' || conflict_key || ':sale', 'sha256'
  ), 'hex');

  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', '99000000-0000-0000-0000-000000000001',
    'source_fact_key', 'fixture:completion-conflict',
    'source_record_id', '99000000-0000-0000-0000-000000000002',
    'event_type', 'fixture_conflict',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000001',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', '2026-08-23T12:00:00Z',
    'effective_on', '2026-08-23',
    'source_path', '/dashboard/ticketing/fixture',
    'variables', '{}'::jsonb,
    'idempotency_key', source_key
  ));

  details := jsonb_build_object(
    'expectedBookingVersion', (created #>> '{booking,version}')::bigint,
    'expectedTransactionVersion', (created #>> '{transaction,version}')::bigint,
    'contactPhone', null,
    'departureDate', null,
    'returnDate', null,
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 75)
    ),
    'passengers', '[]'::jsonb
  );

  begin
    perform public.ticketing_complete_tk_details(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      conflict_key, details
    );
    raise exception 'Commission source conflict did not abort completion';
  exception when invalid_parameter_value then
    null;
  end;

  if exists (
    select 1 from public.ticket_passenger_fare_lines
    where transaction_id = transaction_id_value and unit_sale_price_source is not null
  ) or exists (
    select 1 from public.ticket_idempotency_keys
    where action_name = 'ticketing.complete_tk_details.v1'
      and actor_employee_id = '40000000-0000-0000-0000-000000000001'
      and idempotency_key = conflict_key
  ) or exists (
    select 1 from public.ticket_audit_events
    where transaction_id = transaction_id_value and action = 'complete_tk_details'
  ) then
    raise exception 'Failed completion left partial operational/audit/idempotency state';
  end if;
end
$$;

-- Prepare a deterministic two-session optimistic-version race for the shell
-- harness. The winner pauses after its one audit insert while retaining every
-- row lock; the loser must then wake and fail on the stale versions.
do $$
declare
  created jsonb;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'completion-concurrency-create',
    jsonb_build_object(
      'customerName', 'Completion Concurrency',
      'pnr', 'COMP-C1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-22',
      'timeLimitAt', '2026-09-10T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 50)
      )
    )
  );

  if created #>> '{booking,pnr}' <> 'COMP-C1' then
    raise exception 'Completion concurrency fixture was not created';
  end if;
end
$$;

create or replace function public.ticketing_test_pause_completion_race()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.action = 'complete_tk_details'
    and exists (
      select 1
      from public.ticket_bookings booking
      where booking.id = new.booking_id
        and booking.normalized_pnr = 'COMP-C1'
    )
  then
    perform pg_sleep(5);
  end if;
  return new;
end
$$;

drop trigger if exists ticketing_test_pause_completion_race
  on public.ticket_audit_events;
create trigger ticketing_test_pause_completion_race
  after insert on public.ticket_audit_events
  for each row execute function public.ticketing_test_pause_completion_race();

select 'Ticketing TK completion integration checks passed.' as result;
