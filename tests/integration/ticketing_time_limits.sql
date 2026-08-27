do $ticketing_time_limit_assertions$
declare
  capability jsonb;
  event_constraint text;
  claimed_count integer;
  future_status text;
  expired_status text;
  expired_transaction_status text;
  notification_id uuid;
  notification_token uuid;
begin
  select public.ticketing_schema_status() into capability;

  if capability ->> 'version' <> '2026082702'
    or capability ->> 'ready' <> 'true'
  then
    raise exception 'Ticketing time-limit capability is not ready: %', capability;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_claim_time_limit_notifications(timestamptz,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_claim_time_limit_notifications(timestamptz,integer)',
    'EXECUTE'
  ) then
    raise exception 'Ticketing notification claim grants are incorrect';
  end if;

  select pg_get_constraintdef(oid) into event_constraint
  from pg_constraint
  where conrelid = 'public.ticket_notification_events'::regclass
    and conname = 'ticket_notification_events_delivery_status_check';

  if event_constraint not like '%processing%' then
    raise exception 'Ticketing notification processing state is missing';
  end if;

  insert into public.ticket_bookings (
    id, owner_employee_id, location_id, airline_id, pnr, customer_name,
    booking_date, operational_status, time_limit_at, time_limit_timezone,
    created_by, updated_by
  ) values
    (
      'a9000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'TIME24', 'Future deadline', date '2026-08-27', 'held',
      '2026-08-28 10:00:00+00', 'Europe/London',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    ),
    (
      'a9000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'TIMEEX', 'Expired deadline', date '2026-08-27', 'held',
      '2026-08-27 10:00:00+00', 'Europe/London',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    ),
    (
      'a9000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'TIME6', 'Six-hour deadline', date '2026-08-27', 'held',
      '2026-08-27 17:00:00+00', 'Europe/London',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    ),
    (
      'a9000000-0000-0000-0000-000000000004',
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'TIME2', 'Two-hour deadline', date '2026-08-27', 'held',
      '2026-08-27 13:00:00+00', 'Europe/London',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    );

  insert into public.ticket_transactions (
    id, booking_id, service_type, owner_employee_id, acting_employee_id,
    booking_date, operational_status, time_limit_at, time_limit_timezone
  ) values (
    'a9000000-0000-0000-0000-000000000001',
    'a9000000-0000-0000-0000-000000000002',
    'TK',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    date '2026-08-27',
    'held',
    '2026-08-27 10:00:00+00',
    'Europe/London'
  );

  create temporary table ticketing_time_limit_claims on commit drop as
  select *
  from public.ticketing_claim_time_limit_notifications('2026-08-27 11:00:00+00', 100);

  select count(*) into claimed_count
  from ticketing_time_limit_claims
  where booking_id in (
    'a9000000-0000-0000-0000-000000000001',
    'a9000000-0000-0000-0000-000000000002',
    'a9000000-0000-0000-0000-000000000003',
    'a9000000-0000-0000-0000-000000000004'
  );
  if claimed_count <> 7 then
    raise exception 'Expected catch-up claims for 24/6/2-hour and expiry notifications, got %', claimed_count;
  end if;
  if exists (
    select threshold_key
    from ticketing_time_limit_claims
    where booking_id in (
      'a9000000-0000-0000-0000-000000000001',
      'a9000000-0000-0000-0000-000000000002',
      'a9000000-0000-0000-0000-000000000003',
      'a9000000-0000-0000-0000-000000000004'
    )
    group by threshold_key
    having count(*) <> case threshold_key
      when '24h' then 3
      when '6h' then 2
      when '2h' then 1
      when 'expiry' then 1
      else -1
    end
  ) then
    raise exception 'Expected exactly one claim for each time-limit threshold';
  end if;

  select operational_status into future_status
  from public.ticket_bookings
  where id = 'a9000000-0000-0000-0000-000000000001';
  select operational_status into expired_status
  from public.ticket_bookings
  where id = 'a9000000-0000-0000-0000-000000000002';
  if future_status <> 'held' or expired_status <> 'expired' then
    raise exception 'Held expiry transition is incorrect: future %, expired %', future_status, expired_status;
  end if;

  select claims.notification_id, claims.claim_token into notification_id, notification_token
  from ticketing_time_limit_claims claims
  where claims.threshold_key = 'expiry'
    and claims.booking_id = 'a9000000-0000-0000-0000-000000000002';
  if not public.ticketing_finish_time_limit_notification(
    notification_id, notification_token, 'sent', null
  ) then
    raise exception 'Expected expiry notification finalization to succeed';
  end if;
  if public.ticketing_finish_time_limit_notification(
    notification_id, notification_token, 'sent', null
  ) then
    raise exception 'Notification finalization should be idempotently single-use';
  end if;

  select operational_status into expired_transaction_status
  from public.ticket_transactions
  where booking_id = 'a9000000-0000-0000-0000-000000000002';
  if expired_transaction_status <> 'expired' then
    raise exception 'Held transaction did not expire with its booking: %', expired_transaction_status;
  end if;

end
$ticketing_time_limit_assertions$;
