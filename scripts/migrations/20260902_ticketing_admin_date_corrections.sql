-- Forward-only Ticketing capability 2026090203.
-- Adds audited record-manager correction of booking dates and issued/deadline dates.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_2026090203_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026090202 then
    raise exception 'Ticketing capability 2026090202 is required before capability 2026090203'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026090203 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026090203, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_2026090203_guard$;

create table if not exists public.ticket_date_correction_contexts (
  id uuid primary key default gen_random_uuid(),
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  previous_booking_date date not null,
  booking_date date not null,
  previous_time_limit_at timestamptz,
  time_limit_at timestamptz,
  previous_time_limit_timezone text,
  time_limit_timezone text,
  previous_issued_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.ticket_date_correction_contexts enable row level security;
revoke all on table public.ticket_date_correction_contexts from public, anon, authenticated;
grant all on table public.ticket_date_correction_contexts to service_role;

create or replace function public.ticketing_date_correction_context_matches_2026090203(
  p_old public.ticket_transactions,
  p_new public.ticket_transactions
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.ticket_date_correction_contexts context
    where context.id::text = nullif(
      current_setting('ticketing.date_correction_context_id', true), ''
    )
      and context.transaction_id = (p_old).id
      and context.previous_booking_date = (p_old).booking_date
      and context.booking_date = (p_new).booking_date
      and context.previous_time_limit_at is not distinct from (p_old).time_limit_at
      and context.time_limit_at is not distinct from (p_new).time_limit_at
      and context.previous_time_limit_timezone is not distinct from (p_old).time_limit_timezone
      and context.time_limit_timezone is not distinct from (p_new).time_limit_timezone
      and context.previous_issued_at is not distinct from (p_old).issued_at
      and context.issued_at is not distinct from (p_new).issued_at
      and row(
        (p_new).id,
        (p_new).booking_id,
        (p_new).parent_transaction_id,
        (p_new).supersedes_transaction_id,
        (p_new).service_type,
        (p_new).owner_employee_id,
        (p_new).acting_employee_id,
        (p_new).operational_status,
        (p_new).payment_status,
        (p_new).paid_at,
        (p_new).cancelled_at,
        (p_new).refunded_at,
        (p_new).passenger_ticket_count,
        (p_new).currency,
        (p_new).supplier_cost_source,
        (p_new).supplier_cost_gbp,
        (p_new).sale_price_source,
        (p_new).sale_price_gbp,
        (p_new).idempotency_key
      ) is not distinct from row(
        (p_old).id,
        (p_old).booking_id,
        (p_old).parent_transaction_id,
        (p_old).supersedes_transaction_id,
        (p_old).service_type,
        (p_old).owner_employee_id,
        (p_old).acting_employee_id,
        (p_old).operational_status,
        (p_old).payment_status,
        (p_old).paid_at,
        (p_old).cancelled_at,
        (p_old).refunded_at,
        (p_old).passenger_ticket_count,
        (p_old).currency,
        (p_old).supplier_cost_source,
        (p_old).supplier_cost_gbp,
        (p_old).sale_price_source,
        (p_old).sale_price_gbp,
        (p_old).idempotency_key
      )
  )
$$;

do $ticketing_2026090203_history_guard$
declare
  definition text;
  upgraded text;
begin
  definition := pg_get_functiondef('public.protect_ticket_transaction_history()'::regprocedure);
  if position('ticketing_date_correction_context_matches_2026090203' in definition) > 0 then
    return;
  end if;
  upgraded := replace(
    definition,
    'and not public.ticketing_initial_pricing_context_matches_2026082801(old.id)',
    'and not public.ticketing_initial_pricing_context_matches_2026082801(old.id)
    and not public.ticketing_date_correction_context_matches_2026090203(old, new)'
  );
  if upgraded = definition then
    raise exception 'Ticket date correction guard did not match transaction history protection'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
  execute upgraded;
end
$ticketing_2026090203_history_guard$;

create or replace function public.ticketing_correct_transaction_dates_2026090203(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_transaction_id uuid,
  p_expected_booking_version bigint,
  p_expected_transaction_version bigint,
  p_idempotency_key text,
  p_correction jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  expected_keys constant text[] := array[
    'operationalStatus', 'bookingDate', 'timeLimitAt', 'issuedAt', 'reason'
  ];
  action_name_value constant text := 'ticketing.correct_transaction_dates.v1';
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  unknown_key text;
  operational_status_value text;
  booking_date_value date;
  time_limit_local timestamp without time zone;
  time_limit_at_value timestamptz;
  issued_date_value date;
  issued_at_value timestamptz;
  reason_value text;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  booking_row public.ticket_bookings%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  location_timezone text;
  context_id_value uuid := gen_random_uuid();
  source_event_row public.commission_source_events%rowtype;
  source_event_result jsonb;
  response_value jsonb;
  final_booking_version bigint;
  final_transaction_version bigint;
  now_value timestamptz := clock_timestamp();
begin
  if p_actor_employee_id is null or p_booking_id is null or p_transaction_id is null
    or p_expected_booking_version is null or p_expected_booking_version < 1
    or p_expected_transaction_version is null or p_expected_transaction_version < 1
    or length(idempotency_key_value) not between 1 and 200
  then
    raise exception 'Actor, record IDs, expected versions, and idempotency key are required'
      using errcode = '22023';
  end if;
  if not public.ticketing_actor_can_maintain_2026090202(p_actor_employee_id) then
    raise exception 'Only an active record manager may correct ticket dates'
      using errcode = '42501';
  end if;
  if p_correction is null or jsonb_typeof(p_correction) is distinct from 'object' then
    raise exception 'Ticket date correction must be an object' using errcode = '22023';
  end if;

  select supplied.key into unknown_key
  from jsonb_object_keys(p_correction) supplied(key)
  where supplied.key <> all(expected_keys)
  limit 1;
  if found or not p_correction ?& expected_keys then
    raise exception 'Ticket date correction fields are missing or invalid' using errcode = '22023';
  end if;

  operational_status_value := lower(btrim(p_correction ->> 'operationalStatus'));
  reason_value := nullif(btrim(p_correction ->> 'reason'), '');
  begin
    booking_date_value := (p_correction ->> 'bookingDate')::date;
    if p_correction -> 'timeLimitAt' <> 'null'::jsonb then
      time_limit_local := (p_correction ->> 'timeLimitAt')::timestamp without time zone;
    end if;
    if p_correction -> 'issuedAt' <> 'null'::jsonb then
      issued_date_value := (p_correction ->> 'issuedAt')::date;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ticket correction contains an invalid date' using errcode = '22007';
  end;

  if to_char(booking_date_value, 'YYYY-MM-DD') <> p_correction ->> 'bookingDate'
    or reason_value is null or length(reason_value) > 500
    or operational_status_value not in ('held', 'issued', 'cancelled', 'part_refunded', 'refunded')
  then
    raise exception 'Ticket date correction is invalid' using errcode = '22023';
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id and booking.archived_at is null
  for update;
  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;
  select location.timezone into location_timezone
  from public.locations location where location.id = booking_row.location_id;
  if location_timezone is null then
    raise exception 'Ticket branch timezone is missing'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
  select transaction.* into transaction_row
  from public.ticket_transactions transaction
  where transaction.id = p_transaction_id and transaction.booking_id = p_booking_id
  for update;
  if not found then
    raise exception 'Ticket transaction not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;
  if operational_status_value = 'held' then
    if time_limit_local is null or issued_date_value is not null
      or time_limit_local::date < booking_date_value
      or to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI') <> p_correction ->> 'timeLimitAt'
    then
      raise exception 'Held ticket dates are invalid' using errcode = '22023';
    end if;
    time_limit_at_value := time_limit_local at time zone location_timezone;
    if time_limit_at_value at time zone location_timezone <> time_limit_local then
      raise exception 'Airline time limit is invalid in the branch timezone'
        using errcode = '22007';
    end if;
  else
    if issued_date_value is null or time_limit_local is not null
      or issued_date_value < booking_date_value
      or to_char(issued_date_value, 'YYYY-MM-DD') <> p_correction ->> 'issuedAt'
    then
      raise exception 'Issued ticket dates are invalid' using errcode = '22023';
    end if;
    issued_at_value := issued_date_value::timestamp without time zone at time zone location_timezone;
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'transactionId', p_transaction_id,
    'expectedBookingVersion', p_expected_booking_version,
    'expectedTransactionVersion', p_expected_transaction_version,
    'operationalStatus', operational_status_value,
    'bookingDate', booking_date_value,
    'timeLimitAt', case when time_limit_local is null then null
      else to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI') end,
    'issuedAt', issued_date_value,
    'reason', reason_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value, 0
  ));
  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different date correction'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if booking_row.version <> p_expected_booking_version
    or transaction_row.version <> p_expected_transaction_version
    or transaction_row.operational_status <> operational_status_value
  then
    raise exception 'Ticket changed; reload before correcting dates'
      using errcode = '40001',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'transactionVersion', transaction_row.version
        )::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  if transaction_row.booking_date = booking_date_value
    and transaction_row.time_limit_at is not distinct from time_limit_at_value
    and transaction_row.issued_at is not distinct from issued_at_value
  then
    raise exception 'Ticket dates are already current'
      using errcode = '22023', hint = 'TICKETING_DATE_NO_CHANGE';
  end if;

  insert into public.ticket_date_correction_contexts (
    id, actor_employee_id, transaction_id,
    previous_booking_date, booking_date,
    previous_time_limit_at, time_limit_at,
    previous_time_limit_timezone, time_limit_timezone,
    previous_issued_at, issued_at
  ) values (
    context_id_value, p_actor_employee_id, p_transaction_id,
    transaction_row.booking_date, booking_date_value,
    transaction_row.time_limit_at, time_limit_at_value,
    transaction_row.time_limit_timezone,
    case when time_limit_at_value is null then null else location_timezone end,
    transaction_row.issued_at, issued_at_value
  );
  perform set_config('ticketing.date_correction_context_id', context_id_value::text, true);

  update public.ticket_transactions transaction
  set booking_date = booking_date_value,
      time_limit_at = time_limit_at_value,
      time_limit_timezone = case when time_limit_at_value is null then null else location_timezone end,
      issued_at = issued_at_value,
      correction_reason = reason_value
  where transaction.id = p_transaction_id;

  delete from public.ticket_date_correction_contexts context where context.id = context_id_value;
  perform set_config('ticketing.date_correction_context_id', '', true);

  if transaction_row.service_type = 'TK' and transaction_row.parent_transaction_id is null then
    update public.ticket_bookings booking
    set booking_date = booking_date_value,
        time_limit_at = time_limit_at_value,
        time_limit_timezone = case when time_limit_at_value is null then null else location_timezone end,
        updated_by = p_actor_employee_id
    where booking.id = p_booking_id;
  end if;

  if issued_date_value is not null then
    select source_event.* into source_event_row
    from public.commission_source_events source_event
    where source_event.source_module = 'ticketing'
      and source_event.source_fact_key = 'transaction:' || p_transaction_id::text || ':issued'
    order by source_event.event_version desc
    limit 1;
    if not found then
      raise exception 'Issued ticket source fact is missing'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;

    source_event_result := public.append_commission_source_event(jsonb_build_object(
      'source_module', source_event_row.source_module,
      'source_event_id', gen_random_uuid(),
      'source_fact_key', source_event_row.source_fact_key,
      'source_record_id', source_event_row.source_record_id,
      'event_type', source_event_row.event_type,
      'contract_version', source_event_row.contract_version,
      'event_version', source_event_row.event_version + 1,
      'supersedes_event_id', source_event_row.source_event_id,
      'employee_id', source_event_row.employee_id,
      'owner_employee_id', source_event_row.owner_employee_id,
      'location_id', source_event_row.location_id,
      'occurred_at', now_value,
      'effective_on', issued_date_value,
      'source_path', source_event_row.source_path,
      'variables', jsonb_set(
        source_event_row.variables || jsonb_build_object('booking_date', booking_date_value),
        '{issued_at}', to_jsonb(issued_at_value), true
      ),
      'idempotency_key', 'date-correction:' || encode(digest(
        p_actor_employee_id::text || ':' || idempotency_key_value || ':'
          || source_event_row.source_fact_key,
        'sha256'
      ), 'hex')
    ));
  end if;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action,
    actor_employee_id, reason, before_state, after_state
  ) values (
    'transaction', p_transaction_id, p_booking_id, p_transaction_id,
    'correct_ticket_dates', p_actor_employee_id, reason_value,
    jsonb_build_object(
      'bookingDate', transaction_row.booking_date,
      'timeLimitAt', transaction_row.time_limit_at,
      'timeLimitTimezone', transaction_row.time_limit_timezone,
      'issuedAt', transaction_row.issued_at
    ),
    jsonb_build_object(
      'bookingDate', booking_date_value,
      'timeLimitAt', time_limit_at_value,
      'timeLimitTimezone', case when time_limit_at_value is null then null else location_timezone end,
      'issuedAt', issued_at_value,
      'sourceEventId', source_event_result ->> 'sourceEventId'
    )
  );

  select version into final_booking_version
  from public.ticket_bookings where id = p_booking_id;
  select version into final_transaction_version
  from public.ticket_transactions where id = p_transaction_id;

  response_value := jsonb_build_object(
    'bookingId', p_booking_id,
    'transactionId', p_transaction_id,
    'bookingVersion', final_booking_version,
    'transactionVersion', final_transaction_version,
    'bookingDate', booking_date_value,
    'timeLimitAt', case when time_limit_local is null then null
      else to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI') end,
    'issuedAt', issued_date_value,
    'idempotentReplay', false
  );

  insert into public.ticket_idempotency_keys (
    action_name, actor_employee_id, idempotency_key,
    request_payload, response_payload, completed_at
  ) values (
    action_name_value, p_actor_employee_id, idempotency_key_value,
    canonical_request, response_value, now_value
  );

  return response_value;
end
$$;

revoke all on function public.ticketing_date_correction_context_matches_2026090203(
  public.ticket_transactions, public.ticket_transactions
) from public, anon, authenticated, service_role;
revoke all on function public.ticketing_correct_transaction_dates_2026090203(
  uuid, uuid, uuid, bigint, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ticketing_correct_transaction_dates_2026090203(
  uuid, uuid, uuid, bigint, bigint, text, jsonb
) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026090203,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260902_ticketing_admin_date_corrections.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array('audited-ticket-date-corrections')
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
