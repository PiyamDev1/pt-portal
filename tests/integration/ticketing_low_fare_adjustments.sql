\set ON_ERROR_STOP on

do $$
declare
  status_value jsonb;
begin
  status_value := public.ticketing_schema_status();
  if (status_value ->> 'ready')::boolean is not true
    or (status_value ->> 'version')::bigint <> 2026082401
    or (status_value ->> 'requiredVersion')::bigint <> 2026082401
    or not (status_value #> '{details,capabilities}' ?& array[
      'shared-low-fare-adjustments',
      'whole-pnr-gbp-fare-lineage',
      'server-snapshotted-original-fare',
      'target-safe-fare-adjustment-events',
      'immutable-fare-adjustment-history'
    ])
  then
    raise exception 'Low Fare capability is incorrect: %', status_value;
  end if;

  if not has_function_privilege(
      'service_role',
      'public.ticketing_append_fare_adjustment(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.ticketing_append_fare_adjustment(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.ticketing_append_fare_adjustment(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'Low Fare append RPC grants are incorrect';
  end if;

  if not has_table_privilege('service_role', 'public.ticket_fare_adjustments', 'SELECT')
    or has_table_privilege('service_role', 'public.ticket_fare_adjustments', 'INSERT')
    or has_table_privilege('service_role', 'public.ticket_fare_adjustments', 'UPDATE')
    or has_table_privilege('service_role', 'public.ticket_fare_adjustments', 'DELETE')
    or has_table_privilege('authenticated', 'public.ticket_fare_adjustments', 'SELECT')
    or has_table_privilege('anon', 'public.ticket_fare_adjustments', 'SELECT')
    or not has_table_privilege(
      'service_role', 'public.ticket_fare_adjustment_current', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.ticket_fare_adjustment_current', 'SELECT'
    )
    or has_table_privilege('anon', 'public.ticket_fare_adjustment_current', 'SELECT')
  then
    raise exception 'Low Fare table or current-view ACL is incorrect';
  end if;

  if has_function_privilege(
      'service_role',
      'public.validate_ticket_fare_adjustment_lineage_2026082401()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.serialize_ticket_package_scope_2026082401()',
      'EXECUTE'
    )
    or position(
      'pg_advisory_xact_lock'
      in pg_get_functiondef(
        'public.ticketing_append_fare_adjustment(uuid,uuid,text,jsonb)'::regprocedure
      )
    ) = 0
    or position(
      'for update'
      in lower(pg_get_functiondef(
        'public.ticketing_append_fare_adjustment(uuid,uuid,text,jsonb)'::regprocedure
      ))
    ) = 0
  then
    raise exception 'Low Fare internal grants or mutation locks are incorrect';
  end if;

  if not exists (
      select 1
      from pg_class class_row
      where class_row.oid = 'public.ticket_fare_adjustments'::regclass
        and class_row.relrowsecurity
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'ticket_fare_adjustments'
        and policyname = 'Service role reads ticket_fare_adjustments'
        and cmd = 'SELECT'
    )
  then
    raise exception 'Low Fare RLS boundary is missing';
  end if;

  if not exists (
      select 1
      from pg_trigger trigger_row
      join pg_proc procedure_row on procedure_row.oid = trigger_row.tgfoid
      where trigger_row.tgrelid = 'public.ticket_fare_adjustments'::regclass
        and trigger_row.tgname = 'ticket_fare_adjustments_validate_lineage'
        and procedure_row.proname = 'validate_ticket_fare_adjustment_lineage_2026082401'
        and not trigger_row.tgisinternal
    )
    or not exists (
      select 1
      from pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.ticket_fare_adjustments'::regclass
        and trigger_row.tgname = 'ticket_fare_adjustments_immutable'
        and not trigger_row.tgisinternal
    )
    or not exists (
      select 1
      from pg_trigger trigger_row
      join pg_proc procedure_row on procedure_row.oid = trigger_row.tgfoid
      where trigger_row.tgrelid = 'public.ticket_package_links'::regclass
        and trigger_row.tgname = 'ticket_package_links_00_serialize_booking_scope_2401'
        and procedure_row.proname = 'serialize_ticket_package_scope_2026082401'
        and not trigger_row.tgisinternal
    )
  then
    raise exception 'Low Fare lineage, immutability, or package serialization trigger is missing';
  end if;

  if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.ticket_fare_adjustments'::regclass
        and conname = 'ticket_fare_adjustments_root_same_booking_fkey'
    )
    or not exists (
      select 1 from pg_constraint
      where conrelid = 'public.ticket_fare_adjustments'::regclass
        and conname = 'ticket_fare_adjustments_previous_same_booking_fkey'
    )
    or not exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'ticket_fare_adjustments'
        and indexname = 'ticket_fare_adjustments_booking_sequence_idx'
        and indexdef ilike 'create unique index%'
    )
    or not exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'ticket_fare_adjustments'
        and indexname = 'ticket_fare_adjustments_one_successor_idx'
        and indexdef ilike 'create unique index%'
    )
  then
    raise exception 'Low Fare same-booking or branch-prevention backstops are missing';
  end if;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      'authenticated-low-fare-bypass',
      '{}'::jsonb
    );
    raise exception 'authenticated executed the server-only Low Fare RPC';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform 1 from public.ticket_fare_adjustments;
    raise exception 'authenticated read the server-only Low Fare table';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

set role service_role;
do $$
begin
  begin
    insert into public.ticket_fare_adjustments (
      booking_id,
      root_transaction_id,
      sequence_number,
      acting_employee_id,
      owner_employee_id,
      actor_location_id,
      booking_location_id,
      original_fare_gbp,
      new_fare_gbp,
      passenger_ticket_count,
      effective_on,
      package_match_status,
      commission_scope
    ) values (
      gen_random_uuid(),
      gen_random_uuid(),
      1,
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid(),
      1,
      2,
      1,
      current_date,
      'unmatched',
      'ticket'
    );
    raise exception 'service_role inserted a Low Fare row outside the RPC';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

insert into public.locations (id, name, branch_code, timezone)
values (
  '30000000-0000-0000-0000-000000000002',
  'Remote Test Branch',
  'RTS',
  'Europe/London'
)
on conflict (id) do update
set timezone = excluded.timezone;

update public.employees
set location_id = '30000000-0000-0000-0000-000000000002'
where id = '40000000-0000-0000-0000-000000000003';

-- Shared cross-agent Low Fare, replay, conflict, chronology, lineage, signed
-- higher-fare movement, current projection, root immutability, and target-safe
-- source facts.
do $$
begin
  perform public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'low-fare-root-main',
    jsonb_build_object(
      'customerName', 'Shared Low Fare Customer',
      'pnr', 'LOW-U1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 100
        ),
        jsonb_build_object(
          'passengerType', 'CHD', 'quantity', 1, 'unitSupplierCost', 50
        )
      )
    )
  );
end
$$;

do $$
declare
  first_result jsonb;
  replay_result jsonb;
  second_result jsonb;
  booking_id_value uuid;
  root_id_value uuid;
  first_adjustment_id uuid;
  second_adjustment_id uuid;
  booking_version_before bigint;
  root_version_before bigint;
  root_supplier_before numeric(14,2);
  booking_updated_before timestamptz;
  booking_version_after_first bigint;
  adjustment_count_before integer;
  event_count_before integer;
  audit_count_before integer;
  error_hint text;
  error_detail text;
  current_entry jsonb;
begin
  select
    booking.id,
    root.id,
    booking.version,
    booking.updated_at,
    root.version,
    root.supplier_cost_gbp
  into
    booking_id_value,
    root_id_value,
    booking_version_before,
    booking_updated_before,
    root_version_before,
    root_supplier_before
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'LOW-U1';

  first_result := public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000003',
    booking_id_value,
    'low-fare-main-first',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_before,
      'expectedRootTransactionVersion', root_version_before,
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 200,
      'effectiveOn', '2026-08-25',
      'currency', 'GBP',
      'notes', '  supplier repriced  '
    )
  );

  first_adjustment_id := (first_result #>> '{adjustment,id}')::uuid;
  booking_version_after_first := (first_result #>> '{booking,version}')::bigint;

  if (first_result ->> 'idempotentReplay')::boolean is not false
    or first_result #>> '{adjustment,sequenceNumber}' <> '1'
    or first_result #>> '{adjustment,previousAdjustmentId}' is not null
    or first_result #>> '{adjustment,actingEmployeeId}'
      <> '40000000-0000-0000-0000-000000000003'
    or first_result #>> '{adjustment,ownerEmployeeId}'
      <> '40000000-0000-0000-0000-000000000001'
    or first_result #>> '{adjustment,actorLocationId}'
      <> '30000000-0000-0000-0000-000000000002'
    or first_result #>> '{adjustment,bookingLocationId}'
      <> '30000000-0000-0000-0000-000000000001'
    or first_result #>> '{adjustment,originalFareSource}' <> '250.00'
    or first_result #>> '{adjustment,originalFareGbp}' <> '250.00'
    or first_result #>> '{adjustment,newFareSource}' <> '200.00'
    or first_result #>> '{adjustment,newFareGbp}' <> '200.00'
    or first_result #>> '{adjustment,differenceSource}' <> '50.00'
    or first_result #>> '{adjustment,differenceGbp}' <> '50.00'
    or first_result #>> '{adjustment,passengerTicketCount}' <> '3'
    or first_result #>> '{adjustment,effectiveOn}' <> '2026-08-25'
    or first_result #>> '{adjustment,notes}' <> 'supplier repriced'
    or first_result #>> '{adjustment,packageMatchStatus}' <> 'unmatched'
    or first_result #>> '{adjustment,commissionScope}' <> 'ticket'
    or jsonb_array_length(first_result #> '{adjustment,packageLinkIds}') <> 0
    or first_result #>> '{sourceEvent,eventType}' <> 'ticket_low_fare_adjusted'
    or first_result ?| array['commission', 'profit', 'margin', 'earnings']
  then
    raise exception 'First shared Low Fare response is incorrect: %', first_result;
  end if;

  if not exists (
      select 1
      from public.ticket_fare_adjustments adjustment
      where adjustment.id = first_adjustment_id
        and adjustment.booking_id = booking_id_value
        and adjustment.root_transaction_id = root_id_value
        and adjustment.previous_adjustment_id is null
        and adjustment.sequence_number = 1
        and adjustment.acting_employee_id = '40000000-0000-0000-0000-000000000003'
        and adjustment.owner_employee_id = '40000000-0000-0000-0000-000000000001'
        and adjustment.actor_location_id = '30000000-0000-0000-0000-000000000002'
        and adjustment.booking_location_id = '30000000-0000-0000-0000-000000000001'
        and adjustment.original_fare_source = 250
        and adjustment.original_fare_gbp = 250
        and adjustment.new_fare_source = 200
        and adjustment.new_fare_gbp = 200
        and adjustment.difference_source = 50
        and adjustment.difference_gbp = 50
        and adjustment.passenger_ticket_count = 3
        and adjustment.notes = 'supplier repriced'
        and adjustment.commission_scope = 'ticket'
        and cardinality(adjustment.package_link_ids) = 0
    )
  then
    raise exception 'First shared Low Fare row did not snapshot server facts';
  end if;

  if not exists (
      select 1
      from public.ticket_bookings booking
      where booking.id = booking_id_value
        and booking.owner_employee_id = '40000000-0000-0000-0000-000000000001'
        and booking.updated_by = '40000000-0000-0000-0000-000000000003'
        and booking.version = booking_version_before + 1
        and booking.updated_at > booking_updated_before
    )
    or not exists (
      select 1
      from public.ticket_transactions root
      where root.id = root_id_value
        and root.version = root_version_before
        and root.supplier_cost_gbp = root_supplier_before
    )
  then
    raise exception 'Low Fare append changed ownership/root or failed to advance booking freshness';
  end if;

  if not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = first_adjustment_id
        and source_event.event_type = 'ticket_low_fare_adjusted'
        and source_event.employee_id = '40000000-0000-0000-0000-000000000003'
        and source_event.owner_employee_id = '40000000-0000-0000-0000-000000000001'
        and source_event.location_id = '30000000-0000-0000-0000-000000000002'
        and source_event.effective_on = '2026-08-25'
        and source_event.source_path = '/dashboard/ticketing/low-fare'
        and (source_event.variables ->> 'difference_source')::numeric = 50
        and (source_event.variables ->> 'difference_gbp')::numeric = 50
        and (source_event.variables ->> 'original_fare_source')::numeric = 250
        and (source_event.variables ->> 'original_fare_gbp')::numeric = 250
        and (source_event.variables ->> 'new_fare_source')::numeric = 200
        and (source_event.variables ->> 'new_fare_gbp')::numeric = 200
        and (source_event.variables ->> 'passenger_ticket_count')::integer = 3
        and (source_event.variables ->> 'issued_ticket_target_units')::integer = 0
        and source_event.variables ->> 'commission_scope' = 'ticket'
        and source_event.variables ->> 'actor_location_id'
          = '30000000-0000-0000-0000-000000000002'
        and source_event.variables ->> 'booking_location_id'
          = '30000000-0000-0000-0000-000000000001'
        and source_event.variables ->> 'service_type' = 'TK'
        and source_event.variables ->> 'operational_status' = 'issued'
        and source_event.variables ->> 'payment_status' = 'unpaid'
        and source_event.variables ->> 'issued_at' is not null
        and source_event.variables ->> 'paid_at' is null
        and source_event.variables ->> 'cancelled_at' is null
        and source_event.variables ->> 'refunded_at' is null
        and (source_event.variables ->> 'root_supplier_cost_source')::numeric = 250
        and (source_event.variables ->> 'root_supplier_cost_gbp')::numeric = 250
        and not source_event.variables ?| array[
          'commission', 'commission_amount', 'agent_commission',
          'earnings', 'profit', 'margin'
        ]
    )
    or exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = first_adjustment_id
        and source_event.event_type = 'ticket_issued'
    )
  then
    raise exception 'Low Fare Commission fact is not actor-attributed, signed, or target-safe';
  end if;

  if not exists (
      select 1
      from public.ticket_audit_events audit
      where audit.id = (first_result ->> 'auditEventId')::uuid
        and audit.booking_id = booking_id_value
        and audit.transaction_id = root_id_value
        and audit.action = 'append_fare_adjustment'
        and audit.actor_employee_id = '40000000-0000-0000-0000-000000000003'
        and audit.after_state ->> 'adjustment_id' = first_adjustment_id::text
        and audit.after_state ->> 'direction' = 'lower'
        and not audit.after_state ?| array[
          'customer_name', 'pnr', 'notes', 'original_fare_gbp', 'new_fare_gbp',
          'difference_gbp'
        ]
    )
  then
    raise exception 'Low Fare audit is missing or contains unredacted detail';
  end if;

  select count(*) into adjustment_count_before
  from public.ticket_fare_adjustments where booking_id = booking_id_value;
  select count(*) into event_count_before
  from public.commission_source_events where source_record_id = first_adjustment_id;
  select count(*) into audit_count_before
  from public.ticket_audit_events where booking_id = booking_id_value
    and action = 'append_fare_adjustment';

  replay_result := public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000003',
    booking_id_value,
    'low-fare-main-first',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_before,
      'expectedRootTransactionVersion', root_version_before,
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 200.00,
      'effectiveOn', '2026-08-25',
      'currency', 'GBP',
      'notes', 'supplier repriced'
    )
  );

  if (replay_result ->> 'idempotentReplay')::boolean is not true
    or replay_result #>> '{adjustment,id}' <> first_adjustment_id::text
    or (select count(*) from public.ticket_fare_adjustments
        where booking_id = booking_id_value) <> adjustment_count_before
    or (select count(*) from public.commission_source_events
        where source_record_id = first_adjustment_id) <> event_count_before
    or (select count(*) from public.ticket_audit_events
        where booking_id = booking_id_value
          and action = 'append_fare_adjustment') <> audit_count_before
    or (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_after_first
    or (select version from public.ticket_transactions where id = root_id_value)
      <> root_version_before
  then
    raise exception 'Low Fare replay duplicated facts or changed versions';
  end if;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000003',
      booking_id_value,
      'low-fare-main-first',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_before,
        'expectedRootTransactionVersion', root_version_before,
        'expectedPreviousAdjustmentId', null,
        'newFareGbp', 199,
        'effectiveOn', '2026-08-25',
        'currency', 'GBP',
        'notes', 'supplier repriced'
      )
    );
    raise exception 'Conflicting Low Fare idempotency payload committed';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'Low Fare idempotency conflict omitted its stable hint';
    end if;
  end;

  current_entry := jsonb_build_object(
    'expectedBookingVersion', booking_version_after_first,
    'expectedRootTransactionVersion', root_version_before,
    'expectedPreviousAdjustmentId', first_adjustment_id,
    'newFareGbp', 190,
    'effectiveOn', '2026-08-26',
    'currency', 'GBP',
    'notes', null
  );

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-root-date-conflict',
      jsonb_set(current_entry, '{effectiveOn}', '"2026-08-23"'::jsonb)
    );
    raise exception 'Low Fare adjustment predated the root issue date';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_DATE_CONFLICT' then
      raise exception 'Root chronology failure omitted TICKETING_DATE_CONFLICT';
    end if;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-tail-date-conflict',
      jsonb_set(current_entry, '{effectiveOn}', '"2026-08-24"'::jsonb)
    );
    raise exception 'Low Fare adjustment predated the current tail';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_DATE_CONFLICT' then
      raise exception 'Tail chronology failure omitted TICKETING_DATE_CONFLICT';
    end if;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-zero-difference',
      jsonb_set(current_entry, '{newFareGbp}', '200'::jsonb)
    );
    raise exception 'Zero-difference Low Fare adjustment committed';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_ZERO_FARE_DIFFERENCE' then
      raise exception 'Zero-difference rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-lineage-conflict',
      jsonb_set(current_entry, '{expectedPreviousAdjustmentId}', 'null'::jsonb)
    );
    raise exception 'Stale Low Fare predecessor committed';
  exception when unique_violation then
    get stacked diagnostics error_hint = pg_exception_hint, error_detail = pg_exception_detail;
    if error_hint is distinct from 'TICKETING_FARE_ADJUSTMENT_LINEAGE_CONFLICT'
      or (error_detail::jsonb ->> 'currentPreviousAdjustmentId')
        is distinct from first_adjustment_id::text
      or (error_detail::jsonb ->> 'currentSequenceNumber') <> '1'
    then
      raise exception 'Low Fare lineage conflict omitted stable current-tail detail';
    end if;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-precision-reject',
      jsonb_set(current_entry, '{newFareGbp}', '190.001'::jsonb)
    );
    raise exception 'Low Fare fare with more than two decimals committed';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-zero-value-reject',
      jsonb_set(current_entry, '{newFareGbp}', '0'::jsonb)
    );
    raise exception 'Zero new Low Fare value committed';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-max-reject',
      jsonb_set(current_entry, '{newFareGbp}', '100000000'::jsonb)
    );
    raise exception 'Out-of-contract Low Fare value committed';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-notes-reject',
      jsonb_set(current_entry, '{notes}', to_jsonb(repeat('x', 1001)))
    );
    raise exception 'Oversized Low Fare notes committed';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000004',
      booking_id_value,
      'low-fare-unauthorised',
      current_entry
    );
    raise exception 'Non-Ticketing employee appended Low Fare';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000005',
      booking_id_value,
      'low-fare-no-location',
      current_entry
    );
    raise exception 'Ticketing employee without a branch appended Low Fare';
  exception when insufficient_privilege then
    null;
  end;

  if (select count(*) from public.ticket_fare_adjustments
      where booking_id = booking_id_value) <> 1
    or (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_after_first
    or (select version from public.ticket_transactions where id = root_id_value)
      <> root_version_before
  then
    raise exception 'Rejected Low Fare attempts left partial operational state';
  end if;

  second_result := public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'low-fare-main-second-higher',
    jsonb_set(current_entry, '{newFareGbp}', '240'::jsonb)
  );
  second_adjustment_id := (second_result #>> '{adjustment,id}')::uuid;

  if second_result #>> '{adjustment,sequenceNumber}' <> '2'
    or second_result #>> '{adjustment,previousAdjustmentId}' <> first_adjustment_id::text
    or second_result #>> '{adjustment,originalFareSource}' <> '200.00'
    or second_result #>> '{adjustment,originalFareGbp}' <> '200.00'
    or second_result #>> '{adjustment,newFareSource}' <> '240.00'
    or second_result #>> '{adjustment,newFareGbp}' <> '240.00'
    or second_result #>> '{adjustment,differenceSource}' <> '-40.00'
    or second_result #>> '{adjustment,differenceGbp}' <> '-40.00'
    or second_result #>> '{sourceEvent,eventType}' <> 'ticket_higher_fare_adjusted'
    or not exists (
      select 1
      from public.ticket_fare_adjustment_current current_adjustment
      where current_adjustment.booking_id = booking_id_value
        and current_adjustment.id = second_adjustment_id
        and current_adjustment.previous_adjustment_id = first_adjustment_id
        and current_adjustment.sequence_number = 2
        and current_adjustment.original_fare_source = current_adjustment.original_fare_gbp
        and current_adjustment.new_fare_source = current_adjustment.new_fare_gbp
        and current_adjustment.difference_source = -40
        and current_adjustment.difference_gbp = -40
    )
    or not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = second_adjustment_id
        and source_event.event_type = 'ticket_higher_fare_adjusted'
        and (source_event.variables ->> 'difference_source')::numeric = -40
        and (source_event.variables ->> 'difference_gbp')::numeric = -40
        and (source_event.variables ->> 'issued_ticket_target_units')::integer = 0
    )
  then
    raise exception 'Higher-fare lineage, current projection, or signed event is incorrect';
  end if;

  -- A historical retry remains stable after a later append has advanced both
  -- the booking token and adjustment tail.
  replay_result := public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000003',
    booking_id_value,
    'low-fare-main-first',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_before,
      'expectedRootTransactionVersion', root_version_before,
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 200,
      'effectiveOn', '2026-08-25',
      'currency', 'GBP',
      'notes', 'supplier repriced'
    )
  );

  if (replay_result ->> 'idempotentReplay')::boolean is not true
    or replay_result #>> '{adjustment,id}' <> first_adjustment_id::text
    or replay_result #>> '{adjustment,sequenceNumber}' <> '1'
    or (select count(*) from public.ticket_fare_adjustments
        where booking_id = booking_id_value) <> 2
    or (select count(*) from public.ticket_audit_events
        where booking_id = booking_id_value
          and action = 'append_fare_adjustment') <> 2
    or (select count(*)
        from public.commission_source_events source_event
        join public.ticket_fare_adjustments adjustment
          on adjustment.id = source_event.source_record_id
        where adjustment.booking_id = booking_id_value) <> 2
    or (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_after_first + 1
    or (select version from public.ticket_transactions where id = root_id_value)
      <> root_version_before
    or (select id from public.ticket_fare_adjustment_current
        where booking_id = booking_id_value) <> second_adjustment_id
  then
    raise exception 'Historical Low Fare replay drifted after a later tail append';
  end if;

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-stale-version',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_after_first,
        'expectedRootTransactionVersion', root_version_before,
        'expectedPreviousAdjustmentId', second_adjustment_id,
        'newFareGbp', 230,
        'effectiveOn', '2026-08-27',
        'currency', 'GBP',
        'notes', null
      )
    );
    raise exception 'Stale Low Fare booking version committed';
  exception when serialization_failure then
    get stacked diagnostics error_hint = pg_exception_hint, error_detail = pg_exception_detail;
    if error_hint is distinct from 'TICKETING_VERSION_CONFLICT'
      or (error_detail::jsonb ->> 'bookingVersion')
        <> (booking_version_after_first + 1)::text
      or (error_detail::jsonb ->> 'rootTransactionVersion') <> root_version_before::text
    then
      raise exception 'Low Fare version conflict omitted stable current versions';
    end if;
  end;
end
$$;

-- Package-linked adjustments retain the exact server-derived package scope;
-- actor branch remains separate from booking/package branch.
insert into public.travel_packages (id, package_reference, package_type, status)
values (
  '60000000-0000-0000-0000-000000000030',
  'PKG-LOW-1',
  'umrah',
  'selected'
);

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
) values (
  '70000000-0000-0000-0000-000000000030',
  '60000000-0000-0000-0000-000000000030',
  'flight',
  'LOW-PKG1',
  'confirmed'
);

do $$
declare
  created jsonb;
  adjusted jsonb;
  booking_id_value uuid;
  root_id_value uuid;
  adjustment_id_value uuid;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'low-fare-package-root',
    jsonb_build_object(
      'customerName', 'Package Low Fare Customer',
      'pnr', 'LOW-PKG1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 300
        )
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  root_id_value := (created #>> '{transaction,id}')::uuid;

  adjusted := public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000003',
    booking_id_value,
    'low-fare-package-first',
    jsonb_build_object(
      'expectedBookingVersion',
        (select version from public.ticket_bookings where id = booking_id_value),
      'expectedRootTransactionVersion',
        (select version from public.ticket_transactions where id = root_id_value),
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 550,
      'effectiveOn', '2026-08-25',
      'currency', 'GBP',
      'notes', null
    )
  );
  adjustment_id_value := (adjusted #>> '{adjustment,id}')::uuid;

  if adjusted #>> '{adjustment,packageMatchStatus}' <> 'matched'
    or adjusted #>> '{adjustment,commissionScope}' <> 'package'
    or jsonb_array_length(adjusted #> '{adjustment,packageLinkIds}') <> 1
    or adjusted #>> '{adjustment,packageId}'
      <> '60000000-0000-0000-0000-000000000030'
    or adjusted #>> '{adjustment,reservationId}'
      <> '70000000-0000-0000-0000-000000000030'
    or adjusted #>> '{adjustment,packageType}' <> 'umrah'
    or not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = adjustment_id_value
        and source_event.employee_id = '40000000-0000-0000-0000-000000000003'
        and source_event.owner_employee_id = '40000000-0000-0000-0000-000000000001'
        and source_event.location_id = '30000000-0000-0000-0000-000000000002'
        and source_event.variables ->> 'commission_scope' = 'package'
        and source_event.variables ->> 'package_id'
          = '60000000-0000-0000-0000-000000000030'
        and source_event.variables ->> 'reservation_id'
          = '70000000-0000-0000-0000-000000000030'
        and source_event.variables ->> 'package_type' = 'umrah'
    )
  then
    raise exception 'Package Low Fare snapshot or event attribution is incorrect: %', adjusted;
  end if;
end
$$;

-- Held, non-GBP, incomplete-GBP, and out-of-contract original fares are not
-- eligible even when a low-level legacy row otherwise resembles an Issued TK.
do $$
declare
  held jsonb;
  booking_id_value uuid;
  root_id_value uuid;
  booking_version_value bigint;
  root_version_value bigint;
  error_hint text;
begin
  held := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'low-fare-held-root',
    jsonb_build_object(
      'customerName', 'Held Low Fare Customer',
      'pnr', 'LOW-H1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-24',
      'timeLimitAt', '2026-08-28T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100
        )
      )
    )
  );
  booking_id_value := (held #>> '{booking,id}')::uuid;
  root_id_value := (held #>> '{transaction,id}')::uuid;
  booking_version_value := (select version from public.ticket_bookings where id = booking_id_value);
  root_version_value := (select version from public.ticket_transactions where id = root_id_value);

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'low-fare-held-ineligible',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedRootTransactionVersion', root_version_value,
        'expectedPreviousAdjustmentId', null,
        'newFareGbp', 90,
        'effectiveOn', '2026-08-25',
        'currency', 'GBP',
        'notes', null
      )
    );
    raise exception 'Held TK accepted a Low Fare adjustment';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_CORRECTION_REQUIRED' then
      raise exception 'Held Low Fare rejection omitted correction hint';
    end if;
  end;
end
$$;

do $$
declare
  fixture record;
  error_hint text;
begin
  for fixture in
    select * from (values
      (
        '8e000000-0000-0000-0000-000000000001'::uuid,
        '8f000000-0000-0000-0000-000000000001'::uuid,
        'LOW-USD1'::text,
        'USD'::text,
        100::numeric,
        80::numeric,
        70::numeric
      ),
      (
        '8e000000-0000-0000-0000-000000000002'::uuid,
        '8f000000-0000-0000-0000-000000000002'::uuid,
        'LOW-INC1'::text,
        'GBP'::text,
        100::numeric,
        null::numeric,
        90::numeric
      ),
      (
        '8e000000-0000-0000-0000-000000000003'::uuid,
        '8f000000-0000-0000-0000-000000000003'::uuid,
        'LOW-BIG1'::text,
        'GBP'::text,
        100000000::numeric,
        100000000::numeric,
        99999999::numeric
      )
    ) as rows(booking_id, root_id, pnr, currency, supplier_source, supplier_gbp, proposed_fare)
  loop
    insert into public.ticket_bookings (
      id,
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
      fixture.booking_id,
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      fixture.pnr,
      'Legacy Fare Eligibility',
      '2026-08-24',
      'issued',
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
    ) values (
      fixture.root_id,
      fixture.booking_id,
      'TK',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'draft',
      '2026-08-24',
      fixture.currency
    );

    insert into public.ticket_passenger_fare_lines (
      transaction_id,
      passenger_type,
      quantity,
      currency,
      unit_supplier_cost_source,
      unit_supplier_cost_gbp
    ) values (
      fixture.root_id,
      'ADT',
      1,
      fixture.currency,
      fixture.supplier_source,
      fixture.supplier_gbp
    );

    update public.ticket_transactions
    set operational_status = 'issued',
        issued_at = '2026-08-24T00:00:00Z'
    where id = fixture.root_id;

    begin
      perform public.ticketing_append_fare_adjustment(
        '40000000-0000-0000-0000-000000000001',
        fixture.booking_id,
        'low-fare-ineligible-' || fixture.pnr,
        jsonb_build_object(
          'expectedBookingVersion',
            (select version from public.ticket_bookings where id = fixture.booking_id),
          'expectedRootTransactionVersion',
            (select version from public.ticket_transactions where id = fixture.root_id),
          'expectedPreviousAdjustmentId', null,
          'newFareGbp', fixture.proposed_fare,
          'effectiveOn', '2026-08-25',
          'currency', 'GBP',
          'notes', null
        )
      );
      raise exception 'Ineligible legacy fare root % accepted Low Fare', fixture.pnr;
    exception when object_not_in_prerequisite_state then
      get stacked diagnostics error_hint = pg_exception_hint;
      if error_hint is distinct from 'TICKETING_CORRECTION_REQUIRED' then
        raise exception 'Ineligible legacy fare % omitted correction hint', fixture.pnr;
      end if;
    end;
  end loop;
end
$$;

-- A downstream Commission collision must roll back adjustment, booking token,
-- audit, and Ticketing idempotency together.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  root_id_value uuid;
  booking_version_before bigint;
  root_version_before bigint;
  conflict_key constant text := 'low-fare-source-conflict';
  source_key text;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'low-fare-rollback-root',
    jsonb_build_object(
      'customerName', 'Low Fare Rollback Customer',
      'pnr', 'LOW-RB1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100
        )
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  root_id_value := (created #>> '{transaction,id}')::uuid;
  booking_version_before := (select version from public.ticket_bookings where id = booking_id_value);
  root_version_before := (select version from public.ticket_transactions where id = root_id_value);

  source_key := 'tklf:v1:' || encode(digest(
    '40000000-0000-0000-0000-000000000003:' || conflict_key || ':adjusted',
    'sha256'
  ), 'hex');

  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', gen_random_uuid(),
    'source_fact_key', 'test:low-fare-source-conflict',
    'source_record_id', gen_random_uuid(),
    'event_type', 'test_low_fare_conflict',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000003',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000002',
    'occurred_at', clock_timestamp(),
    'effective_on', '2026-08-25',
    'source_path', '/dashboard/ticketing/low-fare',
    'variables', jsonb_build_object('test', true),
    'idempotency_key', source_key
  ));

  begin
    perform public.ticketing_append_fare_adjustment(
      '40000000-0000-0000-0000-000000000003',
      booking_id_value,
      conflict_key,
      jsonb_build_object(
        'expectedBookingVersion', booking_version_before,
        'expectedRootTransactionVersion', root_version_before,
        'expectedPreviousAdjustmentId', null,
        'newFareGbp', 90,
        'effectiveOn', '2026-08-25',
        'currency', 'GBP',
        'notes', null
      )
    );
    raise exception 'Commission source collision did not abort Low Fare';
  exception when invalid_parameter_value then
    null;
  end;

  if (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_before
    or (select version from public.ticket_transactions where id = root_id_value)
      <> root_version_before
    or exists (
      select 1 from public.ticket_fare_adjustments where booking_id = booking_id_value
    )
    or exists (
      select 1 from public.ticket_audit_events
      where booking_id = booking_id_value and action = 'append_fare_adjustment'
    )
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.append_fare_adjustment.v1'
        and actor_employee_id = '40000000-0000-0000-0000-000000000003'
        and idempotency_key = conflict_key
    )
  then
    raise exception 'Low Fare Commission failure left partial transaction state';
  end if;
end
$$;

-- Database-owner lower writes still cannot rewrite/delete immutable history or
-- forge the server-derived original fare on the next sequence.
do $$
declare
  booking_id_value uuid;
  root_id_value uuid;
  current_adjustment public.ticket_fare_adjustments%rowtype;
begin
  select booking.id, root.id
  into booking_id_value, root_id_value
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'LOW-U1';

  select adjustment.*
  into current_adjustment
  from public.ticket_fare_adjustments adjustment
  where adjustment.booking_id = booking_id_value
  order by adjustment.sequence_number desc
  limit 1;

  begin
    update public.ticket_fare_adjustments
    set notes = notes
    where id = current_adjustment.id;
    raise exception 'Database owner updated immutable Low Fare history';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    delete from public.ticket_fare_adjustments where id = current_adjustment.id;
    raise exception 'Database owner deleted immutable Low Fare history';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    insert into public.ticket_fare_adjustments (
      booking_id,
      root_transaction_id,
      previous_adjustment_id,
      sequence_number,
      acting_employee_id,
      owner_employee_id,
      actor_location_id,
      booking_location_id,
      original_fare_source,
      original_fare_gbp,
      new_fare_source,
      new_fare_gbp,
      passenger_ticket_count,
      effective_on,
      package_match_status,
      commission_scope
    ) values (
      booking_id_value,
      root_id_value,
      current_adjustment.id,
      current_adjustment.sequence_number + 1,
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      current_adjustment.new_fare_gbp + 1,
      current_adjustment.new_fare_gbp + 1,
      current_adjustment.new_fare_gbp - 1,
      current_adjustment.new_fare_gbp - 1,
      current_adjustment.passenger_ticket_count,
      current_adjustment.effective_on,
      'unmatched',
      'ticket'
    );
    raise exception 'Lower write forged the next Low Fare original snapshot';
  exception when check_violation then
    null;
  end;
end
$$;

set role service_role;
do $$
begin
  begin
    update public.ticket_fare_adjustments set notes = notes;
    raise exception 'service_role updated immutable Low Fare history';
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.ticket_fare_adjustments;
    raise exception 'service_role deleted immutable Low Fare history';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

-- Runner-owned optimistic and package-phantom concurrency fixture. The pause
-- happens after adjustment/event/booking writes, holding the booking lock until
-- the complete atomic operation commits.
do $$
declare
  created jsonb;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'low-fare-race-root',
    jsonb_build_object(
      'customerName', 'Low Fare Race Customer',
      'pnr', 'LOW-C1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100
        )
      )
    )
  );
end
$$;

insert into public.travel_packages (id, package_reference, package_type, status)
values (
  '60000000-0000-0000-0000-000000000031',
  'PKG-LOW-RACE',
  'holiday',
  'selected'
);

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
) values (
  '70000000-0000-0000-0000-000000000031',
  '60000000-0000-0000-0000-000000000031',
  'flight',
  'LOW-C1',
  'confirmed'
);

create or replace function public.ticketing_test_pause_low_fare_race()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.action = 'append_fare_adjustment'
    and exists (
      select 1
      from public.ticket_bookings booking
      where booking.id = new.booking_id
        and booking.normalized_pnr = 'LOW-C1'
    )
  then
    perform pg_sleep(2);
  end if;
  return new;
end
$$;

drop trigger if exists ticketing_test_pause_low_fare_race
  on public.ticket_audit_events;
create trigger ticketing_test_pause_low_fare_race
  before insert on public.ticket_audit_events
  for each row execute function public.ticketing_test_pause_low_fare_race();

select 'Ticketing Low Fare adjustment integration checks passed.' as result;
