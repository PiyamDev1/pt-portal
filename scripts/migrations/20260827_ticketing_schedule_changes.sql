-- Forward-only Ticketing capability 2026082701.
--
-- Adds a manual, replay-safe schedule-change workflow for upcoming issued
-- root-TK sectors. Any authorised Ticketing employee can mark a suspected
-- flight-number/time change. The responsible employee, or an Admin/Master
-- Admin/Super Admin acting with a reason, can review, finalise, or dismiss it.
-- Finalisation delegates to the versioned itinerary replacement boundary so
-- the applied schedule receives a new itinerary revision and retained history.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'ticketing:schema-migration',
  0
));

do $ticketing_schedule_forward_guard$
declare
  installed_version bigint;
begin
  if pg_catalog.to_regclass('public.portal_schema_versions') is not null then
    execute
      'select version from public.portal_schema_versions where component = $1 for update'
      into installed_version
      using 'ticketing';
  end if;

  if installed_version > 2026082701 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082701, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082602 then
    raise exception 'Ticketing capability 2026082602 is required before schedule-change capability 2026082701'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_schedule_forward_guard$;

lock table
  public.ticket_bookings,
  public.ticket_transactions,
  public.ticket_itinerary_sectors,
  public.ticket_schedule_events,
  public.ticket_idempotency_keys
in share row exclusive mode;

do $ticketing_schedule_post_lock_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing';

  if installed_version > 2026082701 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082701, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082602 then
    raise exception 'Ticketing capability 2026082602 is required before schedule-change capability 2026082701'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_schedule_post_lock_guard$;

alter table public.ticket_schedule_events
  add column if not exists change_case_id uuid,
  add column if not exists event_version integer;

alter table public.ticket_schedule_events
  disable trigger ticket_schedule_events_immutable;
update public.ticket_schedule_events
set change_case_id = coalesce(change_case_id, id),
    event_version = coalesce(event_version, 1)
where change_case_id is null or event_version is null;
alter table public.ticket_schedule_events
  enable trigger ticket_schedule_events_immutable;

alter table public.ticket_schedule_events
  alter column change_case_id set not null,
  alter column event_version set not null;

do $ticketing_schedule_event_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ticket_schedule_events'::regclass
      and conname = 'ticket_schedule_events_version_check'
  ) then
    alter table public.ticket_schedule_events
      add constraint ticket_schedule_events_version_check
      check (event_version > 0);
  end if;
end
$ticketing_schedule_event_constraints$;

create unique index if not exists ticket_schedule_events_case_version_idx
  on public.ticket_schedule_events (change_case_id, event_version);
create unique index if not exists ticket_schedule_events_case_type_idx
  on public.ticket_schedule_events (change_case_id, event_type);
create index if not exists ticket_schedule_events_case_created_idx
  on public.ticket_schedule_events (change_case_id, created_at, id);

comment on column public.ticket_schedule_events.change_case_id is
  'Stable identifier grouping immutable marked/reviewed/finalised-or-dismissed events for one manual schedule-change case.';

create table if not exists public.ticket_schedule_write_contexts (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.ticket_itinerary_sectors(id) on delete restrict,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  from_status text not null,
  to_status text not null,
  consumed boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_schedule_write_contexts_status_check check (
    from_status in ('on_schedule', 'change_marked', 'awaiting_finalisation')
    and to_status in ('on_schedule', 'change_marked', 'awaiting_finalisation')
    and from_status <> to_status
  ),
  constraint ticket_schedule_write_contexts_transition_check check (
    (from_status = 'on_schedule' and to_status = 'change_marked')
    or (from_status = 'change_marked' and to_status in ('awaiting_finalisation', 'on_schedule'))
    or (from_status = 'awaiting_finalisation' and to_status = 'on_schedule')
  )
);

alter table public.ticket_schedule_write_contexts enable row level security;
revoke all on table public.ticket_schedule_write_contexts
  from public, anon, authenticated, service_role;

-- Preserve the capability-2602 insert/retirement boundary and add one narrow
-- status-only path backed by an inaccessible, single-use schedule context.
create or replace function public.guard_ticket_itinerary_sector_write_2026082701()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  itinerary_context_id_value uuid;
  itinerary_context_row public.ticket_itinerary_write_contexts%rowtype;
  schedule_context_id_value uuid;
  schedule_context_row public.ticket_schedule_write_contexts%rowtype;
  schedule_finalisation_case_id_value uuid;
  root_transaction_row public.ticket_transactions%rowtype;
  airport_timezone_value text;
  arrival_timezone_value text;
  derived_departure_utc timestamptz;
  derived_arrival_utc timestamptz;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket itinerary history is append-only'
      using errcode = '55000', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
  end if;

  begin
    schedule_context_id_value := nullif(
      current_setting('ticketing.schedule_context_id', true), ''
    )::uuid;
  exception when invalid_text_representation then
    schedule_context_id_value := null;
  end;

  if schedule_context_id_value is not null then
    if tg_op <> 'UPDATE' then
      raise exception 'A schedule context permits only a status transition'
        using errcode = '42501', hint = 'TICKETING_SCHEDULE_CHANGE_REQUIRED';
    end if;

    select context.* into schedule_context_row
    from public.ticket_schedule_write_contexts context
    where context.id = schedule_context_id_value
    for update;

    if not found
      or schedule_context_row.consumed
      or old.id <> schedule_context_row.sector_id
      or old.schedule_status <> schedule_context_row.from_status
      or new.schedule_status <> schedule_context_row.to_status
      or not old.is_active
      or not new.is_active
      or new.retired_at is not null
      or new.retired_by is not null
      or (
        to_jsonb(new) - array['schedule_status', 'updated_at']::text[]
      ) is distinct from (
        to_jsonb(old) - array['schedule_status', 'updated_at']::text[]
      )
    then
      raise exception 'Ticket schedule transition does not match its authorised context'
        using errcode = '55000', hint = 'TICKETING_SCHEDULE_INVARIANT_FAILED';
    end if;

    update public.ticket_schedule_write_contexts context
    set consumed = true
    where context.id = schedule_context_row.id;
    return new;
  end if;

  begin
    itinerary_context_id_value := nullif(
      current_setting('ticketing.itinerary_context_id', true), ''
    )::uuid;
  exception when invalid_text_representation then
    itinerary_context_id_value := null;
  end;

  if itinerary_context_id_value is null then
    raise exception 'Ticket itinerary changes require an authorised workflow boundary'
      using errcode = '42501', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
  end if;

  select context.* into itinerary_context_row
  from public.ticket_itinerary_write_contexts context
  where context.id = itinerary_context_id_value
  for update;

  if not found then
    raise exception 'Ticket itinerary write context is invalid'
      using errcode = '42501', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
  end if;

  if tg_op = 'UPDATE' then
    begin
      schedule_finalisation_case_id_value := nullif(
        current_setting('ticketing.schedule_finalisation_case_id', true), ''
      )::uuid;
    exception when invalid_text_representation then
      schedule_finalisation_case_id_value := null;
    end;

    if old.booking_id <> itinerary_context_row.booking_id
      or not old.is_active
      or new.is_active
      or new.retired_at is distinct from itinerary_context_row.changed_at
      or new.retired_by is distinct from itinerary_context_row.actor_employee_id
      or (
        to_jsonb(new) - array['is_active', 'retired_at', 'retired_by', 'updated_at']::text[]
      ) is distinct from (
        to_jsonb(old) - array['is_active', 'retired_at', 'retired_by', 'updated_at']::text[]
      )
      or itinerary_context_row.retired_count >= itinerary_context_row.expected_retire_count
      or (
        old.schedule_status <> 'on_schedule'
        and (
          old.schedule_status <> 'awaiting_finalisation'
          or schedule_finalisation_case_id_value is null
          or not exists (
            select 1
            from public.ticket_schedule_events marked
            where marked.change_case_id = schedule_finalisation_case_id_value
              and marked.sector_id = old.id
              and marked.event_type = 'marked'
              and exists (
                select 1
                from public.ticket_schedule_events reviewed
                where reviewed.change_case_id = marked.change_case_id
                  and reviewed.event_type = 'reviewed'
              )
              and not exists (
                select 1
                from public.ticket_schedule_events terminal
                where terminal.change_case_id = marked.change_case_id
                  and terminal.event_type in ('finalised', 'dismissed')
              )
          )
        )
      )
    then
      raise exception 'Only an authorised itinerary or schedule-finalisation retirement is allowed'
        using errcode = '55000', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
    end if;

    update public.ticket_itinerary_write_contexts context
    set retired_count = retired_count + 1
    where context.id = itinerary_context_row.id;
    return new;
  end if;

  if new.booking_id <> itinerary_context_row.booking_id
    or new.source_transaction_id is distinct from itinerary_context_row.root_transaction_id
    or new.created_by <> itinerary_context_row.actor_employee_id
    or new.itinerary_version <> itinerary_context_row.itinerary_version
    or new.sequence_number not between 1 and itinerary_context_row.expected_insert_count
    or not new.is_active
    or new.retired_at is not null
    or new.retired_by is not null
    or new.schedule_status <> 'on_schedule'
    or itinerary_context_row.inserted_count >= itinerary_context_row.expected_insert_count
  then
    raise exception 'Ticket itinerary sector does not match its authorised replacement context'
      using errcode = '55000', hint = 'TICKETING_ITINERARY_INVARIANT_FAILED';
  end if;

  select transaction.* into root_transaction_row
  from public.ticket_transactions transaction
  where transaction.id = itinerary_context_row.root_transaction_id
    and transaction.booking_id = itinerary_context_row.booking_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null;

  if not found then
    raise exception 'Ticket itinerary must reference the booking root TK transaction'
      using errcode = '55000', hint = 'TICKETING_ITINERARY_INVARIANT_FAILED';
  end if;

  if not exists (
    select 1 from public.airlines airline
    where airline.id = new.airline_id and airline.is_active
  ) then
    raise exception 'Ticket itinerary airline is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRLINE_NOT_FOUND';
  end if;

  select airport.timezone into airport_timezone_value
  from public.ticket_airports airport
  where airport.iata_code = new.origin_airport_code and airport.is_active;
  if not found then
    raise exception 'Ticket itinerary origin airport is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
  end if;

  select airport.timezone into arrival_timezone_value
  from public.ticket_airports airport
  where airport.iata_code = new.destination_airport_code and airport.is_active;
  if not found then
    raise exception 'Ticket itinerary destination airport is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
  end if;

  derived_departure_utc := new.departure_local at time zone airport_timezone_value;
  if new.departure_timezone <> airport_timezone_value
    or new.departure_at_utc is distinct from derived_departure_utc
    or (derived_departure_utc at time zone airport_timezone_value) is distinct from new.departure_local
  then
    raise exception 'Ticket itinerary departure timezone or UTC value is invalid'
      using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_INVALID';
  end if;

  if new.arrival_local is null then
    if new.arrival_timezone is not null or new.arrival_at_utc is not null then
      raise exception 'Ticket itinerary arrival fields are inconsistent'
        using errcode = '22023', hint = 'TICKETING_ITINERARY_INVARIANT_FAILED';
    end if;
  else
    derived_arrival_utc := new.arrival_local at time zone arrival_timezone_value;
    if new.arrival_timezone <> arrival_timezone_value
      or new.arrival_at_utc is distinct from derived_arrival_utc
      or (derived_arrival_utc at time zone arrival_timezone_value) is distinct from new.arrival_local
      or derived_arrival_utc < derived_departure_utc
    then
      raise exception 'Ticket itinerary arrival timezone, UTC value, or chronology is invalid'
        using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_INVALID';
    end if;
  end if;

  update public.ticket_itinerary_write_contexts context
  set inserted_count = inserted_count + 1
  where context.id = itinerary_context_row.id;
  return new;
end
$$;

drop trigger if exists ticket_itinerary_sectors_guard_2602
  on public.ticket_itinerary_sectors;
drop trigger if exists ticket_itinerary_sectors_guard_2701
  on public.ticket_itinerary_sectors;
create trigger ticket_itinerary_sectors_guard_2701
  before insert or update or delete on public.ticket_itinerary_sectors
  for each row execute function public.guard_ticket_itinerary_sector_write_2026082701();

create or replace function public.ticketing_transition_schedule_change(
  p_actor_employee_id uuid,
  p_sector_id uuid,
  p_expected_itinerary_version bigint,
  p_idempotency_key text,
  p_action text,
  p_change_id uuid,
  p_proposal jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  action_name_value constant text := 'ticketing.transition_schedule_change.v1';
  allowed_proposal_keys constant text[] := array[
    'flightNumber', 'departureLocal', 'arrivalLocal'
  ];
  action_value text := lower(btrim(coalesce(p_action, '')));
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  reason_value text := nullif(btrim(p_reason), '');
  unknown_key text;
  flight_number_value text;
  departure_text_value text;
  arrival_text_value text;
  departure_local_value timestamp without time zone;
  arrival_local_value timestamp without time zone;
  departure_utc_value timestamptz;
  arrival_utc_value timestamptz;
  destination_timezone_value text;
  canonical_proposal jsonb;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_role_name text;
  actor_has_ticketing_department boolean := false;
  department_lock_row record;
  booking_id_value uuid;
  booking_row public.ticket_bookings%rowtype;
  sector_row public.ticket_itinerary_sectors%rowtype;
  root_transaction_row public.ticket_transactions%rowtype;
  mark_event_row public.ticket_schedule_events%rowtype;
  reviewed_event_row public.ticket_schedule_events%rowtype;
  current_schedule jsonb;
  proposed_schedule jsonb;
  desired_sectors jsonb;
  replacement_response jsonb;
  applied_sector jsonb;
  next_event_version integer;
  change_id_value uuid;
  event_id_value uuid := gen_random_uuid();
  current_status text;
  next_status text;
  context_id_value uuid := gen_random_uuid();
  context_row public.ticket_schedule_write_contexts%rowtype;
  event_type_value text;
  is_on_behalf_value boolean;
  replacement_reason text;
  response_sector_id uuid;
  response_itinerary_version bigint;
  response_value jsonb;
  now_value timestamptz := clock_timestamp();
begin
  if p_actor_employee_id is null then
    raise exception 'Authenticated Ticketing employee required' using errcode = '42501';
  end if;
  if p_sector_id is null then
    raise exception 'Flight sector not found'
      using errcode = 'P0002', hint = 'TICKETING_SECTOR_NOT_FOUND';
  end if;
  if p_expected_itinerary_version is null or p_expected_itinerary_version < 1 then
    raise exception 'A valid expected itinerary version is required' using errcode = '22023';
  end if;
  if action_value not in ('mark', 'review', 'finalise', 'dismiss') then
    raise exception 'Unsupported schedule-change action' using errcode = '22023';
  end if;
  if length(idempotency_key_value) not between 1 and 200 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  if reason_value is null or length(reason_value) > 500 then
    raise exception 'A schedule-change reason between 1 and 500 characters is required'
      using errcode = '22023', hint = 'TICKETING_SCHEDULE_REASON_REQUIRED';
  end if;

  if action_value = 'mark' then
    if p_change_id is not null
      or p_proposal is null
      or jsonb_typeof(p_proposal) is distinct from 'object'
    then
      raise exception 'A new schedule change requires only a proposal'
        using errcode = '22023';
    end if;

    select supplied.key into unknown_key
    from jsonb_object_keys(p_proposal) supplied(key)
    where supplied.key <> all (allowed_proposal_keys)
    limit 1;
    if found then
      raise exception 'Unknown schedule-change proposal field: %', unknown_key
        using errcode = '22023';
    end if;

    if not p_proposal ?& array['flightNumber', 'departureLocal']::text[]
      or jsonb_typeof(p_proposal -> 'flightNumber') is distinct from 'string'
      or jsonb_typeof(p_proposal -> 'departureLocal') is distinct from 'string'
      or (
        p_proposal ? 'arrivalLocal'
        and jsonb_typeof(p_proposal -> 'arrivalLocal') not in ('string', 'null')
      )
    then
      raise exception 'Schedule-change proposal fields are invalid' using errcode = '22023';
    end if;

    flight_number_value := upper(btrim(p_proposal ->> 'flightNumber'));
    departure_text_value := p_proposal ->> 'departureLocal';
    arrival_text_value := case
      when not p_proposal ? 'arrivalLocal'
        or jsonb_typeof(p_proposal -> 'arrivalLocal') = 'null'
      then null
      else p_proposal ->> 'arrivalLocal'
    end;

    if length(flight_number_value) not between 1 and 20
      or flight_number_value !~ '^[A-Z0-9][A-Z0-9 /-]*$'
    then
      raise exception 'Schedule-change flight number is invalid' using errcode = '22023';
    end if;

    begin
      if departure_text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then
        raise invalid_datetime_format;
      end if;
      departure_local_value := departure_text_value::timestamp(0) without time zone;
      if to_char(departure_local_value, 'YYYY-MM-DD"T"HH24:MI') <> left(departure_text_value, 16)
        or (length(departure_text_value) = 19 and
          to_char(departure_local_value, 'YYYY-MM-DD"T"HH24:MI:SS') <> departure_text_value)
      then
        raise invalid_datetime_format;
      end if;

      if arrival_text_value is not null then
        if arrival_text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then
          raise invalid_datetime_format;
        end if;
        arrival_local_value := arrival_text_value::timestamp(0) without time zone;
        if to_char(arrival_local_value, 'YYYY-MM-DD"T"HH24:MI') <> left(arrival_text_value, 16)
          or (length(arrival_text_value) = 19 and
            to_char(arrival_local_value, 'YYYY-MM-DD"T"HH24:MI:SS') <> arrival_text_value)
        then
          raise invalid_datetime_format;
        end if;
      else
        arrival_local_value := null;
      end if;

      if departure_local_value < timestamp '2000-01-01 00:00:00'
        or departure_local_value >= timestamp '2201-01-01 00:00:00'
        or (arrival_local_value is not null and (
          arrival_local_value < timestamp '2000-01-01 00:00:00'
          or arrival_local_value >= timestamp '2201-01-01 00:00:00'
        ))
      then
        raise datetime_field_overflow;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Schedule-change local times are invalid'
        using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_INVALID';
    end;

    canonical_proposal := jsonb_build_object(
      'flightNumber', flight_number_value,
      'departureLocal', to_char(departure_local_value, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'arrivalLocal', case when arrival_local_value is null then null
        else to_char(arrival_local_value, 'YYYY-MM-DD"T"HH24:MI:SS') end
    );
  else
    if p_change_id is null or p_proposal is not null then
      raise exception 'An existing schedule-change ID is required without a proposal'
        using errcode = '22023';
    end if;
    canonical_proposal := null;
  end if;

  canonical_request := jsonb_build_object(
    'sectorId', p_sector_id,
    'expectedItineraryVersion', p_expected_itinerary_version,
    'action', action_value,
    'changeId', p_change_id,
    'proposal', canonical_proposal,
    'reason', reason_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused for a different schedule change'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Schedule-change idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g')
  into actor_role_name
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for share of employee, role;
  if not found then
    raise exception 'Actor is not an active Ticketing employee' using errcode = '42501';
  end if;

  for department_lock_row in
    select membership.department_id, department.name
    from public.employee_departments membership
    join public.departments department on department.id = membership.department_id
    where membership.employee_id = p_actor_employee_id
    order by membership.department_id
    for share of membership, department
  loop
    if lower(btrim(department_lock_row.name)) = 'ticketing' then
      actor_has_ticketing_department := true;
    end if;
  end loop;

  if actor_role_name not in ('manager', 'admin', 'master admin', 'super admin')
    and not actor_has_ticketing_department
  then
    raise exception 'Actor is not an authorised Ticketing employee' using errcode = '42501';
  end if;

  select sector.booking_id into booking_id_value
  from public.ticket_itinerary_sectors sector
  where sector.id = p_sector_id;
  if not found then
    raise exception 'Flight sector not found'
      using errcode = 'P0002', hint = 'TICKETING_SECTOR_NOT_FOUND';
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = booking_id_value
  for update;
  if not found or booking_row.archived_at is not null or booking_row.operational_status <> 'issued' then
    raise exception 'Issued flight sector not found'
      using errcode = 'P0002', hint = 'TICKETING_SECTOR_NOT_FOUND';
  end if;

  select sector.* into sector_row
  from public.ticket_itinerary_sectors sector
  where sector.id = p_sector_id
  for update;
  if not found
    or sector_row.booking_id <> booking_row.id
    or not sector_row.is_active
    or sector_row.retired_at is not null
    or sector_row.itinerary_version <> p_expected_itinerary_version
  then
    raise exception 'Flight sector changed after it was loaded'
      using errcode = '40001', hint = 'TICKETING_ITINERARY_VERSION_CONFLICT';
  end if;

  select transaction.* into root_transaction_row
  from public.ticket_transactions transaction
  where transaction.id = sector_row.source_transaction_id
    and transaction.booking_id = booking_row.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  for share;
  if not found then
    raise exception 'Issued root TK sector not found'
      using errcode = 'P0002', hint = 'TICKETING_SECTOR_NOT_FOUND';
  end if;

  is_on_behalf_value := p_actor_employee_id <> booking_row.owner_employee_id;
  if action_value <> 'mark' and is_on_behalf_value
    and actor_role_name not in ('admin', 'master admin', 'super admin')
  then
    raise exception 'Only the responsible employee or an administrator can resolve a schedule change'
      using errcode = '42501', hint = 'TICKETING_SCHEDULE_ON_BEHALF_FORBIDDEN';
  end if;

  select airport.timezone into destination_timezone_value
  from public.ticket_airports airport
  where airport.iata_code = sector_row.destination_airport_code and airport.is_active
  for share;
  if not found then
    raise exception 'Destination airport is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
  end if;

  current_schedule := jsonb_build_object(
    'airlineId', sector_row.airline_id,
    'flightNumber', sector_row.flight_number,
    'originAirportCode', sector_row.origin_airport_code,
    'destinationAirportCode', sector_row.destination_airport_code,
    'departureLocal', to_char(sector_row.departure_local, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'departureTimezone', sector_row.departure_timezone,
    'departureAtUtc', sector_row.departure_at_utc,
    'arrivalLocal', case when sector_row.arrival_local is null then null
      else to_char(sector_row.arrival_local, 'YYYY-MM-DD"T"HH24:MI:SS') end,
    'arrivalTimezone', sector_row.arrival_timezone,
    'arrivalAtUtc', sector_row.arrival_at_utc,
    'sequenceNumber', sector_row.sequence_number,
    'itineraryVersion', sector_row.itinerary_version
  );

  if action_value = 'mark' then
    if sector_row.schedule_status <> 'on_schedule' then
      raise exception 'This sector already has an open schedule change'
        using errcode = '55000', hint = 'TICKETING_SCHEDULE_STATE_CONFLICT';
    end if;

    departure_utc_value := departure_local_value at time zone sector_row.departure_timezone;
    if (departure_utc_value at time zone sector_row.departure_timezone)
      is distinct from departure_local_value
    then
      raise exception 'Proposed departure time does not exist in the airport timezone'
        using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_GAP';
    end if;

    if arrival_local_value is not null then
      arrival_utc_value := arrival_local_value at time zone destination_timezone_value;
      if (arrival_utc_value at time zone destination_timezone_value)
          is distinct from arrival_local_value
        or arrival_utc_value < departure_utc_value
      then
        raise exception 'Proposed arrival time is invalid'
          using errcode = '22023', hint = 'TICKETING_ITINERARY_CHRONOLOGY_INVALID';
      end if;
    else
      arrival_utc_value := null;
    end if;

    proposed_schedule := current_schedule || jsonb_build_object(
      'flightNumber', flight_number_value,
      'departureLocal', canonical_proposal ->> 'departureLocal',
      'departureAtUtc', departure_utc_value,
      'arrivalLocal', canonical_proposal -> 'arrivalLocal',
      'arrivalTimezone', case when arrival_local_value is null then null
        else destination_timezone_value end,
      'arrivalAtUtc', arrival_utc_value
    );

    if jsonb_build_object(
      'flightNumber', current_schedule -> 'flightNumber',
      'departureLocal', current_schedule -> 'departureLocal',
      'arrivalLocal', current_schedule -> 'arrivalLocal'
    ) is not distinct from canonical_proposal
    then
      raise exception 'Proposed schedule is unchanged'
        using errcode = '22023', hint = 'TICKETING_SCHEDULE_UNCHANGED';
    end if;

    change_id_value := gen_random_uuid();
    next_event_version := 1;
    event_type_value := 'marked';
    current_status := 'on_schedule';
    next_status := 'change_marked';
  else
    change_id_value := p_change_id;
    select event.* into mark_event_row
    from public.ticket_schedule_events event
    where event.change_case_id = change_id_value
      and event.sector_id = sector_row.id
      and event.event_type = 'marked'
    for share;
    if not found then
      raise exception 'Schedule change not found'
        using errcode = 'P0002', hint = 'TICKETING_SCHEDULE_CHANGE_NOT_FOUND';
    end if;

    if exists (
      select 1 from public.ticket_schedule_events event
      where event.change_case_id = change_id_value
        and event.event_type in ('finalised', 'dismissed')
    ) then
      raise exception 'Schedule change is already closed'
        using errcode = '55000', hint = 'TICKETING_SCHEDULE_STATE_CONFLICT';
    end if;

    current_schedule := mark_event_row.previous_schedule;
    proposed_schedule := mark_event_row.proposed_schedule;
    select coalesce(max(event.event_version), 0) + 1 into next_event_version
    from public.ticket_schedule_events event
    where event.change_case_id = change_id_value;

    if action_value = 'review' then
      if sector_row.schedule_status <> 'change_marked' or next_event_version <> 2 then
        raise exception 'Schedule change is not ready for review'
          using errcode = '55000', hint = 'TICKETING_SCHEDULE_STATE_CONFLICT';
      end if;
      event_type_value := 'reviewed';
      current_status := 'change_marked';
      next_status := 'awaiting_finalisation';
    elsif action_value = 'dismiss' then
      if sector_row.schedule_status not in ('change_marked', 'awaiting_finalisation') then
        raise exception 'Schedule change cannot be dismissed from its current state'
          using errcode = '55000', hint = 'TICKETING_SCHEDULE_STATE_CONFLICT';
      end if;
      event_type_value := 'dismissed';
      current_status := sector_row.schedule_status;
      next_status := 'on_schedule';
    else
      select event.* into reviewed_event_row
      from public.ticket_schedule_events event
      where event.change_case_id = change_id_value and event.event_type = 'reviewed'
      for share;
      if not found or sector_row.schedule_status <> 'awaiting_finalisation' then
        raise exception 'Schedule change must be reviewed before finalisation'
          using errcode = '55000', hint = 'TICKETING_SCHEDULE_STATE_CONFLICT';
      end if;
      event_type_value := 'finalised';
      current_status := 'awaiting_finalisation';
      next_status := 'on_schedule';
    end if;
  end if;

  if action_value = 'finalise' then
    select jsonb_agg(
      jsonb_build_object(
        'airlineId', sector.airline_id,
        'flightNumber', case when sector.id = sector_row.id
          then proposed_schedule ->> 'flightNumber' else sector.flight_number end,
        'originAirportCode', sector.origin_airport_code,
        'destinationAirportCode', sector.destination_airport_code,
        'departureLocal', case when sector.id = sector_row.id
          then proposed_schedule ->> 'departureLocal'
          else to_char(sector.departure_local, 'YYYY-MM-DD"T"HH24:MI:SS') end,
        'arrivalLocal', case when sector.id = sector_row.id
          then proposed_schedule -> 'arrivalLocal'
          when sector.arrival_local is null then 'null'::jsonb
          else to_jsonb(to_char(sector.arrival_local, 'YYYY-MM-DD"T"HH24:MI:SS')) end
      ) order by sector.sequence_number
    ) into desired_sectors
    from public.ticket_itinerary_sectors sector
    where sector.booking_id = booking_row.id and sector.is_active;

    replacement_reason := case when is_on_behalf_value then reason_value else null end;
    perform set_config(
      'ticketing.schedule_finalisation_case_id',
      change_id_value::text,
      true
    );
    replacement_response := public.ticketing_replace_root_tk_itinerary(
      p_actor_employee_id,
      booking_row.id,
      p_expected_itinerary_version,
      idempotency_key_value,
      desired_sectors,
      replacement_reason
    );
    perform set_config('ticketing.schedule_finalisation_case_id', '', true);
    if replacement_response ->> 'changed' <> 'true' then
      raise exception 'Finalised schedule did not create an itinerary revision'
        using errcode = '55000', hint = 'TICKETING_SCHEDULE_INVARIANT_FAILED';
    end if;

    applied_sector := replacement_response -> 'sectors' -> (sector_row.sequence_number - 1);
    begin
      response_sector_id := (applied_sector ->> 'id')::uuid;
      response_itinerary_version := (replacement_response ->> 'itineraryVersion')::bigint;
    exception when invalid_text_representation then
      raise exception 'Itinerary replacement returned an invalid schedule result'
        using errcode = '55000', hint = 'TICKETING_SCHEDULE_INVARIANT_FAILED';
    end;
  else
    insert into public.ticket_schedule_write_contexts (
      id, sector_id, actor_employee_id, from_status, to_status
    ) values (
      context_id_value, sector_row.id, p_actor_employee_id, current_status, next_status
    );
    perform set_config('ticketing.schedule_context_id', context_id_value::text, true);
    update public.ticket_itinerary_sectors sector
    set schedule_status = next_status
    where sector.id = sector_row.id;

    select context.* into context_row
    from public.ticket_schedule_write_contexts context
    where context.id = context_id_value
    for update;
    if not found or not context_row.consumed then
      raise exception 'Schedule transition did not consume its write context'
        using errcode = '55000', hint = 'TICKETING_SCHEDULE_INVARIANT_FAILED';
    end if;
    delete from public.ticket_schedule_write_contexts context
    where context.id = context_id_value;
    perform set_config('ticketing.schedule_context_id', '', true);
    applied_sector := null;
    response_sector_id := sector_row.id;
    response_itinerary_version := sector_row.itinerary_version;
  end if;

  insert into public.ticket_schedule_events (
    id,
    sector_id,
    event_type,
    previous_schedule,
    proposed_schedule,
    actor_employee_id,
    reviewed_by,
    review_reason,
    created_at,
    reviewed_at,
    change_case_id,
    event_version
  ) values (
    event_id_value,
    sector_row.id,
    event_type_value,
    current_schedule,
    proposed_schedule,
    p_actor_employee_id,
    case when action_value = 'mark' then null else p_actor_employee_id end,
    reason_value,
    now_value,
    case when action_value = 'mark' then null else now_value end,
    change_id_value,
    next_event_version
  );

  response_value := jsonb_build_object(
    'action', action_value,
    'changeId', change_id_value,
    'eventId', event_id_value,
    'bookingId', booking_row.id,
    'priorSectorId', sector_row.id,
    'sectorId', response_sector_id,
    'itineraryVersion', response_itinerary_version,
    'scheduleStatus', next_status,
    'ownerEmployeeId', booking_row.owner_employee_id,
    'actingEmployeeId', p_actor_employee_id,
    'isOnBehalf', is_on_behalf_value,
    'appliedSector', applied_sector,
    'idempotentReplay', false
  );

  insert into public.ticket_idempotency_keys (
    action_name,
    actor_employee_id,
    idempotency_key,
    request_payload,
    response_payload,
    completed_at
  ) values (
    action_name_value,
    p_actor_employee_id,
    idempotency_key_value,
    canonical_request,
    response_value,
    clock_timestamp()
  );

  return response_value;
end
$$;

comment on function public.ticketing_transition_schedule_change(
  uuid, uuid, bigint, text, text, uuid, jsonb, text
) is
  'Service-only manual schedule-change state machine. Shared Ticketing staff may mark; only the responsible employee or reasoned administrator may review, finalise, or dismiss. Finalisation creates a new root itinerary revision and no Commission fact.';

create or replace view public.ticket_active_schedule_changes
with (security_invoker = true)
as
select
  marked.sector_id,
  marked.change_case_id,
  greatest(marked.event_version, coalesce(reviewed.event_version, 0)) as event_version,
  marked.proposed_schedule,
  marked.actor_employee_id as marked_by_employee_id,
  marked_actor.full_name as marked_by_employee_name,
  marked.created_at as marked_at,
  marked.review_reason as mark_reason,
  reviewed.actor_employee_id as reviewed_by_employee_id,
  reviewed_actor.full_name as reviewed_by_employee_name,
  reviewed.created_at as reviewed_at,
  reviewed.review_reason
from public.ticket_schedule_events marked
join public.employees marked_actor
  on marked_actor.id = marked.actor_employee_id
left join public.ticket_schedule_events reviewed
  on reviewed.change_case_id = marked.change_case_id
  and reviewed.event_type = 'reviewed'
left join public.employees reviewed_actor
  on reviewed_actor.id = reviewed.actor_employee_id
where marked.event_type = 'marked'
  and not exists (
    select 1
    from public.ticket_schedule_events terminal
    where terminal.change_case_id = marked.change_case_id
      and terminal.event_type in ('finalised', 'dismissed')
  );

comment on view public.ticket_active_schedule_changes is
  'Server-only operational projection of currently open manual schedule-change cases. Contains schedule and employee identity facts only; no financial or Commission values.';

revoke all on table public.ticket_active_schedule_changes
  from public, anon, authenticated, service_role;
grant select on table public.ticket_active_schedule_changes to service_role;

-- Schedule facts remain readable to the authenticated server route but can be
-- appended only inside the security-definer transition function.
drop policy if exists "Service role appends ticket_schedule_events"
  on public.ticket_schedule_events;
drop policy if exists "Service role reads ticket_schedule_events"
  on public.ticket_schedule_events;
create policy "Service role reads ticket_schedule_events"
  on public.ticket_schedule_events for select to service_role using (true);
revoke all on table public.ticket_schedule_events
  from public, anon, authenticated, service_role;
grant select on table public.ticket_schedule_events to service_role;

revoke all on function public.guard_ticket_itinerary_sector_write_2026082701()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_transition_schedule_change(
  uuid, uuid, bigint, text, text, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.ticketing_transition_schedule_change(
  uuid, uuid, bigint, text, text, uuid, jsonb, text
) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082701,
  now(),
  coalesce((
    select schema_version.details
    from public.portal_schema_versions schema_version
    where schema_version.component = 'ticketing'
  ), '{}'::jsonb) || jsonb_build_object(
    'migration', '20260827_ticketing_schedule_changes.sql',
    'capabilities', coalesce((
      select schema_version.details -> 'capabilities'
      from public.portal_schema_versions schema_version
      where schema_version.component = 'ticketing'
        and jsonb_typeof(schema_version.details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array(
      'manual-flight-schedule-change-cases',
      'owner-admin-schedule-finalisation',
      'schedule-finalisation-itinerary-revision'
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
      coalesce(schema_version.version >= 2026082701, false)
      and to_regprocedure('public.digest(text,text)') is not null
      and exists (
        select 1
        from pg_extension extension_row
        join pg_depend extension_member
          on extension_member.refclassid = 'pg_extension'::regclass
          and extension_member.refobjid = extension_row.oid
          and extension_member.classid = 'pg_proc'::regclass
          and extension_member.deptype = 'e'
        join pg_proc digest_procedure
          on digest_procedure.oid = extension_member.objid
          and digest_procedure.proname = 'digest'
          and digest_procedure.proargtypes = '25 25'::oidvector
        where extension_row.extname = 'pgcrypto'
      )
      and to_regclass('public.ticket_airports') is not null
      and to_regclass('public.ticket_schedule_write_contexts') is not null
      and to_regclass('public.ticket_active_schedule_changes') is not null
      and to_regprocedure(
        'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082701),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where schema_version.component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
