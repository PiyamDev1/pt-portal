-- Integration assertions for Ticketing capability 2026082903.

do $$
declare
  admin_id constant uuid := '40000000-0000-0000-0000-000000000006';
  refund_source record;
  same_airline_replacement record;
  different_airline_id uuid;
  voucher_row public.ticket_vouchers;
  result_value jsonb;
  replay_value jsonb;
  refund_id_value uuid;
  event_version bigint;
  voucher_version integer;
  mismatch_hint text;
begin
  if public.ticketing_schema_status() ->> 'ready' <> 'true'
    or public.ticketing_schema_status() ->> 'version' <> '2026082903'
    or to_regclass('public.ticket_refunds') is null
    or to_regclass('public.ticket_refund_events') is null
  then
    raise exception 'Refund/voucher lifecycle capability is not ready';
  end if;

  if has_table_privilege('authenticated', 'public.ticket_refunds', 'SELECT')
    or has_table_privilege('authenticated', 'public.ticket_refund_events', 'SELECT')
    or has_function_privilege(
      'authenticated',
      'public.ticketing_record_refund_2026082903(uuid,uuid,text,integer,text,uuid,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.ticketing_append_voucher_event_2026082903(uuid,uuid,integer,text,numeric,date,uuid,text,integer,uuid,text,text,text,text)',
      'EXECUTE'
    )
  then
    raise exception 'Refund/voucher server boundary grants are incorrect';
  end if;

  select
    booking.id as booking_id,
    booking.owner_employee_id,
    booking.airline_id,
    booking.pnr,
    allocation.position,
    passenger.passenger_type
  into refund_source
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  join public.ticket_transaction_passengers allocation
    on allocation.transaction_id = transaction.id
    and nullif(btrim(allocation.ticket_number), '') is not null
  join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
  join public.ticket_passenger_fare_lines fare on fare.id = allocation.fare_line_id
  left join public.ticket_vouchers voucher
    on voucher.transaction_passenger_id = allocation.id
  left join public.ticket_refunds refund
    on refund.transaction_passenger_id = allocation.id and refund.status <> 'voided'
  where booking.archived_at is null
    and voucher.id is null
    and refund.id is null
    and fare.unit_supplier_cost_gbp = 100
    and fare.unit_sale_price_gbp = 150
  order by booking.created_at, booking.id
  limit 1;

  if refund_source.booking_id is null then
    raise exception 'Refund lifecycle fixture has no completed £100/£150 issued ticket';
  end if;

  select
    booking.id as booking_id,
    booking.airline_id,
    allocation.position,
    passenger.passenger_type
  into same_airline_replacement
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  join public.ticket_transaction_passengers allocation
    on allocation.transaction_id = transaction.id
    and nullif(btrim(allocation.ticket_number), '') is not null
  join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
  where booking.id <> refund_source.booking_id
    and booking.airline_id = refund_source.airline_id
    and booking.archived_at is null
  order by booking.created_at, booking.id
  limit 1;

  if same_airline_replacement.booking_id is null then
    raise exception 'Voucher lifecycle fixture has no same-airline replacement ticket';
  end if;

  -- An exact PNR added in Packages before refund recording must be snapshotted as package scope.
  insert into public.travel_packages (id, package_reference, package_type, status)
  values ('97000000-0000-0000-0000-000000000001', 'PKG-REFUND-1', 'holiday', 'selected');
  insert into public.travel_package_reservations (
    id, package_id, reservation_type, booking_reference, status
  ) values (
    '98000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'flight', refund_source.pnr, 'confirmed'
  );

  result_value := public.ticketing_record_refund_2026082903(
    refund_source.owner_employee_id,
    refund_source.booking_id,
    refund_source.passenger_type,
    refund_source.position,
    'refund',
    null, null, null, null, null,
    40, 10, 5, 5,
    null, null,
    'ticket-cancellation-v1',
    'PIA cancellation calculation saved',
    null,
    'refund-lifecycle-record-1'
  );
  refund_id_value := (result_value ->> 'refundId')::uuid;

  if result_value ->> 'packageMatchStatus' <> 'matched'
    or result_value ->> 'commissionScope' <> 'package'
    or (select proposed_cancellation_charge_gbp from public.ticket_refunds
        where id = refund_id_value) <> 60
    or (select proposed_customer_refund_gbp from public.ticket_refunds
        where id = refund_id_value) <> 90
    or (select expected_airline_recovery_gbp from public.ticket_refunds
        where id = refund_id_value) <> 60
    or (select package_id from public.ticket_refunds where id = refund_id_value)
      <> '97000000-0000-0000-0000-000000000001'
  then
    raise exception 'Saved refund formula or package snapshot is incorrect: %', result_value;
  end if;

  replay_value := public.ticketing_record_refund_2026082903(
    refund_source.owner_employee_id,
    refund_source.booking_id,
    refund_source.passenger_type,
    refund_source.position,
    'refund',
    null, null, null, null, null,
    40, 10, 5, 5,
    null, null,
    'ticket-cancellation-v1',
    'PIA cancellation calculation saved',
    null,
    'refund-lifecycle-record-1'
  );
  if not (replay_value ->> 'idempotentReplay')::boolean
    or (select count(*) from public.ticket_refunds where id = refund_id_value) <> 1
    or (select count(*) from public.ticket_refund_events
        where refund_id = refund_id_value and event_type = 'recorded') <> 1
  then
    raise exception 'Refund recording retry was not idempotent';
  end if;

  event_version := (select version from public.ticket_refunds where id = refund_id_value);
  result_value := public.ticketing_append_refund_event_2026082903(
    admin_id, refund_id_value, event_version, 'customer_settlement', 90,
    current_date, 'CUSTOMER-REFUND-1', null, null, 'refund-customer-settlement-1'
  );
  event_version := (result_value ->> 'version')::bigint;
  perform public.ticketing_append_refund_event_2026082903(
    admin_id, refund_id_value, event_version, 'airline_recovery', 60,
    current_date, 'AIRLINE-RECOVERY-1', null, null, 'refund-airline-recovery-1'
  );
  event_version := (select version from public.ticket_refunds where id = refund_id_value);
  perform public.ticketing_append_refund_event_2026082903(
    admin_id, refund_id_value, event_version, 'other_cost', 10,
    current_date, 'SUPPLIER-CANCEL-1', null, null, 'refund-other-cost-1'
  );
  event_version := (select version from public.ticket_refunds where id = refund_id_value);
  result_value := public.ticketing_append_refund_event_2026082903(
    admin_id, refund_id_value, event_version, 'recovery_finalised', null,
    current_date, 'AIRLINE-FINAL-1', null, null, 'refund-recovery-final-1'
  );

  if result_value ->> 'status' <> 'settled'
    or (result_value ->> 'actualCompanyResultGbp')::numeric <> 5
    or (select count(*) from public.ticket_refund_events where refund_id = refund_id_value) <> 5
  then
    raise exception 'Refund actual settlement/result lifecycle is incorrect: %', result_value;
  end if;

  begin
    update public.ticket_refunds set notes = 'Rewritten' where id = refund_id_value;
    raise exception 'Refund snapshot was directly mutable';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    update public.ticket_refund_events set notes = 'Rewritten' where refund_id = refund_id_value;
    raise exception 'Refund event was directly mutable';
  exception when object_not_in_prerequisite_state then null;
  end;

  select * into voucher_row
  from public.ticket_vouchers
  where status = 'unclaimed'
  order by created_at, id
  limit 1;
  if voucher_row.id is null then raise exception 'Voucher lifecycle fixture is missing'; end if;

  result_value := public.ticketing_append_voucher_event_2026082903(
    voucher_row.owner_employee_id, voucher_row.id, voucher_row.version,
    'claim_submitted', null, current_date,
    null, null, null, null, 'CLAIM-1', 'Claim sent to airline', null,
    'voucher-claim-submit-1'
  );
  voucher_version := (result_value ->> 'version')::integer;
  result_value := public.ticketing_append_voucher_event_2026082903(
    admin_id, voucher_row.id, voucher_version,
    'value_confirmed', 100, current_date,
    null, null, null, null, 'CREDIT-100', 'Airline confirmed credit', null,
    'voucher-value-confirm-1'
  );
  voucher_version := (result_value ->> 'version')::integer;

  insert into public.airlines (id, iata_code, name)
  values ('99000000-0000-0000-0000-000000000001', 'ZZ', 'Lifecycle Test Airline')
  on conflict (iata_code) do update set name = excluded.name
  returning id into different_airline_id;
  update public.ticket_bookings
  set airline_id = different_airline_id
  where id = same_airline_replacement.booking_id;

  begin
    perform public.ticketing_append_voucher_event_2026082903(
      admin_id, voucher_row.id, voucher_version,
      'part_used', 10, current_date,
      same_airline_replacement.booking_id,
      same_airline_replacement.passenger_type,
      same_airline_replacement.position,
      null, null, null, null, 'voucher-airline-mismatch-1'
    );
    raise exception 'Voucher was used on a different airline';
  exception when check_violation then
    get stacked diagnostics mismatch_hint = pg_exception_hint;
    if mismatch_hint <> 'TICKETING_VOUCHER_AIRLINE_MISMATCH' then raise; end if;
  end;

  -- Restore the valid replacement ticket to the voucher airline, then allocate only part of it.
  update public.ticket_bookings
  set airline_id = voucher_row.airline_id
  where id = same_airline_replacement.booking_id;
  result_value := public.ticketing_append_voucher_event_2026082903(
    admin_id, voucher_row.id, voucher_version,
    'part_used', 40, current_date,
    same_airline_replacement.booking_id,
    same_airline_replacement.passenger_type,
    same_airline_replacement.position,
    null, 'CREDIT-USE-1', 'Part credit used', null,
    'voucher-part-use-1'
  );
  if result_value ->> 'status' <> 'part_used'
    or (result_value ->> 'remainingValueGbp')::numeric <> 60 then
    raise exception 'Partial voucher allocation is incorrect: %', result_value;
  end if;

  voucher_version := (result_value ->> 'version')::integer;
  result_value := public.ticketing_append_voucher_event_2026082903(
    admin_id, voucher_row.id, voucher_version,
    'refund_received', 60, current_date,
    null, null, null, refund_id_value, 'AIRLINE-CASH-1',
    'Remaining credit refunded', null, 'voucher-refund-received-1'
  );
  if result_value ->> 'status' <> 'refund_received'
    or (result_value ->> 'remainingValueGbp')::numeric <> 0 then
    raise exception 'Voucher refund completion is incorrect: %', result_value;
  end if;

  begin
    update public.ticket_vouchers set notes = 'Rewritten' where id = voucher_row.id;
    raise exception 'Voucher cached lifecycle row was directly mutable';
  exception when object_not_in_prerequisite_state then null;
  end;

  if not exists (
    select 1 from public.ticket_audit_events
    where entity_type = 'refund' and entity_id = refund_id_value
      and action = 'refund_recovery_finalised'
  ) or not exists (
    select 1 from public.ticket_audit_events
    where entity_type = 'voucher' and entity_id = voucher_row.id
      and action = 'voucher_part_used'
  ) then
    raise exception 'Refund/voucher lifecycle audit evidence is incomplete';
  end if;
end
$$;
