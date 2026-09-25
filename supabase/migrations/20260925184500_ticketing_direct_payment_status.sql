-- Payment status is operational data. Ticketing staff must be able to keep it
-- current without opening an amendment or waiting for a second administrator.
-- The guarded RPC below keeps that narrow: it changes only the root TK payment
-- fields, checks the current owner/version, and leaves an immutable audit row.

create or replace function public.protect_ticket_transaction_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  direct_payment_update boolean :=
    current_setting('ticketing.direct_payment_status_update', true) = 'enabled';
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket transactions cannot be deleted; archive or append a correction'
      using errcode = '55000';
  end if;

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded') then
    if (
      old.operational_status = 'issued'
      and new.operational_status not in ('issued', 'cancelled', 'part_refunded', 'refunded')
    ) or (
      old.operational_status = 'cancelled'
      and new.operational_status <> 'cancelled'
    ) or (
      old.operational_status = 'part_refunded'
      and new.operational_status not in ('part_refunded', 'refunded')
    ) or (
      old.operational_status = 'refunded'
      and new.operational_status <> 'refunded'
    ) then
      raise exception 'Posted ticket lifecycle cannot move backwards'
        using errcode = '55000';
    end if;
  end if;

  if (
    (old.payment_status = 'part_paid' and new.payment_status = 'unpaid')
    or (old.payment_status = 'paid' and new.payment_status <> 'paid')
  ) and not direct_payment_update then
    raise exception 'Ticket payment status cannot move backwards'
      using errcode = '55000';
  end if;

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
    and row(
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.owner_employee_id,
      new.acting_employee_id,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.sale_price_source,
      new.sale_price_gbp,
      new.idempotency_key
    ) is distinct from row(
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.owner_employee_id,
      old.acting_employee_id,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.sale_price_source,
      old.sale_price_gbp,
      old.idempotency_key
    ) then
    raise exception 'Posted ticket identity and financial facts are immutable; append a correction'
      using errcode = '55000';
  end if;

  if (
    (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
    or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
    or (old.refunded_at is not null and new.refunded_at is distinct from old.refunded_at)
  ) and not direct_payment_update then
    raise exception 'Posted ticket lifecycle timestamps are immutable; append a correction'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create or replace function public.ticketing_update_root_payment_status(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_idempotency_key text,
  p_payment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  expected_keys constant text[] := array[
    'expectedBookingVersion', 'expectedTransactionVersion', 'paymentStatus', 'paidAt'
  ];
  action_name_value constant text := 'ticketing.update_root_payment_status.v1';
  idempotency_key_value text := nullif(btrim(p_idempotency_key), '');
  expected_booking_version_value bigint;
  expected_transaction_version_value bigint;
  payment_status_value text;
  paid_date_value date;
  paid_at_value timestamptz;
  actor_role_name text;
  actor_has_ticketing_department boolean := false;
  actor_can_manage_any boolean := false;
  department_lock_row record;
  booking_row public.ticket_bookings%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  attribution_row public.ticket_booking_attribution_versions%rowtype;
  existing_request jsonb;
  existing_response jsonb;
  canonical_request jsonb;
  before_state_value jsonb;
  after_state_value jsonb;
  response_value jsonb;
  booking_timezone text;
  changed_value boolean := false;
  source_event_row public.commission_source_events%rowtype;
  source_event_result jsonb;
  source_event_key text;
  now_value timestamptz := clock_timestamp();
  unknown_key text;
begin
  if idempotency_key_value is null or length(idempotency_key_value) > 200 then
    raise exception 'A valid Ticketing idempotency key is required' using errcode = '22023';
  end if;
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception 'Ticket payment must be a JSON object' using errcode = '22023';
  end if;
  select supplied.key into unknown_key from jsonb_object_keys(p_payment) supplied(key)
  where supplied.key <> all (expected_keys) limit 1;
  if found or not p_payment ?& expected_keys then
    raise exception 'Ticket payment has invalid fields' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payment -> 'expectedBookingVersion') <> 'number'
    or jsonb_typeof(p_payment -> 'expectedTransactionVersion') <> 'number'
    or jsonb_typeof(p_payment -> 'paymentStatus') <> 'string'
    or jsonb_typeof(p_payment -> 'paidAt') not in ('string', 'null') then
    raise exception 'Ticket payment has invalid values' using errcode = '22023';
  end if;
  begin
    expected_booking_version_value := (p_payment ->> 'expectedBookingVersion')::bigint;
    expected_transaction_version_value := (p_payment ->> 'expectedTransactionVersion')::bigint;
    payment_status_value := p_payment ->> 'paymentStatus';
    paid_date_value := case when jsonb_typeof(p_payment -> 'paidAt') = 'null' then null else (p_payment ->> 'paidAt')::date end;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ticket payment contains invalid values' using errcode = '22023';
  end;
  if expected_booking_version_value < 1 or expected_transaction_version_value < 1
    or payment_status_value not in ('unpaid', 'part_paid', 'paid') then
    raise exception 'Ticket payment contains invalid values' using errcode = '22023';
  end if;
  if (payment_status_value = 'paid') <> (paid_date_value is not null) then
    raise exception 'Only paid tickets require a paid date' using errcode = '22023';
  end if;

  canonical_request := jsonb_build_object(
    'expectedBookingVersion', expected_booking_version_value,
    'expectedTransactionVersion', expected_transaction_version_value,
    'paymentStatus', payment_status_value,
    'paidAt', paid_date_value
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing-payment:' || p_actor_employee_id::text || ':' || idempotency_key_value, 0
  ));
  select request_payload, response_payload into existing_request, existing_response
  from public.ticket_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id
    and idempotency_key = idempotency_key_value
  for update;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Ticket payment idempotency key was reused with different details'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return coalesce(existing_response, '{}'::jsonb) || jsonb_build_object('idempotentReplay', true);
  end if;

  select regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g')
  into actor_role_name
  from public.employees employee join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for share of employee, role;
  if not found then raise exception 'Actor is not active' using errcode = '42501'; end if;
  actor_can_manage_any := actor_role_name in ('maintenance admin', 'admin', 'master admin', 'super admin');
  for department_lock_row in
    select membership.department_id, department.name
    from public.employee_departments membership join public.departments department on department.id = membership.department_id
    where membership.employee_id = p_actor_employee_id order by membership.department_id
    for share of membership, department
  loop
    actor_has_ticketing_department := actor_has_ticketing_department
      or lower(btrim(department_lock_row.name)) = 'ticketing';
  end loop;
  if not actor_can_manage_any and not actor_has_ticketing_department then
    raise exception 'Actor is not an active authorised Ticketing employee' using errcode = '42501';
  end if;

  select * into booking_row from public.ticket_bookings
  where id = p_booking_id and archived_at is null for update;
  if not found then raise exception 'Ticket record not found' using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND'; end if;
  select * into transaction_row from public.ticket_transactions
  where booking_id = booking_row.id and parent_transaction_id is null and service_type = 'TK'
  for update;
  if not found then raise exception 'Ticket record not found' using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND'; end if;
  if booking_row.version <> expected_booking_version_value or transaction_row.version <> expected_transaction_version_value then
    raise exception 'Ticket versions are stale' using errcode = '40001',
      detail = jsonb_build_object('bookingVersion', booking_row.version, 'transactionVersion', transaction_row.version)::text,
      hint = 'TICKETING_VERSION_CONFLICT';
  end if;
  if booking_row.payment_status is distinct from transaction_row.payment_status then
    raise exception 'Ticket payment state requires repair' using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
  if not actor_can_manage_any then
    select * into attribution_row from public.ticket_booking_attribution_versions
    where booking_id = booking_row.id order by attribution_version desc limit 1 for update;
    if not found or (attribution_row.primary_employee_id <> p_actor_employee_id and not exists (
      select 1 from public.ticket_booking_attribution_assistants assistant
      where assistant.attribution_id = attribution_row.id and assistant.employee_id = p_actor_employee_id
    )) then
      raise exception 'Ticket payment belongs to another employee' using errcode = '42501';
    end if;
  end if;
  select timezone into booking_timezone from public.locations where id = booking_row.location_id for share;
  if not found or booking_timezone is null then
    raise exception 'Ticket branch timezone requires repair' using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
  if paid_date_value is not null then
    if paid_date_value < booking_row.booking_date then
      raise exception 'Paid date cannot be before booking date' using errcode = '22023';
    end if;
    paid_at_value := paid_date_value::timestamp without time zone at time zone booking_timezone;
  end if;

  before_state_value := jsonb_build_object('paymentStatus', transaction_row.payment_status, 'paidAt', transaction_row.paid_at);
  changed_value := transaction_row.payment_status is distinct from payment_status_value
    or transaction_row.paid_at is distinct from paid_at_value;
  if changed_value then
    perform set_config('ticketing.direct_payment_status_update', 'enabled', true);
    update public.ticket_bookings set payment_status = payment_status_value, updated_by = p_actor_employee_id
    where id = booking_row.id;
    update public.ticket_transactions set payment_status = payment_status_value, paid_at = paid_at_value
    where id = transaction_row.id;
    select * into booking_row from public.ticket_bookings where id = booking_row.id;
    select * into transaction_row from public.ticket_transactions where id = transaction_row.id;
    after_state_value := jsonb_build_object('paymentStatus', transaction_row.payment_status, 'paidAt', transaction_row.paid_at);
    insert into public.ticket_audit_events (
      entity_type, entity_id, booking_id, transaction_id, action, actor_employee_id, before_state, after_state, created_at
    ) values (
      'transaction', transaction_row.id, booking_row.id, transaction_row.id,
      'update_root_payment_status', p_actor_employee_id, before_state_value, after_state_value, now_value
    );

    -- Preserve the immutable source-fact lineage when a previously-paid ticket
    -- is corrected back to partial or unpaid. Commission treats ticket_paid as
    -- informational, but downstream consumers can read the latest version.
    if transaction_row.payment_status = 'paid' or exists (
      select 1 from public.commission_source_events event
      where event.source_module = 'ticketing' and event.source_fact_key = 'transaction:' || transaction_row.id::text || ':paid'
    ) then
      select * into source_event_row from public.commission_source_events event
      where event.source_module = 'ticketing' and event.source_fact_key = 'transaction:' || transaction_row.id::text || ':paid'
      order by event.event_version desc limit 1 for update;
      source_event_key := 'tkpay:v1:' || encode(digest(p_actor_employee_id::text || ':' || idempotency_key_value, 'sha256'), 'hex');
      source_event_result := public.append_commission_source_event(jsonb_build_object(
        'source_module', 'ticketing', 'source_event_id', gen_random_uuid(),
        'source_fact_key', 'transaction:' || transaction_row.id::text || ':paid',
        'source_record_id', transaction_row.id, 'event_type', 'ticket_paid', 'contract_version', 1,
        'event_version', coalesce(source_event_row.event_version, 0) + 1,
        'supersedes_event_id', case when source_event_row.id is null then null else source_event_row.source_event_id end,
        'employee_id', p_actor_employee_id, 'owner_employee_id', booking_row.owner_employee_id,
        'location_id', booking_row.location_id, 'occurred_at', now_value,
        'effective_on', coalesce(paid_date_value, booking_row.booking_date),
        'source_path', '/dashboard/ticketing/ledger/' || booking_row.id::text,
        'variables', jsonb_build_object('service_type', 'TK', 'payment_status', transaction_row.payment_status),
        'idempotency_key', source_event_key
      ));
    end if;
  else
    after_state_value := before_state_value;
  end if;
  response_value := jsonb_build_object(
    'booking', jsonb_build_object('id', booking_row.id, 'version', booking_row.version, 'paymentStatus', booking_row.payment_status),
    'transaction', jsonb_build_object('id', transaction_row.id, 'version', transaction_row.version, 'paymentStatus', transaction_row.payment_status, 'paidAt', transaction_row.paid_at),
    'changed', changed_value, 'idempotentReplay', false
  );
  insert into public.ticket_idempotency_keys (action_name, actor_employee_id, idempotency_key, request_payload, response_payload, completed_at)
  values (action_name_value, p_actor_employee_id, idempotency_key_value, canonical_request, response_value, clock_timestamp());
  return response_value;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Ticket payment contains an invalid date' using errcode = '22023';
end
$$;

comment on function public.ticketing_update_root_payment_status(uuid, uuid, text, jsonb) is
  'Atomic direct root-TK payment update for the assigned Ticketing agent or a Ticketing administrator. It retains versions, idempotency, source-fact lineage, and immutable audit evidence without a second approval.';

revoke all on function public.ticketing_update_root_payment_status(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_update_root_payment_status(uuid, uuid, text, jsonb)
  to service_role;
