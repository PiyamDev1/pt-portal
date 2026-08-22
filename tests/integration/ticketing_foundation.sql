\set ON_ERROR_STOP on

do $$
begin
  if public.normalize_ticket_pnr_v1('  a b-c 12  ') <> 'AB-C12' then
    raise exception 'PNR normalization did not preserve punctuation/remove whitespace';
  end if;
  if public.normalize_ticket_pnr_v1('   ') is not null then
    raise exception 'Blank PNR must normalize to null';
  end if;
end
$$;

do $$
begin
  if (select timezone from public.locations where branch_code = 'TST') <> 'Europe/London' then
    raise exception 'Existing location timezone was not backfilled';
  end if;
  if (select iata_code::text from public.airlines where id = '50000000-0000-0000-0000-000000000001') <> 'TK' then
    raise exception 'Airline IATA code was not normalized';
  end if;
  if (select name from public.airlines where id = '50000000-0000-0000-0000-000000000001') <> 'Turkish Airlines' then
    raise exception 'Airline name was not trimmed';
  end if;
  if (select normalized_booking_reference from public.travel_package_reservations where id = '70000000-0000-0000-0000-000000000001') <> 'ABC-12' then
    raise exception 'Package reservation PNR was not normalized';
  end if;
  if not exists (
    select 1
    from public.ticket_legacy_migration_map
    where legacy_ticket_ledger_id = '71000000-0000-0000-0000-000000000001'
      and migration_status = 'needs_review'
      and booking_id is null
      and transaction_id is null
  ) then
    raise exception 'Legacy ledger row was not preserved for reviewed migration';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ticket_transaction_passengers'
      and column_name in (
        'currency',
        'supplier_cost_override_source',
        'supplier_cost_override_gbp',
        'sale_price_override_source',
        'sale_price_override_gbp'
      )
  ) then
    raise exception 'Unreconciled per-passenger fare overrides remain in the allocation table';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.locations (name, timezone) values ('Bad timezone', 'London/Invalid');
    raise exception 'Invalid IANA timezone was accepted';
  exception when check_violation then
    null;
  end;
end
$$;

insert into public.ticket_bookings (
  id,
  owner_employee_id,
  location_id,
  airline_id,
  pnr,
  customer_name,
  booking_date,
  operational_status,
  time_limit_at,
  time_limit_timezone,
  created_by,
  updated_by
)
values (
  '80000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  ' ab c-12 ',
  'Test Customer',
  '2026-08-22',
  'held',
  '2026-08-23T12:00:00Z',
  'Europe/London',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);

do $$
begin
  if (select normalized_pnr from public.ticket_bookings where id = '80000000-0000-0000-0000-000000000001') <> 'ABC-12' then
    raise exception 'Ticket booking PNR was not normalized';
  end if;

  begin
    insert into public.ticket_bookings (
      owner_employee_id,
      location_id,
      airline_id,
      pnr,
      customer_name,
      booking_date,
      operational_status,
      created_by,
      updated_by
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'NO-TIME',
      'Invalid Held Booking',
      '2026-08-22',
      'held',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    );
    raise exception 'Held booking without deadline was accepted';
  exception when check_violation then
    null;
  end;
end
$$;

insert into public.ticket_transactions (
  id,
  booking_id,
  service_type,
  owner_employee_id,
  acting_employee_id,
  operational_status,
  booking_date,
  time_limit_at,
  time_limit_timezone,
  currency
)
values (
  '81000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'TK',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'held',
  '2026-08-22',
  '2026-08-23T12:00:00Z',
  'Europe/London',
  'GBP'
);

insert into public.ticket_passenger_fare_lines (
  transaction_id,
  passenger_type,
  quantity,
  currency,
  unit_supplier_cost_source,
  unit_supplier_cost_gbp,
  unit_sale_price_source,
  unit_sale_price_gbp
)
values (
  '81000000-0000-0000-0000-000000000001',
  'ADT',
  3,
  'GBP',
  100,
  100,
  125,
  125
);

do $$
begin
  if (
    select supplier_total_gbp = 300 and sale_total_gbp = 375
    from public.ticket_passenger_fare_lines
    where transaction_id = '81000000-0000-0000-0000-000000000001'
  ) is not true then
    raise exception 'Passenger fare generated totals are incorrect';
  end if;

  update public.ticket_transactions
  set operational_status = 'issued',
      issued_at = '2026-08-22T12:00:00Z',
      passenger_ticket_count = 99,
      supplier_cost_source = 1,
      supplier_cost_gbp = 1,
      sale_price_source = 1,
      sale_price_gbp = 1
  where id = '81000000-0000-0000-0000-000000000001';

  if not exists (
    select 1
    from public.ticket_transactions
    where id = '81000000-0000-0000-0000-000000000001'
      and passenger_ticket_count = 3
      and supplier_cost_gbp = 300
      and sale_price_gbp = 375
  ) then
    raise exception 'Issued transaction did not snapshot authoritative fare totals/count';
  end if;

  begin
    insert into public.ticket_transactions (
      booking_id,
      service_type,
      owner_employee_id,
      acting_employee_id,
      booking_date
    ) values (
      '80000000-0000-0000-0000-000000000001',
      'RER',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '2026-08-22'
    );
    raise exception 'Invalid service type was accepted';
  exception when check_violation then
    null;
  end;
end
$$;

insert into public.ticket_transactions (
  id,
  booking_id,
  parent_transaction_id,
  service_type,
  owner_employee_id,
  acting_employee_id,
  operational_status,
  booking_date
)
values (
  '81000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  'R-ER',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'draft',
  '2026-08-22'
);

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
)
values (
  '80000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'USD-TEST',
  'Foreign Currency Customer',
  '2026-08-22',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);

insert into public.ticket_transactions (
  id,
  booking_id,
  service_type,
  owner_employee_id,
  acting_employee_id,
  operational_status,
  booking_date,
  currency
)
values (
  '81000000-0000-0000-0000-000000000003',
  '80000000-0000-0000-0000-000000000002',
  'TK',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'draft',
  '2026-08-22',
  'USD'
);

insert into public.ticket_passenger_fare_lines (
  transaction_id,
  passenger_type,
  quantity,
  currency,
  unit_supplier_cost_source
)
values (
  '81000000-0000-0000-0000-000000000003',
  'ADT',
  1,
  'USD',
  100
);

update public.ticket_transactions
set operational_status = 'issued',
    issued_at = '2026-08-22T13:00:00Z'
where id = '81000000-0000-0000-0000-000000000003';

do $$
begin
  begin
    update public.ticket_transactions
    set payment_status = 'paid', paid_at = '2026-08-22T14:00:00Z'
    where id = '81000000-0000-0000-0000-000000000003';
    raise exception 'Non-GBP transaction was paid without actual GBP values';
  exception when check_violation then
    null;
  end;
end
$$;

update public.ticket_passenger_fare_lines
set unit_sale_price_source = 125,
    unit_supplier_cost_gbp = 80,
    unit_sale_price_gbp = 100
where transaction_id = '81000000-0000-0000-0000-000000000003';

update public.ticket_transactions
set payment_status = 'paid', paid_at = '2026-08-22T14:00:00Z'
where id = '81000000-0000-0000-0000-000000000003';

do $$
begin
  if not exists (
    select 1
    from public.ticket_transactions
    where id = '81000000-0000-0000-0000-000000000003'
      and passenger_ticket_count = 1
      and supplier_cost_source = 100
      and supplier_cost_gbp = 80
      and sale_price_source = 125
      and sale_price_gbp = 100
      and payment_status = 'paid'
  ) then
    raise exception 'Non-GBP issued-to-paid reconciliation is incorrect';
  end if;

  begin
    update public.ticket_transactions
    set payment_status = 'unpaid'
    where id = '81000000-0000-0000-0000-000000000003';
    raise exception 'Paid transaction moved back to unpaid';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_transactions
    set operational_status = 'draft'
    where id = '81000000-0000-0000-0000-000000000003';
    raise exception 'Issued transaction moved back to draft';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_transactions
    set issued_at = '2026-08-22T15:00:00Z'
    where id = '81000000-0000-0000-0000-000000000001';
    raise exception 'Issued transaction timestamp was rewritten';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_transactions
    set paid_at = '2026-08-22T15:00:00Z'
    where id = '81000000-0000-0000-0000-000000000003';
    raise exception 'Paid transaction timestamp was rewritten';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_passenger_fare_lines
    set transaction_id = '81000000-0000-0000-0000-000000000002'
    where transaction_id = '81000000-0000-0000-0000-000000000001';
    raise exception 'Posted passenger fare line moved to another transaction';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end
$$;

insert into public.ticket_passengers (
  id,
  booking_id,
  passenger_type,
  full_name,
  created_by
)
values (
  '84000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000002',
  'ADT',
  'Cross Booking Test',
  '40000000-0000-0000-0000-000000000001'
);

insert into public.ticket_passengers (
  id,
  booking_id,
  passenger_type,
  full_name,
  created_by
)
values (
  '84000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000002',
  'CHD',
  'Fare Type Mismatch Test',
  '40000000-0000-0000-0000-000000000001'
);

do $$
begin
  begin
    insert into public.ticket_transactions (
      booking_id,
      service_type,
      owner_employee_id,
      acting_employee_id,
      booking_date
    ) values (
      '80000000-0000-0000-0000-000000000002',
      'DC',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '2026-08-22'
    );
    raise exception 'Root DC transaction was accepted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.ticket_transaction_passengers (
      booking_id,
      transaction_id,
      passenger_id
    ) values (
      '80000000-0000-0000-0000-000000000002',
      '81000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001'
    );
    raise exception 'Cross-booking transaction/passenger allocation was accepted';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.ticket_transaction_passengers (
      booking_id,
      transaction_id,
      passenger_id,
      fare_line_id
    ) values (
      '80000000-0000-0000-0000-000000000002',
      '81000000-0000-0000-0000-000000000003',
      '84000000-0000-0000-0000-000000000002',
      (
        select id
        from public.ticket_passenger_fare_lines
        where transaction_id = '81000000-0000-0000-0000-000000000003'
          and passenger_type = 'ADT'
      )
    );
    raise exception 'Passenger was allocated to a different fare type';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.ticket_itinerary_sectors (
      booking_id,
      source_transaction_id,
      sequence_number,
      origin_airport_code,
      destination_airport_code,
      departure_local,
      departure_timezone,
      departure_at_utc,
      created_by
    ) values (
      '80000000-0000-0000-0000-000000000002',
      '81000000-0000-0000-0000-000000000001',
      1,
      'LHR',
      'IST',
      '2026-09-01 10:00:00',
      'Europe/London',
      '2026-09-01T09:00:00Z',
      '40000000-0000-0000-0000-000000000001'
    );
    raise exception 'Cross-booking itinerary source transaction was accepted';
  exception when foreign_key_violation then
    null;
  end;
end
$$;

insert into public.ticket_transaction_passengers (
  booking_id,
  transaction_id,
  passenger_id,
  fare_line_id,
  ticket_number
)
select
  '80000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000003',
  '84000000-0000-0000-0000-000000000001',
  fare_line.id,
  'TEST-001'
from public.ticket_passenger_fare_lines fare_line
where fare_line.transaction_id = '81000000-0000-0000-0000-000000000003'
  and fare_line.passenger_type = 'ADT';

do $$
begin
  if not exists (
    select 1
    from public.ticket_transaction_passengers allocation
    join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
    join public.ticket_passenger_fare_lines fare_line on fare_line.id = allocation.fare_line_id
    where allocation.transaction_id = '81000000-0000-0000-0000-000000000003'
      and passenger.passenger_type = fare_line.passenger_type
  ) then
    raise exception 'Valid passenger-to-fare allocation was not persisted';
  end if;
end
$$;

do $$
begin
  begin
    update public.ticket_passengers
    set passenger_type = 'CHD'
    where id = '84000000-0000-0000-0000-000000000001';
    raise exception 'Allocated passenger type was changed';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end
$$;

insert into public.ticket_passengers (
  id,
  booking_id,
  passenger_type,
  full_name,
  created_by
)
values (
  '84000000-0000-0000-0000-000000000003',
  '80000000-0000-0000-0000-000000000001',
  'CHD',
  'Draft Fare Allocation Test',
  '40000000-0000-0000-0000-000000000001'
);

insert into public.ticket_passenger_fare_lines (
  id,
  transaction_id,
  passenger_type,
  quantity,
  currency
)
values (
  '85000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  'CHD',
  1,
  'GBP'
);

insert into public.ticket_transaction_passengers (
  booking_id,
  transaction_id,
  passenger_id,
  fare_line_id
)
values (
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  '84000000-0000-0000-0000-000000000003',
  '85000000-0000-0000-0000-000000000001'
);

do $$
begin
  begin
    update public.ticket_passenger_fare_lines
    set passenger_type = 'ADT'
    where id = '85000000-0000-0000-0000-000000000001';
    raise exception 'Allocated draft fare-line type was changed';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_transactions
    set operational_status = 'cancelled'
    where id = '81000000-0000-0000-0000-000000000001';
    raise exception 'Cancelled transaction without cancelled_at was accepted';
  exception when check_violation then
    null;
  end;

  update public.ticket_transactions
  set operational_status = 'cancelled',
      cancelled_at = '2026-08-22T16:00:00Z'
  where id = '81000000-0000-0000-0000-000000000001';

  begin
    update public.ticket_transactions
    set cancelled_at = '2026-08-22T17:00:00Z'
    where id = '81000000-0000-0000-0000-000000000001';
    raise exception 'Cancellation timestamp was rewritten';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  update public.ticket_transactions
  set operational_status = 'refunded',
      refunded_at = '2026-08-22T16:30:00Z'
  where id = '81000000-0000-0000-0000-000000000003';

  begin
    update public.ticket_transactions
    set refunded_at = '2026-08-22T17:30:00Z'
    where id = '81000000-0000-0000-0000-000000000003';
    raise exception 'Refund timestamp was rewritten';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end
$$;

insert into public.commission_source_events (
  id,
  source_module,
  source_event_id,
  source_fact_key,
  source_record_id,
  event_type,
  contract_version,
  event_version,
  employee_id,
  owner_employee_id,
  location_id,
  occurred_at,
  effective_on,
  source_path,
  variables,
  idempotency_key
)
values (
  '82000000-0000-0000-0000-000000000001',
  'ticketing',
  '83000000-0000-0000-0000-000000000001',
  'transaction:81000000-0000-0000-0000-000000000001:issued',
  '81000000-0000-0000-0000-000000000001',
  'ticket_issued',
  1,
  1,
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '2026-08-22T12:00:00Z',
  '2026-08-22',
  '/dashboard/ticketing/ledger/80000000-0000-0000-0000-000000000001',
  '{"service_type":"TK","passenger_ticket_count":3,"commission_scope":"ticket"}',
  'ticketing-test-issued-1'
);

do $$
begin
  if not exists (
    select 1
    from public.commission_source_event_states
    where event_id = '82000000-0000-0000-0000-000000000001'
      and processing_status = 'pending'
  ) then
    raise exception 'Commission source-event state was not created atomically';
  end if;

  begin
    update public.commission_source_events
    set variables = '{"tampered":true}'
    where id = '82000000-0000-0000-0000-000000000001';
    raise exception 'Immutable Commission source event was updated';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    insert into public.commission_source_events (
      source_module,
      source_event_id,
      source_fact_key,
      source_record_id,
      event_type,
      contract_version,
      event_version,
      employee_id,
      occurred_at,
      effective_on,
      source_path,
      variables,
      idempotency_key
    ) values (
      'ticketing',
      '83000000-0000-0000-0000-000000000002',
      'transaction:81000000-0000-0000-0000-000000000001:issued',
      '81000000-0000-0000-0000-000000000001',
      'ticket_issued',
      1,
      2,
      '40000000-0000-0000-0000-000000000001',
      '2026-08-22T12:05:00Z',
      '2026-08-22',
      '/dashboard/ticketing/ledger/80000000-0000-0000-0000-000000000001',
      '{}',
      'ticketing-test-issued-invalid-lineage'
    );
    raise exception 'Correction without superseded event was accepted';
  exception when check_violation then
    null;
  end;
end
$$;

insert into public.commission_source_events (
  id,
  source_module,
  source_event_id,
  source_fact_key,
  source_record_id,
  event_type,
  contract_version,
  event_version,
  supersedes_event_id,
  employee_id,
  owner_employee_id,
  location_id,
  occurred_at,
  effective_on,
  source_path,
  variables,
  idempotency_key
)
values (
  '82000000-0000-0000-0000-000000000002',
  'ticketing',
  '83000000-0000-0000-0000-000000000003',
  'transaction:81000000-0000-0000-0000-000000000001:issued',
  '81000000-0000-0000-0000-000000000001',
  'ticket_issued_corrected',
  1,
  2,
  '82000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '2026-08-22T12:10:00Z',
  '2026-08-22',
  '/dashboard/ticketing/ledger/80000000-0000-0000-0000-000000000001',
  '{"service_type":"TK","passenger_ticket_count":3,"commission_scope":"package"}',
  'ticketing-test-issued-correction-2'
);

do $$
begin
  if (
    select count(*)
    from public.commission_source_event_states
    where event_id in (
      '82000000-0000-0000-0000-000000000001',
      '82000000-0000-0000-0000-000000000002'
    )
  ) <> 2 then
    raise exception 'Corrected source-event lineage did not create two processing states';
  end if;
end
$$;

set role service_role;

do $$
declare
  event_payload jsonb;
  first_result jsonb;
  replay_result jsonb;
begin
  event_payload := jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', '83000000-0000-0000-0000-000000000004',
    'source_fact_key', 'transaction:81000000-0000-0000-0000-000000000003:paid',
    'source_record_id', '81000000-0000-0000-0000-000000000003',
    'event_type', 'ticket_paid',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000001',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', '2026-08-22T14:00:00Z',
    'effective_on', '2026-08-22',
    'source_path', '/dashboard/ticketing/ledger/80000000-0000-0000-0000-000000000002',
    'variables', jsonb_build_object(
      'service_type', 'TK',
      'passenger_ticket_count', 1,
      'commission_scope', 'ticket'
    ),
    'idempotency_key', 'ticketing-rpc-paid-1'
  );

  first_result := public.append_commission_source_event(event_payload);
  replay_result := public.append_commission_source_event(event_payload);

  if (first_result ->> 'idempotentReplay')::boolean is not false
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or first_result ->> 'id' is distinct from replay_result ->> 'id'
  then
    raise exception 'Commission source-event retry did not return a stable replay';
  end if;

  update public.commission_source_event_states
  set processing_status = 'processing',
      attempt_count = 1
  where event_id = (first_result ->> 'id')::uuid;

  if not found then
    raise exception 'service_role could not update scoped Commission processing state';
  end if;

  update public.commission_source_event_states
  set processing_status = 'pending'
  where event_id = (first_result ->> 'id')::uuid;

  begin
    insert into public.commission_source_events (source_module)
    values ('bypass');
    raise exception 'service_role bypassed the Commission append function';
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.commission_source_event_states
    where event_id = (first_result ->> 'id')::uuid;
    raise exception 'service_role deleted Commission processing state';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;

do $$
declare
  event_payload jsonb;
  source_row_id uuid;
  correction_result jsonb;
begin
  event_payload := jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', '83000000-0000-0000-0000-000000000004',
    'source_fact_key', 'transaction:81000000-0000-0000-0000-000000000003:paid',
    'source_record_id', '81000000-0000-0000-0000-000000000003',
    'event_type', 'ticket_paid',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000001',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', '2026-08-22T14:00:00Z',
    'effective_on', '2026-08-22',
    'source_path', '/dashboard/ticketing/ledger/80000000-0000-0000-0000-000000000002',
    'variables', jsonb_build_object(
      'service_type', 'TK',
      'passenger_ticket_count', 1,
      'commission_scope', 'ticket'
    ),
    'idempotency_key', 'ticketing-rpc-paid-1'
  );

  select id
  into source_row_id
  from public.commission_source_events
  where source_module = 'ticketing'
    and source_event_id = '83000000-0000-0000-0000-000000000004';

  if source_row_id is null
    or (select count(*) from public.commission_source_events
        where source_module = 'ticketing'
          and idempotency_key = 'ticketing-rpc-paid-1') <> 1
    or not exists (
      select 1
      from public.commission_source_event_states
      where event_id = source_row_id and processing_status = 'pending'
    )
  then
    raise exception 'Retry-safe Commission append did not persist one event and state';
  end if;

  begin
    perform public.append_commission_source_event(
      event_payload || jsonb_build_object('variables', '{"tampered":true}'::jsonb)
    );
    raise exception 'Conflicting Commission idempotency payload was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.append_commission_source_event(
      event_payload || jsonb_build_object('unexpected_field', true)
    );
    raise exception 'Unknown Commission source-event field was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.append_commission_source_event(event_payload - 'owner_employee_id');
    raise exception 'Incomplete Commission source-event envelope was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  correction_result := public.append_commission_source_event(
    event_payload
      || jsonb_build_object(
        'source_event_id', '83000000-0000-0000-0000-000000000005',
        'event_type', 'ticket_paid_corrected',
        'event_version', 2,
        'supersedes_event_id', '83000000-0000-0000-0000-000000000004',
        'variables', jsonb_build_object(
          'service_type', 'TK',
          'passenger_ticket_count', 1,
          'commission_scope', 'package'
        ),
        'idempotency_key', 'ticketing-rpc-paid-correction-2'
      )
  );

  if (correction_result ->> 'idempotentReplay')::boolean is not false
    or not exists (
      select 1
      from public.commission_source_events
      where source_event_id = '83000000-0000-0000-0000-000000000005'
        and supersedes_event_id = source_row_id
    )
  then
    raise exception 'Producer source-event correction lineage was not resolved';
  end if;

  begin
    delete from public.commission_source_event_states where event_id = source_row_id;
    raise exception 'Commission source-event state deletion bypassed its trigger';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end
$$;

do $$
begin
  set constraints ticket_bookings_validate_package_scope immediate;

  begin
    update public.ticket_bookings
    set package_match_status = 'matched',
        commission_scope = 'package'
    where id = '80000000-0000-0000-0000-000000000002';
    raise exception 'Package scope without package-flight evidence was accepted';
  exception when check_violation then
    null;
  end;

  set constraints ticket_bookings_validate_package_scope deferred;

  begin
    insert into public.ticket_package_links (
      booking_id,
      package_id,
      reservation_id,
      match_status,
      matched_pnr
    ) values (
      '80000000-0000-0000-0000-000000000002',
      '60000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      'matched',
      'USD-TEST'
    );
    raise exception 'Package link with a different flight PNR was accepted';
  exception when check_violation then
    null;
  end;
end
$$;

do $$
begin
  insert into public.ticket_package_links (
    booking_id,
    package_id,
    reservation_id,
    match_status,
    resolution_method,
    matched_pnr
  ) values (
    '80000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'matched',
    'automatic',
    'ignored-by-derived-evidence'
  );

  update public.ticket_bookings
  set package_match_status = 'matched',
      commission_scope = 'package'
  where id = '80000000-0000-0000-0000-000000000001';
end
$$;

do $$
begin
  if not exists (
    select 1
    from public.ticket_bookings booking
    join public.ticket_package_links link on link.booking_id = booking.id
    where booking.id = '80000000-0000-0000-0000-000000000001'
      and booking.package_match_status = 'matched'
      and booking.commission_scope = 'package'
      and link.match_status = 'matched'
      and link.resolution_method = 'automatic'
      and link.matched_pnr = 'ABC-12'
      and link.package_reference_snapshot = 'PKG-TEST'
      and link.package_type_snapshot = 'umrah'
      and link.retired_at is null
  ) then
    raise exception 'Supported package-flight evidence did not derive package scope snapshots';
  end if;

  begin
    update public.ticket_bookings
    set pnr = 'CHANGED-PNR'
    where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'Booking PNR changed while package evidence was active';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.travel_package_reservations
    set booking_reference = 'CHANGED-PNR'
    where id = '70000000-0000-0000-0000-000000000001';
    raise exception 'Package flight PNR changed while Ticketing evidence was active';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.travel_packages
    set package_type = 'holiday'
    where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'Linked package type changed without Ticketing reconciliation';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ticket_bookings',
    'ticket_transactions',
    'ticket_passenger_fare_lines',
    'ticket_passengers',
    'ticket_transaction_passengers',
    'ticket_itinerary_sectors',
    'ticket_schedule_events',
    'ticket_package_links',
    'ticket_idempotency_keys',
    'ticket_audit_events',
    'ticket_notification_events',
    'ticket_legacy_migration_map',
    'commission_source_events',
    'commission_source_event_states',
    'commission_rules',
    'commission_rate_components',
    'commission_tiers',
    'employee_commission_assignments'
  ]
  loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', table_name)::regclass) then
      raise exception 'RLS is not enabled on %', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'anon unexpectedly has SELECT on %', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') then
      raise exception 'authenticated unexpectedly has SELECT on %', table_name;
    end if;
    if not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') then
      raise exception 'service_role lacks SELECT on %', table_name;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.airlines', 'SELECT') then
    raise exception 'anon unexpectedly has SELECT on airlines';
  end if;
  if not has_table_privilege('authenticated', 'public.airlines', 'SELECT') then
    raise exception 'authenticated lacks airline lookup access';
  end if;
  if has_table_privilege('authenticated', 'public.airlines', 'INSERT') then
    raise exception 'authenticated unexpectedly has airline mutation access';
  end if;
  if has_table_privilege('authenticated', 'public.ticket_ledger', 'SELECT') then
    raise exception 'authenticated unexpectedly has legacy ledger access';
  end if;
  if not has_table_privilege('service_role', 'public.ticket_ledger', 'SELECT') then
    raise exception 'service_role lacks legacy ledger read access';
  end if;
  if has_table_privilege('service_role', 'public.ticket_ledger', 'INSERT') then
    raise exception 'service_role unexpectedly has legacy ledger write access';
  end if;
  if has_table_privilege('service_role', 'public.ticket_audit_events', 'UPDATE')
    or has_table_privilege('service_role', 'public.ticket_schedule_events', 'DELETE')
    or has_table_privilege('service_role', 'public.commission_source_events', 'UPDATE')
    or has_table_privilege('service_role', 'public.commission_source_events', 'INSERT')
  then
    raise exception 'service_role unexpectedly has mutation access to append-only events';
  end if;
  if has_table_privilege('service_role', 'public.commission_source_event_states', 'INSERT')
    or has_table_privilege('service_role', 'public.commission_source_event_states', 'DELETE')
    or has_table_privilege('service_role', 'public.commission_source_event_states', 'UPDATE')
  then
    raise exception 'service_role has broad Commission processing-state mutation access';
  end if;
  if not has_column_privilege(
    'service_role',
    'public.commission_source_event_states',
    'processing_status',
    'UPDATE'
  ) then
    raise exception 'service_role lacks scoped Commission processing-state update access';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.append_commission_source_event(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.append_commission_source_event(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Commission append function execute grants are incorrect';
  end if;
end
$$;

do $$
declare
  status jsonb;
begin
  status := public.ticketing_schema_status();
  if coalesce((status ->> 'ready')::boolean, false) is not true then
    raise exception 'Ticketing schema status is not ready: %', status;
  end if;
  if (status ->> 'version')::bigint <> 20260822 then
    raise exception 'Unexpected Ticketing schema version: %', status;
  end if;
end
$$;

select 'Ticketing foundation integration checks passed.' as result;
