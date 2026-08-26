-- Forward-only Ticketing capability 2026082602.
--
-- Adds a server-owned airport directory and a retry-safe replacement boundary
-- for a booking's current root-TK itinerary. Callers submit airport codes and
-- local wall-clock values only. The database derives trusted IANA zones and UTC
-- instants, rejects daylight-saving gaps, and retains every prior revision.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'ticketing:schema-migration',
  0
));

do $ticketing_itinerary_forward_guard$
declare
  installed_version bigint;
begin
  if pg_catalog.to_regclass('public.portal_schema_versions') is not null then
    execute
      'select version from public.portal_schema_versions where component = $1 for update'
      into installed_version
      using 'ticketing';
  end if;

  if installed_version > 2026082602 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082602, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082601 then
    raise exception 'Ticketing capability 2026082601 is required before root itinerary capability 2026082602'
      using
        errcode = '55000',
        hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_itinerary_forward_guard$;

-- Include all relations whose facts are used by the replacement authority or
-- whose rows are changed by it. This closes the scan-to-trigger handover on an
-- upgrade with existing itinerary rows.
lock table
  public.ticket_bookings,
  public.ticket_transactions,
  public.ticket_itinerary_sectors,
  public.ticket_idempotency_keys,
  public.ticket_audit_events
in share row exclusive mode;

do $ticketing_itinerary_post_lock_guard$
declare
  installed_version bigint;
begin
  select version
  into installed_version
  from public.portal_schema_versions
  where component = 'ticketing';

  if installed_version > 2026082602 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082602, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082601 then
    raise exception 'Ticketing capability 2026082601 is required before root itinerary capability 2026082602'
      using
        errcode = '55000',
        hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_itinerary_post_lock_guard$;

create table if not exists public.ticket_airports (
  iata_code text primary key,
  name text not null,
  city text not null,
  country_code text not null,
  timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint ticket_airports_iata_code_check
    check (iata_code ~ '^[A-Z]{3}$'),
  constraint ticket_airports_name_check
    check (length(btrim(name)) between 1 and 200),
  constraint ticket_airports_city_check
    check (length(btrim(city)) between 1 and 100),
  constraint ticket_airports_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint ticket_airports_timezone_check
    check (public.is_valid_iana_timezone(timezone))
);

comment on table public.ticket_airports is
  'Server-owned airport directory used to derive itinerary IANA zones and UTC instants. Clients never provide timezone or UTC values.';

insert into public.ticket_airports (
  iata_code,
  name,
  city,
  country_code,
  timezone
)
values
  ('LHR', 'Heathrow Airport', 'London', 'GB', 'Europe/London'),
  ('LGW', 'Gatwick Airport', 'London', 'GB', 'Europe/London'),
  ('STN', 'Stansted Airport', 'London', 'GB', 'Europe/London'),
  ('LTN', 'Luton Airport', 'London', 'GB', 'Europe/London'),
  ('MAN', 'Manchester Airport', 'Manchester', 'GB', 'Europe/London'),
  ('BHX', 'Birmingham Airport', 'Birmingham', 'GB', 'Europe/London'),
  ('EDI', 'Edinburgh Airport', 'Edinburgh', 'GB', 'Europe/London'),
  ('GLA', 'Glasgow Airport', 'Glasgow', 'GB', 'Europe/London'),
  ('ISB', 'Islamabad International Airport', 'Islamabad', 'PK', 'Asia/Karachi'),
  ('LHE', 'Allama Iqbal International Airport', 'Lahore', 'PK', 'Asia/Karachi'),
  ('KHI', 'Jinnah International Airport', 'Karachi', 'PK', 'Asia/Karachi'),
  ('SKT', 'Sialkot International Airport', 'Sialkot', 'PK', 'Asia/Karachi'),
  ('PEW', 'Bacha Khan International Airport', 'Peshawar', 'PK', 'Asia/Karachi'),
  ('MUX', 'Multan International Airport', 'Multan', 'PK', 'Asia/Karachi'),
  ('UET', 'Quetta International Airport', 'Quetta', 'PK', 'Asia/Karachi'),
  ('JED', 'King Abdulaziz International Airport', 'Jeddah', 'SA', 'Asia/Riyadh'),
  ('MED', 'Prince Mohammad bin Abdulaziz International Airport', 'Madinah', 'SA', 'Asia/Riyadh'),
  ('RUH', 'King Khalid International Airport', 'Riyadh', 'SA', 'Asia/Riyadh'),
  ('DMM', 'King Fahd International Airport', 'Dammam', 'SA', 'Asia/Riyadh'),
  ('IST', 'Istanbul Airport', 'Istanbul', 'TR', 'Europe/Istanbul'),
  ('SAW', 'Sabiha Gokcen International Airport', 'Istanbul', 'TR', 'Europe/Istanbul'),
  ('DXB', 'Dubai International Airport', 'Dubai', 'AE', 'Asia/Dubai'),
  ('DWC', 'Al Maktoum International Airport', 'Dubai', 'AE', 'Asia/Dubai'),
  ('AUH', 'Zayed International Airport', 'Abu Dhabi', 'AE', 'Asia/Dubai'),
  ('SHJ', 'Sharjah International Airport', 'Sharjah', 'AE', 'Asia/Dubai'),
  ('DOH', 'Hamad International Airport', 'Doha', 'QA', 'Asia/Qatar'),
  ('MCT', 'Muscat International Airport', 'Muscat', 'OM', 'Asia/Muscat'),
  ('KWI', 'Kuwait International Airport', 'Kuwait City', 'KW', 'Asia/Kuwait'),
  ('BAH', 'Bahrain International Airport', 'Manama', 'BH', 'Asia/Bahrain')
on conflict (iata_code) do update
set name = excluded.name,
    city = excluded.city,
    country_code = excluded.country_code,
    timezone = excluded.timezone,
    is_active = true,
    updated_at = clock_timestamp()
where row(
  ticket_airports.name,
  ticket_airports.city,
  ticket_airports.country_code,
  ticket_airports.timezone,
  ticket_airports.is_active
) is distinct from row(
  excluded.name,
  excluded.city,
  excluded.country_code,
  excluded.timezone,
  true
);

alter table public.ticket_itinerary_sectors
  add column if not exists itinerary_version bigint not null default 1,
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by uuid;

do $ticketing_itinerary_retired_by_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_itinerary_sectors'::regclass
      and conname = 'ticket_itinerary_sectors_retired_by_fkey'
  ) then
    alter table public.ticket_itinerary_sectors
      add constraint ticket_itinerary_sectors_retired_by_fkey
      foreign key (retired_by)
      references public.employees(id)
      on delete restrict;
  end if;
end
$ticketing_itinerary_retired_by_fk$;

-- Earlier capabilities could retain inactive rows without retirement metadata.
-- Preserve those rows and give them an explicit migration-safe retirement fact.
update public.ticket_itinerary_sectors sector
set retired_at = coalesce(sector.retired_at, sector.updated_at, sector.created_at),
    retired_by = coalesce(sector.retired_by, sector.created_by)
where not sector.is_active
  and (sector.retired_at is null or sector.retired_by is null);

do $ticketing_itinerary_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_itinerary_sectors'::regclass
      and conname = 'ticket_itinerary_sectors_version_check'
  ) then
    alter table public.ticket_itinerary_sectors
      add constraint ticket_itinerary_sectors_version_check
      check (itinerary_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_itinerary_sectors'::regclass
      and conname = 'ticket_itinerary_sectors_retirement_check'
  ) then
    alter table public.ticket_itinerary_sectors
      add constraint ticket_itinerary_sectors_retirement_check
      check (
        (is_active and retired_at is null and retired_by is null)
        or (not is_active and retired_at is not null and retired_by is not null)
      );
  end if;
end
$ticketing_itinerary_constraints$;

create index if not exists ticket_itinerary_sectors_booking_revision_idx
  on public.ticket_itinerary_sectors (
    booking_id,
    itinerary_version desc,
    sequence_number
  );

-- Ephemeral, unforgeable context for the only supported insert/update path.
-- No application role receives privileges on this relation.
create table if not exists public.ticket_itinerary_write_contexts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  root_transaction_id uuid not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  itinerary_version bigint not null,
  expected_retire_count integer not null,
  expected_insert_count integer not null,
  retired_count integer not null default 0,
  inserted_count integer not null default 0,
  changed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_itinerary_write_contexts_version_check
    check (itinerary_version > 0),
  constraint ticket_itinerary_write_contexts_counts_check
    check (
      expected_retire_count between 0 and 12
      and expected_insert_count between 1 and 12
      and retired_count between 0 and expected_retire_count
      and inserted_count between 0 and expected_insert_count
    ),
  constraint ticket_itinerary_write_contexts_root_booking_fkey
    foreign key (root_transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict
);

alter table public.ticket_itinerary_write_contexts enable row level security;
revoke all on table public.ticket_itinerary_write_contexts
  from public, anon, authenticated, service_role;

create or replace function public.guard_ticket_itinerary_sector_write_2026082602()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  context_id_value uuid;
  context_row public.ticket_itinerary_write_contexts%rowtype;
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
    context_id_value := nullif(
      current_setting('ticketing.itinerary_context_id', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    context_id_value := null;
  end;

  if context_id_value is null then
    raise exception 'Ticket itinerary changes require the authorised replacement boundary'
      using errcode = '42501', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
  end if;

  select context.*
  into context_row
  from public.ticket_itinerary_write_contexts context
  where context.id = context_id_value
  for update;

  if not found then
    raise exception 'Ticket itinerary write context is invalid'
      using errcode = '42501', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
  end if;

  if tg_op = 'UPDATE' then
    if old.booking_id <> context_row.booking_id
      or not old.is_active
      or new.is_active
      or new.retired_at is distinct from context_row.changed_at
      or new.retired_by is distinct from context_row.actor_employee_id
      or (
        to_jsonb(new) - array['is_active', 'retired_at', 'retired_by', 'updated_at']::text[]
      ) is distinct from (
        to_jsonb(old) - array['is_active', 'retired_at', 'retired_by', 'updated_at']::text[]
      )
      or context_row.retired_count >= context_row.expected_retire_count
    then
      raise exception 'Only retirement is allowed while replacing a ticket itinerary'
        using errcode = '55000', hint = 'TICKETING_ITINERARY_REPLACEMENT_REQUIRED';
    end if;

    update public.ticket_itinerary_write_contexts context
    set retired_count = retired_count + 1
    where context.id = context_row.id;

    return new;
  end if;

  if new.booking_id <> context_row.booking_id
    or new.source_transaction_id is distinct from context_row.root_transaction_id
    or new.created_by <> context_row.actor_employee_id
    or new.itinerary_version <> context_row.itinerary_version
    or new.sequence_number not between 1 and context_row.expected_insert_count
    or not new.is_active
    or new.retired_at is not null
    or new.retired_by is not null
    or new.schedule_status <> 'on_schedule'
    or context_row.inserted_count >= context_row.expected_insert_count
  then
    raise exception 'Ticket itinerary sector does not match its authorised replacement context'
      using errcode = '55000', hint = 'TICKETING_ITINERARY_INVARIANT_FAILED';
  end if;

  select transaction.*
  into root_transaction_row
  from public.ticket_transactions transaction
  where transaction.id = context_row.root_transaction_id
    and transaction.booking_id = context_row.booking_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null;

  if not found then
    raise exception 'Ticket itinerary must reference the booking root TK transaction'
      using errcode = '55000', hint = 'TICKETING_ITINERARY_INVARIANT_FAILED';
  end if;

  if not exists (
    select 1
    from public.airlines airline
    where airline.id = new.airline_id
      and airline.is_active
  ) then
    raise exception 'Ticket itinerary airline is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRLINE_NOT_FOUND';
  end if;

  select airport.timezone
  into airport_timezone_value
  from public.ticket_airports airport
  where airport.iata_code = new.origin_airport_code
    and airport.is_active;

  if not found then
    raise exception 'Ticket itinerary origin airport is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
  end if;

  select airport.timezone
  into arrival_timezone_value
  from public.ticket_airports airport
  where airport.iata_code = new.destination_airport_code
    and airport.is_active;

  if not found then
    raise exception 'Ticket itinerary destination airport is unavailable'
      using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
  end if;

  derived_departure_utc := new.departure_local at time zone airport_timezone_value;
  if new.departure_timezone <> airport_timezone_value
    or new.departure_at_utc is distinct from derived_departure_utc
    or (derived_departure_utc at time zone airport_timezone_value)
      is distinct from new.departure_local
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
      or (derived_arrival_utc at time zone arrival_timezone_value)
        is distinct from new.arrival_local
      or derived_arrival_utc < derived_departure_utc
    then
      raise exception 'Ticket itinerary arrival timezone, UTC value, or chronology is invalid'
        using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_INVALID';
    end if;
  end if;

  update public.ticket_itinerary_write_contexts context
  set inserted_count = inserted_count + 1
  where context.id = context_row.id;

  return new;
end
$$;

drop trigger if exists ticket_itinerary_sectors_guard_2602
  on public.ticket_itinerary_sectors;
create trigger ticket_itinerary_sectors_guard_2602
  before insert or update or delete on public.ticket_itinerary_sectors
  for each row execute function public.guard_ticket_itinerary_sector_write_2026082602();

create or replace function public.ticketing_replace_root_tk_itinerary(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_expected_itinerary_version bigint,
  p_idempotency_key text,
  p_sectors jsonb,
  p_on_behalf_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  allowed_sector_keys constant text[] := array[
    'airlineId',
    'flightNumber',
    'originAirportCode',
    'destinationAirportCode',
    'departureLocal',
    'arrivalLocal'
  ];
  required_sector_keys constant text[] := array[
    'flightNumber',
    'originAirportCode',
    'destinationAirportCode',
    'departureLocal'
  ];
  action_name_value constant text := 'ticketing.replace_root_tk_itinerary.v1';
  idempotency_key_value text;
  on_behalf_reason_value text;
  input_sector jsonb;
  unknown_key text;
  sequence_value integer;
  airline_id_value uuid;
  airline_code_value text;
  airline_name_value text;
  flight_number_value text;
  origin_code_value text;
  destination_code_value text;
  departure_text_value text;
  arrival_text_value text;
  departure_local_value timestamp without time zone;
  arrival_local_value timestamp without time zone;
  departure_timezone_value text;
  arrival_timezone_value text;
  departure_utc_value timestamptz;
  arrival_utc_value timestamptz;
  canonical_sectors jsonb := '[]'::jsonb;
  canonical_request jsonb;
  desired_sectors jsonb := '[]'::jsonb;
  desired_signature jsonb := '[]'::jsonb;
  current_signature jsonb := '[]'::jsonb;
  before_sectors jsonb := '[]'::jsonb;
  response_sectors jsonb := '[]'::jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_role_name text;
  actor_has_ticketing_department boolean := false;
  department_lock_row record;
  owner_employee_name_value text;
  default_airline_code_value text;
  default_airline_name_value text;
  booking_row public.ticket_bookings%rowtype;
  root_transaction_row public.ticket_transactions%rowtype;
  attribution_row public.ticket_booking_attribution_versions%rowtype;
  current_itinerary_version bigint;
  next_itinerary_version bigint;
  current_sector_count integer;
  is_on_behalf_value boolean;
  changed_value boolean;
  now_value timestamptz := clock_timestamp();
  context_id_value uuid := gen_random_uuid();
  context_row public.ticket_itinerary_write_contexts%rowtype;
  audit_event_id_value uuid;
  response_value jsonb;
begin
  if p_actor_employee_id is null then
    raise exception 'Authenticated Ticketing employee required'
      using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  if p_expected_itinerary_version is null or p_expected_itinerary_version < 0 then
    raise exception 'A valid expected itinerary version is required'
      using errcode = '22023';
  end if;

  idempotency_key_value := btrim(coalesce(p_idempotency_key, ''));
  if length(idempotency_key_value) not between 1 and 200 then
    raise exception 'A valid idempotency key is required'
      using errcode = '22023';
  end if;

  on_behalf_reason_value := nullif(btrim(p_on_behalf_reason), '');
  if on_behalf_reason_value is not null
    and length(on_behalf_reason_value) > 500
  then
    raise exception 'An on-behalf itinerary reason cannot exceed 500 characters'
      using errcode = '22023';
  end if;

  if p_sectors is null
    or jsonb_typeof(p_sectors) is distinct from 'array'
    or jsonb_array_length(p_sectors) not between 1 and 12
  then
    raise exception 'A ticket itinerary requires between 1 and 12 sectors'
      using errcode = '22023';
  end if;

  for input_sector, sequence_value in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(p_sectors) with ordinality item(value, ordinality)
    order by item.ordinality
  loop
    if jsonb_typeof(input_sector) is distinct from 'object' then
      raise exception 'Each ticket itinerary sector must be an object'
        using errcode = '22023';
    end if;

    select supplied.key
    into unknown_key
    from jsonb_object_keys(input_sector) supplied(key)
    where supplied.key <> all (allowed_sector_keys)
    limit 1;

    if found then
      raise exception 'Unknown ticket itinerary sector field: %', unknown_key
        using errcode = '22023';
    end if;

    if not input_sector ?& required_sector_keys
      or jsonb_typeof(input_sector -> 'flightNumber') is distinct from 'string'
      or jsonb_typeof(input_sector -> 'originAirportCode') is distinct from 'string'
      or jsonb_typeof(input_sector -> 'destinationAirportCode') is distinct from 'string'
      or jsonb_typeof(input_sector -> 'departureLocal') is distinct from 'string'
      or (
        input_sector ? 'airlineId'
        and jsonb_typeof(input_sector -> 'airlineId') not in ('string', 'null')
      )
      or (
        input_sector ? 'arrivalLocal'
        and jsonb_typeof(input_sector -> 'arrivalLocal') not in ('string', 'null')
      )
    then
      raise exception 'Ticket itinerary sector fields have invalid value types'
        using errcode = '22023';
    end if;

    begin
      airline_id_value := case
        when not input_sector ? 'airlineId'
          or jsonb_typeof(input_sector -> 'airlineId') = 'null'
        then null
        else (input_sector ->> 'airlineId')::uuid
      end;
    exception when invalid_text_representation then
      raise exception 'Ticket itinerary airline ID is invalid'
        using errcode = '22023';
    end;

    flight_number_value := upper(btrim(input_sector ->> 'flightNumber'));
    origin_code_value := upper(btrim(input_sector ->> 'originAirportCode'));
    destination_code_value := upper(btrim(input_sector ->> 'destinationAirportCode'));
    departure_text_value := input_sector ->> 'departureLocal';
    arrival_text_value := case
      when not input_sector ? 'arrivalLocal'
        or jsonb_typeof(input_sector -> 'arrivalLocal') = 'null'
      then null
      else input_sector ->> 'arrivalLocal'
    end;

    if length(flight_number_value) not between 1 and 20
      or flight_number_value !~ '^[A-Z0-9][A-Z0-9 /-]*$'
      or origin_code_value !~ '^[A-Z]{3}$'
      or destination_code_value !~ '^[A-Z]{3}$'
      or origin_code_value = destination_code_value
    then
      raise exception 'Ticket itinerary flight number or airport code is invalid'
        using errcode = '22023';
    end if;

    begin
      if departure_text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then
        raise invalid_datetime_format;
      end if;
      departure_local_value := departure_text_value::timestamp(0) without time zone;
      if to_char(departure_local_value, 'YYYY-MM-DD"T"HH24:MI')
          <> left(departure_text_value, 16)
        or (
          length(departure_text_value) = 19
          and to_char(departure_local_value, 'YYYY-MM-DD"T"HH24:MI:SS')
            <> departure_text_value
        )
      then
        raise invalid_datetime_format;
      end if;

      if arrival_text_value is not null then
        if arrival_text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then
          raise invalid_datetime_format;
        end if;
        arrival_local_value := arrival_text_value::timestamp(0) without time zone;
        if to_char(arrival_local_value, 'YYYY-MM-DD"T"HH24:MI')
            <> left(arrival_text_value, 16)
          or (
            length(arrival_text_value) = 19
            and to_char(arrival_local_value, 'YYYY-MM-DD"T"HH24:MI:SS')
              <> arrival_text_value
          )
        then
          raise invalid_datetime_format;
        end if;
      else
        arrival_local_value := null;
      end if;

      if departure_local_value < timestamp '2000-01-01 00:00:00'
        or departure_local_value >= timestamp '2201-01-01 00:00:00'
        or (
          arrival_local_value is not null
          and (
            arrival_local_value < timestamp '2000-01-01 00:00:00'
            or arrival_local_value >= timestamp '2201-01-01 00:00:00'
          )
        )
      then
        raise datetime_field_overflow;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ticket itinerary local times must be valid ISO local values between 2000 and 2200 without a timezone or UTC offset'
        using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_INVALID';
    end;

    canonical_sectors := canonical_sectors || jsonb_build_array(jsonb_build_object(
      'airlineId', airline_id_value,
      'flightNumber', flight_number_value,
      'originAirportCode', origin_code_value,
      'destinationAirportCode', destination_code_value,
      'departureLocal', to_char(departure_local_value, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'arrivalLocal', case when arrival_local_value is null then null
        else to_char(arrival_local_value, 'YYYY-MM-DD"T"HH24:MI:SS') end
    ));
  end loop;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedItineraryVersion', p_expected_itinerary_version,
    'sectors', canonical_sectors,
    'onBehalfReason', on_behalf_reason_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  -- Replay is intentionally before active-employee, role, ownership, airport,
  -- airline, booking-state, and current-version checks. A committed response
  -- remains retryable even if any of those mutable facts changed afterward.
  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different ticket itinerary'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Ticket itinerary idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g')
  into actor_role_name
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id
    and employee.is_active
  for share of employee, role;

  if not found then
    raise exception 'Actor is not an active Ticketing employee'
      using errcode = '42501';
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
    raise exception 'Actor is not an active authorised Ticketing employee'
      using errcode = '42501';
  end if;

  select booking.*
  into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
  for update;

  if not found
    or booking_row.archived_at is not null
    or booking_row.operational_status not in ('held', 'issued')
  then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  select owner_employee.full_name, airline.iata_code, airline.name
  into
    owner_employee_name_value,
    default_airline_code_value,
    default_airline_name_value
  from public.employees owner_employee
  join public.airlines airline on airline.id = booking_row.airline_id
  where owner_employee.id = booking_row.owner_employee_id
  for share of owner_employee, airline;

  if not found then
    raise exception 'Ticket owner or default airline requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  select transaction.*
  into root_transaction_row
  from public.ticket_transactions transaction
  where transaction.booking_id = booking_row.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  for update;

  if not found
    or root_transaction_row.owner_employee_id <> booking_row.owner_employee_id
  then
    raise exception 'Ticket root ownership requires an audited attribution correction'
      using errcode = '55000', hint = 'TICKETING_ATTRIBUTION_CORRECTION_REQUIRED';
  end if;

  select attribution.*
  into attribution_row
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = booking_row.id
  order by attribution.attribution_version desc
  limit 1
  for share;

  if not found
    or attribution_row.root_transaction_id <> root_transaction_row.id
    or attribution_row.primary_employee_id <> booking_row.owner_employee_id
  then
    raise exception 'Ticket root ownership requires an audited attribution correction'
      using errcode = '55000', hint = 'TICKETING_ATTRIBUTION_CORRECTION_REQUIRED';
  end if;

  is_on_behalf_value := p_actor_employee_id <> booking_row.owner_employee_id;
  if is_on_behalf_value then
    if actor_role_name not in ('admin', 'master admin', 'super admin') then
      raise exception 'Only an administrator can replace another employee''s ticket itinerary'
        using errcode = '42501', hint = 'TICKETING_ON_BEHALF_FORBIDDEN';
    end if;
    if on_behalf_reason_value is null then
      raise exception 'An on-behalf itinerary reason is required'
        using errcode = '22023', hint = 'TICKETING_ON_BEHALF_REASON_REQUIRED';
    end if;
  elsif on_behalf_reason_value is not null then
    raise exception 'An on-behalf reason is not allowed for a self itinerary replacement'
      using errcode = '22023', hint = 'TICKETING_ON_BEHALF_REASON_NOT_ALLOWED';
  end if;

  perform 1
  from public.ticket_itinerary_sectors sector
  where sector.booking_id = booking_row.id
  order by sector.itinerary_version, sector.sequence_number, sector.id
  for update;

  select
    coalesce(max(sector.itinerary_version), 0),
    count(*) filter (where sector.is_active)::integer
  into current_itinerary_version, current_sector_count
  from public.ticket_itinerary_sectors sector
  where sector.booking_id = booking_row.id;

  if current_itinerary_version <> p_expected_itinerary_version then
    raise exception 'Ticket itinerary version is stale'
      using
        errcode = '40001',
        detail = jsonb_build_object(
          'itineraryVersion', current_itinerary_version
        )::text,
        hint = 'TICKETING_ITINERARY_VERSION_CONFLICT';
  end if;

  if current_sector_count > 12 then
    raise exception 'Existing ticket itinerary requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'airlineId', sector.airline_id,
    'flightNumber', sector.flight_number,
    'originAirportCode', sector.origin_airport_code,
    'destinationAirportCode', sector.destination_airport_code,
    'departureLocal', to_char(sector.departure_local, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'arrivalLocal', case when sector.arrival_local is null then null
      else to_char(sector.arrival_local, 'YYYY-MM-DD"T"HH24:MI:SS') end
  ) order by sector.sequence_number), '[]'::jsonb)
  into current_signature
  from public.ticket_itinerary_sectors sector
  where sector.booking_id = booking_row.id
    and sector.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sector.id,
    'sequenceNumber', sector.sequence_number,
    'itineraryVersion', sector.itinerary_version,
    'airlineId', sector.airline_id,
    'airlineCode', airline.iata_code,
    'airlineName', airline.name,
    'flightNumber', sector.flight_number,
    'originAirportCode', sector.origin_airport_code,
    'originTimezone', sector.departure_timezone,
    'destinationAirportCode', sector.destination_airport_code,
    'destinationTimezone', destination_airport.timezone,
    'departureLocal', to_char(sector.departure_local, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'departureAtUtc', sector.departure_at_utc,
    'arrivalLocal', case when sector.arrival_local is null then null
      else to_char(sector.arrival_local, 'YYYY-MM-DD"T"HH24:MI:SS') end,
    'arrivalAtUtc', sector.arrival_at_utc,
    'scheduleStatus', sector.schedule_status,
    'createdByEmployeeId', sector.created_by
  ) order by sector.sequence_number), '[]'::jsonb)
  into before_sectors
  from public.ticket_itinerary_sectors sector
  join public.airlines airline on airline.id = sector.airline_id
  join public.ticket_airports destination_airport
    on destination_airport.iata_code = sector.destination_airport_code
  where sector.booking_id = booking_row.id
    and sector.is_active;

  for input_sector, sequence_value in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(canonical_sectors) with ordinality item(value, ordinality)
    order by item.ordinality
  loop
    airline_id_value := coalesce(
      (input_sector ->> 'airlineId')::uuid,
      booking_row.airline_id
    );

    select airline.iata_code, airline.name
    into airline_code_value, airline_name_value
    from public.airlines airline
    where airline.id = airline_id_value
      and airline.is_active
    for share;

    if not found then
      raise exception 'Ticket itinerary airline is unavailable'
        using errcode = '22023', hint = 'TICKETING_AIRLINE_NOT_FOUND';
    end if;

    origin_code_value := input_sector ->> 'originAirportCode';
    destination_code_value := input_sector ->> 'destinationAirportCode';
    departure_local_value := (input_sector ->> 'departureLocal')::timestamp without time zone;
    arrival_local_value := (input_sector ->> 'arrivalLocal')::timestamp without time zone;

    select airport.timezone
    into departure_timezone_value
    from public.ticket_airports airport
    where airport.iata_code = origin_code_value
      and airport.is_active
    for share;

    if not found then
      raise exception 'Ticket itinerary origin airport is unavailable: %', origin_code_value
        using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
    end if;

    select airport.timezone
    into arrival_timezone_value
    from public.ticket_airports airport
    where airport.iata_code = destination_code_value
      and airport.is_active
    for share;

    if not found then
      raise exception 'Ticket itinerary destination airport is unavailable: %', destination_code_value
        using errcode = '22023', hint = 'TICKETING_AIRPORT_NOT_FOUND';
    end if;

    -- PostgreSQL resolves an ambiguous overlap to its later, standard-time UTC
    -- instant. The round-trip check accepts that deterministic interpretation
    -- but rejects a nonexistent spring-forward wall-clock value.
    departure_utc_value := departure_local_value at time zone departure_timezone_value;
    if (departure_utc_value at time zone departure_timezone_value)
      is distinct from departure_local_value
    then
      raise exception 'Ticket itinerary departure local time does not exist in the airport timezone'
        using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_GAP';
    end if;

    if arrival_local_value is not null then
      arrival_utc_value := arrival_local_value at time zone arrival_timezone_value;
      if (arrival_utc_value at time zone arrival_timezone_value)
        is distinct from arrival_local_value
      then
        raise exception 'Ticket itinerary arrival local time does not exist in the airport timezone'
          using errcode = '22023', hint = 'TICKETING_LOCAL_TIME_GAP';
      end if;
      if arrival_utc_value < departure_utc_value then
        raise exception 'Ticket itinerary arrival cannot be before departure'
          using errcode = '22023', hint = 'TICKETING_ITINERARY_CHRONOLOGY_INVALID';
      end if;
    else
      arrival_utc_value := null;
    end if;

    desired_signature := desired_signature || jsonb_build_array(jsonb_build_object(
      'airlineId', airline_id_value,
      'flightNumber', input_sector ->> 'flightNumber',
      'originAirportCode', origin_code_value,
      'destinationAirportCode', destination_code_value,
      'departureLocal', input_sector ->> 'departureLocal',
      'arrivalLocal', input_sector ->> 'arrivalLocal'
    ));

    desired_sectors := desired_sectors || jsonb_build_array(jsonb_build_object(
      'sequenceNumber', sequence_value,
      'airlineId', airline_id_value,
      'airlineCode', airline_code_value,
      'airlineName', airline_name_value,
      'flightNumber', input_sector ->> 'flightNumber',
      'originAirportCode', origin_code_value,
      'originTimezone', departure_timezone_value,
      'destinationAirportCode', destination_code_value,
      'destinationTimezone', arrival_timezone_value,
      'departureLocal', input_sector ->> 'departureLocal',
      'departureAtUtc', departure_utc_value,
      'arrivalLocal', input_sector ->> 'arrivalLocal',
      'arrivalAtUtc', arrival_utc_value
    ));
  end loop;

  changed_value := current_signature is distinct from desired_signature;
  next_itinerary_version := current_itinerary_version;

  if changed_value then
    next_itinerary_version := current_itinerary_version + 1;

    insert into public.ticket_itinerary_write_contexts (
      id,
      booking_id,
      root_transaction_id,
      actor_employee_id,
      itinerary_version,
      expected_retire_count,
      expected_insert_count,
      changed_at
    ) values (
      context_id_value,
      booking_row.id,
      root_transaction_row.id,
      p_actor_employee_id,
      next_itinerary_version,
      current_sector_count,
      jsonb_array_length(desired_sectors),
      now_value
    );

    perform set_config(
      'ticketing.itinerary_context_id',
      context_id_value::text,
      true
    );

    update public.ticket_itinerary_sectors sector
    set is_active = false,
        retired_at = now_value,
        retired_by = p_actor_employee_id
    where sector.booking_id = booking_row.id
      and sector.is_active;

    for input_sector in
      select item.value
      from jsonb_array_elements(desired_sectors) item(value)
      order by (item.value ->> 'sequenceNumber')::integer
    loop
      insert into public.ticket_itinerary_sectors (
        booking_id,
        source_transaction_id,
        sequence_number,
        airline_id,
        flight_number,
        origin_airport_code,
        destination_airport_code,
        departure_local,
        departure_timezone,
        departure_at_utc,
        arrival_local,
        arrival_timezone,
        arrival_at_utc,
        schedule_status,
        is_active,
        created_by,
        itinerary_version
      ) values (
        booking_row.id,
        root_transaction_row.id,
        (input_sector ->> 'sequenceNumber')::integer,
        (input_sector ->> 'airlineId')::uuid,
        input_sector ->> 'flightNumber',
        input_sector ->> 'originAirportCode',
        input_sector ->> 'destinationAirportCode',
        (input_sector ->> 'departureLocal')::timestamp without time zone,
        input_sector ->> 'originTimezone',
        (input_sector ->> 'departureAtUtc')::timestamptz,
        (input_sector ->> 'arrivalLocal')::timestamp without time zone,
        case when input_sector ->> 'arrivalLocal' is null then null
          else input_sector ->> 'destinationTimezone' end,
        (input_sector ->> 'arrivalAtUtc')::timestamptz,
        'on_schedule',
        true,
        p_actor_employee_id,
        next_itinerary_version
      );
    end loop;

    select context.*
    into context_row
    from public.ticket_itinerary_write_contexts context
    where context.id = context_id_value
    for update;

    if not found
      or context_row.retired_count <> context_row.expected_retire_count
      or context_row.inserted_count <> context_row.expected_insert_count
    then
      raise exception 'Ticket itinerary replacement did not consume its complete write context'
        using errcode = '55000', hint = 'TICKETING_ITINERARY_INVARIANT_FAILED';
    end if;

    delete from public.ticket_itinerary_write_contexts context
    where context.id = context_id_value;
    perform set_config('ticketing.itinerary_context_id', '', true);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', sector.id,
      'sequenceNumber', sector.sequence_number,
      'itineraryVersion', sector.itinerary_version,
      'airlineId', sector.airline_id,
      'airlineCode', airline.iata_code,
      'airlineName', airline.name,
      'flightNumber', sector.flight_number,
      'originAirportCode', sector.origin_airport_code,
      'originTimezone', sector.departure_timezone,
      'destinationAirportCode', sector.destination_airport_code,
      'destinationTimezone', destination_airport.timezone,
      'departureLocal', to_char(sector.departure_local, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'departureAtUtc', sector.departure_at_utc,
      'arrivalLocal', case when sector.arrival_local is null then null
        else to_char(sector.arrival_local, 'YYYY-MM-DD"T"HH24:MI:SS') end,
      'arrivalAtUtc', sector.arrival_at_utc,
      'scheduleStatus', sector.schedule_status,
      'createdByEmployeeId', sector.created_by
    ) order by sector.sequence_number), '[]'::jsonb)
    into response_sectors
    from public.ticket_itinerary_sectors sector
    join public.airlines airline on airline.id = sector.airline_id
    join public.ticket_airports destination_airport
      on destination_airport.iata_code = sector.destination_airport_code
    where sector.booking_id = booking_row.id
      and sector.is_active;

    audit_event_id_value := gen_random_uuid();
    insert into public.ticket_audit_events (
      id,
      entity_type,
      entity_id,
      booking_id,
      transaction_id,
      action,
      actor_employee_id,
      reason,
      before_state,
      after_state,
      created_at
    ) values (
      audit_event_id_value,
      'booking',
      booking_row.id,
      booking_row.id,
      root_transaction_row.id,
      case when is_on_behalf_value
        then 'replace_root_tk_itinerary_on_behalf'
        else 'replace_root_tk_itinerary'
      end,
      p_actor_employee_id,
      on_behalf_reason_value,
      jsonb_build_object(
        'itinerary_version', current_itinerary_version,
        'owner_employee_id', booking_row.owner_employee_id,
        'sectors', before_sectors
      ),
      jsonb_build_object(
        'itinerary_version', next_itinerary_version,
        'owner_employee_id', booking_row.owner_employee_id,
        'acting_employee_id', p_actor_employee_id,
        'replacement_mode', case when is_on_behalf_value then 'on_behalf' else 'self' end,
        'sectors', response_sectors
      ),
      now_value
    );
  else
    response_sectors := before_sectors;
  end if;

  response_value := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking_row.id,
      'version', booking_row.version,
      'ownerEmployeeId', booking_row.owner_employee_id,
      'ownerEmployeeName', owner_employee_name_value,
      'pnr', booking_row.pnr,
      'customerName', booking_row.customer_name,
      'operationalStatus', booking_row.operational_status,
      'defaultAirline', jsonb_build_object(
        'id', booking_row.airline_id,
        'iataCode', default_airline_code_value,
        'name', default_airline_name_value
      )
    ),
    'rootTransaction', jsonb_build_object(
      'id', root_transaction_row.id
    ),
    'itineraryVersion', next_itinerary_version,
    'sectors', response_sectors,
    'auditEventId', audit_event_id_value,
    'changed', changed_value,
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

comment on function public.ticketing_replace_root_tk_itinerary(
  uuid,
  uuid,
  bigint,
  text,
  jsonb,
  text
) is
  'Service-only, idempotent root-TK itinerary replacement. Derives airport timezones and UTC, uses a dedicated monotonic itinerary version, retains history, and requires a reason for administrator cover.';

-- Airport lookup is server-route-only. Itinerary history is readable by the
-- service role, while every write must go through the security-definer RPC.
alter table public.ticket_airports enable row level security;
drop policy if exists "Service role reads ticket airports"
  on public.ticket_airports;
create policy "Service role reads ticket airports"
  on public.ticket_airports for select to service_role using (true);
revoke all on table public.ticket_airports
  from public, anon, authenticated, service_role;
grant select on table public.ticket_airports to service_role;

drop policy if exists "Service role manages ticket_itinerary_sectors"
  on public.ticket_itinerary_sectors;
drop policy if exists "Service role reads ticket itinerary sectors"
  on public.ticket_itinerary_sectors;
create policy "Service role reads ticket itinerary sectors"
  on public.ticket_itinerary_sectors for select to service_role using (true);
revoke all on table public.ticket_itinerary_sectors
  from public, anon, authenticated, service_role;
grant select on table public.ticket_itinerary_sectors to service_role;

revoke all on function public.guard_ticket_itinerary_sector_write_2026082602()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_replace_root_tk_itinerary(
  uuid,
  uuid,
  bigint,
  text,
  jsonb,
  text
) from public, anon, authenticated;
grant execute on function public.ticketing_replace_root_tk_itinerary(
  uuid,
  uuid,
  bigint,
  text,
  jsonb,
  text
) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082602,
  now(),
  coalesce(
    (
      select schema_version.details
      from public.portal_schema_versions schema_version
      where schema_version.component = 'ticketing'
    ),
    '{}'::jsonb
  ) || jsonb_build_object(
    'migration', '20260826_ticketing_sector_itinerary.sql',
    'capabilities', coalesce(
      (
        select schema_version.details -> 'capabilities'
        from public.portal_schema_versions schema_version
        where schema_version.component = 'ticketing'
          and jsonb_typeof(schema_version.details -> 'capabilities') = 'array'
      ),
      '[]'::jsonb
    ) || jsonb_build_array(
      'server-owned-airport-directory',
      'server-derived-itinerary-timezones',
      'versioned-root-tk-itinerary-replacement',
      'reasoned-itinerary-on-behalf-audit'
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
      coalesce(schema_version.version >= 2026082602, false)
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
      and to_regprocedure(
        'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082602),
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
