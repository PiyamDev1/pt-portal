-- Forward-only Ticketing capability 2026082802.
-- Adds admin-controlled amendments/deletion, quick-entry supplier snapshots,
-- and AeroDataBox usage/cadence tracking without storing provider secrets.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version > 2026082802 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082802, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
  if installed_version is null or installed_version < 2026082801 then
    raise exception 'Ticketing capability 2026082801 is required before capability 2026082802'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$guard$;

alter table public.ticket_bookings
  add column if not exists supplier_code text,
  add column if not exists supplier_name text;

update public.ticket_bookings
set supplier_code = coalesce(supplier_code, 'unknown'),
    supplier_name = coalesce(supplier_name, 'Not recorded')
where supplier_code is null or supplier_name is null;

-- The booking table has deferred package/attribution integrity triggers. Flush
-- those events before tightening the newly backfilled columns.
set constraints all immediate;

alter table public.ticket_bookings
  alter column supplier_code set default 'sabre_polani',
  alter column supplier_code set not null,
  alter column supplier_name set default 'Sabre Polani',
  alter column supplier_name set not null;

alter table public.ticket_bookings
  drop constraint if exists ticket_bookings_supplier_code_check;
alter table public.ticket_bookings
  add constraint ticket_bookings_supplier_code_check
  check (supplier_code in ('unknown', 'sabre_polani', 'amadeus_piyam', 'sabre_bt', 'ptap', 'airline'));

alter table public.ticket_bookings
  drop constraint if exists ticket_bookings_supplier_name_check;
alter table public.ticket_bookings
  add constraint ticket_bookings_supplier_name_check
  check (length(btrim(supplier_name)) between 1 and 200);

comment on column public.ticket_bookings.supplier_name is
  'Immutable-at-entry supplier display snapshot. Pre-capability rows remain Not recorded; airline suppliers are resolved server-side from the booking airline.';

alter table public.ticket_airports
  add column if not exists icao_code text,
  add column if not exists airport_type text,
  add column if not exists country_name text,
  add column if not exists region_code text,
  add column if not exists region_name text,
  add column if not exists latitude_deg double precision,
  add column if not exists longitude_deg double precision;

create table if not exists public.ticket_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  requested_by uuid not null references public.employees(id) on delete restrict,
  request_type text not null,
  request_notes text,
  status text not null default 'pending',
  reviewed_by uuid references public.employees(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_change_requests_type_check
    check (request_type in ('amendment', 'deletion')),
  constraint ticket_change_requests_notes_check
    check (
      (request_type = 'amendment' and length(btrim(request_notes)) between 1 and 1000)
      or (request_type = 'deletion' and (request_notes is null or length(btrim(request_notes)) <= 1000))
    ),
  constraint ticket_change_requests_status_check
    check (status in ('pending', 'fulfilled', 'rejected', 'cancelled')),
  constraint ticket_change_requests_review_check
    check (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
    )
);

create unique index if not exists ticket_change_requests_one_pending_idx
  on public.ticket_change_requests (booking_id, request_type)
  where status = 'pending';
create index if not exists ticket_change_requests_pending_created_idx
  on public.ticket_change_requests (created_at)
  where status = 'pending';

comment on table public.ticket_change_requests is
  'Staff requests for an administrator to amend or archive a Ticketing record. Deletion requests never require a free-text reason.';

create table if not exists public.ticket_flight_api_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  provider text not null default 'aerodatabox',
  monthly_limit integer not null default 600,
  weekly_interval_days integer not null default 7,
  predeparture_hours integer not null default 72,
  max_checks_per_run integer not null default 25,
  updated_by uuid references public.employees(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  constraint ticket_flight_api_settings_provider_check check (provider = 'aerodatabox'),
  constraint ticket_flight_api_settings_limit_check check (monthly_limit between 1 and 1000000),
  constraint ticket_flight_api_settings_weekly_check check (weekly_interval_days between 1 and 31),
  constraint ticket_flight_api_settings_predeparture_check check (predeparture_hours between 24 and 168),
  constraint ticket_flight_api_settings_batch_check check (max_checks_per_run between 1 and 100)
);

insert into public.ticket_flight_api_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.ticket_flight_api_sector_state (
  sector_id uuid primary key references public.ticket_itinerary_sectors(id) on delete restrict,
  last_weekly_checked_at timestamptz,
  predeparture_checked_at timestamptz,
  last_checked_at timestamptz,
  last_check_status text,
  last_provider_status text,
  last_provider_schedule jsonb,
  schedule_change_detected_at timestamptz,
  last_error text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint ticket_flight_api_sector_state_status_check
    check (last_check_status is null or last_check_status in ('matched', 'change_detected', 'not_found', 'failed')),
  constraint ticket_flight_api_sector_state_error_check
    check (last_error is null or length(last_error) <= 500)
);

create table if not exists public.ticket_flight_api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'aerodatabox',
  sector_id uuid references public.ticket_itinerary_sectors(id) on delete restrict,
  check_kind text not null,
  endpoint text not null,
  http_status integer,
  outcome text not null,
  units integer not null default 1,
  error_message text,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint ticket_flight_api_usage_provider_check check (provider = 'aerodatabox'),
  constraint ticket_flight_api_usage_kind_check check (check_kind in ('weekly', 'predeparture', 'manual')),
  constraint ticket_flight_api_usage_outcome_check
    check (outcome in ('started', 'matched', 'change_detected', 'not_found', 'failed', 'skipped')),
  constraint ticket_flight_api_usage_units_check check (units between 0 and 1000),
  constraint ticket_flight_api_usage_endpoint_check check (length(endpoint) between 1 and 500),
  constraint ticket_flight_api_usage_error_check
    check (error_message is null or length(error_message) <= 500)
);

create index if not exists ticket_flight_api_usage_requested_idx
  on public.ticket_flight_api_usage (requested_at desc);
create index if not exists ticket_flight_api_usage_month_provider_idx
  on public.ticket_flight_api_usage (provider, requested_at)
  where units > 0;

create or replace function public.ticketing_actor_is_admin_2026082802(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = p_employee_id
      and employee.is_active
      and regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g')
        in ('admin', 'master admin', 'super admin')
  )
$$;

create or replace function public.ticketing_import_airport_reference_2026082802(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare affected_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500
    or exists (
      select 1 from jsonb_array_elements(p_rows) item(value)
      where item.value ->> 'iataCode' !~ '^[A-Z]{3}$'
        or item.value ->> 'countryCode' !~ '^[A-Z]{2}$'
        or length(btrim(item.value ->> 'name')) not between 1 and 200
        or length(btrim(item.value ->> 'city')) not between 1 and 100
        or not public.is_valid_iana_timezone(item.value ->> 'timezone')
        or (item.value ->> 'latitudeDeg')::double precision not between -90 and 90
        or (item.value ->> 'longitudeDeg')::double precision not between -180 and 180
    )
  then
    raise exception 'Invalid airport import batch' using errcode = '22023';
  end if;

  insert into public.ticket_airports (
    iata_code, name, city, country_code, timezone, is_active, icao_code,
    airport_type, country_name, region_code, region_name,
    latitude_deg, longitude_deg, updated_at
  )
  select
    item.value ->> 'iataCode', btrim(item.value ->> 'name'), btrim(item.value ->> 'city'),
    item.value ->> 'countryCode', item.value ->> 'timezone', true,
    nullif(item.value ->> 'icaoCode', ''), nullif(item.value ->> 'airportType', ''),
    nullif(item.value ->> 'countryName', ''), nullif(item.value ->> 'regionCode', ''),
    nullif(item.value ->> 'regionName', ''),
    (item.value ->> 'latitudeDeg')::double precision,
    (item.value ->> 'longitudeDeg')::double precision,
    clock_timestamp()
  from jsonb_array_elements(p_rows) item(value)
  on conflict (iata_code) do update
  set name = excluded.name,
      city = excluded.city,
      country_code = excluded.country_code,
      timezone = excluded.timezone,
      is_active = true,
      icao_code = excluded.icao_code,
      airport_type = excluded.airport_type,
      country_name = excluded.country_name,
      region_code = excluded.region_code,
      region_name = excluded.region_name,
      latitude_deg = excluded.latitude_deg,
      longitude_deg = excluded.longitude_deg,
      updated_at = excluded.updated_at;
  get diagnostics affected_count = row_count;
  return affected_count;
end
$$;

create or replace function public.ticketing_import_airline_reference_2026082802(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare affected_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500
    or exists (
      select 1 from jsonb_array_elements(p_rows) item(value)
      where item.value ->> 'iataCode' !~ '^[A-Z0-9]{2}$'
        or length(btrim(item.value ->> 'name')) not between 1 and 200
    )
  then
    raise exception 'Invalid airline import batch' using errcode = '22023';
  end if;

  insert into public.airlines (iata_code, name, is_active, updated_at)
  select item.value ->> 'iataCode', btrim(item.value ->> 'name'), true, clock_timestamp()
  from jsonb_array_elements(p_rows) item(value)
  on conflict (iata_code) do update
  set name = excluded.name, is_active = true, updated_at = excluded.updated_at;
  get diagnostics affected_count = row_count;
  return affected_count;
end
$$;

create or replace function public.ticketing_create_quick_tk_supplied(
  p_actor_employee_id uuid,
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
  supplier_code_value text := nullif(btrim(p_entry ->> 'supplierCode'), '');
  supplier_name_value text;
  booking_id_value uuid;
  booking_row public.ticket_bookings%rowtype;
  response_value jsonb;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or supplier_code_value is null
    or supplier_code_value not in ('sabre_polani', 'amadeus_piyam', 'sabre_bt', 'ptap', 'airline')
  then
    raise exception 'A valid ticket supplier is required' using errcode = '22023';
  end if;

  supplier_name_value := case supplier_code_value
    when 'sabre_polani' then 'Sabre Polani'
    when 'amadeus_piyam' then 'Amadeus Piyam'
    when 'sabre_bt' then 'Sabre BT'
    when 'ptap' then 'PTAP'
    else null
  end;
  if supplier_code_value = 'airline' then
    select airline.name into supplier_name_value
    from public.airlines airline
    where airline.id = (p_entry ->> 'airlineId')::uuid
      and airline.is_active;
    if not found then
      raise exception 'The selected airline supplier is unavailable' using errcode = '22023';
    end if;
  end if;

  response_value := public.ticketing_create_quick_tk_priced(
    p_actor_employee_id,
    p_idempotency_key,
    p_entry - 'supplierCode'
  );
  booking_id_value := (response_value #>> '{booking,id}')::uuid;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = booking_id_value
  for update;

  if response_value ->> 'idempotentReplay' = 'true'
    and row(booking_row.supplier_code, booking_row.supplier_name)
      is distinct from row(supplier_code_value, supplier_name_value)
  then
    raise exception 'Idempotency key was reused with a different supplier'
      using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
  end if;

  if row(booking_row.supplier_code, booking_row.supplier_name)
    is distinct from row(supplier_code_value, supplier_name_value)
  then
    update public.ticket_bookings
    set supplier_code = supplier_code_value,
        supplier_name = supplier_name_value,
        updated_by = p_actor_employee_id
    where id = booking_id_value;

    insert into public.ticket_audit_events (
      entity_type, entity_id, booking_id, action, actor_employee_id,
      before_state, after_state
    ) values (
      'booking', booking_id_value, booking_id_value, 'ticket_supplier_recorded',
      p_actor_employee_id,
      jsonb_build_object('supplierCode', booking_row.supplier_code, 'supplierName', booking_row.supplier_name),
      jsonb_build_object('supplierCode', supplier_code_value, 'supplierName', supplier_name_value)
    );
  end if;

  return response_value || jsonb_build_object(
    'supplier', jsonb_build_object('code', supplier_code_value, 'name', supplier_name_value)
  );
end
$$;

create or replace function public.ticketing_request_booking_change(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_request_type text,
  p_request_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  request_row public.ticket_change_requests%rowtype;
  notes_value text := nullif(btrim(p_request_notes), '');
begin
  if p_actor_employee_id is null or p_booking_id is null
    or p_request_type not in ('amendment', 'deletion')
    or (p_request_type = 'amendment' and notes_value is null)
    or length(coalesce(notes_value, '')) > 1000
  then
    raise exception 'Invalid ticket change request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing.change-request.v1:' || p_booking_id::text || ':' || p_request_type,
    0
  ));

  perform 1 from public.employees employee
  where employee.id = p_actor_employee_id and employee.is_active
  for share;
  if not found then
    raise exception 'Active employee required' using errcode = '42501';
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
  for update;
  if not found or booking_row.archived_at is not null then
    raise exception 'Ticket booking not found' using errcode = 'P0002';
  end if;
  if booking_row.owner_employee_id <> p_actor_employee_id
    and not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id)
  then
    raise exception 'Only the responsible employee may request this ticket change'
      using errcode = '42501';
  end if;

  select request.* into request_row
  from public.ticket_change_requests request
  where request.booking_id = p_booking_id
    and request.request_type = p_request_type
    and request.status = 'pending'
  for update;
  if found then
    return jsonb_build_object('requestId', request_row.id, 'status', 'pending', 'idempotentReplay', true);
  end if;

  insert into public.ticket_change_requests (
    booking_id, requested_by, request_type, request_notes
  ) values (
    p_booking_id, p_actor_employee_id, p_request_type,
    case when p_request_type = 'deletion' then null else notes_value end
  ) returning * into request_row;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, action, actor_employee_id, before_state, after_state
  ) values (
    'booking', p_booking_id, p_booking_id, 'ticket_' || p_request_type || '_requested',
    p_actor_employee_id, '{}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object('requestId', request_row.id, 'notes', request_row.request_notes))
  );

  return jsonb_build_object('requestId', request_row.id, 'status', 'pending', 'idempotentReplay', false);
end
$$;

create or replace function public.ticketing_review_booking_change(
  p_actor_employee_id uuid,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare request_row public.ticket_change_requests%rowtype;
begin
  if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id) then
    raise exception 'Only an active administrator may review ticket changes' using errcode = '42501';
  end if;
  if p_request_id is null or p_status not in ('fulfilled', 'rejected') then
    raise exception 'Invalid ticket change review' using errcode = '22023';
  end if;

  select request.* into request_row
  from public.ticket_change_requests request
  where request.id = p_request_id
  for update;
  if not found then raise exception 'Ticket change request not found' using errcode = 'P0002'; end if;
  if request_row.status <> 'pending' then
    return jsonb_build_object('requestId', request_row.id, 'status', request_row.status, 'idempotentReplay', true);
  end if;

  update public.ticket_change_requests
  set status = p_status, reviewed_by = p_actor_employee_id, reviewed_at = clock_timestamp()
  where id = p_request_id;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, action, actor_employee_id, before_state, after_state
  ) values (
    'booking', request_row.booking_id, request_row.booking_id,
    'ticket_change_request_' || p_status, p_actor_employee_id,
    jsonb_build_object('requestId', request_row.id, 'status', 'pending'),
    jsonb_build_object('requestId', request_row.id, 'status', p_status)
  );
  return jsonb_build_object('requestId', request_row.id, 'status', p_status, 'idempotentReplay', false);
end
$$;

create or replace function public.ticketing_admin_correct_sale_prices(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_expected_booking_version bigint,
  p_expected_transaction_version bigint,
  p_idempotency_key text,
  p_fare_sales jsonb
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
  context_id_value uuid := gen_random_uuid();
  affected_count integer;
  sale_total_value numeric(14,2);
  before_fares jsonb;
  after_fares jsonb;
  source_event_row public.commission_source_events%rowtype;
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  response_value jsonb;
begin
  if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id) then
    raise exception 'Only an active administrator may correct ticket sale prices' using errcode = '42501';
  end if;
  if p_booking_id is null or length(idempotency_key_value) not between 1 and 200
    or jsonb_typeof(p_fare_sales) <> 'array'
    or jsonb_array_length(p_fare_sales) not between 1 and 4
    or exists (
      select 1 from jsonb_array_elements(p_fare_sales) item(value)
      where jsonb_typeof(item.value) <> 'object'
        or not item.value ?& array['passengerType', 'unitSalePrice']
        or item.value ->> 'passengerType' not in ('ADT', 'YTH', 'CHD', 'INF')
        or jsonb_typeof(item.value -> 'unitSalePrice') <> 'number'
        or (item.value ->> 'unitSalePrice')::numeric < 0
        or (item.value ->> 'unitSalePrice')::numeric > 99999999.99
        or scale((item.value ->> 'unitSalePrice')::numeric) > 2
    )
  then
    raise exception 'Invalid admin sale correction' using errcode = '22023';
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedBookingVersion', p_expected_booking_version,
    'expectedTransactionVersion', p_expected_transaction_version,
    'fareSales', p_fare_sales
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing.admin_correct_sale_prices.v1:' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));
  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = 'ticketing.admin_correct_sale_prices.v1'
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different sale correction'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id and booking.archived_at is null
  for update;
  if not found then raise exception 'Ticket booking not found' using errcode = 'P0002'; end if;

  select transaction.* into transaction_row
  from public.ticket_transactions transaction
  where transaction.booking_id = p_booking_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  for update;
  if not found then raise exception 'Ticket transaction not found' using errcode = 'P0002'; end if;

  if booking_row.version <> p_expected_booking_version
    or transaction_row.version <> p_expected_transaction_version
  then
    raise exception 'Ticket versions are stale'
      using errcode = '40001', hint = 'TICKETING_VERSION_CONFLICT',
        detail = jsonb_build_object('bookingVersion', booking_row.version, 'transactionVersion', transaction_row.version)::text;
  end if;

  select count(*)::integer,
    jsonb_agg(jsonb_build_object(
      'passengerType', fare.passenger_type,
      'unitSalePrice', fare.unit_sale_price_source
    ) order by fare.passenger_type)
  into affected_count, before_fares
  from public.ticket_passenger_fare_lines fare
  where fare.transaction_id = transaction_row.id;

  if affected_count <> jsonb_array_length(p_fare_sales)
    or exists (
      select 1 from public.ticket_passenger_fare_lines fare
      where fare.transaction_id = transaction_row.id
        and not exists (
          select 1 from jsonb_array_elements(p_fare_sales) item(value)
          where item.value ->> 'passengerType' = fare.passenger_type
        )
    )
  then
    raise exception 'Fare groups must exactly match the ticket' using errcode = '22023';
  end if;

  insert into public.ticket_initial_pricing_contexts (id, actor_employee_id, transaction_id)
  values (context_id_value, p_actor_employee_id, transaction_row.id);
  perform set_config('ticketing.initial_pricing_context_id', context_id_value::text, true);

  update public.ticket_passenger_fare_lines fare
  set unit_sale_price_source = (item.value ->> 'unitSalePrice')::numeric(14,2),
      unit_sale_price_gbp = (item.value ->> 'unitSalePrice')::numeric(14,2),
      unit_gross_sale_price_source = (item.value ->> 'unitSalePrice')::numeric(14,2) + fare.unit_discount_source,
      unit_gross_sale_price_gbp = (item.value ->> 'unitSalePrice')::numeric(14,2) + fare.unit_discount_gbp
  from jsonb_array_elements(p_fare_sales) item(value)
  where fare.transaction_id = transaction_row.id
    and fare.passenger_type = item.value ->> 'passengerType';

  select sum(fare.sale_total_source)::numeric(14,2),
    jsonb_agg(jsonb_build_object(
      'passengerType', fare.passenger_type,
      'unitSalePrice', fare.unit_sale_price_source
    ) order by fare.passenger_type)
  into sale_total_value, after_fares
  from public.ticket_passenger_fare_lines fare
  where fare.transaction_id = transaction_row.id;

  update public.ticket_transactions
  set sale_price_source = sale_total_value,
      sale_price_gbp = sale_total_value
  where id = transaction_row.id;

  select distinct on (source_event.source_fact_key) source_event.*
  into source_event_row
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key = 'transaction:' || transaction_row.id::text || ':issued'
  order by source_event.source_fact_key, source_event.event_version desc;
  if found then
    perform public.append_commission_source_event(jsonb_build_object(
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
      'occurred_at', clock_timestamp(),
      'effective_on', source_event_row.effective_on,
      'source_path', source_event_row.source_path,
      'variables', source_event_row.variables || jsonb_build_object(
        'sale_price_source', sale_total_value,
        'sale_price_gbp', sale_total_value,
        'fare_prices', after_fares,
        'admin_corrected_by', p_actor_employee_id
      ),
      'idempotency_key', 'admin-sale-correction:' || idempotency_key_value
    ));
  end if;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, action, actor_employee_id, before_state, after_state
  ) values (
    'transaction', transaction_row.id, p_booking_id, 'ticket_sale_price_admin_corrected',
    p_actor_employee_id,
    jsonb_build_object('fareSales', before_fares),
    jsonb_build_object('fareSales', after_fares, 'saleTotal', sale_total_value)
  );

  delete from public.ticket_initial_pricing_contexts where id = context_id_value;
  perform set_config('ticketing.initial_pricing_context_id', '', true);

  select booking.* into booking_row from public.ticket_bookings booking where booking.id = p_booking_id;
  select transaction.* into transaction_row from public.ticket_transactions transaction where transaction.id = transaction_row.id;
  response_value := jsonb_build_object(
    'bookingVersion', booking_row.version,
    'transactionVersion', transaction_row.version,
    'fareSales', after_fares,
    'saleTotal', sale_total_value,
    'idempotentReplay', false
  );
  insert into public.ticket_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload,
    response_payload, completed_at
  ) values (
    'ticketing.admin_correct_sale_prices.v1', p_actor_employee_id, idempotency_key_value,
    canonical_request, response_value, clock_timestamp()
  );
  return response_value;
end
$$;

-- Deletion is an administrator action. The HTTP boundary verifies a fresh
-- second factor; this database boundary independently enforces the admin role.
create or replace function public.ticketing_archive_booking(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  source_event_row public.commission_source_events%rowtype;
begin
  if p_actor_employee_id is null or p_booking_id is null then
    raise exception 'A booking is required' using errcode = '22023';
  end if;
  if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id) then
    raise exception 'Only an active administrator may delete a ticket' using errcode = '42501';
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
  for update;
  if not found then raise exception 'Ticket booking not found' using errcode = 'P0002'; end if;
  if booking_row.archived_at is not null then
    return jsonb_build_object('bookingId', p_booking_id, 'archived', true, 'idempotentReplay', true);
  end if;

  update public.ticket_bookings
  set archived_at = clock_timestamp(), updated_by = p_actor_employee_id
  where id = p_booking_id;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, action, actor_employee_id,
    before_state, after_state
  ) values (
    'booking', p_booking_id, p_booking_id, 'ticket_booking_archived', p_actor_employee_id,
    jsonb_build_object('archived_at', booking_row.archived_at),
    jsonb_build_object('archived_at', clock_timestamp(), 'freshSecondFactorVerified', true)
  );

  update public.ticket_change_requests
  set status = 'fulfilled', reviewed_by = p_actor_employee_id, reviewed_at = clock_timestamp()
  where booking_id = p_booking_id and request_type = 'deletion' and status = 'pending';

  for source_event_row in
    select distinct on (source_event.source_fact_key) source_event.*
    from public.commission_source_events source_event
    join public.ticket_transactions transaction on transaction.id = source_event.source_record_id
    where source_event.source_module = 'ticketing' and transaction.booking_id = p_booking_id
    order by source_event.source_fact_key, source_event.event_version desc
  loop
    perform public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', gen_random_uuid(),
      'source_fact_key', source_event_row.source_fact_key,
      'source_record_id', source_event_row.source_record_id,
      'event_type', 'ticket_entry_archived',
      'contract_version', source_event_row.contract_version,
      'event_version', source_event_row.event_version + 1,
      'supersedes_event_id', source_event_row.source_event_id,
      'employee_id', source_event_row.employee_id,
      'owner_employee_id', source_event_row.owner_employee_id,
      'location_id', source_event_row.location_id,
      'occurred_at', clock_timestamp(),
      'effective_on', current_date,
      'source_path', '/ticketing/ledger',
      'variables', source_event_row.variables || jsonb_build_object(
        'archived', true, 'issued_ticket_target_units', 0, 'assistant_target_units', 0
      ),
      'idempotency_key', 'archive:' || p_booking_id::text || ':' || source_event_row.id::text
    ));
  end loop;

  return jsonb_build_object('bookingId', p_booking_id, 'archived', true, 'idempotentReplay', false);
end
$$;

alter table public.ticket_change_requests enable row level security;
alter table public.ticket_flight_api_settings enable row level security;
alter table public.ticket_flight_api_sector_state enable row level security;
alter table public.ticket_flight_api_usage enable row level security;

revoke all on table public.ticket_change_requests, public.ticket_flight_api_settings,
  public.ticket_flight_api_sector_state, public.ticket_flight_api_usage
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.ticket_change_requests to service_role;
grant select, update on table public.ticket_flight_api_settings to service_role;
grant select, insert, update on table public.ticket_flight_api_sector_state to service_role;
grant select, insert, update on table public.ticket_flight_api_usage to service_role;

revoke all on function public.ticketing_actor_is_admin_2026082802(uuid),
  public.ticketing_import_airport_reference_2026082802(jsonb),
  public.ticketing_import_airline_reference_2026082802(jsonb),
  public.ticketing_create_quick_tk_supplied(uuid,text,jsonb),
  public.ticketing_request_booking_change(uuid,uuid,text,text),
  public.ticketing_review_booking_change(uuid,uuid,text),
  public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb),
  public.ticketing_archive_booking(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_create_quick_tk_supplied(uuid,text,jsonb),
  public.ticketing_import_airport_reference_2026082802(jsonb),
  public.ticketing_import_airline_reference_2026082802(jsonb),
  public.ticketing_request_booking_change(uuid,uuid,text,text),
  public.ticketing_review_booking_change(uuid,uuid,text),
  public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb),
  public.ticketing_archive_booking(uuid,uuid,text)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing', 2026082802, now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260828_ticketing_admin_requests_suppliers_api.sql',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'admin-controlled-ticket-amendments', 'fresh-auth-admin-ticket-archive',
        'staff-ticket-change-requests', 'ticket-supplier-snapshots',
        'flight-api-quota-tracking'
      )
    )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.ticketing_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready', coalesce(schema_version.version >= 2026082802, false)
      and to_regprocedure('public.ticketing_archive_booking(uuid,uuid,text)') is not null
      and to_regprocedure('public.ticketing_create_quick_tk_supplied(uuid,text,jsonb)') is not null
      and to_regprocedure('public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)') is not null
      and to_regprocedure('public.ticketing_request_booking_change(uuid,uuid,text,text)') is not null
      and to_regprocedure('public.ticketing_import_airport_reference_2026082802(jsonb)') is not null
      and to_regclass('public.ticket_flight_api_usage') is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082802),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
