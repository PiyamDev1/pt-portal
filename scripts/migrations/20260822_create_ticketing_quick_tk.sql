-- Atomic, retry-safe TK quick entry on top of the deployed Ticketing foundation.
--
-- The staff API resolves the authenticated employee and passes that UUID as
-- p_actor_employee_id. Ownership and branch location are derived here; the JSON
-- envelope deliberately contains no caller-controlled identity fields.

begin;

-- Settings can assign agents later; creating the department grants no access by
-- itself because the RPC still requires an explicit employee membership.
insert into public.departments (name)
select 'Ticketing'
where not exists (
  select 1
  from public.departments department
  where lower(btrim(department.name)) = 'ticketing'
);

-- Guarantee the minimum quick-entry directory without replacing curated names.
insert into public.airlines (iata_code, name, is_active)
values
  ('TK', 'Turkish Airlines', true),
  ('PK', 'Pakistan International Airlines', true),
  ('SV', 'Saudia', true)
on conflict (iata_code) do update
set name = case
      when nullif(btrim(public.airlines.name), '') is null then excluded.name
      else public.airlines.name
    end,
    is_active = true,
    updated_at = case
      when nullif(btrim(public.airlines.name), '') is null
        or public.airlines.is_active is not true
      then now()
      else public.airlines.updated_at
    end;

-- The foundation keeps booking and transaction owners as separate operational
-- snapshots. Enforce their alignment for every root/child transaction and for
-- later booking or transaction ownership changes.
do $$
begin
  if exists (
    select 1
    from public.ticket_transactions transaction
    join public.ticket_bookings booking on booking.id = transaction.booking_id
    where transaction.owner_employee_id is distinct from booking.owner_employee_id
  ) then
    raise exception 'Existing Ticketing booking/transaction owners must be reconciled first'
      using errcode = '23514';
  end if;
end
$$;

create or replace function public.validate_ticket_transaction_owner_alignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_id_value uuid;
begin
  if tg_table_name = 'ticket_bookings' then
    booking_id_value := new.id;
  else
    booking_id_value := new.booking_id;
  end if;

  if exists (
    select 1
    from public.ticket_transactions transaction
    join public.ticket_bookings booking on booking.id = transaction.booking_id
    where booking.id = booking_id_value
      and transaction.owner_employee_id is distinct from booking.owner_employee_id
  ) then
    raise exception 'Ticket transaction owner must match its booking owner'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transactions_validate_owner_alignment
  on public.ticket_transactions;
create constraint trigger ticket_transactions_validate_owner_alignment
  after insert or update on public.ticket_transactions
  deferrable initially immediate
  for each row execute function public.validate_ticket_transaction_owner_alignment();

drop trigger if exists ticket_bookings_validate_transaction_owner_alignment
  on public.ticket_bookings;
create constraint trigger ticket_bookings_validate_transaction_owner_alignment
  after update on public.ticket_bookings
  deferrable initially immediate
  for each row execute function public.validate_ticket_transaction_owner_alignment();

create or replace function public.ticketing_create_quick_tk(
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
  expected_keys constant text[] := array[
    'customerName',
    'pnr',
    'airlineId',
    'serviceType',
    'operationalStatus',
    'bookingDate',
    'timeLimitAt',
    'issuedAt',
    'currency',
    'fares',
    'confirmDuplicate'
  ];
  required_keys constant text[] := array[
    'customerName',
    'pnr',
    'airlineId',
    'serviceType',
    'operationalStatus',
    'bookingDate',
    'timeLimitAt',
    'issuedAt',
    'currency',
    'fares'
  ];
  fare_keys constant text[] := array[
    'passengerType',
    'quantity',
    'unitSupplierCost'
  ];
  action_name_value constant text := 'ticketing.quick_create_tk.v1';
  unknown_key text;
  fare_value jsonb;
  idempotency_key_value text;
  existing_request jsonb;
  existing_response jsonb;
  canonical_request jsonb;
  canonical_fares jsonb;
  customer_name_value text;
  pnr_value text;
  normalized_pnr_value text;
  airline_id_value uuid;
  operational_status_value text;
  booking_date_value date;
  time_limit_text text;
  time_limit_local timestamp without time zone;
  time_limit_at_value timestamptz;
  issued_date_value date;
  issued_at_value timestamptz;
  confirm_duplicate_value boolean := false;
  actor_location_id uuid;
  actor_timezone text;
  booking_id_value uuid := gen_random_uuid();
  transaction_id_value uuid := gen_random_uuid();
  audit_event_id_value uuid := gen_random_uuid();
  source_event_id_value uuid;
  source_event_result jsonb;
  source_event_key text;
  existing_booking_id uuid;
  existing_owner_employee_id uuid;
  existing_customer_name text;
  passenger_ticket_count_value integer;
  supplier_total_value numeric(14,2);
  fare_line_id_value uuid;
  fare_lines_response jsonb := '[]'::jsonb;
  package_link_ids jsonb := '[]'::jsonb;
  package_candidate_count integer := 0;
  package_candidate_package_count integer := 0;
  common_package_group_count integer := 0;
  package_link_id_value uuid;
  matched_package_link_id uuid;
  matched_package_id uuid;
  matched_reservation_id uuid;
  matched_group_id uuid;
  matched_package_type text;
  matched_package_reference text;
  package_match_status_value text := 'unmatched';
  commission_scope_value text := 'ticket';
  package_candidate record;
  booking_version_value bigint;
  transaction_version_value bigint;
  now_value timestamptz := clock_timestamp();
  response_value jsonb;
begin
  if p_actor_employee_id is null then
    raise exception 'Authenticated Ticketing employee required'
      using errcode = '42501';
  end if;

  idempotency_key_value := btrim(coalesce(p_idempotency_key, ''));
  if length(idempotency_key_value) not between 1 and 200 then
    raise exception 'A valid idempotency key is required'
      using errcode = '22023';
  end if;

  -- A service-role RPC cannot safely derive the end-user identity from auth.uid().
  -- The route supplies its requireStaffSession employee ID; this function then
  -- verifies current access and derives the immutable owner/location context.
  select
    employee.location_id,
    location.timezone
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

  if p_entry is null or jsonb_typeof(p_entry) is distinct from 'object' then
    raise exception 'TK quick entry must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_entry) as supplied(key)
  where supplied.key <> all (expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown TK quick-entry field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_entry ?& required_keys then
    raise exception 'TK quick entry is missing one or more required fields'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(array[
      'customerName',
      'pnr',
      'airlineId',
      'serviceType',
      'operationalStatus',
      'bookingDate',
      'currency'
    ]) as required_string(key_name)
    where jsonb_typeof(p_entry -> key_name) is distinct from 'string'
  ) or exists (
    select 1
    from unnest(array['timeLimitAt', 'issuedAt']) as nullable_string(key_name)
    where jsonb_typeof(p_entry -> key_name) not in ('string', 'null')
  ) or jsonb_typeof(p_entry -> 'fares') is distinct from 'array'
    or (
      p_entry ? 'confirmDuplicate'
      and jsonb_typeof(p_entry -> 'confirmDuplicate') is distinct from 'boolean'
    )
  then
    raise exception 'TK quick entry contains invalid value types'
      using errcode = '22023';
  end if;

  begin
    customer_name_value := btrim(p_entry ->> 'customerName');
    pnr_value := btrim(p_entry ->> 'pnr');
    normalized_pnr_value := public.normalize_ticket_pnr_v1(pnr_value);
    airline_id_value := (p_entry ->> 'airlineId')::uuid;
    operational_status_value := p_entry ->> 'operationalStatus';
    booking_date_value := (p_entry ->> 'bookingDate')::date;
    confirm_duplicate_value := coalesce((p_entry ->> 'confirmDuplicate')::boolean, false);
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
    then
      raise exception 'TK quick entry contains invalid typed values'
        using errcode = '22023';
  end;

  if length(customer_name_value) not between 1 and 200
    or normalized_pnr_value is null
    or length(normalized_pnr_value) not between 1 and 20
    or p_entry ->> 'serviceType' <> 'TK'
    or operational_status_value not in ('held', 'issued')
    or p_entry ->> 'currency' <> 'GBP'
    or p_entry ->> 'bookingDate' !~ '^\d{4}-\d{2}-\d{2}$'
    or to_char(booking_date_value, 'YYYY-MM-DD') <> p_entry ->> 'bookingDate'
  then
    raise exception 'TK quick entry contains invalid contract values'
      using errcode = '22023';
  end if;

  if operational_status_value = 'held' then
    if jsonb_typeof(p_entry -> 'timeLimitAt') is distinct from 'string'
      or jsonb_typeof(p_entry -> 'issuedAt') is distinct from 'null'
    then
      raise exception 'Held TK quick entry requires a time limit and no issued date'
        using errcode = '22023';
    end if;

    time_limit_text := btrim(p_entry ->> 'timeLimitAt');
    if time_limit_text !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$' then
      raise exception 'timeLimitAt must be a branch-local ISO datetime'
        using errcode = '22023';
    end if;

    begin
      time_limit_local := replace(time_limit_text, 'T', ' ')::timestamp without time zone;
      time_limit_at_value := time_limit_local at time zone actor_timezone;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'timeLimitAt is not a valid branch-local datetime'
          using errcode = '22023';
    end;

    if time_limit_local::date < booking_date_value then
      raise exception 'timeLimitAt cannot be earlier than bookingDate'
        using errcode = '22023';
    end if;

    -- Reject local times that PostgreSQL normalises through a DST gap.
    if time_limit_at_value at time zone actor_timezone <> time_limit_local then
      raise exception 'timeLimitAt does not exist in the branch timezone'
        using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_entry -> 'timeLimitAt') is distinct from 'null'
      or jsonb_typeof(p_entry -> 'issuedAt') is distinct from 'string'
    then
      raise exception 'Issued TK quick entry requires an issued date and no time limit'
        using errcode = '22023';
    end if;

    begin
      if p_entry ->> 'issuedAt' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise invalid_datetime_format;
      end if;
      issued_date_value := (p_entry ->> 'issuedAt')::date;
      if to_char(issued_date_value, 'YYYY-MM-DD') <> p_entry ->> 'issuedAt' then
        raise invalid_datetime_format;
      end if;
      issued_at_value := issued_date_value::timestamp without time zone at time zone actor_timezone;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'issuedAt must be a valid YYYY-MM-DD date'
          using errcode = '22023';
    end;

    if issued_date_value < booking_date_value then
      raise exception 'issuedAt cannot be earlier than bookingDate'
        using errcode = '22023';
    end if;
  end if;

  if jsonb_array_length(p_entry -> 'fares') not between 1 and 3 then
    raise exception 'TK quick entry requires between one and three fare groups'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
  ) then
    raise exception 'Each fare group must be a JSON object'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') as item(value)
    where not item.value ?& fare_keys
      or exists (
        select 1
        from jsonb_object_keys(item.value) as supplied(key)
        where supplied.key <> all (fare_keys)
      )
  ) then
    raise exception 'Each fare group must contain only passengerType, quantity, and unitSupplierCost'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') as item(value)
    where jsonb_typeof(item.value -> 'passengerType') is distinct from 'string'
      or jsonb_typeof(item.value -> 'quantity') is distinct from 'number'
      or jsonb_typeof(item.value -> 'unitSupplierCost') is distinct from 'number'
  ) then
    raise exception 'Fare-group values have invalid types'
      using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_entry -> 'fares') as item(value)
      where item.value ->> 'passengerType' not in ('ADT', 'CHD', 'INF')
        or item.value ->> 'quantity' !~ '^\d+$'
        or (item.value ->> 'quantity')::integer not between 1 and 99
        or (item.value ->> 'unitSupplierCost')::numeric < 0
        or scale((item.value ->> 'unitSupplierCost')::numeric) > 2
        or (item.value ->> 'unitSupplierCost')::numeric > 99999999.99
    ) then
      raise exception 'Fare groups contain invalid passenger types, quantities, or costs'
        using errcode = '22023';
    end if;

    if (
      select count(distinct item.value ->> 'passengerType')
      from jsonb_array_elements(p_entry -> 'fares') as item(value)
    ) <> jsonb_array_length(p_entry -> 'fares') then
      raise exception 'Each passenger type may appear only once'
        using errcode = '22023';
    end if;

    select
      sum((item.value ->> 'quantity')::integer)::integer,
      sum(
        (item.value ->> 'quantity')::integer
          * (item.value ->> 'unitSupplierCost')::numeric
      )::numeric(14,2)
    into passenger_ticket_count_value, supplier_total_value
    from jsonb_array_elements(p_entry -> 'fares') as item(value);
  exception
    when invalid_text_representation
      or numeric_value_out_of_range
    then
      raise exception 'Fare groups contain invalid numeric values'
        using errcode = '22023';
  end;

  if passenger_ticket_count_value not between 1 and 99
    or supplier_total_value > 999999999999.99
  then
    raise exception 'Fare-group totals exceed the TK quick-entry limits'
      using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'passengerType', item.value ->> 'passengerType',
      'quantity', (item.value ->> 'quantity')::integer,
      'unitSupplierCost', (item.value ->> 'unitSupplierCost')::numeric(14,2)
    )
    order by case item.value ->> 'passengerType'
      when 'ADT' then 1
      when 'CHD' then 2
      else 3
    end
  )
  into canonical_fares
  from jsonb_array_elements(p_entry -> 'fares') as item(value);

  canonical_request := jsonb_build_object(
    'customerName', customer_name_value,
    'pnr', normalized_pnr_value,
    'airlineId', airline_id_value,
    'serviceType', 'TK',
    'operationalStatus', operational_status_value,
    'bookingDate', to_char(booking_date_value, 'YYYY-MM-DD'),
    'timeLimitAt', case
      when time_limit_local is null then null
      else to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI:SS')
    end,
    'issuedAt', case
      when issued_date_value is null then null
      else to_char(issued_date_value, 'YYYY-MM-DD')
    end,
    'currency', 'GBP',
    'fares', canonical_fares
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
      0
    )
  );

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different TK quick entry'
        using errcode = '22023';
    end if;
    if existing_response is null then
      raise exception 'TK quick-entry idempotency record is incomplete'
        using errcode = '55000';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  perform 1
  from public.airlines airline
  where airline.id = airline_id_value
    and airline.is_active
  for share of airline;

  if not found then
    raise exception 'Active airline not found'
      using errcode = 'P0002';
  end if;

  -- Serialize duplicate detection independently of the caller's retry key.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'ticketing.quick_create_tk.duplicate:'
        || airline_id_value::text || ':' || normalized_pnr_value,
      0
    )
  );

  select
    booking.id,
    booking.owner_employee_id,
    booking.customer_name
  into
    existing_booking_id,
    existing_owner_employee_id,
    existing_customer_name
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  where booking.airline_id = airline_id_value
    and booking.normalized_pnr = normalized_pnr_value
    and booking.archived_at is null
  order by booking.created_at, booking.id
  limit 1
  for share of booking, transaction;

  if found and not confirm_duplicate_value then
    raise exception 'Duplicate TK confirmation required'
      using
        errcode = '23505',
        detail = jsonb_strip_nulls(jsonb_build_object(
          'bookingId', case
            when existing_owner_employee_id = p_actor_employee_id then existing_booking_id
          end,
          'pnr', normalized_pnr_value,
          'customerName', case
            when existing_owner_employee_id = p_actor_employee_id then existing_customer_name
          end,
          'ownedByActor', existing_owner_employee_id = p_actor_employee_id
        ))::text,
        hint = 'TICKETING_DUPLICATE_TK';
  end if;

  insert into public.ticket_bookings (
    id,
    owner_employee_id,
    location_id,
    airline_id,
    pnr,
    customer_name,
    booking_date,
    operational_status,
    payment_status,
    time_limit_at,
    time_limit_timezone,
    package_match_status,
    commission_scope,
    created_by,
    updated_by
  ) values (
    booking_id_value,
    p_actor_employee_id,
    actor_location_id,
    airline_id_value,
    pnr_value,
    customer_name_value,
    booking_date_value,
    operational_status_value,
    'unpaid',
    time_limit_at_value,
    case when time_limit_at_value is null then null else actor_timezone end,
    'unmatched',
    'ticket',
    p_actor_employee_id,
    p_actor_employee_id
  );

  -- Issued rows cannot be inserted before their fare children. Start in Draft,
  -- add the grouped fares, then post the requested final state in this transaction.
  insert into public.ticket_transactions (
    id,
    booking_id,
    service_type,
    owner_employee_id,
    acting_employee_id,
    operational_status,
    payment_status,
    booking_date,
    time_limit_at,
    time_limit_timezone,
    currency,
    idempotency_key
  ) values (
    transaction_id_value,
    booking_id_value,
    'TK',
    p_actor_employee_id,
    p_actor_employee_id,
    'draft',
    'unpaid',
    booking_date_value,
    time_limit_at_value,
    case when time_limit_at_value is null then null else actor_timezone end,
    'GBP',
    idempotency_key_value
  );

  for fare_value in
    select item.value
    from jsonb_array_elements(canonical_fares) as item(value)
    order by case item.value ->> 'passengerType'
      when 'ADT' then 1
      when 'CHD' then 2
      else 3
    end
  loop
    fare_line_id_value := gen_random_uuid();
    insert into public.ticket_passenger_fare_lines (
      id,
      transaction_id,
      passenger_type,
      quantity,
      currency,
      unit_supplier_cost_source,
      unit_supplier_cost_gbp
    ) values (
      fare_line_id_value,
      transaction_id_value,
      fare_value ->> 'passengerType',
      (fare_value ->> 'quantity')::integer,
      'GBP',
      (fare_value ->> 'unitSupplierCost')::numeric(14,2),
      (fare_value ->> 'unitSupplierCost')::numeric(14,2)
    );
  end loop;

  update public.ticket_transactions
  set operational_status = operational_status_value,
      issued_at = issued_at_value,
      passenger_ticket_count = passenger_ticket_count_value,
      supplier_cost_source = supplier_total_value,
      supplier_cost_gbp = supplier_total_value
  where id = transaction_id_value
  returning version into transaction_version_value;

  -- Keep the package evidence set stable until the booking, links, audit row,
  -- source event, and idempotency response commit. SHARE permits concurrent
  -- readers/quick entries while briefly blocking reservation/package writers,
  -- including phantom inserts that row locks cannot see.
  lock table
    public.travel_package_reservations,
    public.travel_packages,
    public.travel_package_groups,
    public.travel_package_group_members
  in share mode;

  select count(*)::integer, count(distinct package.id)::integer
  into package_candidate_count, package_candidate_package_count
  from public.travel_package_reservations reservation
  join public.travel_packages package on package.id = reservation.package_id
  where reservation.normalized_booking_reference = normalized_pnr_value
    and reservation.reservation_type = 'flight'
    and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
    and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
    and lower(btrim(package.status)) not in ('cancelled', 'archived');

  if package_candidate_package_count > 1 then
    select
      count(*)::integer,
      (array_agg(common_group.group_id order by common_group.group_id))[1]
    into common_package_group_count, matched_group_id
    from (
      select membership.group_id
      from public.travel_package_group_members membership
      join public.travel_package_groups package_group
        on package_group.id = membership.group_id
      join (
        select distinct package.id as package_id
        from public.travel_package_reservations reservation
        join public.travel_packages package on package.id = reservation.package_id
        where reservation.normalized_booking_reference = normalized_pnr_value
          and reservation.reservation_type = 'flight'
          and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
          and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
          and lower(btrim(package.status)) not in ('cancelled', 'archived')
      ) candidate_package on candidate_package.package_id = membership.package_id
      where lower(btrim(package_group.status)) not in ('cancelled', 'archived')
      group by membership.group_id
      having count(distinct membership.package_id) = package_candidate_package_count
    ) common_group;

    if common_package_group_count <> 1 then
      matched_group_id := null;
    end if;
  end if;

  if package_candidate_count > 0
    and (
      package_candidate_package_count = 1
      or matched_group_id is not null
    )
  then
    select
      reservation.id,
      package.id,
      lower(btrim(package.package_type)),
      package.package_reference
    into
      matched_reservation_id,
      matched_package_id,
      matched_package_type,
      matched_package_reference
    from public.travel_package_reservations reservation
    join public.travel_packages package on package.id = reservation.package_id
    left join public.travel_package_group_members membership
      on membership.package_id = package.id
      and membership.group_id = matched_group_id
    where reservation.normalized_booking_reference = normalized_pnr_value
      and reservation.reservation_type = 'flight'
      and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
      and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
      and lower(btrim(package.status)) not in ('cancelled', 'archived')
    order by
      case when coalesce(membership.is_lead_family, false) then 0 else 1 end,
      membership.sort_order nulls last,
      package.id,
      reservation.id
    limit 1;

    matched_package_link_id := gen_random_uuid();
    insert into public.ticket_package_links (
      id,
      booking_id,
      package_id,
      reservation_id,
      group_id,
      match_status,
      resolution_method,
      matched_pnr
    ) values (
      matched_package_link_id,
      booking_id_value,
      matched_package_id,
      matched_reservation_id,
      matched_group_id,
      'matched',
      'automatic',
      normalized_pnr_value
    );

    update public.ticket_bookings
    set package_match_status = 'matched',
        commission_scope = 'package',
        updated_by = p_actor_employee_id
    where id = booking_id_value;

    package_match_status_value := 'matched';
    commission_scope_value := 'package';
  elsif package_candidate_count > 1 then
    for package_candidate in
      select reservation.id as reservation_id, package.id as package_id
      from public.travel_package_reservations reservation
      join public.travel_packages package on package.id = reservation.package_id
      where reservation.normalized_booking_reference = normalized_pnr_value
        and reservation.reservation_type = 'flight'
        and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
        and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
        and lower(btrim(package.status)) not in ('cancelled', 'archived')
      order by package.id, reservation.id
    loop
      package_link_id_value := gen_random_uuid();
      insert into public.ticket_package_links (
        id,
        booking_id,
        package_id,
        reservation_id,
        match_status,
        resolution_method,
        matched_pnr
      ) values (
        package_link_id_value,
        booking_id_value,
        package_candidate.package_id,
        package_candidate.reservation_id,
        'ambiguous',
        'automatic',
        normalized_pnr_value
      );
    end loop;

    update public.ticket_bookings
    set package_match_status = 'ambiguous',
        commission_scope = 'unresolved',
        updated_by = p_actor_employee_id
    where id = booking_id_value;

    package_match_status_value := 'ambiguous';
    commission_scope_value := 'unresolved';
    matched_package_id := null;
    matched_reservation_id := null;
    matched_package_type := null;
    matched_package_reference := null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', fare_line.id,
        'passengerType', fare_line.passenger_type,
        'quantity', fare_line.quantity,
        'unitSupplierCost', fare_line.unit_supplier_cost_source,
        'supplierTotal', fare_line.supplier_total_source
      )
      order by case fare_line.passenger_type
        when 'ADT' then 1
        when 'CHD' then 2
        else 3
      end
    ),
    '[]'::jsonb
  )
  into fare_lines_response
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_id_value;

  select coalesce(jsonb_agg(link.id order by link.id), '[]'::jsonb)
  into package_link_ids
  from public.ticket_package_links link
  where link.booking_id = booking_id_value
    and link.retired_at is null;

  if operational_status_value = 'issued' then
    source_event_id_value := gen_random_uuid();
    source_event_key := 'tkqc:v1:' || encode(
      digest(p_actor_employee_id::text || ':' || idempotency_key_value, 'sha256'),
      'hex'
    );

    source_event_result := public.append_commission_source_event(
      jsonb_build_object(
        'source_module', 'ticketing',
        'source_event_id', source_event_id_value,
        'source_fact_key', 'transaction:' || transaction_id_value::text || ':issued',
        'source_record_id', transaction_id_value,
        'event_type', 'ticket_issued',
        'contract_version', 1,
        'event_version', 1,
        'supersedes_event_id', null,
        'employee_id', p_actor_employee_id,
        'owner_employee_id', p_actor_employee_id,
        'location_id', actor_location_id,
        'occurred_at', now_value,
        'effective_on', issued_date_value,
        'source_path', '/dashboard/ticketing/ledger/' || booking_id_value::text,
        'variables', jsonb_build_object(
          'service_type', 'TK',
          'operational_status', 'issued',
          'payment_status', 'unpaid',
          'issued_at', issued_at_value,
          'paid_at', null,
          'cancelled_at', null,
          'refunded_at', null,
          'passenger_ticket_count', passenger_ticket_count_value,
          'currency', 'GBP',
          'supplier_cost_source', supplier_total_value,
          'supplier_cost_gbp', supplier_total_value,
          'sale_price_source', null,
          'sale_price_gbp', null,
          'pnr', normalized_pnr_value,
          'airline_id', airline_id_value,
          'parent_transaction_id', null,
          'package_link_ids', package_link_ids,
          'package_id', matched_package_id,
          'reservation_id', matched_reservation_id,
          'group_id', matched_group_id,
          'package_type', matched_package_type,
          'package_match_status', package_match_status_value,
          'commission_scope', commission_scope_value
        ),
        'idempotency_key', source_event_key
      )
    );
  end if;

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
    transaction_id_value,
    booking_id_value,
    transaction_id_value,
    'quick_create_tk',
    p_actor_employee_id,
    null,
    jsonb_build_object(
      'service_type', 'TK',
      'operational_status', operational_status_value,
      'payment_status', 'unpaid',
      'passenger_ticket_count', passenger_ticket_count_value,
      'package_match_status', package_match_status_value,
      'commission_scope', commission_scope_value,
      'source_event_id', source_event_id_value
    ),
    now_value
  );

  select booking.version
  into booking_version_value
  from public.ticket_bookings booking
  where booking.id = booking_id_value;

  select transaction.version
  into transaction_version_value
  from public.ticket_transactions transaction
  where transaction.id = transaction_id_value;

  response_value := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking_id_value,
      'version', booking_version_value,
      'ownerEmployeeId', p_actor_employee_id,
      'locationId', actor_location_id,
      'airlineId', airline_id_value,
      'customerName', customer_name_value,
      'pnr', pnr_value,
      'normalizedPnr', normalized_pnr_value,
      'bookingDate', booking_date_value,
      'operationalStatus', operational_status_value,
      'paymentStatus', 'unpaid',
      'timeLimitAt', time_limit_at_value,
      'timeLimitTimezone', case when time_limit_at_value is null then null else actor_timezone end
    ),
    'transaction', jsonb_build_object(
      'id', transaction_id_value,
      'version', transaction_version_value,
      'serviceType', 'TK',
      'operationalStatus', operational_status_value,
      'paymentStatus', 'unpaid',
      'issuedAt', issued_at_value,
      'currency', 'GBP',
      'passengerTicketCount', passenger_ticket_count_value,
      'supplierCost', supplier_total_value,
      'salePrice', null
    ),
    'fares', fare_lines_response,
    'packageMatch', jsonb_build_object(
      'status', package_match_status_value,
      'scope', commission_scope_value,
      'linkIds', package_link_ids,
      'packageId', matched_package_id,
      'reservationId', matched_reservation_id,
      'groupId', matched_group_id,
      'packageType', matched_package_type,
      'packageReference', matched_package_reference
    ),
    'auditEventId', audit_event_id_value,
    'sourceEvent', case
      when source_event_result is null then null
      else jsonb_build_object(
        'sourceEventId', source_event_result ->> 'sourceEventId',
        'eventType', 'ticket_issued',
        'eventVersion', (source_event_result ->> 'eventVersion')::integer
      )
    end,
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

comment on function public.ticketing_create_quick_tk(uuid, text, jsonb) is
  'Service-role-only atomic TK quick entry with derived ownership, package matching, audit, issued source event, and retry-safe replay.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082201,
  now(),
  jsonb_build_object(
    'migration', '20260822_create_ticketing_quick_tk.sql',
    'capabilities', jsonb_build_array(
      'atomic-quick-tk',
      'duplicate-confirmation',
      'automatic-package-match',
      'transaction-owner-alignment',
      'starter-airline-directory'
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
    'ready', coalesce(version >= 2026082201, false),
    'version', version,
    'requiredVersion', 2026082201,
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_create_quick_tk(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_create_quick_tk(uuid, text, jsonb)
  to service_role;

revoke all on function public.validate_ticket_transaction_owner_alignment()
  from public, anon, authenticated;
grant execute on function public.validate_ticket_transaction_owner_alignment()
  to service_role;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
