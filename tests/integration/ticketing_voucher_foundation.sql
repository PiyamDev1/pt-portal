do $$
declare
  source_row record;
  voucher_result jsonb;
  replay_result jsonb;
  voucher_id_value uuid;
  other_employee_id uuid;
begin
  if (public.ticketing_schema_status() ->> 'ready')::boolean is not true
    or (public.ticketing_schema_status() ->> 'version')::bigint <> 2026082901 then
    raise exception 'Ticketing voucher capability 2026082901 is not ready';
  end if;

  if to_regclass('public.ticket_vouchers') is null
    or to_regclass('public.ticket_voucher_events') is null
    or to_regprocedure(
      'public.ticketing_create_voucher_2026082901(uuid,uuid,text,integer,uuid,date,date,text,text,text)'
    ) is null then
    raise exception 'Ticketing voucher objects are incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.ticket_vouchers', 'SELECT')
    or has_table_privilege('authenticated', 'public.ticket_voucher_events', 'SELECT')
    or has_function_privilege(
      'authenticated',
      'public.ticketing_create_voucher_2026082901(uuid,uuid,text,integer,uuid,date,date,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Authenticated clients bypassed the voucher server boundary';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.ticketing_create_voucher_2026082901(uuid,uuid,text,integer,uuid,date,date,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Service role cannot create a voucher';
  end if;

  select
    booking.id as booking_id,
    booking.owner_employee_id,
    allocation.id as allocation_id,
    allocation.position as passenger_position,
    passenger.passenger_type,
    (transaction.issued_at at time zone 'UTC')::date as issue_date
  into source_row
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
  where booking.operational_status = 'issued'
    and booking.archived_at is null
  order by transaction.created_at, allocation.position
  limit 1;

  if source_row.booking_id is null then
    raise exception 'Voucher integration fixture has no issued passenger ticket';
  end if;

  voucher_result := public.ticketing_create_voucher_2026082901(
    source_row.owner_employee_id,
    source_row.booking_id,
    source_row.passenger_type,
    source_row.passenger_position,
    source_row.owner_employee_id,
    source_row.issue_date + 1,
    null,
    'AIR-CLAIM-1',
    'Awaiting airline confirmation',
    'voucher-foundation-idempotency-1'
  );
  voucher_id_value := (voucher_result ->> 'voucherId')::uuid;

  if voucher_result ->> 'status' <> 'unclaimed'
    or (voucher_result ->> 'idempotentReplay')::boolean
    or (voucher_result ->> 'claimByDate')::date <> (source_row.issue_date + interval '11 months')::date
    or not exists (
      select 1 from public.ticket_vouchers voucher
      where voucher.id = voucher_id_value
        and voucher.confirmed_value_gbp is null
        and voucher.remaining_value_gbp is null
    )
    or (select count(*) from public.ticket_voucher_events
        where voucher_id = voucher_id_value and event_type = 'created') <> 1
    or (select count(*) from public.ticket_audit_events
        where entity_type = 'voucher' and entity_id = voucher_id_value
          and action = 'voucher_created') <> 1
    or (select count(*) from public.ticket_notification_events
        where entity_type = 'voucher' and entity_id = voucher_id_value
          and notification_type = 'voucher_claim') <> 3 then
    raise exception 'Voucher creation did not preserve the initial unknown-value contract';
  end if;

  replay_result := public.ticketing_create_voucher_2026082901(
    source_row.owner_employee_id,
    source_row.booking_id,
    source_row.passenger_type,
    source_row.passenger_position,
    source_row.owner_employee_id,
    source_row.issue_date + 1,
    null,
    'AIR-CLAIM-1',
    'Awaiting airline confirmation',
    'voucher-foundation-idempotency-1'
  );
  if (replay_result ->> 'voucherId')::uuid <> voucher_id_value
    or not (replay_result ->> 'idempotentReplay')::boolean then
    raise exception 'Voucher exact retry was not idempotent';
  end if;

  begin
    perform public.ticketing_create_voucher_2026082901(
      source_row.owner_employee_id,
      source_row.booking_id,
      source_row.passenger_type,
      source_row.passenger_position,
      source_row.owner_employee_id,
      source_row.issue_date + 1,
      null,
      null,
      null,
      'voucher-foundation-duplicate-2'
    );
    raise exception 'Duplicate passenger voucher unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  select employee.id into other_employee_id
  from public.employees employee
  where employee.id <> source_row.owner_employee_id
    and employee.is_active = true
  limit 1;
  if other_employee_id is not null then
    begin
      perform public.ticketing_create_voucher_2026082901(
        other_employee_id,
        source_row.booking_id,
        source_row.passenger_type,
        source_row.passenger_position,
        other_employee_id,
        source_row.issue_date + 1,
        null,
        null,
        null,
        'voucher-foundation-forbidden-3'
      );
      raise exception 'Non-owner voucher creation unexpectedly succeeded';
    exception
      when insufficient_privilege then null;
    end;
  end if;

  begin
    perform public.ticketing_create_voucher_2026082901(
      source_row.owner_employee_id,
      source_row.booking_id,
      source_row.passenger_type,
      source_row.passenger_position,
      source_row.owner_employee_id,
      source_row.issue_date + 1,
      (source_row.issue_date + interval '10 months')::date,
      null,
      null,
      'voucher-foundation-owner-date-override'
    );
    raise exception 'Owner claim-deadline override unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when unique_violation then
      raise exception 'Deadline authorization ran after duplicate detection';
  end;

  begin
    update public.ticket_vouchers set notes = 'Rewritten' where id = voucher_id_value;
    raise exception 'Voucher row was mutable';
  exception
    when object_not_in_prerequisite_state then null;
  end;
  begin
    update public.ticket_voucher_events set notes = 'Rewritten'
    where voucher_id = voucher_id_value;
    raise exception 'Voucher event was mutable';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end
$$;
