\set ON_ERROR_STOP on

do $$
declare
  status_value jsonb;
  rpc_oid oid;
  rpc_config text[];
begin
  status_value := public.ticketing_schema_status();
  if status_value ->> 'ready' <> 'true'
    or status_value ->> 'version' <> '2026082602'
    or status_value ->> 'requiredVersion' <> '2026082602'
  then
    raise exception 'Ticketing root itinerary capability is not ready: %', status_value;
  end if;

  if pg_catalog.to_regclass('public.ticket_airports') is null
    or pg_catalog.to_regclass('public.ticket_itinerary_write_contexts') is null
    or pg_catalog.to_regprocedure(
      'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'
    ) is null
  then
    raise exception 'Ticketing itinerary capability objects are missing';
  end if;

  if (select count(*) from public.ticket_airports where is_active) < 29
    or not exists (
      select 1 from public.ticket_airports
      where iata_code = 'LHR'
        and timezone = 'Europe/London'
        and country_code = 'GB'
    )
    or not exists (
      select 1 from public.ticket_airports
      where iata_code = 'ISB'
        and timezone = 'Asia/Karachi'
        and country_code = 'PK'
    )
    or not exists (
      select 1 from public.ticket_airports
      where iata_code = 'JED'
        and timezone = 'Asia/Riyadh'
        and country_code = 'SA'
    )
    or not exists (
      select 1 from public.ticket_airports
      where iata_code = 'IST'
        and timezone = 'Europe/Istanbul'
        and country_code = 'TR'
    )
    or not exists (
      select 1 from public.ticket_airports
      where iata_code = 'DXB'
        and timezone = 'Asia/Dubai'
        and country_code = 'AE'
    )
  then
    raise exception 'Ticket airport seed coverage or trusted timezones are incorrect';
  end if;

  select procedure_row.oid, procedure_row.proconfig
  into rpc_oid, rpc_config
  from pg_proc procedure_row
  where procedure_row.oid =
    'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
    and procedure_row.prosecdef;

  if rpc_oid is null
    or not ('search_path=pg_catalog, public, pg_temp' = any(rpc_config))
    or not ('row_security=off' = any(rpc_config))
    or has_function_privilege(
      'public',
      'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)',
      'EXECUTE'
    )
  then
    raise exception 'Ticket itinerary RPC security-definer configuration or grants are incorrect';
  end if;

  if not (
      select class_row.relrowsecurity
      from pg_class class_row
      where class_row.oid = 'public.ticket_airports'::regclass
    )
    or not (
      select class_row.relrowsecurity
      from pg_class class_row
      where class_row.oid = 'public.ticket_itinerary_write_contexts'::regclass
    )
    or has_table_privilege('service_role', 'public.ticket_airports', 'INSERT')
    or has_table_privilege('service_role', 'public.ticket_airports', 'UPDATE')
    or has_table_privilege('service_role', 'public.ticket_airports', 'DELETE')
    or not has_table_privilege('service_role', 'public.ticket_airports', 'SELECT')
    or has_table_privilege('service_role', 'public.ticket_itinerary_sectors', 'INSERT')
    or has_table_privilege('service_role', 'public.ticket_itinerary_sectors', 'UPDATE')
    or has_table_privilege('service_role', 'public.ticket_itinerary_sectors', 'DELETE')
    or not has_table_privilege('service_role', 'public.ticket_itinerary_sectors', 'SELECT')
    or has_table_privilege('service_role', 'public.ticket_itinerary_write_contexts', 'SELECT')
    or has_table_privilege('service_role', 'public.ticket_itinerary_write_contexts', 'INSERT')
  then
    raise exception 'Ticket itinerary relation RLS or least-privilege grants are incorrect';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.ticket_itinerary_sectors'::regclass
      and trigger_row.tgname = 'ticket_itinerary_sectors_guard_2602'
      and trigger_row.tgenabled = 'O'
  )
  then
    raise exception 'Ticket itinerary context/invariant trigger is missing or disabled';
  end if;
end
$$;

insert into public.roles (id, name, level)
select '1b000000-0000-0000-0000-000000000001', 'Maintenance', 2
where not exists (
  select 1 from public.roles where lower(btrim(name)) = 'maintenance'
);

insert into auth.users (id, email)
values ('4b000000-0000-0000-0000-000000000001', 'itinerary-maintenance@example.test')
on conflict (id) do nothing;

insert into public.employees (
  id,
  full_name,
  email,
  role_id,
  location_id,
  is_active
)
values (
  '4b000000-0000-0000-0000-000000000001',
  'Itinerary Maintenance',
  'itinerary-maintenance@example.test',
  (select id from public.roles where lower(btrim(name)) = 'maintenance' limit 1),
  '30000000-0000-0000-0000-000000000001',
  true
)
on conflict (id) do update set is_active = true;

create temporary table ticketing_itinerary_test_state (
  booking_id uuid primary key,
  root_transaction_id uuid not null,
  original_booking_version bigint not null,
  initial_commission_count bigint not null,
  first_response jsonb
);

do $$
declare
  created jsonb;
begin
  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'root-itinerary-create',
    jsonb_build_object(
      'customerName', 'Root Itinerary Customer',
      'pnr', 'ITIN-2602',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-26',
      'timeLimitAt', '2026-09-01T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(jsonb_build_object(
        'passengerType', 'ADT',
        'quantity', 1,
        'unitSupplierCost', 250
      )),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', '[]'::jsonb,
      'attributionReason', 'Admin entered itinerary fixture for Primary A'
    )
  );

  insert into ticketing_itinerary_test_state (
    booking_id,
    root_transaction_id,
    original_booking_version,
    initial_commission_count
  ) values (
    (created #>> '{booking,id}')::uuid,
    (created #>> '{transaction,id}')::uuid,
    (created #>> '{booking,version}')::bigint,
    (select count(*) from public.commission_source_events)
  );
end
$$;

-- The responsible employee creates revision 1. The airline defaults to the
-- root booking airline, while every timezone and UTC instant is server-derived.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  result_value jsonb;
begin
  select * into state_row from ticketing_itinerary_test_state;

  result_value := public.ticketing_replace_root_tk_itinerary(
    '4a000000-0000-0000-0000-000000000002',
    state_row.booking_id,
    0,
    'root-itinerary-self-v1',
    jsonb_build_array(
      jsonb_build_object(
        'flightNumber', 'tk 1980',
        'originAirportCode', 'lhr',
        'destinationAirportCode', 'ist',
        'departureLocal', '2026-09-15T10:30',
        'arrivalLocal', '2026-09-15T16:30'
      ),
      jsonb_build_object(
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'flightNumber', 'TK 710',
        'originAirportCode', 'IST',
        'destinationAirportCode', 'ISB',
        'departureLocal', '2026-09-15T18:30:00',
        'arrivalLocal', '2026-09-16T02:30:00'
      )
    ),
    null
  );

  update ticketing_itinerary_test_state
  set first_response = result_value;

  if result_value ->> 'itineraryVersion' <> '1'
    or result_value ->> 'changed' <> 'true'
    or result_value ->> 'idempotentReplay' <> 'false'
    or jsonb_array_length(result_value -> 'sectors') <> 2
    or result_value #>> '{booking,id}' <> state_row.booking_id::text
    or result_value #>> '{booking,version}' <> state_row.original_booking_version::text
    or result_value #>> '{booking,ownerEmployeeId}'
      <> '4a000000-0000-0000-0000-000000000002'
    or result_value #>> '{booking,ownerEmployeeName}' <> 'Attribution Primary A'
    or result_value #>> '{booking,pnr}' <> 'ITIN-2602'
    or result_value #>> '{booking,customerName}' <> 'Root Itinerary Customer'
    or result_value #>> '{booking,operationalStatus}' <> 'held'
    or result_value #>> '{booking,defaultAirline,iataCode}' <> 'TK'
    or result_value #>> '{sectors,0,airlineCode}' <> 'TK'
    or result_value #>> '{sectors,0,airlineName}' <> 'Turkish Airlines'
    or result_value #>> '{sectors,0,originTimezone}' <> 'Europe/London'
    or result_value #>> '{sectors,0,destinationTimezone}' <> 'Europe/Istanbul'
    or result_value #>> '{sectors,1,originTimezone}' <> 'Europe/Istanbul'
    or result_value #>> '{sectors,1,destinationTimezone}' <> 'Asia/Karachi'
    or result_value #>> '{rootTransaction,id}' <> state_row.root_transaction_id::text
  then
    raise exception 'Initial itinerary response is incomplete or incorrect: %', result_value;
  end if;

  if (select version from public.ticket_bookings where id = state_row.booking_id)
      <> state_row.original_booking_version
    or (select owner_employee_id from public.ticket_bookings where id = state_row.booking_id)
      <> '4a000000-0000-0000-0000-000000000002'
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id and is_active) <> 2
    or not exists (
      select 1
      from public.ticket_itinerary_sectors sector
      where sector.booking_id = state_row.booking_id
        and sector.sequence_number = 1
        and sector.itinerary_version = 1
        and sector.airline_id = '50000000-0000-0000-0000-000000000001'
        and sector.flight_number = 'TK 1980'
        and sector.departure_timezone = 'Europe/London'
        and sector.departure_at_utc = timestamptz '2026-09-15 09:30:00+00'
        and sector.arrival_timezone = 'Europe/Istanbul'
        and sector.arrival_at_utc = timestamptz '2026-09-15 13:30:00+00'
        and sector.source_transaction_id = state_row.root_transaction_id
        and sector.created_by = '4a000000-0000-0000-0000-000000000002'
        and sector.is_active
    )
    or not exists (
      select 1
      from public.ticket_audit_events audit
      where audit.id = (result_value ->> 'auditEventId')::uuid
        and audit.booking_id = state_row.booking_id
        and audit.transaction_id = state_row.root_transaction_id
        and audit.action = 'replace_root_tk_itinerary'
        and audit.actor_employee_id = '4a000000-0000-0000-0000-000000000002'
        and audit.reason is null
        and audit.after_state ->> 'itinerary_version' = '1'
        and audit.after_state ->> 'owner_employee_id' =
          '4a000000-0000-0000-0000-000000000002'
    )
    or (select count(*) from public.commission_source_events)
      <> state_row.initial_commission_count
    or exists (select 1 from public.ticket_itinerary_write_contexts)
  then
    raise exception 'Initial itinerary replacement violated persistence, audit, attribution, or Commission invariants';
  end if;
end
$$;

-- A committed exact retry survives mutable authority and airport changes and
-- returns the immutable presentation snapshot without touching current rows.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  replay_value jsonb;
begin
  select * into state_row from ticketing_itinerary_test_state;
  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000002';
  update public.ticket_airports set is_active = false where iata_code = 'LHR';

  replay_value := public.ticketing_replace_root_tk_itinerary(
    '4a000000-0000-0000-0000-000000000002',
    state_row.booking_id,
    0,
    'root-itinerary-self-v1',
    jsonb_build_array(
      jsonb_build_object(
        'flightNumber', 'TK 1980',
        'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST',
        'departureLocal', '2026-09-15T10:30:00',
        'arrivalLocal', '2026-09-15T16:30:00'
      ),
      jsonb_build_object(
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'flightNumber', 'TK 710',
        'originAirportCode', 'IST',
        'destinationAirportCode', 'ISB',
        'departureLocal', '2026-09-15T18:30:00',
        'arrivalLocal', '2026-09-16T02:30:00'
      )
    ),
    null
  );

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000002';
  update public.ticket_airports set is_active = true where iata_code = 'LHR';

  if replay_value ->> 'idempotentReplay' <> 'true'
    or replay_value - 'idempotentReplay'
      is distinct from state_row.first_response - 'idempotentReplay'
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id) <> 2
    or (select count(*) from public.ticket_audit_events
        where booking_id = state_row.booking_id
          and action like 'replace_root_tk_itinerary%') <> 1
  then
    raise exception 'Exact itinerary replay was not immutable and authority-independent: %', replay_value;
  end if;
exception when others then
  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000002';
  update public.ticket_airports set is_active = true where iata_code = 'LHR';
  raise;
end
$$;

-- A new key carrying the same current schedule is a no-op: no history, audit,
-- booking version, or itinerary version churn.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  result_value jsonb;
begin
  select * into state_row from ticketing_itinerary_test_state;
  result_value := public.ticketing_replace_root_tk_itinerary(
    '4a000000-0000-0000-0000-000000000002',
    state_row.booking_id,
    1,
    'root-itinerary-self-noop',
    jsonb_build_array(
      jsonb_build_object(
        'flightNumber', 'TK 1980',
        'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST',
        'departureLocal', '2026-09-15T10:30',
        'arrivalLocal', '2026-09-15T16:30'
      ),
      jsonb_build_object(
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'flightNumber', 'TK 710',
        'originAirportCode', 'IST',
        'destinationAirportCode', 'ISB',
        'departureLocal', '2026-09-15T18:30',
        'arrivalLocal', '2026-09-16T02:30'
      )
    ),
    null
  );

  if result_value ->> 'changed' <> 'false'
    or result_value ->> 'itineraryVersion' <> '1'
    or jsonb_typeof(result_value -> 'auditEventId') <> 'null'
    or result_value #>> '{sectors,0,airlineName}' <> 'Turkish Airlines'
    or result_value #>> '{sectors,0,destinationTimezone}' <> 'Europe/Istanbul'
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id) <> 2
    or (select count(*) from public.ticket_audit_events
        where booking_id = state_row.booking_id
          and action like 'replace_root_tk_itinerary%') <> 1
    or (select version from public.ticket_bookings where id = state_row.booking_id)
      <> state_row.original_booking_version
  then
    raise exception 'Identical itinerary with a new key was not a stable no-op: %', result_value;
  end if;
end
$$;

-- Conflict, authority, reason, module-membership, and strict-input failures must
-- leave revision 1 untouched.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  payload_value jsonb;
  error_hint text;
begin
  select * into state_row from ticketing_itinerary_test_state;
  payload_value := jsonb_build_array(jsonb_build_object(
    'flightNumber', 'TK 999',
    'originAirportCode', 'LHR',
    'destinationAirportCode', 'ISB',
    'departureLocal', '2026-09-20T10:00',
    'arrivalLocal', '2026-09-21T00:30'
  ));

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002',
      state_row.booking_id, 0, 'root-itinerary-self-v1', payload_value, null
    );
    raise exception 'Itinerary idempotency key accepted a different payload';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000001',
      state_row.booking_id, 1, 'root-itinerary-admin-no-reason', payload_value, null
    );
    raise exception 'Administrator replaced another employee itinerary without a reason';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_ON_BEHALF_REASON_REQUIRED' then raise; end if;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000006',
      state_row.booking_id, 1, 'root-itinerary-manager-cover', payload_value, 'Manager cover'
    );
    raise exception 'Manager replaced another employee itinerary';
  exception when insufficient_privilege then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_ON_BEHALF_FORBIDDEN' then raise; end if;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4b000000-0000-0000-0000-000000000001',
      state_row.booking_id, 1, 'root-itinerary-maintenance-cover', payload_value, 'Maintenance cover'
    );
    raise exception 'Maintenance employee replaced another employee itinerary';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002',
      state_row.booking_id, 1, 'root-itinerary-self-reason', payload_value, 'Self reason'
    );
    raise exception 'Owner supplied an on-behalf itinerary reason';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_ON_BEHALF_REASON_NOT_ALLOWED' then raise; end if;
  end;

  delete from public.employee_departments
  where employee_id = '4a000000-0000-0000-0000-000000000002'
    and department_id = '20000000-0000-0000-0000-000000000001';
  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002',
      state_row.booking_id, 1, 'root-itinerary-ex-ticketing-self', payload_value, null
    );
    raise exception 'Former Ticketing owner replaced an itinerary';
  exception when insufficient_privilege then null;
  end;
  insert into public.employee_departments (employee_id, department_id)
  values (
    '4a000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001'
  );

  if (select count(*) from public.ticket_itinerary_sectors
      where booking_id = state_row.booking_id) <> 2
    or (select max(itinerary_version) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id) <> 1
  then
    raise exception 'Rejected itinerary authority/idempotency requests changed history';
  end if;
exception when others then
  insert into public.employee_departments (employee_id, department_id)
  select
    '4a000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001'
  where not exists (
    select 1 from public.employee_departments
    where employee_id = '4a000000-0000-0000-0000-000000000002'
      and department_id = '20000000-0000-0000-0000-000000000001'
  );
  raise;
end
$$;

-- Admin cover creates revision 2, retires revision 1 with the real actor, and
-- records the reason while retaining the responsible employee as owner.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  result_value jsonb;
begin
  select * into state_row from ticketing_itinerary_test_state;
  result_value := public.ticketing_replace_root_tk_itinerary(
    '4a000000-0000-0000-0000-000000000001',
    state_row.booking_id,
    1,
    'root-itinerary-admin-v2',
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 999',
      'originAirportCode', 'LHR',
      'destinationAirportCode', 'ISB',
      'departureLocal', '2026-09-20T10:00',
      'arrivalLocal', '2026-09-21T00:30'
    )),
    'Admin covered itinerary entry while the owner was absent'
  );

  if result_value ->> 'itineraryVersion' <> '2'
    or result_value #>> '{booking,ownerEmployeeId}'
      <> '4a000000-0000-0000-0000-000000000002'
    or result_value #>> '{sectors,0,createdByEmployeeId}'
      <> '4a000000-0000-0000-0000-000000000001'
    or (select version from public.ticket_bookings where id = state_row.booking_id)
      <> state_row.original_booking_version
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id
          and itinerary_version = 1
          and not is_active
          and retired_by = '4a000000-0000-0000-0000-000000000001'
          and retired_at is not null) <> 2
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id
          and itinerary_version = 2
          and is_active
          and created_by = '4a000000-0000-0000-0000-000000000001') <> 1
    or not exists (
      select 1 from public.ticket_audit_events audit
      where audit.id = (result_value ->> 'auditEventId')::uuid
        and audit.action = 'replace_root_tk_itinerary_on_behalf'
        and audit.actor_employee_id = '4a000000-0000-0000-0000-000000000001'
        and audit.reason = 'Admin covered itinerary entry while the owner was absent'
        and audit.after_state ->> 'owner_employee_id' =
          '4a000000-0000-0000-0000-000000000002'
    )
    or (select count(*) from public.commission_source_events)
      <> state_row.initial_commission_count
  then
    raise exception 'Administrator itinerary replacement violated attribution/history/audit invariants: %', result_value;
  end if;
end
$$;

-- Strict client input: no timezone/UTC fields, no nonexistent local times,
-- bounded years, no unknown airport, correct chronology, and 1..12 sectors.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  invalid_payload jsonb;
  error_hint text;
  error_detail text;
begin
  select * into state_row from ticketing_itinerary_test_state;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 1,
      'root-itinerary-stale',
      jsonb_build_array(jsonb_build_object(
        'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST', 'departureLocal', '2026-09-20T10:00'
      )), null
    );
    raise exception 'Stale itinerary version was accepted';
  exception when serialization_failure then
    get stacked diagnostics error_hint = pg_exception_hint, error_detail = pg_exception_detail;
    if error_hint <> 'TICKETING_ITINERARY_VERSION_CONFLICT'
      or error_detail::jsonb ->> 'itineraryVersion' <> '2'
    then raise; end if;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 2,
      'root-itinerary-injected-zone',
      jsonb_build_array(jsonb_build_object(
        'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST', 'departureLocal', '2026-09-20T10:00',
        'departureTimezone', 'UTC'
      )), null
    );
    raise exception 'Client-supplied itinerary timezone was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 2,
      'root-itinerary-injected-utc',
      jsonb_build_array(jsonb_build_object(
        'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST', 'departureLocal', '2026-09-20T10:00',
        'departureAtUtc', '2026-09-20T09:00:00Z'
      )), null
    );
    raise exception 'Client-supplied itinerary UTC was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 2,
      'root-itinerary-gap',
      jsonb_build_array(jsonb_build_object(
        'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST', 'departureLocal', '2026-03-29T01:30'
      )), null
    );
    raise exception 'Nonexistent DST-gap local time was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_LOCAL_TIME_GAP' then raise; end if;
  end;

  foreach invalid_payload in array array[
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
      'destinationAirportCode', 'IST', 'departureLocal', '1999-12-31T23:59:59'
    )),
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
      'destinationAirportCode', 'IST', 'departureLocal', '2201-01-01T00:00:00'
    )),
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 100', 'originAirportCode', 'ZZZ',
      'destinationAirportCode', 'IST', 'departureLocal', '2026-09-20T10:00'
    )),
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 100', 'originAirportCode', 'LHR',
      'destinationAirportCode', 'IST', 'departureLocal', '2026-09-20T10:00',
      'arrivalLocal', '2026-09-20T09:00'
    ))
  ]
  loop
    begin
      perform public.ticketing_replace_root_tk_itinerary(
        '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 2,
        'root-itinerary-invalid-' || encode(digest(invalid_payload::text, 'sha256'), 'hex'),
        invalid_payload, null
      );
      raise exception 'Invalid bounded/airport/chronology itinerary was accepted: %', invalid_payload;
    exception when invalid_parameter_value then null;
    end;
  end loop;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 2,
      'root-itinerary-empty', '[]'::jsonb, null
    );
    raise exception 'Empty itinerary was accepted';
  exception when invalid_parameter_value then null;
  end;

  select jsonb_agg(jsonb_build_object(
    'flightNumber', 'TK ' || value,
    'originAirportCode', 'LHR',
    'destinationAirportCode', 'IST',
    'departureLocal', '2026-09-20T10:00'
  ) order by value)
  into invalid_payload
  from generate_series(1, 13) value;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002', state_row.booking_id, 2,
      'root-itinerary-too-many', invalid_payload, null
    );
    raise exception 'Thirteen-sector itinerary was accepted';
  exception when invalid_parameter_value then null;
  end;

  if (select max(itinerary_version) from public.ticket_itinerary_sectors
      where booking_id = state_row.booking_id) <> 2
    or (select count(*) from public.ticket_itinerary_write_contexts) <> 0
  then
    raise exception 'Rejected strict-input requests changed itinerary state';
  end if;
end
$$;

-- PostgreSQL's deterministic overlap mapping is the later standard-time UTC
-- instant: Europe/London 2026-10-25 01:30 maps to 01:30Z, not 00:30Z.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  result_value jsonb;
begin
  select * into state_row from ticketing_itinerary_test_state;
  result_value := public.ticketing_replace_root_tk_itinerary(
    '4a000000-0000-0000-0000-000000000002',
    state_row.booking_id,
    2,
    'root-itinerary-overlap-v3',
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 200',
      'originAirportCode', 'LHR',
      'destinationAirportCode', 'IST',
      'departureLocal', '2026-10-25T01:30',
      'arrivalLocal', '2026-10-25T06:30'
    )),
    null
  );

  if result_value ->> 'itineraryVersion' <> '3'
    or not exists (
      select 1
      from public.ticket_itinerary_sectors sector
      where sector.booking_id = state_row.booking_id
        and sector.itinerary_version = 3
        and sector.is_active
        and sector.departure_local = timestamp '2026-10-25 01:30:00'
        and sector.departure_timezone = 'Europe/London'
        and sector.departure_at_utc = timestamptz '2026-10-25 01:30:00+00'
        and sector.arrival_at_utc = timestamptz '2026-10-25 03:30:00+00'
        and sector.created_by = '4a000000-0000-0000-0000-000000000002'
    )
    or (select count(*) from public.commission_source_events)
      <> state_row.initial_commission_count
  then
    raise exception 'DST-overlap mapping or final itinerary revision is incorrect: %', result_value;
  end if;
end
$$;

-- Even the database owner cannot mutate sector history outside an unforgeable
-- live context; the service role also has no table write privileges.
do $$
declare
  state_row ticketing_itinerary_test_state%rowtype;
  active_sector_id uuid;
begin
  select * into state_row from ticketing_itinerary_test_state;
  select id into active_sector_id
  from public.ticket_itinerary_sectors
  where booking_id = state_row.booking_id and is_active;

  begin
    update public.ticket_itinerary_sectors
    set flight_number = 'TK 201'
    where id = active_sector_id;
    raise exception 'Direct itinerary sector update bypassed replacement context';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.ticket_itinerary_sectors where id = active_sector_id;
    raise exception 'Itinerary history row was deleted';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    insert into public.ticket_itinerary_sectors (
      booking_id, source_transaction_id, sequence_number, airline_id,
      flight_number, origin_airport_code, destination_airport_code,
      departure_local, departure_timezone, departure_at_utc,
      schedule_status, is_active, created_by, itinerary_version
    ) values (
      state_row.booking_id, state_row.root_transaction_id, 2,
      '50000000-0000-0000-0000-000000000001', 'TK 202', 'LHR', 'IST',
      '2026-11-01 10:00', 'Europe/London', '2026-11-01 10:00+00',
      'on_schedule', true, '4a000000-0000-0000-0000-000000000002', 3
    );
    raise exception 'Direct itinerary sector insert bypassed replacement context';
  exception when insufficient_privilege then null;
  end;

  if exists (select 1 from public.ticket_itinerary_write_contexts)
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id and is_active) <> 1
    or (select count(*) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id and not is_active) <> 3
    or (select max(itinerary_version) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id) <> 3
    or (select count(*) from public.ticket_audit_events
        where booking_id = state_row.booking_id
          and action like 'replace_root_tk_itinerary%') <> 3
    or (select version from public.ticket_bookings where id = state_row.booking_id)
      <> state_row.original_booking_version
    or (select owner_employee_id from public.ticket_bookings where id = state_row.booking_id)
      <> '4a000000-0000-0000-0000-000000000002'
  then
    raise exception 'Final itinerary history, audit, context, version, or owner invariants are incorrect';
  end if;
end
$$;

select 'Ticketing root-TK itinerary integration checks passed.' as result;
