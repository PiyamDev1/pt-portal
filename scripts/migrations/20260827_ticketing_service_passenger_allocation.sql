-- Forward-only Ticketing capability 2026082703.
--
-- Adds exact root-passenger allocation to DC/R-ER service transactions while
-- preserving the existing aggregate financial and lineage RPC boundary.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_service_passenger_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version > 2026082703 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082703, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082702 then
    raise exception 'Ticketing capability 2026082702 is required before service passenger allocation capability 2026082703'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_service_passenger_forward_guard$;

create or replace function public.ticketing_append_service_transaction_allocated(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_idempotency_key text,
  p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  selected_ids uuid[];
  child_transaction_id uuid;
  root_transaction_id uuid;
  expected_type_counts jsonb;
  selected_type_counts jsonb;
  response_value jsonb;
  selected_count integer;
  child_fare record;
  selected_passenger record;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or jsonb_typeof(p_entry -> 'selectedPassengerIds') <> 'array'
  then
    raise exception 'Exact affected passenger selection is required'
      using errcode = '22023', hint = 'TICKETING_PASSENGER_SELECTION_REQUIRED';
  end if;

  begin
    select array_agg(value::text::uuid order by value::text::uuid)
    into selected_ids
    from jsonb_array_elements_text(p_entry -> 'selectedPassengerIds') values(value);
  exception when invalid_text_representation then
    raise exception 'Affected passenger selection contains an invalid passenger'
      using errcode = '22023', hint = 'TICKETING_PASSENGER_SELECTION_INVALID';
  end;

  selected_count := coalesce(array_length(selected_ids, 1), 0);
  if selected_count < 1 or selected_count > 99
    or (select count(distinct selected_id) from unnest(selected_ids) selected_id) <> selected_count
  then
    raise exception 'Affected passengers must be selected exactly once'
      using errcode = '22023', hint = 'TICKETING_PASSENGER_SELECTION_INVALID';
  end if;

  select transaction.id
  into root_transaction_id
  from public.ticket_transactions transaction
  where transaction.booking_id = p_booking_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  for share;

  if root_transaction_id is null then
    raise exception 'An issued root TK transaction is required'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if exists (
    select 1
    from unnest(selected_ids) selected_id
    where not exists (
      select 1
      from public.ticket_transaction_passengers allocation
      where allocation.transaction_id = root_transaction_id
        and allocation.booking_id = p_booking_id
        and allocation.passenger_id = selected_id
    )
  ) then
    raise exception 'Every affected passenger must belong to the issued root TK'
      using errcode = '22023', hint = 'TICKETING_PASSENGER_SELECTION_INVALID';
  end if;

  select coalesce(jsonb_object_agg(fare.passenger_type, fare.quantity), '{}'::jsonb)
  into expected_type_counts
  from jsonb_array_elements(p_entry -> 'fares') fare_value(value)
  cross join lateral jsonb_to_record(fare_value.value) as fare(passenger_type text, quantity integer);

  select coalesce(jsonb_object_agg(passenger.passenger_type, passenger.quantity), '{}'::jsonb)
  into selected_type_counts
  from (
    select root_passenger.passenger_type, count(*)::integer as quantity
    from public.ticket_passengers root_passenger
    where root_passenger.id = any(selected_ids)
      and root_passenger.booking_id = p_booking_id
    group by root_passenger.passenger_type
  ) passenger;

  if selected_type_counts is distinct from expected_type_counts then
    raise exception 'Selected passengers must match the affected passenger quantities'
      using errcode = '22023', hint = 'TICKETING_PASSENGER_SELECTION_MISMATCH';
  end if;

  response_value := public.ticketing_append_service_transaction(
    p_actor_employee_id,
    p_booking_id,
    p_idempotency_key,
    p_entry - 'selectedPassengerIds'
  );

  child_transaction_id := nullif(response_value -> 'transaction' ->> 'id', '')::uuid;
  if child_transaction_id is null then
    raise exception 'Ticketing returned an invalid service transaction result'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  for selected_passenger in
    select root_passenger.id, root_passenger.passenger_type, allocation.position
    from public.ticket_passengers root_passenger
    join public.ticket_transaction_passengers allocation
      on allocation.passenger_id = root_passenger.id
      and allocation.transaction_id = root_transaction_id
      and allocation.booking_id = p_booking_id
    where root_passenger.id = any(selected_ids)
      and root_passenger.booking_id = p_booking_id
    order by root_passenger.passenger_type, allocation.position, root_passenger.id
  loop
    select fare.id
    into child_fare
    from public.ticket_passenger_fare_lines fare
    where fare.transaction_id = child_transaction_id
      and fare.passenger_type = selected_passenger.passenger_type;

    if child_fare.id is null then
      raise exception 'Allocated passenger fare line is unavailable'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;

    insert into public.ticket_transaction_passengers (
      booking_id, transaction_id, passenger_id, fare_line_id
    ) values (
      p_booking_id, child_transaction_id, selected_passenger.id, child_fare.id
    )
    on conflict (transaction_id, passenger_id) do nothing;
  end loop;

  return response_value || jsonb_build_object(
    'selectedPassengerIds', to_jsonb(selected_ids)
  );
end
$$;

comment on function public.ticketing_append_service_transaction_allocated(uuid, uuid, text, jsonb)
is 'Service-only exact root-passenger DC/R-ER allocation wrapper over the existing atomic aggregate service transaction boundary.';

revoke all on function public.ticketing_append_service_transaction_allocated(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_append_service_transaction_allocated(uuid, uuid, text, jsonb)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082703,
  now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260827_ticketing_service_passenger_allocation.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing'
          and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'exact-dc-rer-affected-passengers',
        'dc-rer-child-passenger-allocation'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.ticketing_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready',
      coalesce(schema_version.version >= 2026082703, false)
      and to_regprocedure('public.digest(text,text)') is not null
      and to_regclass('public.ticket_notification_events') is not null
      and to_regprocedure(
        'public.ticketing_claim_time_limit_notifications(timestamptz,integer)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_finish_time_limit_notification(uuid,uuid,text,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_append_service_transaction_allocated(uuid,uuid,text,jsonb)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082703),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
