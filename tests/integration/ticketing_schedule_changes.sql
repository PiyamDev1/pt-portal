\set ON_ERROR_STOP on

do $$
declare
  status_value jsonb;
  rpc_config text[];
begin
  status_value := public.ticketing_schema_status();
  if status_value ->> 'ready' <> 'true'
    or status_value ->> 'version' <> '2026082701'
    or status_value ->> 'requiredVersion' <> '2026082701'
  then
    raise exception 'Ticketing schedule-change capability is not ready: %', status_value;
  end if;

  if to_regclass('public.ticket_schedule_write_contexts') is null
    or to_regprocedure(
      'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)'
    ) is null
  then
    raise exception 'Ticketing schedule-change objects are missing';
  end if;

  select procedure_row.proconfig into rpc_config
  from pg_proc procedure_row
  where procedure_row.oid =
    'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)'::regprocedure
    and procedure_row.prosecdef;

  if rpc_config is null
    or not ('search_path=pg_catalog, public, pg_temp' = any(rpc_config))
    or not ('row_security=off' = any(rpc_config))
    or has_function_privilege(
      'public',
      'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)',
      'EXECUTE'
    )
    or has_table_privilege('service_role', 'public.ticket_schedule_events', 'INSERT')
    or not has_table_privilege('service_role', 'public.ticket_schedule_events', 'SELECT')
    or has_table_privilege('service_role', 'public.ticket_schedule_write_contexts', 'SELECT')
    or has_table_privilege('service_role', 'public.ticket_schedule_write_contexts', 'INSERT')
  then
    raise exception 'Ticketing schedule-change security boundary or grants are incorrect';
  end if;

  if not exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.ticket_itinerary_sectors'::regclass
      and trigger_row.tgname = 'ticket_itinerary_sectors_guard_2701'
      and trigger_row.tgenabled = 'O'
  ) then
    raise exception 'Ticketing schedule-change sector guard is missing or disabled';
  end if;
end
$$;

create temporary table ticketing_schedule_test_state (
  booking_id uuid primary key,
  root_transaction_id uuid not null,
  sector_id uuid,
  change_id uuid,
  original_booking_version bigint not null,
  initial_commission_count bigint not null,
  mark_response jsonb,
  review_response jsonb,
  final_response jsonb
);

do $$
declare
  created jsonb;
  itinerary jsonb;
begin
  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'schedule-change-issued-fixture',
    jsonb_build_object(
      'customerName', 'Schedule Change Customer',
      'pnr', 'SCH-2701',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-27',
      'timeLimitAt', null,
      'issuedAt', '2026-08-27',
      'currency', 'GBP',
      'fares', jsonb_build_array(jsonb_build_object(
        'passengerType', 'ADT',
        'quantity', 1,
        'unitSupplierCost', 300
      )),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', '[]'::jsonb,
      'attributionReason', 'Admin created the issued schedule-change fixture for Primary A'
    )
  );

  itinerary := public.ticketing_replace_root_tk_itinerary(
    '4a000000-0000-0000-0000-000000000002',
    (created #>> '{booking,id}')::uuid,
    0,
    'schedule-change-itinerary-v1',
    jsonb_build_array(jsonb_build_object(
      'flightNumber', 'TK 1980',
      'originAirportCode', 'LHR',
      'destinationAirportCode', 'IST',
      'departureLocal', '2026-11-10T10:00',
      'arrivalLocal', '2026-11-10T16:00'
    )),
    null
  );

  insert into ticketing_schedule_test_state (
    booking_id,
    root_transaction_id,
    sector_id,
    original_booking_version,
    initial_commission_count
  ) values (
    (created #>> '{booking,id}')::uuid,
    (created #>> '{transaction,id}')::uuid,
    (itinerary #>> '{sectors,0,id}')::uuid,
    (created #>> '{booking,version}')::bigint,
    (select count(*) from public.commission_source_events)
  );
end
$$;

-- A different active Ticketing employee may mark a suspected change on the
-- shared monitor, but cannot resolve the responsible employee's change.
do $$
declare
  state_row ticketing_schedule_test_state%rowtype;
  result_value jsonb;
  replay_value jsonb;
  error_hint text;
begin
  select * into state_row from ticketing_schedule_test_state;
  result_value := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000004',
    state_row.sector_id,
    1,
    '00000000-0000-4000-8000-000000002701',
    'mark',
    null,
    jsonb_build_object(
      'flightNumber', 'tk 1982',
      'departureLocal', '2026-11-10T12:30',
      'arrivalLocal', '2026-11-10T18:15'
    ),
    'Airline schedule email received'
  );

  update ticketing_schedule_test_state
  set change_id = (result_value ->> 'changeId')::uuid,
      mark_response = result_value;

  replay_value := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000004',
    state_row.sector_id,
    1,
    '00000000-0000-4000-8000-000000002701',
    'mark',
    null,
    jsonb_build_object(
      'flightNumber', 'TK 1982',
      'departureLocal', '2026-11-10T12:30:00',
      'arrivalLocal', '2026-11-10T18:15:00'
    ),
    'Airline schedule email received'
  );

  if result_value ->> 'action' <> 'mark'
    or result_value ->> 'scheduleStatus' <> 'change_marked'
    or result_value ->> 'ownerEmployeeId' <> '4a000000-0000-0000-0000-000000000002'
    or result_value ->> 'actingEmployeeId' <> '4a000000-0000-0000-0000-000000000004'
    or result_value ->> 'isOnBehalf' <> 'true'
    or replay_value ->> 'idempotentReplay' <> 'true'
    or replay_value - 'idempotentReplay' is distinct from result_value - 'idempotentReplay'
    or (select schedule_status from public.ticket_itinerary_sectors where id = state_row.sector_id)
      <> 'change_marked'
    or not exists (
      select 1 from public.ticket_schedule_events event
      where event.id = (result_value ->> 'eventId')::uuid
        and event.change_case_id = (result_value ->> 'changeId')::uuid
        and event.event_version = 1
        and event.event_type = 'marked'
        and event.actor_employee_id = '4a000000-0000-0000-0000-000000000004'
        and event.proposed_schedule ->> 'flightNumber' = 'TK 1982'
        and event.proposed_schedule ->> 'departureAtUtc' = '2026-11-10T12:30:00+00:00'
    )
    or exists (select 1 from public.ticket_schedule_write_contexts)
    or (select count(*) from public.commission_source_events) <> state_row.initial_commission_count
  then
    raise exception 'Shared schedule marking, replay, status, event, or Commission invariants failed: %', result_value;
  end if;

  begin
    perform public.ticketing_transition_schedule_change(
      '4a000000-0000-0000-0000-000000000004',
      state_row.sector_id,
      1,
      '00000000-0000-4000-8000-000000002702',
      'review',
      (result_value ->> 'changeId')::uuid,
      null,
      'Non-owner review attempt'
    );
    raise exception 'A non-owner Ticketing employee reviewed another agent''s change';
  exception when insufficient_privilege then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_SCHEDULE_ON_BEHALF_FORBIDDEN' then raise; end if;
  end;

  begin
    perform public.ticketing_transition_schedule_change(
      '4a000000-0000-0000-0000-000000000006',
      state_row.sector_id,
      1,
      '00000000-0000-4000-8000-000000002703',
      'review',
      (result_value ->> 'changeId')::uuid,
      null,
      'Manager review attempt'
    );
    raise exception 'A Manager reviewed another agent''s change';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.ticketing_replace_root_tk_itinerary(
      '4a000000-0000-0000-0000-000000000002',
      state_row.booking_id,
      1,
      'schedule-change-bypass-attempt',
      jsonb_build_array(jsonb_build_object(
        'flightNumber', 'TK 999',
        'originAirportCode', 'LHR',
        'destinationAirportCode', 'IST',
        'departureLocal', '2026-11-10T14:00',
        'arrivalLocal', '2026-11-10T20:00'
      )),
      null
    );
    raise exception 'The general itinerary editor abandoned an open schedule-change case';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;

-- The responsible employee reviews the marked change. Direct finalisation
-- before this step is rejected by the database state machine.
do $$
declare
  state_row ticketing_schedule_test_state%rowtype;
  result_value jsonb;
begin
  select * into state_row from ticketing_schedule_test_state;

  begin
    perform public.ticketing_transition_schedule_change(
      '4a000000-0000-0000-0000-000000000002',
      state_row.sector_id,
      1,
      '00000000-0000-4000-8000-000000002704',
      'finalise',
      state_row.change_id,
      null,
      'Premature finalisation attempt'
    );
    raise exception 'An unreviewed schedule change was finalised';
  exception when object_not_in_prerequisite_state then null;
  end;

  result_value := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000002',
    state_row.sector_id,
    1,
    '00000000-0000-4000-8000-000000002705',
    'review',
    state_row.change_id,
    null,
    'Schedule checked against the airline notice; customer contact is required'
  );
  update ticketing_schedule_test_state set review_response = result_value;

  if result_value ->> 'scheduleStatus' <> 'awaiting_finalisation'
    or result_value ->> 'isOnBehalf' <> 'false'
    or (select schedule_status from public.ticket_itinerary_sectors where id = state_row.sector_id)
      <> 'awaiting_finalisation'
    or not exists (
      select 1 from public.ticket_schedule_events event
      where event.change_case_id = state_row.change_id
        and event.event_type = 'reviewed'
        and event.event_version = 2
        and event.actor_employee_id = '4a000000-0000-0000-0000-000000000002'
        and event.reviewed_by = '4a000000-0000-0000-0000-000000000002'
    )
  then
    raise exception 'Responsible-owner review did not advance the schedule case safely: %', result_value;
  end if;
end
$$;

-- An administrator can cover finalisation with an audit reason. The existing
-- itinerary RPC applies the proposal as revision 2, retires revision 1, and
-- emits no Ticketing Commission fact.
do $$
declare
  state_row ticketing_schedule_test_state%rowtype;
  result_value jsonb;
  replay_value jsonb;
begin
  select * into state_row from ticketing_schedule_test_state;
  result_value := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000001',
    state_row.sector_id,
    1,
    '00000000-0000-4000-8000-000000002706',
    'finalise',
    state_row.change_id,
    null,
    'Admin covered finalisation while the responsible employee contacted the customer'
  );
  update ticketing_schedule_test_state set final_response = result_value;

  replay_value := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000001',
    state_row.sector_id,
    1,
    '00000000-0000-4000-8000-000000002706',
    'finalise',
    state_row.change_id,
    null,
    'Admin covered finalisation while the responsible employee contacted the customer'
  );

  if result_value ->> 'scheduleStatus' <> 'on_schedule'
    or result_value ->> 'itineraryVersion' <> '2'
    or result_value ->> 'isOnBehalf' <> 'true'
    or result_value ->> 'sectorId' = state_row.sector_id::text
    or result_value #>> '{appliedSector,flightNumber}' <> 'TK 1982'
    or result_value #>> '{appliedSector,departureLocal}' <> '2026-11-10T12:30:00'
    or replay_value ->> 'idempotentReplay' <> 'true'
    or replay_value - 'idempotentReplay' is distinct from result_value - 'idempotentReplay'
    or not exists (
      select 1 from public.ticket_itinerary_sectors sector
      where sector.id = (result_value ->> 'sectorId')::uuid
        and sector.booking_id = state_row.booking_id
        and sector.itinerary_version = 2
        and sector.flight_number = 'TK 1982'
        and sector.departure_local = timestamp '2026-11-10 12:30:00'
        and sector.departure_at_utc = timestamptz '2026-11-10 12:30:00+00'
        and sector.arrival_local = timestamp '2026-11-10 18:15:00'
        and sector.arrival_at_utc = timestamptz '2026-11-10 15:15:00+00'
        and sector.schedule_status = 'on_schedule'
        and sector.is_active
    )
    or not exists (
      select 1 from public.ticket_itinerary_sectors sector
      where sector.id = state_row.sector_id
        and not sector.is_active
        and sector.retired_at is not null
        and sector.schedule_status = 'awaiting_finalisation'
    )
    or not exists (
      select 1 from public.ticket_schedule_events event
      where event.change_case_id = state_row.change_id
        and event.event_type = 'finalised'
        and event.event_version = 3
        and event.actor_employee_id = '4a000000-0000-0000-0000-000000000001'
    )
    or (select count(*) from public.ticket_schedule_events
        where change_case_id = state_row.change_id) <> 3
    or (select version from public.ticket_bookings where id = state_row.booking_id)
      <> state_row.original_booking_version
    or (select owner_employee_id from public.ticket_bookings where id = state_row.booking_id)
      <> '4a000000-0000-0000-0000-000000000002'
    or (select count(*) from public.commission_source_events) <> state_row.initial_commission_count
    or exists (select 1 from public.ticket_schedule_write_contexts)
    or exists (select 1 from public.ticket_itinerary_write_contexts)
  then
    raise exception 'Schedule finalisation violated revision, ownership, event, replay, or Commission invariants: %', result_value;
  end if;
end
$$;

-- A later case can be marked and dismissed without changing the itinerary
-- revision, and direct status writes remain impossible.
do $$
declare
  state_row ticketing_schedule_test_state%rowtype;
  active_sector_id uuid;
  marked jsonb;
  dismissed jsonb;
begin
  select * into state_row from ticketing_schedule_test_state;
  active_sector_id := (state_row.final_response ->> 'sectorId')::uuid;

  marked := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000002',
    active_sector_id,
    2,
    '00000000-0000-4000-8000-000000002707',
    'mark',
    null,
    jsonb_build_object(
      'flightNumber', 'TK 1984',
      'departureLocal', '2026-11-10T13:00',
      'arrivalLocal', '2026-11-10T18:45'
    ),
    'Telephone report requires verification'
  );

  dismissed := public.ticketing_transition_schedule_change(
    '4a000000-0000-0000-0000-000000000002',
    active_sector_id,
    2,
    '00000000-0000-4000-8000-000000002708',
    'dismiss',
    (marked ->> 'changeId')::uuid,
    null,
    'Airline confirmed the telephone report was incorrect'
  );

  begin
    update public.ticket_itinerary_sectors
    set schedule_status = 'change_marked'
    where id = active_sector_id;
    raise exception 'Direct schedule status mutation bypassed the schedule context';
  exception when insufficient_privilege then null;
  end;

  if dismissed ->> 'scheduleStatus' <> 'on_schedule'
    or dismissed ->> 'itineraryVersion' <> '2'
    or (select schedule_status from public.ticket_itinerary_sectors where id = active_sector_id)
      <> 'on_schedule'
    or (select max(itinerary_version) from public.ticket_itinerary_sectors
        where booking_id = state_row.booking_id) <> 2
    or (select count(*) from public.ticket_schedule_events
        where change_case_id = (marked ->> 'changeId')::uuid) <> 2
  then
    raise exception 'Schedule dismissal or direct-write guard is incorrect: %', dismissed;
  end if;
end
$$;

select 'Ticketing manual schedule-change integration checks passed.' as result;
