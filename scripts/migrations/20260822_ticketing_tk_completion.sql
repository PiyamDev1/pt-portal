-- Atomic, retry-safe completion of an existing agent-owned TK record.
--
-- Quick entry deliberately captures only the minimum operational facts. This
-- migration adds stable passenger-slot identity and one server-only operation
-- for adding contact, journey dates, grouped sale values, payment state and
-- passenger details without exposing direct table writes to staff clients.

begin;

do $ticketing_forward_guard$
declare
  installed_version bigint;
begin
  if pg_catalog.to_regclass('public.portal_schema_versions') is not null then
    execute
      'select version from public.portal_schema_versions where component = $1'
      into installed_version
      using 'ticketing';
  end if;

  if installed_version > 2026082202 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082202, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_forward_guard$;

alter table public.ticket_transaction_passengers
  add column if not exists position integer;

-- Deterministically identify any allocations created before positions existed.
with ranked as (
  select
    allocation.id,
    row_number() over (
      partition by allocation.transaction_id, allocation.fare_line_id
      order by allocation.created_at, allocation.id
    )::integer as position
  from public.ticket_transaction_passengers allocation
  where allocation.position is null
)
update public.ticket_transaction_passengers allocation
set position = ranked.position
from ranked
where allocation.id = ranked.id;

-- Every allocation needs a durable slot identity. Keeping this nullable would
-- allow legacy/manual rows to bypass the slot uniqueness contract.
alter table public.ticket_transaction_passengers
  alter column position set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_transaction_passengers'::regclass
      and conname = 'ticket_transaction_passengers_position_check'
      and pg_get_constraintdef(oid) ilike '%position is null%'
  ) then
    alter table public.ticket_transaction_passengers
      drop constraint ticket_transaction_passengers_position_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_transaction_passengers'::regclass
      and conname = 'ticket_transaction_passengers_position_check'
  ) then
    alter table public.ticket_transaction_passengers
      add constraint ticket_transaction_passengers_position_check
      check (position between 1 and 99) not valid;
  end if;
end
$$;

alter table public.ticket_transaction_passengers
  validate constraint ticket_transaction_passengers_position_check;

-- These named constraints belong to this migration. Converge an earlier draft
-- to the API's exact 1..50 nonblank contract, but leave an already-correct
-- rerun untouched and do not validate unrelated legacy phone rows.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_bookings'::regclass
      and conname = 'ticket_bookings_contact_phone_check'
      and pg_get_constraintdef(oid) like '%>= 1%'
      and pg_get_constraintdef(oid) like '%<= 50%'
  ) then
    alter table public.ticket_bookings
      drop constraint if exists ticket_bookings_contact_phone_check;
    alter table public.ticket_bookings
      add constraint ticket_bookings_contact_phone_check
      check (
        contact_phone is null
        or length(btrim(contact_phone)) between 1 and 50
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ticket_passengers'::regclass
      and conname = 'ticket_passengers_contact_phone_check'
      and pg_get_constraintdef(oid) like '%>= 1%'
      and pg_get_constraintdef(oid) like '%<= 50%'
  ) then
    alter table public.ticket_passengers
      drop constraint if exists ticket_passengers_contact_phone_check;
    alter table public.ticket_passengers
      add constraint ticket_passengers_contact_phone_check
      check (
        contact_phone is null
        or length(btrim(contact_phone)) between 1 and 50
      ) not valid;
  end if;
end
$$;

create unique index if not exists ticket_transaction_passengers_slot_unique_idx
  on public.ticket_transaction_passengers (transaction_id, fare_line_id, position)
  where fare_line_id is not null;

create unique index if not exists ticket_transaction_passengers_ticket_number_unique_idx
  on public.ticket_transaction_passengers (transaction_id, upper(btrim(ticket_number)))
  where ticket_number is not null;

comment on column public.ticket_transaction_passengers.position is
  'Stable one-based position within a transaction passenger-type fare group.';

create or replace function public.ticketing_complete_tk_details(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_idempotency_key text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  expected_keys constant text[] := array[
    'expectedBookingVersion',
    'expectedTransactionVersion',
    'contactPhone',
    'departureDate',
    'returnDate',
    'paymentStatus',
    'paidAt',
    'fareSales',
    'passengers'
  ];
  fare_keys constant text[] := array['passengerType', 'unitSalePrice'];
  passenger_keys constant text[] := array[
    'passengerType',
    'position',
    'fullName',
    'contactPhone',
    'dateOfBirth',
    'ticketNumber'
  ];
  action_name_value constant text := 'ticketing.complete_tk_details.v1';
  idempotency_key_value text;
  unknown_key text;
  expected_booking_version_value bigint;
  expected_transaction_version_value bigint;
  contact_phone_value text;
  departure_date_value date;
  return_date_value date;
  payment_status_value text;
  paid_date_value date;
  paid_at_value timestamptz;
  canonical_fares jsonb;
  canonical_passengers jsonb;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  actor_timezone text;
  booking_timezone text;
  booking_row public.ticket_bookings%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  fare_value jsonb;
  passenger_value jsonb;
  fare_row public.ticket_passenger_fare_lines%rowtype;
  allocation_row public.ticket_transaction_passengers%rowtype;
  passenger_row public.ticket_passengers%rowtype;
  passenger_id_value uuid;
  affected_count integer;
  passenger_ticket_count_value integer;
  supplier_total_value numeric(14,2);
  sale_total_value numeric(14,2);
  old_sale_complete boolean;
  new_sale_complete boolean;
  incoming_sale_null_count integer;
  fare_changed boolean := false;
  passenger_changed boolean := false;
  booking_changed boolean := false;
  payment_changed boolean := false;
  changed_value boolean := false;
  allocated_count integer;
  named_count integer;
  old_allocated_count integer;
  old_named_count integer;
  old_details_status text;
  details_status_value text;
  before_state_value jsonb;
  after_state_value jsonb;
  audit_event_id_value uuid;
  source_events_response jsonb := '[]'::jsonb;
  source_event_result jsonb;
  source_event_id_value uuid;
  source_event_key text;
  source_fact_key_value text;
  package_link_ids jsonb := '[]'::jsonb;
  matched_package_id uuid;
  matched_reservation_id uuid;
  matched_group_id uuid;
  matched_package_type text;
  variables_value jsonb;
  fare_sales_response jsonb := '[]'::jsonb;
  passengers_response jsonb := '[]'::jsonb;
  now_value timestamptz := clock_timestamp();
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

  idempotency_key_value := btrim(coalesce(p_idempotency_key, ''));
  if length(idempotency_key_value) not between 1 and 200 then
    raise exception 'A valid idempotency key is required'
      using errcode = '22023';
  end if;

  select employee.location_id, location.timezone
  into actor_location_id, actor_timezone
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  join public.locations location on location.id = employee.location_id
  where employee.id = p_actor_employee_id
    and employee.is_active
    and (
      regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g')
        in ('manager', 'admin', 'master admin', 'super admin')
      or exists (
        select 1
        from public.employee_departments membership
        join public.departments department on department.id = membership.department_id
        where membership.employee_id = employee.id
          and lower(btrim(department.name)) = 'ticketing'
      )
    )
  for share of employee, location;

  if not found or actor_location_id is null or actor_timezone is null then
    raise exception 'Actor is not an active authorised Ticketing employee with a branch location'
      using errcode = '42501';
  end if;

  if p_details is null or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'TK completion details must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_details) supplied(key)
  where supplied.key <> all (expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown TK completion field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_details ?& expected_keys then
    raise exception 'TK completion details are missing one or more required fields'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_details -> 'expectedBookingVersion') is distinct from 'number'
    or jsonb_typeof(p_details -> 'expectedTransactionVersion') is distinct from 'number'
    or jsonb_typeof(p_details -> 'contactPhone') not in ('string', 'null')
    or jsonb_typeof(p_details -> 'departureDate') not in ('string', 'null')
    or jsonb_typeof(p_details -> 'returnDate') not in ('string', 'null')
    or jsonb_typeof(p_details -> 'paymentStatus') is distinct from 'string'
    or jsonb_typeof(p_details -> 'paidAt') not in ('string', 'null')
    or jsonb_typeof(p_details -> 'fareSales') is distinct from 'array'
    or jsonb_typeof(p_details -> 'passengers') is distinct from 'array'
  then
    raise exception 'TK completion details contain invalid value types'
      using errcode = '22023';
  end if;

  begin
    if p_details ->> 'expectedBookingVersion' !~ '^\d+$'
      or p_details ->> 'expectedTransactionVersion' !~ '^\d+$'
    then
      raise invalid_text_representation;
    end if;
    expected_booking_version_value := (p_details ->> 'expectedBookingVersion')::bigint;
    expected_transaction_version_value := (p_details ->> 'expectedTransactionVersion')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Expected Ticketing versions must be positive integers'
      using errcode = '22023';
  end;

  if expected_booking_version_value < 1 or expected_transaction_version_value < 1 then
    raise exception 'Expected Ticketing versions must be positive integers'
      using errcode = '22023';
  end if;

  contact_phone_value := case
    when jsonb_typeof(p_details -> 'contactPhone') = 'null' then null
    else btrim(p_details ->> 'contactPhone')
  end;
  if contact_phone_value is not null and length(contact_phone_value) not between 1 and 50 then
    raise exception 'Customer contact number must contain between 1 and 50 characters'
      using errcode = '22023';
  end if;

  begin
    if p_details ->> 'departureDate' is not null then
      if p_details ->> 'departureDate' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise invalid_datetime_format;
      end if;
      departure_date_value := (p_details ->> 'departureDate')::date;
      if to_char(departure_date_value, 'YYYY-MM-DD') <> p_details ->> 'departureDate' then
        raise invalid_datetime_format;
      end if;
    end if;

    if p_details ->> 'returnDate' is not null then
      if p_details ->> 'returnDate' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise invalid_datetime_format;
      end if;
      return_date_value := (p_details ->> 'returnDate')::date;
      if to_char(return_date_value, 'YYYY-MM-DD') <> p_details ->> 'returnDate' then
        raise invalid_datetime_format;
      end if;
    end if;

    if p_details ->> 'paidAt' is not null then
      if p_details ->> 'paidAt' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise invalid_datetime_format;
      end if;
      paid_date_value := (p_details ->> 'paidAt')::date;
      if to_char(paid_date_value, 'YYYY-MM-DD') <> p_details ->> 'paidAt' then
        raise invalid_datetime_format;
      end if;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'TK completion dates must use valid YYYY-MM-DD values'
      using errcode = '22023';
  end;

  if return_date_value is not null and departure_date_value is null then
    raise exception 'A return date requires a departure date'
      using errcode = '22023';
  end if;
  if return_date_value is not null and return_date_value < departure_date_value then
    raise exception 'Return date cannot be before departure date'
      using errcode = '22023';
  end if;

  payment_status_value := p_details ->> 'paymentStatus';
  if payment_status_value not in ('unpaid', 'paid')
    or (payment_status_value = 'paid' and paid_date_value is null)
    or (payment_status_value = 'unpaid' and paid_date_value is not null)
  then
    raise exception 'Payment status and paid date are inconsistent'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_details -> 'fareSales') not between 1 and 3
    or jsonb_array_length(p_details -> 'passengers') > 99
  then
    raise exception 'TK completion fare or passenger limits were exceeded'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_details -> 'fareSales') item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or not item.value ?& fare_keys
      or exists (
        select 1 from jsonb_object_keys(item.value) supplied(key)
        where supplied.key <> all (fare_keys)
      )
      or jsonb_typeof(item.value -> 'passengerType') is distinct from 'string'
      or jsonb_typeof(item.value -> 'unitSalePrice') not in ('number', 'null')
  ) then
    raise exception 'Fare sale rows must contain only passengerType and unitSalePrice'
      using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_details -> 'fareSales') item(value)
      where item.value ->> 'passengerType' not in ('ADT', 'CHD', 'INF')
        or (
          item.value ->> 'unitSalePrice' is not null
          and (
            (item.value ->> 'unitSalePrice')::numeric < 0
            or scale((item.value ->> 'unitSalePrice')::numeric) > 2
            or (item.value ->> 'unitSalePrice')::numeric > 99999999.99
          )
        )
    ) then
      raise exception 'Fare sale rows contain invalid values'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Fare sale rows contain invalid values'
      using errcode = '22023';
  end;

  if (
    select count(distinct item.value ->> 'passengerType')
    from jsonb_array_elements(p_details -> 'fareSales') item(value)
  ) <> jsonb_array_length(p_details -> 'fareSales') then
    raise exception 'Each fare passenger type may appear only once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_details -> 'passengers') item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or not item.value ?& passenger_keys
      or exists (
        select 1 from jsonb_object_keys(item.value) supplied(key)
        where supplied.key <> all (passenger_keys)
      )
      or jsonb_typeof(item.value -> 'passengerType') is distinct from 'string'
      or jsonb_typeof(item.value -> 'position') is distinct from 'number'
      or jsonb_typeof(item.value -> 'fullName') not in ('string', 'null')
      or jsonb_typeof(item.value -> 'contactPhone') not in ('string', 'null')
      or jsonb_typeof(item.value -> 'dateOfBirth') not in ('string', 'null')
      or jsonb_typeof(item.value -> 'ticketNumber') not in ('string', 'null')
  ) then
    raise exception 'Passenger rows contain invalid fields or value types'
      using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_details -> 'passengers') item(value)
      where item.value ->> 'passengerType' not in ('ADT', 'CHD', 'INF')
        or item.value ->> 'position' !~ '^\d+$'
        or (item.value ->> 'position')::integer not between 1 and 99
        or (
          item.value ->> 'fullName' is not null
          and length(btrim(item.value ->> 'fullName')) not between 1 and 200
        )
        or (
          item.value ->> 'contactPhone' is not null
          and length(btrim(item.value ->> 'contactPhone')) not between 1 and 50
        )
        or (
          item.value ->> 'ticketNumber' is not null
          and length(btrim(item.value ->> 'ticketNumber')) not between 1 and 50
        )
    ) then
      raise exception 'Passenger rows contain invalid values'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Passenger rows contain invalid values'
      using errcode = '22023';
  end;

  if (
    select count(distinct (item.value ->> 'passengerType', item.value ->> 'position'))
    from jsonb_array_elements(p_details -> 'passengers') item(value)
  ) <> jsonb_array_length(p_details -> 'passengers') then
    raise exception 'Each passenger slot may appear only once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_details -> 'passengers') item(value)
    where item.value ->> 'dateOfBirth' is not null
      and (
        item.value ->> 'dateOfBirth' !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char((item.value ->> 'dateOfBirth')::date, 'YYYY-MM-DD')
          <> item.value ->> 'dateOfBirth'
      )
  ) then
    raise exception 'Passenger dates of birth must use valid YYYY-MM-DD values'
      using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'passengerType', item.value ->> 'passengerType',
      'unitSalePrice', case
        when item.value ->> 'unitSalePrice' is null then null
        else (item.value ->> 'unitSalePrice')::numeric(14,2)
      end
    ) order by case item.value ->> 'passengerType'
      when 'ADT' then 1 when 'CHD' then 2 else 3 end
  )
  into canonical_fares
  from jsonb_array_elements(p_details -> 'fareSales') item(value);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'passengerType', item.value ->> 'passengerType',
      'position', (item.value ->> 'position')::integer,
      'fullName', nullif(btrim(item.value ->> 'fullName'), ''),
      'contactPhone', nullif(btrim(item.value ->> 'contactPhone'), ''),
      'dateOfBirth', item.value ->> 'dateOfBirth',
      'ticketNumber', nullif(btrim(item.value ->> 'ticketNumber'), '')
    ) order by
      case item.value ->> 'passengerType' when 'ADT' then 1 when 'CHD' then 2 else 3 end,
      (item.value ->> 'position')::integer
  ), '[]'::jsonb)
  into canonical_passengers
  from jsonb_array_elements(p_details -> 'passengers') item(value);

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedBookingVersion', expected_booking_version_value,
    'expectedTransactionVersion', expected_transaction_version_value,
    'contactPhone', contact_phone_value,
    'departureDate', departure_date_value,
    'returnDate', return_date_value,
    'paymentStatus', payment_status_value,
    'paidAt', paid_date_value,
    'fareSales', canonical_fares,
    'passengers', canonical_passengers
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  -- Ownership is checked even for oversight roles: this is the private My Ledger operation.
  select booking.*
  into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
    and booking.owner_employee_id = p_actor_employee_id
  for update;

  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  select transaction.*
  into transaction_row
  from public.ticket_transactions transaction
  where transaction.booking_id = booking_row.id
    and transaction.owner_employee_id = p_actor_employee_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  for update;

  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  perform 1
  from public.ticket_transactions child_transaction
  where child_transaction.booking_id = booking_row.id
    and child_transaction.parent_transaction_id is not null
  order by child_transaction.id
  for update;

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with different TK completion details'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'TK completion idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if booking_row.archived_at is not null
    or booking_row.operational_status not in ('held', 'issued')
    or transaction_row.operational_status not in ('held', 'issued')
    or booking_row.operational_status <> transaction_row.operational_status
    or transaction_row.currency <> 'GBP'
  then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  if booking_row.payment_status is distinct from transaction_row.payment_status
    or transaction_row.payment_status not in ('unpaid', 'paid')
  then
    raise exception 'Ticket payment state requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if booking_row.version <> expected_booking_version_value
    or transaction_row.version <> expected_transaction_version_value
  then
    raise exception 'Ticket versions are stale'
      using
        errcode = '40001',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'transactionVersion', transaction_row.version
        )::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  select location.timezone
  into booking_timezone
  from public.locations location
  where location.id = booking_row.location_id
  for share;

  if not found or booking_timezone is null then
    raise exception 'Ticket branch timezone requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if paid_date_value is not null then
    paid_at_value := paid_date_value::timestamp without time zone at time zone booking_timezone;
  end if;

  perform 1
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_row.id
  order by fare_line.id
  for update;

  select
    count(*)::integer,
    coalesce(sum(fare_line.quantity), 0)::integer,
    case when count(*) > 0 and bool_and(fare_line.unit_supplier_cost_source is not null)
      then sum(fare_line.supplier_total_source)::numeric(14,2) end,
    count(*) > 0 and bool_and(fare_line.unit_sale_price_source is not null)
  into
    affected_count,
    passenger_ticket_count_value,
    supplier_total_value,
    old_sale_complete
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_row.id;

  if affected_count not between 1 and 3
    or passenger_ticket_count_value not between 1 and 99
    or supplier_total_value is null
    or affected_count <> jsonb_array_length(canonical_fares)
    or exists (
      select 1
      from public.ticket_passenger_fare_lines fare_line
      where fare_line.transaction_id = transaction_row.id
        and not exists (
          select 1
          from jsonb_array_elements(canonical_fares) incoming(value)
          where incoming.value ->> 'passengerType' = fare_line.passenger_type
        )
    )
  then
    raise exception 'Fare sale groups must exactly match the authoritative TK fare groups'
      using errcode = '22023';
  end if;

  select count(*) filter (where item.value ->> 'unitSalePrice' is null)::integer
  into incoming_sale_null_count
  from jsonb_array_elements(canonical_fares) item(value);

  if transaction_row.operational_status = 'issued'
    and incoming_sale_null_count not in (0, affected_count)
  then
    raise exception 'Issued TK sale values must be supplied for every fare group together'
      using errcode = '22023';
  end if;

  if paid_date_value is not null and paid_date_value < booking_row.booking_date then
    raise exception 'Paid date cannot be before booking date'
      using errcode = '22023';
  end if;

  if transaction_row.payment_status = 'paid' then
    if payment_status_value <> 'paid'
      or (transaction_row.paid_at at time zone booking_timezone)::date <> paid_date_value
    then
      raise exception 'Posted payment details require an audited correction'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    paid_at_value := transaction_row.paid_at;
  end if;

  select
    count(*)::integer,
    count(*) filter (where nullif(btrim(passenger.full_name), '') is not null)::integer
  into old_allocated_count, old_named_count
  from public.ticket_transaction_passengers allocation
  join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
  where allocation.transaction_id = transaction_row.id;

  old_details_status := case
    when nullif(btrim(booking_row.contact_phone), '') is not null
      and booking_row.departure_date is not null
      and old_sale_complete
      and old_allocated_count = passenger_ticket_count_value
      and old_named_count = passenger_ticket_count_value
    then 'complete'
    else 'needs_details'
  end;

  before_state_value := jsonb_build_object(
    'contact_phone_present', booking_row.contact_phone is not null,
    'departure_date', booking_row.departure_date,
    'return_date', booking_row.return_date,
    'payment_status', transaction_row.payment_status,
    'paid_at', transaction_row.paid_at,
    'sale_complete', old_sale_complete,
    'allocated_passenger_count', old_allocated_count,
    'named_passenger_count', old_named_count,
    'details_status', old_details_status
  );

  for fare_value in
    select item.value
    from jsonb_array_elements(canonical_fares) item(value)
    order by case item.value ->> 'passengerType'
      when 'ADT' then 1 when 'CHD' then 2 else 3 end
  loop
    select *
    into fare_row
    from public.ticket_passenger_fare_lines fare_line
    where fare_line.transaction_id = transaction_row.id
      and fare_line.passenger_type = fare_value ->> 'passengerType';

    -- For an Issued row, an all-null payload means leave its sale snapshot alone.
    if transaction_row.operational_status = 'issued' and incoming_sale_null_count = affected_count then
      continue;
    end if;

    if transaction_row.operational_status = 'issued'
      and fare_row.unit_sale_price_source is not null
      and fare_row.unit_sale_price_source
        is distinct from (fare_value ->> 'unitSalePrice')::numeric(14,2)
    then
      raise exception 'Posted sale values require an audited correction'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;

    update public.ticket_passenger_fare_lines fare_line
    set unit_sale_price_source = (fare_value ->> 'unitSalePrice')::numeric(14,2),
        unit_sale_price_gbp = (fare_value ->> 'unitSalePrice')::numeric(14,2)
    where fare_line.id = fare_row.id
      and row(fare_line.unit_sale_price_source, fare_line.unit_sale_price_gbp)
        is distinct from row(
          (fare_value ->> 'unitSalePrice')::numeric(14,2),
          (fare_value ->> 'unitSalePrice')::numeric(14,2)
        );
    get diagnostics affected_count = row_count;
    fare_changed := fare_changed or affected_count > 0;
  end loop;

  perform 1
  from public.ticket_transaction_passengers allocation
  join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
  where allocation.transaction_id = transaction_row.id
  order by allocation.id
  for update of allocation, passenger;

  if exists (
    select 1
    from public.ticket_transaction_passengers allocation
    join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
    left join public.ticket_passenger_fare_lines fare_line
      on fare_line.id = allocation.fare_line_id
      and fare_line.transaction_id = allocation.transaction_id
    where allocation.transaction_id = transaction_row.id
      and (
        allocation.booking_id <> booking_row.id
        or allocation.position is null
        or fare_line.id is null
        or allocation.position > fare_line.quantity
        or passenger.booking_id <> booking_row.id
        or passenger.passenger_type <> fare_line.passenger_type
      )
  ) then
    raise exception 'Existing passenger allocations require an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  for passenger_value in
    select item.value
    from jsonb_array_elements(canonical_passengers) item(value)
    order by case item.value ->> 'passengerType'
      when 'ADT' then 1 when 'CHD' then 2 else 3 end,
      (item.value ->> 'position')::integer
  loop
    select *
    into fare_row
    from public.ticket_passenger_fare_lines fare_line
    where fare_line.transaction_id = transaction_row.id
      and fare_line.passenger_type = passenger_value ->> 'passengerType';

    if not found
      or (passenger_value ->> 'position')::integer > fare_row.quantity
    then
      raise exception 'Passenger slot is outside the authoritative fare quantities'
        using errcode = '22023';
    end if;

    select allocation.*
    into allocation_row
    from public.ticket_transaction_passengers allocation
    where allocation.transaction_id = transaction_row.id
      and allocation.fare_line_id = fare_row.id
      and allocation.position = (passenger_value ->> 'position')::integer;

    if found then
      select * into passenger_row
      from public.ticket_passengers passenger
      where passenger.id = allocation_row.passenger_id;

      if not found
        or passenger_row.booking_id <> booking_row.id
        or passenger_row.passenger_type <> fare_row.passenger_type
      then
        raise exception 'Passenger slot requires an audited correction'
          using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
      end if;

      update public.ticket_passengers passenger
      set full_name = passenger_value ->> 'fullName',
          contact_phone = passenger_value ->> 'contactPhone',
          date_of_birth = (passenger_value ->> 'dateOfBirth')::date
      where passenger.id = passenger_row.id
        and row(passenger.full_name, passenger.contact_phone, passenger.date_of_birth)
          is distinct from row(
            passenger_value ->> 'fullName',
            passenger_value ->> 'contactPhone',
            (passenger_value ->> 'dateOfBirth')::date
          );
      get diagnostics affected_count = row_count;
      passenger_changed := passenger_changed or affected_count > 0;

      update public.ticket_transaction_passengers allocation
      set ticket_number = passenger_value ->> 'ticketNumber'
      where allocation.id = allocation_row.id
        and allocation.ticket_number is distinct from passenger_value ->> 'ticketNumber';
      get diagnostics affected_count = row_count;
      passenger_changed := passenger_changed or affected_count > 0;
    else
      passenger_id_value := gen_random_uuid();
      insert into public.ticket_passengers (
        id, booking_id, passenger_type, full_name, contact_phone, date_of_birth, created_by
      ) values (
        passenger_id_value,
        booking_row.id,
        fare_row.passenger_type,
        passenger_value ->> 'fullName',
        passenger_value ->> 'contactPhone',
        (passenger_value ->> 'dateOfBirth')::date,
        p_actor_employee_id
      );

      insert into public.ticket_transaction_passengers (
        booking_id,
        transaction_id,
        passenger_id,
        fare_line_id,
        ticket_number,
        position
      ) values (
        booking_row.id,
        transaction_row.id,
        passenger_id_value,
        fare_row.id,
        passenger_value ->> 'ticketNumber',
        (passenger_value ->> 'position')::integer
      );
      passenger_changed := true;
    end if;
  end loop;

  select
    count(*) > 0 and bool_and(fare_line.unit_sale_price_source is not null),
    case when count(*) > 0 and bool_and(fare_line.unit_sale_price_source is not null)
      then sum(fare_line.sale_total_source)::numeric(14,2) end
  into new_sale_complete, sale_total_value
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_row.id;

  if payment_status_value = 'paid' and not new_sale_complete then
    raise exception 'Paid tickets require complete sale values for every fare group'
      using errcode = '22023';
  end if;

  payment_changed := transaction_row.payment_status <> payment_status_value;
  booking_changed := row(
    booking_row.contact_phone,
    booking_row.departure_date,
    booking_row.return_date,
    booking_row.payment_status
  ) is distinct from row(
    contact_phone_value,
    departure_date_value,
    return_date_value,
    payment_status_value
  );

  changed_value := fare_changed or passenger_changed or booking_changed or payment_changed;

  if changed_value then
    update public.ticket_bookings booking
    set contact_phone = contact_phone_value,
        departure_date = departure_date_value,
        return_date = return_date_value,
        payment_status = payment_status_value,
        updated_by = p_actor_employee_id
    where booking.id = booking_row.id;

    -- Touching the root transaction also makes its version cover child/detail
    -- changes. Its reconciliation trigger snapshots authoritative fare totals.
    update public.ticket_transactions transaction
    set payment_status = payment_status_value,
        paid_at = case when payment_status_value = 'paid' then paid_at_value else null end,
        notes = transaction.notes
    where transaction.id = transaction_row.id;
  end if;

  select * into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id;

  select * into transaction_row
  from public.ticket_transactions transaction
  where transaction.booking_id = p_booking_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null;

  select
    count(*)::integer,
    count(*) filter (where nullif(btrim(passenger.full_name), '') is not null)::integer
  into allocated_count, named_count
  from public.ticket_transaction_passengers allocation
  join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
  where allocation.transaction_id = transaction_row.id;

  if allocated_count > passenger_ticket_count_value then
    raise exception 'Passenger allocations exceed the authoritative fare quantities'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  details_status_value := case
    when contact_phone_value is not null
      and departure_date_value is not null
      and new_sale_complete
      and allocated_count = passenger_ticket_count_value
      and named_count = passenger_ticket_count_value
    then 'complete'
    else 'needs_details'
  end;

  select coalesce(jsonb_agg(link.id order by link.id), '[]'::jsonb)
  into package_link_ids
  from public.ticket_package_links link
  where link.booking_id = booking_row.id and link.retired_at is null;

  select link.package_id, link.reservation_id, link.group_id, link.package_type_snapshot
  into matched_package_id, matched_reservation_id, matched_group_id, matched_package_type
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
    and link.match_status = 'matched'
  limit 1;

  variables_value := jsonb_build_object(
    'service_type', 'TK',
    'operational_status', transaction_row.operational_status,
    'payment_status', transaction_row.payment_status,
    'issued_at', transaction_row.issued_at,
    'paid_at', transaction_row.paid_at,
    'cancelled_at', transaction_row.cancelled_at,
    'refunded_at', transaction_row.refunded_at,
    'passenger_ticket_count', passenger_ticket_count_value,
    'currency', 'GBP',
    'supplier_cost_source', supplier_total_value,
    'supplier_cost_gbp', supplier_total_value,
    'sale_price_source', sale_total_value,
    'sale_price_gbp', sale_total_value,
    'pnr', booking_row.normalized_pnr,
    'airline_id', booking_row.airline_id,
    'parent_transaction_id', null,
    'package_link_ids', package_link_ids,
    'package_id', matched_package_id,
    'reservation_id', matched_reservation_id,
    'group_id', matched_group_id,
    'package_type', matched_package_type,
    'package_match_status', booking_row.package_match_status,
    'commission_scope', booking_row.commission_scope
  );

  -- Only the first complete sale snapshot of an Issued TK is a Commission
  -- fact. Held edits remain operational drafts and emit no financial event.
  if transaction_row.operational_status = 'issued'
    and not old_sale_complete
    and new_sale_complete
  then
    source_fact_key_value := 'transaction:' || transaction_row.id::text || ':sale-completed';
    source_event_id_value := gen_random_uuid();
    source_event_key := 'tktc:v1:' || encode(digest(
      p_actor_employee_id::text || ':' || idempotency_key_value || ':sale', 'sha256'
    ), 'hex');

    source_event_result := public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', source_event_id_value,
      'source_fact_key', source_fact_key_value,
      'source_record_id', transaction_row.id,
      'event_type', 'ticket_sale_completed',
      'contract_version', 1,
      'event_version', 1,
      'supersedes_event_id', null,
      'employee_id', p_actor_employee_id,
      'owner_employee_id', booking_row.owner_employee_id,
      'location_id', booking_row.location_id,
      'occurred_at', now_value,
      'effective_on', coalesce(
        (transaction_row.issued_at at time zone booking_timezone)::date,
        transaction_row.booking_date
      ),
      'source_path', '/dashboard/ticketing/ledger/' || booking_row.id::text,
      'variables', variables_value,
      'idempotency_key', source_event_key
    ));

    source_events_response := source_events_response || jsonb_build_array(jsonb_build_object(
      'sourceEventId', source_event_result ->> 'sourceEventId',
      'eventType', 'ticket_sale_completed',
      'eventVersion', 1
    ));
  end if;

  if payment_changed and payment_status_value = 'paid' then
    source_event_id_value := gen_random_uuid();
    source_event_key := 'tktc:v1:' || encode(digest(
      p_actor_employee_id::text || ':' || idempotency_key_value || ':paid', 'sha256'
    ), 'hex');
    source_event_result := public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', source_event_id_value,
      'source_fact_key', 'transaction:' || transaction_row.id::text || ':paid',
      'source_record_id', transaction_row.id,
      'event_type', 'ticket_paid',
      'contract_version', 1,
      'event_version', 1,
      'supersedes_event_id', null,
      'employee_id', p_actor_employee_id,
      'owner_employee_id', booking_row.owner_employee_id,
      'location_id', booking_row.location_id,
      'occurred_at', now_value,
      'effective_on', paid_date_value,
      'source_path', '/dashboard/ticketing/ledger/' || booking_row.id::text,
      'variables', variables_value,
      'idempotency_key', source_event_key
    ));

    source_events_response := source_events_response || jsonb_build_array(jsonb_build_object(
      'sourceEventId', source_event_result ->> 'sourceEventId',
      'eventType', 'ticket_paid',
      'eventVersion', 1
    ));
  end if;

  after_state_value := jsonb_build_object(
    'contact_phone_present', booking_row.contact_phone is not null,
    'departure_date', booking_row.departure_date,
    'return_date', booking_row.return_date,
    'payment_status', transaction_row.payment_status,
    'paid_at', transaction_row.paid_at,
    'sale_complete', new_sale_complete,
    'allocated_passenger_count', allocated_count,
    'named_passenger_count', named_count,
    'details_status', details_status_value,
    'source_events', source_events_response
  );

  if changed_value then
    audit_event_id_value := gen_random_uuid();
    insert into public.ticket_audit_events (
      id,
      entity_type,
      entity_id,
      booking_id,
      transaction_id,
      action,
      actor_employee_id,
      before_state,
      after_state,
      created_at
    ) values (
      audit_event_id_value,
      'transaction',
      transaction_row.id,
      booking_row.id,
      transaction_row.id,
      'complete_tk_details',
      p_actor_employee_id,
      before_state_value,
      after_state_value,
      now_value
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', fare_line.id,
    'passengerType', fare_line.passenger_type,
    'quantity', fare_line.quantity,
    'unitSupplierCost', fare_line.unit_supplier_cost_source,
    'unitSalePrice', fare_line.unit_sale_price_source,
    'salePriceLocked', fare_line.unit_sale_price_source is not null
      and (transaction_row.operational_status = 'issued' or transaction_row.payment_status = 'paid')
  ) order by case fare_line.passenger_type when 'ADT' then 1 when 'CHD' then 2 else 3 end), '[]'::jsonb)
  into fare_sales_response
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_row.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'passengerType', slots.passenger_type,
    'position', slots.position,
    'fullName', passenger.full_name,
    'contactPhone', passenger.contact_phone,
    'dateOfBirth', passenger.date_of_birth,
    'ticketNumber', allocation.ticket_number
  ) order by case slots.passenger_type when 'ADT' then 1 when 'CHD' then 2 else 3 end,
    slots.position), '[]'::jsonb)
  into passengers_response
  from (
    select fare_line.id as fare_line_id, fare_line.passenger_type,
      generate_series(1, fare_line.quantity) as position
    from public.ticket_passenger_fare_lines fare_line
    where fare_line.transaction_id = transaction_row.id
  ) slots
  left join public.ticket_transaction_passengers allocation
    on allocation.transaction_id = transaction_row.id
    and allocation.fare_line_id = slots.fare_line_id
    and allocation.position = slots.position
  left join public.ticket_passengers passenger on passenger.id = allocation.passenger_id;

  response_value := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking_row.id,
      'version', booking_row.version,
      'contactPhone', booking_row.contact_phone,
      'departureDate', booking_row.departure_date,
      'returnDate', booking_row.return_date,
      'paymentStatus', booking_row.payment_status,
      'detailsStatus', details_status_value
    ),
    'transaction', jsonb_build_object(
      'id', transaction_row.id,
      'version', transaction_row.version,
      'serviceType', transaction_row.service_type,
      'operationalStatus', transaction_row.operational_status,
      'paymentStatus', transaction_row.payment_status,
      'paidAt', transaction_row.paid_at,
      'currency', transaction_row.currency,
      'passengerTicketCount', passenger_ticket_count_value,
      'supplierCost', supplier_total_value,
      'salePrice', sale_total_value
    ),
    'fareSales', fare_sales_response,
    'passengers', passengers_response,
    'sourceEvents', source_events_response,
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
exception
  when invalid_datetime_format or datetime_field_overflow then
    raise exception 'TK completion contains an invalid date'
      using errcode = '22023';
end
$$;

comment on function public.ticketing_complete_tk_details(uuid, uuid, text, jsonb) is
  'Service-role-only, own-record atomic TK detail completion with optimistic versions, stable passenger slots, audit and Commission source facts.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082202,
  now(),
  jsonb_build_object(
    'migration', '20260822_ticketing_tk_completion.sql',
    'capabilities', jsonb_build_array(
      'atomic-quick-tk',
      'duplicate-confirmation',
      'automatic-package-match',
      'transaction-owner-alignment',
      'starter-airline-directory',
      'atomic-tk-completion',
      'stable-passenger-slots',
      'optimistic-ticket-versions',
      'ticket-sale-and-payment-events'
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
    'ready', coalesce(version >= 2026082202, false),
    'version', version,
    'requiredVersion', 2026082202,
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_complete_tk_details(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_complete_tk_details(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
