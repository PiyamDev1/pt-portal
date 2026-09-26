begin;

alter table public.ticket_change_requests
  add column if not exists proposed_details jsonb;

alter table public.ticket_change_requests
  drop constraint if exists ticket_change_requests_notes_check;
alter table public.ticket_change_requests
  add constraint ticket_change_requests_notes_check check (
    (
      request_type = 'amendment'
      and (
        (request_notes is not null and length(btrim(request_notes)) between 1 and 1000)
        or coalesce(jsonb_typeof(proposed_details) = 'object', false)
      )
    )
    or (
      request_type = 'deletion'
      and proposed_details is null
      and (request_notes is null or length(btrim(request_notes)) <= 1000)
    )
  );

create index if not exists ticket_change_requests_requested_by_created_idx
  on public.ticket_change_requests (requested_by, created_at desc);

create or replace function public.ticketing_request_booking_detail_change_2026092602(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_idempotency_key text,
  p_proposed_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  request_row public.ticket_change_requests%rowtype;
  booking_timezone text;
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  response_value jsonb;
begin
  if p_actor_employee_id is null
    or p_booking_id is null
    or length(idempotency_key_value) not between 8 and 200
    or jsonb_typeof(p_proposed_details) is distinct from 'object'
    or jsonb_typeof(p_proposed_details -> 'expectedBookingVersion') is distinct from 'number'
    or jsonb_typeof(p_proposed_details -> 'expectedTransactionVersion') is distinct from 'number'
  then
    raise exception 'Invalid ticket detail change request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.employees employee
    where employee.id = p_actor_employee_id
      and employee.is_active
      and (
        public.ticketing_actor_is_admin_2026082802(employee.id)
        or exists (
          select 1
          from public.employee_departments membership
          join public.departments department on department.id = membership.department_id
          where membership.employee_id = employee.id
            and lower(btrim(department.name)) = 'ticketing'
        )
      )
  ) then
    raise exception 'Active Ticketing employee required' using errcode = '42501';
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'proposedDetails', p_proposed_details
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing.detail-change-request.v2:' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));
  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = 'ticketing.detail-change-request.v2'
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with different proposed ticket details'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select booking, location.timezone
  into booking_row, booking_timezone
  from public.ticket_bookings booking
  join public.locations location on location.id = booking.location_id
  where booking.id = p_booking_id
    and booking.archived_at is null
  for update of booking;
  if not found then
    raise exception 'Ticket booking not found' using errcode = 'P0002';
  end if;

  select transaction.*
  into transaction_row
  from public.ticket_transactions transaction
  where transaction.booking_id = p_booking_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  for update;
  if not found then
    raise exception 'Ticket transaction not found' using errcode = 'P0002';
  end if;

  if booking_row.version <> (p_proposed_details ->> 'expectedBookingVersion')::bigint
    or transaction_row.version <> (p_proposed_details ->> 'expectedTransactionVersion')::bigint
  then
    raise exception 'Ticket versions are stale'
      using errcode = '40001', hint = 'TICKETING_VERSION_CONFLICT',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'transactionVersion', transaction_row.version
        )::text;
  end if;

  if transaction_row.owner_employee_id = p_actor_employee_id
    and date_trunc(
      'month',
      coalesce(transaction_row.issued_at, transaction_row.created_at) at time zone booking_timezone
    ) = date_trunc('month', clock_timestamp() at time zone booking_timezone)
  then
    raise exception 'This ticket is still open for direct editing'
      using errcode = '55000', hint = 'TICKETING_DIRECT_EDIT_ALLOWED';
  end if;

  select request.*
  into request_row
  from public.ticket_change_requests request
  where request.booking_id = p_booking_id
    and request.request_type = 'amendment'
    and request.status = 'pending'
  for update;

  if found then
    update public.ticket_change_requests request
    set requested_by = p_actor_employee_id,
        request_notes = null,
        proposed_details = p_proposed_details,
        created_at = clock_timestamp()
    where request.id = request_row.id
    returning * into request_row;
  else
    insert into public.ticket_change_requests (
      booking_id, requested_by, request_type, request_notes, proposed_details
    ) values (
      p_booking_id, p_actor_employee_id, 'amendment', null, p_proposed_details
    ) returning * into request_row;
  end if;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action,
    actor_employee_id, before_state, after_state
  ) values (
    'booking', p_booking_id, p_booking_id, transaction_row.id,
    'ticket_detail_change_requested', p_actor_employee_id,
    jsonb_build_object(
      'bookingVersion', booking_row.version,
      'transactionVersion', transaction_row.version
    ),
    jsonb_build_object(
      'requestId', request_row.id,
      'proposedDetails', p_proposed_details
    )
  );

  response_value := jsonb_build_object(
    'requestId', request_row.id,
    'status', request_row.status,
    'idempotentReplay', false
  );
  insert into public.ticket_idempotency_keys (
    action_name, actor_employee_id, idempotency_key,
    request_payload, response_payload, completed_at
  ) values (
    'ticketing.detail-change-request.v2', p_actor_employee_id, idempotency_key_value,
    canonical_request, response_value, clock_timestamp()
  );
  return response_value;
end
$$;

do $$
declare
  function_sql text;
  old_guard text := $guard$
  if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id) then
    raise exception 'Only an active administrator may correct ticket sale prices' using errcode = '42501';
  end if;$guard$;
  new_guard text := $guard$
  if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id)
    and not exists (
      select 1
      from public.ticket_bookings authorised_booking
      join public.locations authorised_location
        on authorised_location.id = authorised_booking.location_id
      join public.ticket_transactions authorised_transaction
        on authorised_transaction.booking_id = authorised_booking.id
        and authorised_transaction.service_type = 'TK'
        and authorised_transaction.parent_transaction_id is null
      where authorised_booking.id = p_booking_id
        and authorised_booking.archived_at is null
        and authorised_transaction.owner_employee_id = p_actor_employee_id
        and date_trunc(
          'month',
          coalesce(authorised_transaction.issued_at, authorised_transaction.created_at)
            at time zone authorised_location.timezone
        ) = date_trunc(
          'month',
          clock_timestamp() at time zone authorised_location.timezone
        )
    )
  then
    raise exception 'Only the booking owner within the entry month or an administrator may correct ticket sale prices'
      using errcode = '42501';
  end if;$guard$;
begin
  function_sql := pg_get_functiondef(
    'public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)'::regprocedure
  );
  if position(old_guard in function_sql) = 0 then
    raise exception 'Ticket sale correction authorisation guard did not match'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
  function_sql := replace(function_sql, old_guard, new_guard);
  function_sql := replace(
    function_sql,
    '''ticket_sale_price_admin_corrected''',
    '''ticket_sale_price_corrected'''
  );
  function_sql := replace(function_sql, '''admin_corrected_by''', '''corrected_by''');
  execute function_sql;
end
$$;

revoke all on function
  public.ticketing_request_booking_detail_change_2026092602(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.ticketing_request_booking_detail_change_2026092602(uuid,uuid,text,jsonb)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026092602,
  clock_timestamp(),
  coalesce(
    (select details from public.portal_schema_versions where component = 'ticketing'),
    '{}'::jsonb
  ) || jsonb_build_object(
    'migration', '20260926171556_ticketing_monthly_agent_edits_and_approvals.sql',
    'capabilities', coalesce((
      select details -> 'capabilities'
      from public.portal_schema_versions
      where component = 'ticketing'
        and jsonb_typeof(details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array(
      'monthly-owner-direct-edits',
      'proposed-ticket-detail-approvals',
      'role-aware-ticket-price-visibility'
    )
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
