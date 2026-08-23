-- Atomic, retry-safe DC/R-ER entry against an existing owned TK booking.
--
-- DC and R-ER are append-only child transactions. The original TK transaction
-- remains the immutable financial root, while Commission receives source facts
-- only through distinct non-target event types.

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

  if installed_version > 2026082301 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082301, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_forward_guard$;

-- Keep child lineage meaningful even if a future owner-level maintenance path
-- writes below the RPC boundary. Every service child points to the immutable
-- root TK. DC is an additive service movement; R-ER additionally forms a chain
-- of ticket replacements through supersedes_transaction_id.
create or replace function public.validate_ticket_service_transaction_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  parent_row public.ticket_transactions%rowtype;
  superseded_row public.ticket_transactions%rowtype;
  expected_superseded_id uuid;
  predecessor_issue_business_date date;
  booking_timezone text;
  must_validate_tail boolean;
begin
  if new.service_type not in ('DC', 'R-ER') then
    return new;
  end if;

  -- Serialize direct writes in the same booking-first order used by the RPC.
  select location.timezone
  into booking_timezone
  from public.ticket_bookings booking
  join public.locations location on location.id = booking.location_id
  where booking.id = new.booking_id
  for update of booking;

  if not found or booking_timezone is null then
    raise exception 'DC/R-ER booking branch is unavailable'
      using errcode = '23514';
  end if;

  select transaction.*
  into parent_row
  from public.ticket_transactions transaction
  where transaction.id = new.parent_transaction_id
    and transaction.booking_id = new.booking_id
  for share;

  if not found
    or parent_row.service_type <> 'TK'
    or parent_row.parent_transaction_id is not null
  then
    raise exception 'DC/R-ER parent must be the root TK transaction'
      using errcode = '23514';
  end if;

  if new.operational_status = 'issued'
    and parent_row.operational_status <> 'issued'
  then
    raise exception 'Issued DC/R-ER transactions require an Issued root TK'
      using errcode = '23514';
  end if;

  if new.service_type = 'DC' then
    if new.supersedes_transaction_id is not null then
      raise exception 'DC transactions cannot supersede a ticket transaction'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.supersedes_transaction_id is null then
    raise exception 'R-ER transactions must identify the ticket transaction they supersede'
      using errcode = '23514';
  end if;

  select transaction.*
  into superseded_row
  from public.ticket_transactions transaction
  where transaction.id = new.supersedes_transaction_id
    and transaction.booking_id = new.booking_id
  for share;

  if not found
    or not (
      (
        superseded_row.id = parent_row.id
        and superseded_row.service_type = 'TK'
        and superseded_row.parent_transaction_id is null
      )
      or (
        superseded_row.service_type = 'R-ER'
        and superseded_row.operational_status = 'issued'
      )
    )
  then
    raise exception 'R-ER can supersede only the root TK or an issued R-ER in the same booking'
      using errcode = '23514';
  end if;

  must_validate_tail := tg_op = 'INSERT'
    or old.booking_id is distinct from new.booking_id
    or old.parent_transaction_id is distinct from new.parent_transaction_id
    or old.supersedes_transaction_id is distinct from new.supersedes_transaction_id
    or old.service_type is distinct from new.service_type
    or (old.operational_status <> 'issued' and new.operational_status = 'issued');

  if must_validate_tail then
    select candidate.id
    into expected_superseded_id
    from public.ticket_transactions candidate
    where candidate.booking_id = new.booking_id
      and candidate.id <> new.id
      and candidate.service_type = 'R-ER'
      and candidate.operational_status = 'issued'
      and not exists (
        select 1
        from public.ticket_transactions successor
        where successor.booking_id = candidate.booking_id
          and successor.id <> new.id
          and successor.service_type = 'R-ER'
          and successor.operational_status = 'issued'
          and successor.supersedes_transaction_id = candidate.id
      )
    order by candidate.issued_at desc, candidate.created_at desc, candidate.id desc
    limit 1;

    expected_superseded_id := coalesce(expected_superseded_id, parent_row.id);
    if new.supersedes_transaction_id <> expected_superseded_id then
      raise exception 'R-ER must supersede the current issued replacement-chain tail'
        using errcode = '23514';
    end if;
  end if;

  select source_event.effective_on
  into predecessor_issue_business_date
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key =
      'transaction:' || superseded_row.id::text || ':issued'
  order by source_event.event_version desc
  limit 1;

  predecessor_issue_business_date := coalesce(
    predecessor_issue_business_date,
    (superseded_row.issued_at at time zone booking_timezone)::date
  );

  if predecessor_issue_business_date is null then
    raise exception 'R-ER predecessor issue date is unavailable'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if new.booking_date < predecessor_issue_business_date
    or (
      new.issued_at is not null
      and (new.issued_at at time zone booking_timezone)::date
        < predecessor_issue_business_date
    )
  then
    raise exception 'R-ER booking and issue dates cannot predate the superseded ticket issue date'
      using
        errcode = '22023',
        hint = 'TICKETING_REISSUE_DATE_BEFORE_PREDECESSOR';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transactions_validate_service_lineage
  on public.ticket_transactions;
create trigger ticket_transactions_validate_service_lineage
  before insert or update of
    booking_id,
    parent_transaction_id,
    supersedes_transaction_id,
    service_type,
    operational_status,
    issued_at
  on public.ticket_transactions
  for each row execute function public.validate_ticket_service_transaction_lineage();

create or replace function public.ticketing_append_service_transaction(
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
  expected_keys constant text[] := array[
    'expectedBookingVersion',
    'expectedRootTransactionVersion',
    'serviceType',
    'bookingDate',
    'issuedAt',
    'paymentStatus',
    'paidAt',
    'currency',
    'fares'
  ];
  fare_keys constant text[] := array[
    'passengerType',
    'quantity',
    'unitSupplierCost',
    'unitSalePrice'
  ];
  action_name_value constant text := 'ticketing.append_service_transaction.v1';
  idempotency_key_value text;
  unknown_key text;
  expected_booking_version_value bigint;
  expected_root_version_value bigint;
  service_type_value text;
  event_type_value text;
  booking_date_value date;
  issued_date_value date;
  issued_at_value timestamptz;
  payment_status_value text;
  paid_date_value date;
  paid_at_value timestamptz;
  canonical_fares jsonb;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  actor_timezone text;
  booking_timezone text;
  booking_row public.ticket_bookings%rowtype;
  root_transaction_row public.ticket_transactions%rowtype;
  child_transaction_row public.ticket_transactions%rowtype;
  transaction_id_value uuid := gen_random_uuid();
  audit_event_id_value uuid := gen_random_uuid();
  source_event_id_value uuid := gen_random_uuid();
  source_event_key text;
  source_event_result jsonb;
  payment_source_event_id_value uuid;
  payment_source_event_key text;
  payment_source_event_result jsonb;
  source_events_response jsonb := '[]'::jsonb;
  supersedes_transaction_id_value uuid;
  root_issued_business_date date;
  root_passenger_total_value integer;
  fare_value jsonb;
  passenger_ticket_count_value integer;
  supplier_total_value numeric(14,2);
  sale_total_value numeric(14,2);
  booking_version_value bigint;
  package_link_ids jsonb := '[]'::jsonb;
  matched_package_id uuid;
  matched_reservation_id uuid;
  matched_group_id uuid;
  matched_package_type text;
  fare_lines_response jsonb := '[]'::jsonb;
  variables_value jsonb;
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

  if p_entry is null or jsonb_typeof(p_entry) is distinct from 'object' then
    raise exception 'DC/R-ER entry must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_entry) supplied(key)
  where supplied.key <> all (expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown DC/R-ER entry field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_entry ?& expected_keys then
    raise exception 'DC/R-ER entry is missing one or more required fields'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_entry -> 'expectedBookingVersion') is distinct from 'number'
    or jsonb_typeof(p_entry -> 'expectedRootTransactionVersion') is distinct from 'number'
    or jsonb_typeof(p_entry -> 'serviceType') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'bookingDate') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'issuedAt') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'paymentStatus') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'paidAt') not in ('string', 'null')
    or jsonb_typeof(p_entry -> 'currency') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'fares') is distinct from 'array'
  then
    raise exception 'DC/R-ER entry contains invalid value types'
      using errcode = '22023';
  end if;

  begin
    if p_entry ->> 'expectedBookingVersion' !~ '^\d+$'
      or p_entry ->> 'expectedRootTransactionVersion' !~ '^\d+$'
    then
      raise invalid_text_representation;
    end if;

    expected_booking_version_value := (p_entry ->> 'expectedBookingVersion')::bigint;
    expected_root_version_value := (p_entry ->> 'expectedRootTransactionVersion')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Expected Ticketing versions must be positive integers'
      using errcode = '22023';
  end;

  if expected_booking_version_value < 1 or expected_root_version_value < 1 then
    raise exception 'Expected Ticketing versions must be positive integers'
      using errcode = '22023';
  end if;

  service_type_value := p_entry ->> 'serviceType';
  event_type_value := case service_type_value
    when 'DC' then 'ticket_date_changed'
    when 'R-ER' then 'ticket_reissued'
  end;
  payment_status_value := p_entry ->> 'paymentStatus';

  if event_type_value is null
    or payment_status_value not in ('unpaid', 'paid')
    or p_entry ->> 'currency' <> 'GBP'
  then
    raise exception 'DC/R-ER entry contains invalid contract values'
      using errcode = '22023';
  end if;

  begin
    if p_entry ->> 'bookingDate' !~ '^\d{4}-\d{2}-\d{2}$'
      or p_entry ->> 'issuedAt' !~ '^\d{4}-\d{2}-\d{2}$'
    then
      raise invalid_datetime_format;
    end if;

    booking_date_value := (p_entry ->> 'bookingDate')::date;
    issued_date_value := (p_entry ->> 'issuedAt')::date;

    if to_char(booking_date_value, 'YYYY-MM-DD') <> p_entry ->> 'bookingDate'
      or to_char(issued_date_value, 'YYYY-MM-DD') <> p_entry ->> 'issuedAt'
    then
      raise invalid_datetime_format;
    end if;

    if p_entry ->> 'paidAt' is not null then
      if p_entry ->> 'paidAt' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise invalid_datetime_format;
      end if;
      paid_date_value := (p_entry ->> 'paidAt')::date;
      if to_char(paid_date_value, 'YYYY-MM-DD') <> p_entry ->> 'paidAt' then
        raise invalid_datetime_format;
      end if;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'DC/R-ER dates must use valid YYYY-MM-DD values'
      using errcode = '22023';
  end;

  if issued_date_value < booking_date_value then
    raise exception 'issuedAt cannot be earlier than bookingDate'
      using errcode = '22023';
  end if;

  if (payment_status_value = 'unpaid' and paid_date_value is not null)
    or (payment_status_value = 'paid' and paid_date_value is null)
  then
    raise exception 'Paid DC/R-ER entries require paidAt; Unpaid entries require null paidAt'
      using errcode = '22023';
  end if;

  -- Customer payment is independent from airline issuance and can occur first,
  -- but it cannot predate this service movement's booking date.
  if paid_date_value is not null and paid_date_value < booking_date_value then
    raise exception 'paidAt cannot be earlier than bookingDate'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_entry -> 'fares') not between 1 and 3 then
    raise exception 'DC/R-ER entry requires between one and three fare groups'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
  ) then
    raise exception 'Each DC/R-ER fare group must be a JSON object'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') item(value)
    where not item.value ?& fare_keys
      or exists (
        select 1
        from jsonb_object_keys(item.value) supplied(key)
        where supplied.key <> all (fare_keys)
      )
  ) then
    raise exception 'Each DC/R-ER fare group must contain only passengerType, quantity, unitSupplierCost, and unitSalePrice'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') item(value)
    where jsonb_typeof(item.value -> 'passengerType') is distinct from 'string'
      or jsonb_typeof(item.value -> 'quantity') is distinct from 'number'
      or jsonb_typeof(item.value -> 'unitSupplierCost') is distinct from 'number'
      or jsonb_typeof(item.value -> 'unitSalePrice') is distinct from 'number'
  ) then
    raise exception 'DC/R-ER fare-group values have invalid types'
      using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_entry -> 'fares') item(value)
      where item.value ->> 'passengerType' not in ('ADT', 'CHD', 'INF')
        or item.value ->> 'quantity' !~ '^\d+$'
        or (item.value ->> 'quantity')::integer not between 1 and 99
        or (item.value ->> 'unitSupplierCost')::numeric < 0
        or scale((item.value ->> 'unitSupplierCost')::numeric) > 2
        or (item.value ->> 'unitSupplierCost')::numeric > 99999999.99
        or (item.value ->> 'unitSalePrice')::numeric < 0
        or scale((item.value ->> 'unitSalePrice')::numeric) > 2
        or (item.value ->> 'unitSalePrice')::numeric > 99999999.99
    ) then
      raise exception 'DC/R-ER fare groups contain invalid passenger types, quantities, or money values'
        using errcode = '22023';
    end if;

    if (
      select count(distinct item.value ->> 'passengerType')
      from jsonb_array_elements(p_entry -> 'fares') item(value)
    ) <> jsonb_array_length(p_entry -> 'fares') then
      raise exception 'Each passenger type may appear only once'
        using errcode = '22023';
    end if;

    select
      sum((item.value ->> 'quantity')::integer)::integer,
      sum(
        (item.value ->> 'quantity')::integer
          * (item.value ->> 'unitSupplierCost')::numeric
      )::numeric(14,2),
      sum(
        (item.value ->> 'quantity')::integer
          * (item.value ->> 'unitSalePrice')::numeric
      )::numeric(14,2)
    into passenger_ticket_count_value, supplier_total_value, sale_total_value
    from jsonb_array_elements(p_entry -> 'fares') item(value);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'DC/R-ER fare groups contain invalid numeric values'
      using errcode = '22023';
  end;

  if passenger_ticket_count_value not between 1 and 99
    or supplier_total_value > 999999999999.99
    or sale_total_value > 999999999999.99
  then
    raise exception 'DC/R-ER fare-group totals exceed entry limits'
      using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'passengerType', item.value ->> 'passengerType',
      'quantity', (item.value ->> 'quantity')::integer,
      'unitSupplierCost', (item.value ->> 'unitSupplierCost')::numeric(14,2),
      'unitSalePrice', (item.value ->> 'unitSalePrice')::numeric(14,2)
    )
    order by case item.value ->> 'passengerType'
      when 'ADT' then 1 when 'CHD' then 2 else 3 end
  )
  into canonical_fares
  from jsonb_array_elements(p_entry -> 'fares') item(value);

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedBookingVersion', expected_booking_version_value,
    'expectedRootTransactionVersion', expected_root_version_value,
    'serviceType', service_type_value,
    'bookingDate', booking_date_value,
    'issuedAt', issued_date_value,
    'paymentStatus', payment_status_value,
    'paidAt', paid_date_value,
    'currency', 'GBP',
    'fares', canonical_fares
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  -- This is deliberately an own-ledger operation even for users with an
  -- oversight role. A later correction/team API must use a separate contract.
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
  into root_transaction_row
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

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different DC/R-ER entry'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'DC/R-ER idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if booking_row.archived_at is not null
    or booking_row.operational_status <> 'issued'
    or root_transaction_row.operational_status <> 'issued'
    or root_transaction_row.currency <> 'GBP'
  then
    raise exception 'Ticket record is not eligible for a DC/R-ER transaction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if booking_row.version <> expected_booking_version_value
    or root_transaction_row.version <> expected_root_version_value
  then
    raise exception 'Ticket versions are stale'
      using
        errcode = '40001',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'rootTransactionVersion', root_transaction_row.version
        )::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  select location.timezone
  into booking_timezone
  from public.locations location
  where location.id = booking_row.location_id
  for share of location;

  if not found or booking_timezone is null then
    raise exception 'Ticket booking branch timezone is unavailable'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  issued_at_value := issued_date_value::timestamp without time zone at time zone booking_timezone;
  paid_at_value := case
    when paid_date_value is null then null
    else paid_date_value::timestamp without time zone at time zone booking_timezone
  end;

  -- Prefer the immutable issuance business date already published for the root
  -- TK. Historical rows without that fact fall back to the root timestamp in
  -- the booking branch timezone.
  select source_event.effective_on
  into root_issued_business_date
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key =
      'transaction:' || root_transaction_row.id::text || ':issued'
  order by source_event.event_version desc
  limit 1;

  root_issued_business_date := coalesce(
    root_issued_business_date,
    (root_transaction_row.issued_at at time zone booking_timezone)::date
  );

  if root_issued_business_date is null then
    raise exception 'Root TK issuance date is unavailable'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if booking_date_value < root_issued_business_date
    or issued_date_value < root_issued_business_date
  then
    raise exception 'DC/R-ER booking and issue dates cannot predate the root TK issuance date'
      using errcode = '22023', hint = 'TICKETING_SERVICE_DATE_BEFORE_ROOT';
  end if;

  perform 1
  from public.ticket_passenger_fare_lines root_fare
  where root_fare.transaction_id = root_transaction_row.id
  order by root_fare.passenger_type
  for share;

  select coalesce(sum(root_fare.quantity), 0)::integer
  into root_passenger_total_value
  from public.ticket_passenger_fare_lines root_fare
  where root_fare.transaction_id = root_transaction_row.id;

  if passenger_ticket_count_value > root_passenger_total_value
    or exists (
    select 1
    from jsonb_array_elements(canonical_fares) item(value)
    left join public.ticket_passenger_fare_lines root_fare
      on root_fare.transaction_id = root_transaction_row.id
      and root_fare.passenger_type = item.value ->> 'passengerType'
    where root_fare.id is null
      or (item.value ->> 'quantity')::integer > root_fare.quantity
  ) then
    raise exception 'Affected DC/R-ER quantities cannot exceed the root TK passenger mix'
      using errcode = '22023', hint = 'TICKETING_AFFECTED_QUANTITY_EXCEEDED';
  end if;

  if service_type_value = 'R-ER' then
    select transaction.id
    into supersedes_transaction_id_value
    from public.ticket_transactions transaction
    where transaction.booking_id = booking_row.id
      and transaction.service_type = 'R-ER'
      and transaction.operational_status = 'issued'
      and not exists (
        select 1
        from public.ticket_transactions successor
        where successor.booking_id = transaction.booking_id
          and successor.service_type = 'R-ER'
          and successor.operational_status = 'issued'
          and successor.supersedes_transaction_id = transaction.id
      )
    order by transaction.issued_at desc, transaction.created_at desc, transaction.id desc
    limit 1
    for update;

    supersedes_transaction_id_value := coalesce(
      supersedes_transaction_id_value,
      root_transaction_row.id
    );
  end if;

  -- Insert as Draft so fare children can be added before the reconciliation
  -- trigger validates the final Issued/Paid state.
  insert into public.ticket_transactions (
    id,
    booking_id,
    parent_transaction_id,
    supersedes_transaction_id,
    service_type,
    owner_employee_id,
    acting_employee_id,
    operational_status,
    payment_status,
    booking_date,
    currency,
    idempotency_key
  ) values (
    transaction_id_value,
    booking_row.id,
    root_transaction_row.id,
    supersedes_transaction_id_value,
    service_type_value,
    p_actor_employee_id,
    p_actor_employee_id,
    'draft',
    'unpaid',
    booking_date_value,
    'GBP',
    idempotency_key_value
  );

  for fare_value in
    select item.value
    from jsonb_array_elements(canonical_fares) item(value)
    order by case item.value ->> 'passengerType'
      when 'ADT' then 1 when 'CHD' then 2 else 3 end
  loop
    insert into public.ticket_passenger_fare_lines (
      transaction_id,
      passenger_type,
      quantity,
      currency,
      unit_supplier_cost_source,
      unit_supplier_cost_gbp,
      unit_sale_price_source,
      unit_sale_price_gbp
    ) values (
      transaction_id_value,
      fare_value ->> 'passengerType',
      (fare_value ->> 'quantity')::integer,
      'GBP',
      (fare_value ->> 'unitSupplierCost')::numeric(14,2),
      (fare_value ->> 'unitSupplierCost')::numeric(14,2),
      (fare_value ->> 'unitSalePrice')::numeric(14,2),
      (fare_value ->> 'unitSalePrice')::numeric(14,2)
    );
  end loop;

  update public.ticket_transactions transaction
  set operational_status = 'issued',
      issued_at = issued_at_value,
      payment_status = payment_status_value,
      paid_at = paid_at_value
  where transaction.id = transaction_id_value
  returning transaction.* into child_transaction_row;

  -- Advance the aggregate booking concurrency token without changing the
  -- booking/root lifecycle, payment, itinerary, package, or financial facts.
  update public.ticket_bookings booking
  set updated_by = p_actor_employee_id
  where booking.id = booking_row.id
  returning booking.version into booking_version_value;

  perform 1
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
  order by link.id
  for share;

  select coalesce(jsonb_agg(link.id order by link.id), '[]'::jsonb)
  into package_link_ids
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null;

  select link.package_id, link.reservation_id, link.group_id, link.package_type_snapshot
  into matched_package_id, matched_reservation_id, matched_group_id, matched_package_type
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
    and link.match_status = 'matched'
  order by link.id
  limit 1;

  variables_value := jsonb_build_object(
    'service_type', service_type_value,
    'operational_status', 'issued',
    'payment_status', payment_status_value,
    'issued_at', issued_at_value,
    'paid_at', paid_at_value,
    'cancelled_at', null,
    'refunded_at', null,
    'passenger_ticket_count', passenger_ticket_count_value,
    'currency', 'GBP',
    'supplier_cost_source', supplier_total_value,
    'supplier_cost_gbp', supplier_total_value,
    'sale_price_source', sale_total_value,
    'sale_price_gbp', sale_total_value,
    'pnr', booking_row.normalized_pnr,
    'airline_id', booking_row.airline_id,
    'parent_transaction_id', root_transaction_row.id,
    'supersedes_transaction_id', supersedes_transaction_id_value,
    'root_transaction_id', root_transaction_row.id,
    'root_transaction_version', root_transaction_row.version,
    'package_link_ids', package_link_ids,
    'package_id', matched_package_id,
    'reservation_id', matched_reservation_id,
    'group_id', matched_group_id,
    'package_type', matched_package_type,
    'package_match_status', booking_row.package_match_status,
    'commission_scope', booking_row.commission_scope
  );

  source_event_key := 'tkst:v1:' || encode(digest(
    p_actor_employee_id::text || ':' || idempotency_key_value || ':issued',
    'sha256'
  ), 'hex');

  source_event_result := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', source_event_id_value,
    'source_fact_key', 'transaction:' || transaction_id_value::text || ':issued',
    'source_record_id', transaction_id_value,
    'event_type', event_type_value,
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', p_actor_employee_id,
    'owner_employee_id', booking_row.owner_employee_id,
    'location_id', booking_row.location_id,
    'occurred_at', now_value,
    'effective_on', issued_date_value,
    'source_path', '/dashboard/ticketing/ledger/' || booking_row.id::text,
    'variables', variables_value,
    'idempotency_key', source_event_key
  ));

  source_events_response := source_events_response || jsonb_build_array(jsonb_build_object(
    'sourceEventId', source_event_result ->> 'sourceEventId',
    'eventType', event_type_value,
    'eventVersion', (source_event_result ->> 'eventVersion')::integer
  ));

  -- Payment is a separate state fact, matching the existing TK completion
  -- contract. Commission decides whether that state has any earning effect.
  if payment_status_value = 'paid' then
    payment_source_event_id_value := gen_random_uuid();
    payment_source_event_key := 'tkst:v1:' || encode(digest(
      p_actor_employee_id::text || ':' || idempotency_key_value || ':paid',
      'sha256'
    ), 'hex');

    payment_source_event_result := public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', payment_source_event_id_value,
      'source_fact_key', 'transaction:' || transaction_id_value::text || ':paid',
      'source_record_id', transaction_id_value,
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
      'idempotency_key', payment_source_event_key
    ));

    source_events_response := source_events_response || jsonb_build_array(jsonb_build_object(
      'sourceEventId', payment_source_event_result ->> 'sourceEventId',
      'eventType', 'ticket_paid',
      'eventVersion', (payment_source_event_result ->> 'eventVersion')::integer
    ));
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
    booking_row.id,
    transaction_id_value,
    'append_service_transaction',
    p_actor_employee_id,
    null,
    jsonb_build_object(
      'service_type', service_type_value,
      'operational_status', 'issued',
      'payment_status', payment_status_value,
      'passenger_ticket_count', passenger_ticket_count_value,
      'parent_transaction_id', root_transaction_row.id,
      'supersedes_transaction_id', supersedes_transaction_id_value,
      'package_match_status', booking_row.package_match_status,
      'commission_scope', booking_row.commission_scope,
      'source_event_ids', jsonb_build_array(source_event_id_value)
        || case
          when payment_source_event_id_value is null then '[]'::jsonb
          else jsonb_build_array(payment_source_event_id_value)
        end
    ),
    now_value
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', fare_line.id,
      'passengerType', fare_line.passenger_type,
      'quantity', fare_line.quantity,
      'unitSupplierCost', fare_line.unit_supplier_cost_source,
      'unitSalePrice', fare_line.unit_sale_price_source,
      'supplierTotal', fare_line.supplier_total_source,
      'saleTotal', fare_line.sale_total_source
    ) order by case fare_line.passenger_type
      when 'ADT' then 1 when 'CHD' then 2 else 3 end
  ), '[]'::jsonb)
  into fare_lines_response
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_id_value;

  response_value := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking_row.id,
      'version', booking_version_value,
      'ownerEmployeeId', booking_row.owner_employee_id,
      'locationId', booking_row.location_id,
      'airlineId', booking_row.airline_id,
      'customerName', booking_row.customer_name,
      'pnr', booking_row.pnr,
      'normalizedPnr', booking_row.normalized_pnr,
      'operationalStatus', booking_row.operational_status,
      'paymentStatus', booking_row.payment_status
    ),
    'rootTransaction', jsonb_build_object(
      'id', root_transaction_row.id,
      'version', root_transaction_row.version,
      'serviceType', 'TK'
    ),
    'transaction', jsonb_build_object(
      'id', child_transaction_row.id,
      'version', child_transaction_row.version,
      'parentTransactionId', root_transaction_row.id,
      'supersedesTransactionId', child_transaction_row.supersedes_transaction_id,
      'serviceType', child_transaction_row.service_type,
      'operationalStatus', child_transaction_row.operational_status,
      'paymentStatus', child_transaction_row.payment_status,
      'bookingDate', child_transaction_row.booking_date,
      'issuedOn', issued_date_value,
      'issuedAt', child_transaction_row.issued_at,
      'paidOn', paid_date_value,
      'paidAt', child_transaction_row.paid_at,
      'currency', child_transaction_row.currency,
      'passengerTicketCount', child_transaction_row.passenger_ticket_count,
      'supplierCost', child_transaction_row.supplier_cost_source,
      'salePrice', child_transaction_row.sale_price_source
    ),
    'fares', fare_lines_response,
    'packageMatch', jsonb_build_object(
      'status', booking_row.package_match_status,
      'scope', booking_row.commission_scope,
      'linkIds', package_link_ids,
      'packageId', matched_package_id,
      'reservationId', matched_reservation_id,
      'groupId', matched_group_id,
      'packageType', matched_package_type
    ),
    'auditEventId', audit_event_id_value,
    'sourceEvents', source_events_response,
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
    raise exception 'DC/R-ER entry contains an invalid date'
      using errcode = '22023';
end
$$;

comment on function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb) is
  'Service-role-only own-record append of an aggregate issued DC/R-ER movement with strict affected quantities, root/reissue lineage, optimistic versions, audit, package scope, and variables-only Commission events. It does not claim passenger allocation or itinerary completeness.';

create or replace function public.ticketing_mark_service_transaction_paid(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_transaction_id uuid,
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
    'expectedBookingVersion',
    'expectedTransactionVersion',
    'paidAt'
  ];
  action_name_value constant text := 'ticketing.mark_service_transaction_paid.v1';
  idempotency_key_value text;
  unknown_key text;
  expected_booking_version_value bigint;
  expected_transaction_version_value bigint;
  paid_date_value date;
  paid_at_value timestamptz;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  actor_timezone text;
  booking_timezone text;
  booking_row public.ticket_bookings%rowtype;
  root_transaction_row public.ticket_transactions%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  booking_version_value bigint;
  changed_value boolean := false;
  audit_event_id_value uuid;
  source_event_id_value uuid;
  source_event_key text;
  source_event_result jsonb;
  existing_paid_event_id uuid;
  package_link_ids jsonb := '[]'::jsonb;
  matched_package_id uuid;
  matched_reservation_id uuid;
  matched_group_id uuid;
  matched_package_type text;
  variables_value jsonb;
  now_value timestamptz := clock_timestamp();
  response_value jsonb;
begin
  if p_actor_employee_id is null then
    raise exception 'Authenticated Ticketing employee required'
      using errcode = '42501';
  end if;

  if p_booking_id is null or p_transaction_id is null then
    raise exception 'Ticket service transaction not found'
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

  if p_payment is null or jsonb_typeof(p_payment) is distinct from 'object' then
    raise exception 'DC/R-ER payment must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_payment) supplied(key)
  where supplied.key <> all (expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown DC/R-ER payment field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_payment ?& expected_keys then
    raise exception 'DC/R-ER payment is missing one or more required fields'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_payment -> 'expectedBookingVersion') is distinct from 'number'
    or jsonb_typeof(p_payment -> 'expectedTransactionVersion') is distinct from 'number'
    or jsonb_typeof(p_payment -> 'paidAt') is distinct from 'string'
  then
    raise exception 'DC/R-ER payment contains invalid value types'
      using errcode = '22023';
  end if;

  begin
    if p_payment ->> 'expectedBookingVersion' !~ '^\d+$'
      or p_payment ->> 'expectedTransactionVersion' !~ '^\d+$'
      or p_payment ->> 'paidAt' !~ '^\d{4}-\d{2}-\d{2}$'
    then
      raise invalid_text_representation;
    end if;

    expected_booking_version_value := (p_payment ->> 'expectedBookingVersion')::bigint;
    expected_transaction_version_value := (p_payment ->> 'expectedTransactionVersion')::bigint;
    paid_date_value := (p_payment ->> 'paidAt')::date;

    if to_char(paid_date_value, 'YYYY-MM-DD') <> p_payment ->> 'paidAt' then
      raise invalid_datetime_format;
    end if;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
      or numeric_value_out_of_range
    then
      raise exception 'DC/R-ER payment contains invalid versions or paidAt date'
        using errcode = '22023';
  end;

  if expected_booking_version_value < 1 or expected_transaction_version_value < 1 then
    raise exception 'Expected Ticketing versions must be positive integers'
      using errcode = '22023';
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'transactionId', p_transaction_id,
    'expectedBookingVersion', expected_booking_version_value,
    'expectedTransactionVersion', expected_transaction_version_value,
    'paidAt', paid_date_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  select booking.*
  into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
    and booking.owner_employee_id = p_actor_employee_id
  for update;

  if not found then
    raise exception 'Ticket service transaction not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  select transaction.*
  into root_transaction_row
  from public.ticket_transactions transaction
  where transaction.booking_id = booking_row.id
    and transaction.owner_employee_id = p_actor_employee_id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  for update;

  if not found then
    raise exception 'Ticket service transaction not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  select transaction.*
  into transaction_row
  from public.ticket_transactions transaction
  where transaction.id = p_transaction_id
    and transaction.booking_id = booking_row.id
    and transaction.owner_employee_id = p_actor_employee_id
    and transaction.service_type in ('DC', 'R-ER')
    and transaction.parent_transaction_id = root_transaction_row.id
  for update;

  if not found then
    raise exception 'Ticket service transaction not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different DC/R-ER payment'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'DC/R-ER payment idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if booking_row.archived_at is not null
    or booking_row.operational_status <> 'issued'
    or root_transaction_row.operational_status <> 'issued'
    or transaction_row.operational_status <> 'issued'
    or transaction_row.currency <> 'GBP'
    or transaction_row.supplier_cost_source is null
    or transaction_row.supplier_cost_gbp is null
    or transaction_row.sale_price_source is null
    or transaction_row.sale_price_gbp is null
  then
    raise exception 'Ticket service payment requires a complete issued DC/R-ER transaction'
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
  for share of location;

  if not found or booking_timezone is null then
    raise exception 'Ticket booking branch timezone is unavailable'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if paid_date_value < transaction_row.booking_date then
    raise exception 'paidAt cannot be earlier than the DC/R-ER bookingDate'
      using errcode = '22023';
  end if;

  paid_at_value := paid_date_value::timestamp without time zone at time zone booking_timezone;

  select source_event.id
  into existing_paid_event_id
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key =
      'transaction:' || transaction_row.id::text || ':paid'
  order by source_event.event_version desc
  limit 1;

  if transaction_row.payment_status = 'part_paid' then
    raise exception 'Part Paid service transactions require an amount-aware correction workflow'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  elsif transaction_row.payment_status = 'paid' then
    if transaction_row.paid_at is distinct from paid_at_value
      or existing_paid_event_id is null
    then
      raise exception 'Paid service transaction requires an audited correction'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
  elsif transaction_row.payment_status = 'unpaid' then
    if transaction_row.paid_at is not null or existing_paid_event_id is not null then
      raise exception 'Service payment facts are inconsistent'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;

    update public.ticket_transactions transaction
    set payment_status = 'paid',
        paid_at = paid_at_value
    where transaction.id = transaction_row.id
    returning transaction.* into transaction_row;

    update public.ticket_bookings booking
    set updated_by = p_actor_employee_id
    where booking.id = booking_row.id
    returning booking.version into booking_version_value;

    changed_value := true;
  else
    raise exception 'Service payment state requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if not changed_value then
    booking_version_value := booking_row.version;
  end if;

  perform 1
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
  order by link.id
  for share;

  select coalesce(jsonb_agg(link.id order by link.id), '[]'::jsonb)
  into package_link_ids
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null;

  select link.package_id, link.reservation_id, link.group_id, link.package_type_snapshot
  into matched_package_id, matched_reservation_id, matched_group_id, matched_package_type
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
    and link.match_status = 'matched'
  order by link.id
  limit 1;

  variables_value := jsonb_build_object(
    'service_type', transaction_row.service_type,
    'operational_status', transaction_row.operational_status,
    'payment_status', transaction_row.payment_status,
    'issued_at', transaction_row.issued_at,
    'paid_at', transaction_row.paid_at,
    'cancelled_at', transaction_row.cancelled_at,
    'refunded_at', transaction_row.refunded_at,
    'passenger_ticket_count', transaction_row.passenger_ticket_count,
    'currency', transaction_row.currency,
    'supplier_cost_source', transaction_row.supplier_cost_source,
    'supplier_cost_gbp', transaction_row.supplier_cost_gbp,
    'sale_price_source', transaction_row.sale_price_source,
    'sale_price_gbp', transaction_row.sale_price_gbp,
    'pnr', booking_row.normalized_pnr,
    'airline_id', booking_row.airline_id,
    'parent_transaction_id', transaction_row.parent_transaction_id,
    'supersedes_transaction_id', transaction_row.supersedes_transaction_id,
    'root_transaction_id', root_transaction_row.id,
    'root_transaction_version', root_transaction_row.version,
    'package_link_ids', package_link_ids,
    'package_id', matched_package_id,
    'reservation_id', matched_reservation_id,
    'group_id', matched_group_id,
    'package_type', matched_package_type,
    'package_match_status', booking_row.package_match_status,
    'commission_scope', booking_row.commission_scope
  );

  if changed_value then
    source_event_id_value := gen_random_uuid();
    source_event_key := 'tksp:v1:' || encode(digest(
      p_actor_employee_id::text || ':' || idempotency_key_value || ':paid',
      'sha256'
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
      'mark_service_transaction_paid',
      p_actor_employee_id,
      jsonb_build_object('payment_status', 'unpaid', 'paid_at', null),
      jsonb_build_object(
        'payment_status', 'paid',
        'paid_at', transaction_row.paid_at,
        'source_event_id', source_event_id_value
      ),
      now_value
    );
  end if;

  response_value := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking_row.id,
      'version', booking_version_value
    ),
    'transaction', jsonb_build_object(
      'id', transaction_row.id,
      'version', transaction_row.version,
      'parentTransactionId', transaction_row.parent_transaction_id,
      'supersedesTransactionId', transaction_row.supersedes_transaction_id,
      'serviceType', transaction_row.service_type,
      'operationalStatus', transaction_row.operational_status,
      'paymentStatus', transaction_row.payment_status,
      'bookingDate', transaction_row.booking_date,
      'issuedOn', (transaction_row.issued_at at time zone booking_timezone)::date,
      'paidOn', (transaction_row.paid_at at time zone booking_timezone)::date,
      'paidAt', transaction_row.paid_at,
      'currency', transaction_row.currency,
      'passengerTicketCount', transaction_row.passenger_ticket_count,
      'supplierCost', transaction_row.supplier_cost_source,
      'salePrice', transaction_row.sale_price_source
    ),
    'auditEventId', audit_event_id_value,
    'sourceEvent', case
      when source_event_result is null then null
      else jsonb_build_object(
        'sourceEventId', source_event_result ->> 'sourceEventId',
        'eventType', 'ticket_paid',
        'eventVersion', (source_event_result ->> 'eventVersion')::integer
      )
    end,
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
    raise exception 'DC/R-ER payment contains an invalid date'
      using errcode = '22023';
end
$$;

comment on function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb) is
  'Service-role-only own-record Unpaid-to-Paid transition for an issued aggregate DC/R-ER movement. It leaves booking/root payment facts unchanged and emits one variables-only ticket_paid fact.';

-- Capability 2303 renames these bodies to inaccessible cores and installs
-- branch-date response wrappers under the public RPC names. If an operator
-- later replays this historical migration by itself, restore those wrappers
-- before commit so the ratcheted response contract cannot be downgraded.
do $restore_2303_wrappers$
begin
  if to_regprocedure(
      'public.ticketing_append_service_transaction_core_2026082303(uuid,uuid,text,jsonb)'
    ) is not null
    and to_regprocedure(
      'public.ticketing_enrich_service_business_dates_2026082303(uuid,jsonb)'
    ) is not null
  then
    execute $append_wrapper$
      create or replace function public.ticketing_append_service_transaction(
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
      as $body$
      begin
        return public.ticketing_enrich_service_business_dates_2026082303(
          p_booking_id,
          public.ticketing_append_service_transaction_core_2026082303(
            p_actor_employee_id,
            p_booking_id,
            p_idempotency_key,
            p_entry
          )
        );
      end
      $body$
    $append_wrapper$;
  end if;

  if to_regprocedure(
      'public.ticketing_mark_service_transaction_paid_core_2026082303(uuid,uuid,uuid,text,jsonb)'
    ) is not null
    and to_regprocedure(
      'public.ticketing_enrich_service_business_dates_2026082303(uuid,jsonb)'
    ) is not null
  then
    execute $payment_wrapper$
      create or replace function public.ticketing_mark_service_transaction_paid(
        p_actor_employee_id uuid,
        p_booking_id uuid,
        p_transaction_id uuid,
        p_idempotency_key text,
        p_payment jsonb
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = pg_catalog, public, pg_temp
      set row_security = off
      as $body$
      begin
        return public.ticketing_enrich_service_business_dates_2026082303(
          p_booking_id,
          public.ticketing_mark_service_transaction_paid_core_2026082303(
            p_actor_employee_id,
            p_booking_id,
            p_transaction_id,
            p_idempotency_key,
            p_payment
          )
        );
      end
      $body$
    $payment_wrapper$;
  end if;
end
$restore_2303_wrappers$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082301,
  now(),
  jsonb_build_object(
    'migration', '20260823_ticketing_dc_rer_entry.sql',
    'capabilities', jsonb_build_array(
      'atomic-quick-tk',
      'duplicate-confirmation',
      'automatic-package-match',
      'transaction-owner-alignment',
      'starter-airline-directory',
      'atomic-tk-completion',
      'stable-passenger-slots',
      'optimistic-ticket-versions',
      'ticket-sale-and-payment-events',
      'atomic-dc-rer-entry',
      'root-transaction-lineage',
      'affected-passenger-quantity-guard',
      'target-safe-service-events',
      'service-transaction-payment'
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
    'ready', coalesce(version >= 2026082301, false),
    'version', version,
    'requiredVersion', greatest(version, 2026082301),
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.validate_ticket_service_transaction_lineage()
  from public, anon, authenticated;
grant execute on function public.validate_ticket_service_transaction_lineage()
  to service_role;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
