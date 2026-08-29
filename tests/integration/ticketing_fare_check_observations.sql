-- Integration assertions for Ticketing capability 2026082904.

do $$
declare
  fixture record;
  first_result jsonb;
  replay_result jsonb;
  check_id_value uuid;
  source_count_before bigint;
  audit_count_before bigint;
begin
  select
    booking.id as booking_id,
    booking.version as booking_version,
    booking.package_match_status,
    booking.commission_scope,
    root.id as root_transaction_id,
    root.version as root_version,
    coalesce(adjustment.id, null) as adjustment_id,
    greatest(
      (root.issued_at at time zone location.timezone)::date,
      coalesce(adjustment.effective_on, (root.issued_at at time zone location.timezone)::date)
    ) as effective_on,
    coalesce(adjustment.new_fare_gbp, root.supplier_cost_gbp) as current_fare_gbp
  into fixture
  from public.ticket_bookings booking
  join public.locations location on location.id = booking.location_id
  join public.ticket_transactions root
    on root.booking_id = booking.id and root.service_type = 'TK'
    and root.parent_transaction_id is null and root.operational_status = 'issued'
    and root.currency = 'GBP' and root.supplier_cost_gbp is not null
  left join public.ticket_fare_adjustment_current adjustment
    on adjustment.booking_id = booking.id
  where booking.archived_at is null
  order by booking.created_at, booking.id
  limit 1;

  if fixture.booking_id is null then raise exception 'Fare-check fixture is missing'; end if;
  select count(*) into source_count_before from public.commission_source_events;
  select count(*) into audit_count_before from public.ticket_audit_events;

  first_result := public.ticketing_record_fare_check_2026082904(
    '40000000-0000-0000-0000-000000000001',
    fixture.booking_id,
    fixture.booking_version,
    fixture.root_version,
    fixture.adjustment_id,
    fixture.effective_on,
    'Supplier confirmed no fare change',
    'fare-check-observation-1'
  );
  check_id_value := (first_result ->> 'checkId')::uuid;

  if (first_result ->> 'idempotentReplay')::boolean
    or (first_result ->> 'observedFareGbp')::numeric <> fixture.current_fare_gbp
    or (select count(*) from public.ticket_fare_checks where id = check_id_value) <> 1
    or (select count(*) from public.commission_source_events) <> source_count_before
    or (select count(*) from public.ticket_audit_events) <> audit_count_before + 1
    or not exists (
      select 1 from public.ticket_audit_events audit
      where audit.entity_id = check_id_value
        and audit.action = 'supplier_fare_checked_no_change'
        and audit.after_state ->> 'commissionEventCreated' = 'false'
    )
  then
    raise exception 'No-change fare observation mutated Commission or returned incorrect evidence';
  end if;

  replay_result := public.ticketing_record_fare_check_2026082904(
    '40000000-0000-0000-0000-000000000001',
    fixture.booking_id,
    fixture.booking_version,
    fixture.root_version,
    fixture.adjustment_id,
    fixture.effective_on,
    'Supplier confirmed no fare change',
    'fare-check-observation-1'
  );
  if not (replay_result ->> 'idempotentReplay')::boolean
    or (replay_result ->> 'checkId')::uuid <> check_id_value
    or replay_result - 'idempotentReplay' <> first_result - 'idempotentReplay'
    or (select count(*) from public.ticket_fare_checks where id = check_id_value) <> 1
  then
    raise exception 'Fare-check retry was not idempotent';
  end if;

  begin
    perform public.ticketing_record_fare_check_2026082904(
      '40000000-0000-0000-0000-000000000001', fixture.booking_id,
      fixture.booking_version, fixture.root_version, fixture.adjustment_id,
      fixture.effective_on, 'Different retry payload', 'fare-check-observation-1'
    );
    raise exception 'Fare-check idempotency key accepted a different payload';
  exception when invalid_parameter_value then null;
  end;

  begin
    update public.ticket_fare_checks set notes = 'Rewritten' where id = check_id_value;
    raise exception 'Fare-check evidence was directly mutable';
  exception when object_not_in_prerequisite_state then null;
  end;

  if public.ticketing_schema_status() ->> 'ready' <> 'true'
    or public.ticketing_schema_status() ->> 'version' <> '2026082904'
    or has_table_privilege('authenticated', 'public.ticket_fare_checks', 'SELECT')
    or has_table_privilege('authenticated', 'public.ticket_fare_check_current', 'SELECT')
    or has_table_privilege('authenticated', 'public.ticket_low_fare_filter_owners', 'SELECT')
    or not has_table_privilege('service_role', 'public.ticket_fare_check_current', 'SELECT')
    or not has_table_privilege('service_role', 'public.ticket_low_fare_filter_owners', 'SELECT')
    or has_function_privilege(
      'authenticated',
      'public.ticketing_record_fare_check_2026082904(uuid,uuid,bigint,bigint,uuid,date,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.ticketing_record_fare_check_2026082904(uuid,uuid,bigint,bigint,uuid,date,text,text)',
      'EXECUTE'
    )
  then
    raise exception 'Fare-check readiness or grants are incorrect';
  end if;
end
$$;
