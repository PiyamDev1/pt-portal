-- Shared, append-only Low Fare / higher-fare supplier-cost adjustments.
--
-- This capability records one whole-PNR GBP supplier-fare movement against an
-- active Issued root TK. It never changes the root transaction, allocates a
-- movement to individual passengers, creates an R-ER, or calculates earnings.

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

  if installed_version > 2026082401 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082401, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082304 then
    raise exception 'Ticketing capability 2026082304 is required before Low Fare capability 2026082401'
      using
        errcode = '55000',
        hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_forward_guard$;

create table if not exists public.ticket_fare_adjustments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  root_transaction_id uuid not null,
  previous_adjustment_id uuid,
  sequence_number integer not null,
  acting_employee_id uuid not null references public.employees(id) on delete restrict,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  actor_location_id uuid not null references public.locations(id) on delete restrict,
  booking_location_id uuid not null references public.locations(id) on delete restrict,
  currency text not null default 'GBP',
  original_fare_source numeric(14,2) not null,
  original_fare_gbp numeric(14,2) not null,
  new_fare_source numeric(14,2) not null,
  new_fare_gbp numeric(14,2) not null,
  difference_source numeric(14,2)
    generated always as (round(original_fare_source - new_fare_source, 2)) stored,
  difference_gbp numeric(14,2)
    generated always as (round(original_fare_gbp - new_fare_gbp, 2)) stored,
  passenger_ticket_count integer not null,
  effective_on date not null,
  notes text,
  package_match_status text not null,
  commission_scope text not null,
  package_link_ids uuid[] not null default array[]::uuid[],
  package_id uuid,
  reservation_id uuid,
  group_id uuid,
  package_type text,
  created_at timestamptz not null default now(),
  constraint ticket_fare_adjustments_id_booking_unique unique (id, booking_id),
  constraint ticket_fare_adjustments_root_same_booking_fkey
    foreign key (root_transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict,
  constraint ticket_fare_adjustments_previous_same_booking_fkey
    foreign key (previous_adjustment_id, booking_id)
    references public.ticket_fare_adjustments(id, booking_id)
    on delete restrict,
  constraint ticket_fare_adjustments_sequence_positive_check
    check (sequence_number > 0),
  constraint ticket_fare_adjustments_sequence_predecessor_check check (
    (sequence_number = 1 and previous_adjustment_id is null)
    or (sequence_number > 1 and previous_adjustment_id is not null)
  ),
  constraint ticket_fare_adjustments_currency_check check (currency = 'GBP'),
  constraint ticket_fare_adjustments_money_check check (
    original_fare_source >= 0
    and original_fare_source <= 99999999.99
    and original_fare_gbp >= 0
    and original_fare_gbp <= 99999999.99
    and new_fare_source > 0
    and new_fare_source <= 99999999.99
    and new_fare_gbp > 0
    and new_fare_gbp <= 99999999.99
    and original_fare_gbp <> new_fare_gbp
  ),
  constraint ticket_fare_adjustments_gbp_source_equality_check check (
    original_fare_source = original_fare_gbp
    and new_fare_source = new_fare_gbp
    and difference_source = difference_gbp
  ),
  constraint ticket_fare_adjustments_passenger_count_check
    check (passenger_ticket_count > 0),
  constraint ticket_fare_adjustments_notes_check
    check (notes is null or length(btrim(notes)) between 1 and 1000),
  constraint ticket_fare_adjustments_package_match_status_check
    check (package_match_status in ('unmatched', 'matched', 'ambiguous', 'manually_resolved')),
  constraint ticket_fare_adjustments_commission_scope_check
    check (commission_scope in ('ticket', 'package', 'unresolved')),
  constraint ticket_fare_adjustments_match_scope_check check (
    (package_match_status = 'unmatched' and commission_scope = 'ticket')
    or (
      package_match_status in ('matched', 'manually_resolved')
      and commission_scope = 'package'
    )
    or (package_match_status = 'ambiguous' and commission_scope = 'unresolved')
  ),
  constraint ticket_fare_adjustments_package_snapshot_check check (
    (
      commission_scope = 'package'
      and cardinality(package_link_ids) = 1
      and package_id is not null
      and reservation_id is not null
      and package_type in ('umrah', 'holiday', 'ziyarat')
    )
    or (
      commission_scope = 'ticket'
      and cardinality(package_link_ids) = 0
      and package_id is null
      and reservation_id is null
      and group_id is null
      and package_type is null
    )
    or (
      commission_scope = 'unresolved'
      and cardinality(package_link_ids) >= 2
      and package_id is null
      and reservation_id is null
      and group_id is null
      and package_type is null
    )
  )
);

create unique index if not exists ticket_fare_adjustments_booking_sequence_idx
  on public.ticket_fare_adjustments (booking_id, sequence_number);

create unique index if not exists ticket_fare_adjustments_one_successor_idx
  on public.ticket_fare_adjustments (previous_adjustment_id)
  where previous_adjustment_id is not null;

create index if not exists ticket_fare_adjustments_booking_latest_idx
  on public.ticket_fare_adjustments (booking_id, sequence_number desc);

comment on table public.ticket_fare_adjustments is
  'Immutable whole-PNR GBP supplier-fare adjustment history. Difference is original minus new: positive is Low Fare and negative is a higher fare. Commission calculations remain outside Ticketing.';

-- Package-scope writers must participate in the same booking-first
-- serialization used by Ticketing mutation RPCs. In particular, this closes
-- the phantom-insert window that row-locking only the currently visible links
-- would leave while a Low Fare adjustment snapshots Commission scope.
create or replace function public.serialize_ticket_package_scope_2026082401()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_id_value uuid;
begin
  booking_id_value := case
    when tg_op = 'DELETE' then old.booking_id
    else new.booking_id
  end;

  perform 1
  from public.ticket_bookings booking
  where booking.id = booking_id_value
  for update;

  if not found then
    raise exception 'Ticket package-link booking is unavailable'
      using errcode = '23503';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists ticket_package_links_00_serialize_booking_scope_2401
  on public.ticket_package_links;
create trigger ticket_package_links_00_serialize_booking_scope_2401
  before insert or update or delete on public.ticket_package_links
  for each row execute function public.serialize_ticket_package_scope_2026082401();

create or replace function public.validate_ticket_fare_adjustment_lineage_2026082401()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  root_row public.ticket_transactions%rowtype;
  previous_row public.ticket_fare_adjustments%rowtype;
  current_tail public.ticket_fare_adjustments%rowtype;
  actor_location_value uuid;
  booking_timezone text;
  root_issued_business_date date;
  expected_original_fare numeric(14,2);
  expected_package_link_ids uuid[] := array[]::uuid[];
  expected_package_id uuid;
  expected_reservation_id uuid;
  expected_group_id uuid;
  expected_package_type text;
begin
  select booking.*
  into booking_row
  from public.ticket_bookings booking
  where booking.id = new.booking_id
  for update;

  if not found then
    raise exception 'Low Fare booking is unavailable'
      using errcode = '23514';
  end if;

  select employee.location_id
  into actor_location_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  join public.locations location on location.id = employee.location_id
  where employee.id = new.acting_employee_id
    and employee.is_active
    and location.timezone is not null
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

  if not found or actor_location_value is distinct from new.actor_location_id then
    raise exception 'Low Fare acting employee snapshot is invalid'
      using errcode = '23514';
  end if;

  select transaction.*
  into root_row
  from public.ticket_transactions transaction
  where transaction.id = new.root_transaction_id
    and transaction.booking_id = new.booking_id
  for share;

  if not found
    or booking_row.archived_at is not null
    or booking_row.operational_status <> 'issued'
    or booking_row.normalized_pnr is null
    or root_row.service_type <> 'TK'
    or root_row.parent_transaction_id is not null
    or root_row.operational_status <> 'issued'
    or root_row.owner_employee_id <> booking_row.owner_employee_id
    or root_row.currency <> 'GBP'
    or root_row.supplier_cost_source is null
    or root_row.supplier_cost_gbp is null
    or root_row.supplier_cost_source <> root_row.supplier_cost_gbp
    or root_row.supplier_cost_gbp < 0
    or root_row.supplier_cost_gbp > 99999999.99
    or root_row.passenger_ticket_count <= 0
  then
    raise exception 'Low Fare adjustment requires an active complete Issued GBP root TK'
      using errcode = '23514', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if new.owner_employee_id is distinct from booking_row.owner_employee_id
    or new.booking_location_id is distinct from booking_row.location_id
    or new.currency <> 'GBP'
    or new.passenger_ticket_count <> root_row.passenger_ticket_count
  then
    raise exception 'Low Fare booking, owner, branch, currency, or passenger snapshot is invalid'
      using errcode = '23514';
  end if;

  select adjustment.*
  into current_tail
  from public.ticket_fare_adjustments adjustment
  where adjustment.booking_id = new.booking_id
  order by adjustment.sequence_number desc
  limit 1
  for share;

  if found then
    if new.previous_adjustment_id is distinct from current_tail.id
      or new.sequence_number <> current_tail.sequence_number + 1
    then
      raise exception 'Low Fare adjustment must extend the current booking tail'
        using
          errcode = '23505',
          hint = 'TICKETING_FARE_ADJUSTMENT_LINEAGE_CONFLICT';
    end if;
    previous_row := current_tail;
    expected_original_fare := current_tail.new_fare_gbp;
  else
    if new.previous_adjustment_id is not null or new.sequence_number <> 1 then
      raise exception 'First Low Fare adjustment must start at sequence one'
        using
          errcode = '23505',
          hint = 'TICKETING_FARE_ADJUSTMENT_LINEAGE_CONFLICT';
    end if;
    expected_original_fare := root_row.supplier_cost_gbp;
  end if;

  if new.original_fare_source is distinct from expected_original_fare
    or new.original_fare_gbp is distinct from expected_original_fare
    or new.new_fare_source is distinct from new.new_fare_gbp
    or new.difference_source is distinct from new.difference_gbp
  then
    raise exception 'Low Fare original fare must equal the server-derived current fare'
      using errcode = '23514', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  select location.timezone
  into booking_timezone
  from public.locations location
  where location.id = booking_row.location_id
  for share of location;

  if not found or booking_timezone is null then
    raise exception 'Low Fare booking branch timezone is unavailable'
      using errcode = '23514', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  select source_event.effective_on
  into root_issued_business_date
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key =
      'transaction:' || root_row.id::text || ':issued'
  order by source_event.event_version desc
  limit 1;

  root_issued_business_date := coalesce(
    root_issued_business_date,
    (root_row.issued_at at time zone booking_timezone)::date
  );

  if root_issued_business_date is null
    or new.effective_on < root_issued_business_date
    or (
      previous_row.id is not null
      and new.effective_on < previous_row.effective_on
    )
  then
    raise exception 'Low Fare effective date cannot predate its root issue date or current adjustment tail'
      using
        errcode = '22023',
        hint = 'TICKETING_DATE_CONFLICT';
  end if;

  perform 1
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
  order by link.id
  for share;

  select coalesce(array_agg(link.id order by link.id), array[]::uuid[])
  into expected_package_link_ids
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null;

  select link.package_id, link.reservation_id, link.group_id, link.package_type_snapshot
  into expected_package_id, expected_reservation_id, expected_group_id, expected_package_type
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
    and link.match_status = 'matched'
  order by link.id
  limit 1;

  if new.package_match_status is distinct from booking_row.package_match_status
    or new.commission_scope is distinct from booking_row.commission_scope
    or new.package_link_ids is distinct from expected_package_link_ids
    or new.package_id is distinct from expected_package_id
    or new.reservation_id is distinct from expected_reservation_id
    or new.group_id is distinct from expected_group_id
    or new.package_type is distinct from expected_package_type
  then
    raise exception 'Low Fare package and Commission scope must be server-derived'
      using errcode = '23514', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_fare_adjustments_validate_lineage
  on public.ticket_fare_adjustments;
create trigger ticket_fare_adjustments_validate_lineage
  before insert on public.ticket_fare_adjustments
  for each row execute function public.validate_ticket_fare_adjustment_lineage_2026082401();

drop trigger if exists ticket_fare_adjustments_immutable
  on public.ticket_fare_adjustments;
create trigger ticket_fare_adjustments_immutable
  before update or delete on public.ticket_fare_adjustments
  for each row execute function public.reject_immutable_event_mutation();

create or replace view public.ticket_fare_adjustment_current
with (security_invoker = true)
as
select distinct on (adjustment.booking_id)
  adjustment.id,
  adjustment.booking_id,
  adjustment.root_transaction_id,
  adjustment.previous_adjustment_id,
  adjustment.sequence_number,
  adjustment.acting_employee_id,
  adjustment.owner_employee_id,
  adjustment.actor_location_id,
  adjustment.booking_location_id,
  adjustment.currency,
  adjustment.original_fare_source,
  adjustment.original_fare_gbp,
  adjustment.new_fare_source,
  adjustment.new_fare_gbp,
  adjustment.difference_source,
  adjustment.difference_gbp,
  adjustment.passenger_ticket_count,
  adjustment.effective_on,
  adjustment.notes,
  adjustment.package_match_status,
  adjustment.commission_scope,
  adjustment.package_link_ids,
  adjustment.package_id,
  adjustment.reservation_id,
  adjustment.group_id,
  adjustment.package_type,
  adjustment.created_at
from public.ticket_fare_adjustments adjustment
order by adjustment.booking_id, adjustment.sequence_number desc;

comment on view public.ticket_fare_adjustment_current is
  'One latest immutable Low Fare adjustment per adjusted booking. Never-adjusted bookings are absent and callers should left-join or map absence to null.';

create or replace function public.ticketing_append_fare_adjustment(
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
    'expectedPreviousAdjustmentId',
    'newFareGbp',
    'effectiveOn',
    'currency',
    'notes'
  ];
  action_name_value constant text := 'ticketing.append_fare_adjustment.v1';
  idempotency_key_value text;
  unknown_key text;
  expected_booking_version_value bigint;
  expected_root_version_value bigint;
  expected_previous_adjustment_id_value uuid;
  new_fare_value numeric(14,2);
  new_fare_input numeric;
  effective_on_value date;
  notes_value text;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id_value uuid;
  actor_timezone text;
  booking_timezone text;
  booking_row public.ticket_bookings%rowtype;
  root_row public.ticket_transactions%rowtype;
  previous_row public.ticket_fare_adjustments%rowtype;
  adjustment_row public.ticket_fare_adjustments%rowtype;
  adjustment_id_value uuid := gen_random_uuid();
  audit_event_id_value uuid := gen_random_uuid();
  source_event_id_value uuid := gen_random_uuid();
  source_event_key text;
  source_event_result jsonb;
  event_type_value text;
  root_issued_business_date date;
  original_fare_value numeric(14,2);
  difference_value numeric(14,2);
  sequence_number_value integer;
  booking_version_value bigint;
  package_link_ids_value uuid[] := array[]::uuid[];
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
  into actor_location_id_value, actor_timezone
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

  if not found or actor_location_id_value is null or actor_timezone is null then
    raise exception 'Actor is not an active authorised Ticketing employee with a branch location'
      using errcode = '42501';
  end if;

  if p_entry is null or jsonb_typeof(p_entry) is distinct from 'object' then
    raise exception 'Low Fare adjustment must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_entry) supplied(key)
  where supplied.key <> all (expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown Low Fare adjustment field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_entry ?& expected_keys then
    raise exception 'Low Fare adjustment is missing one or more required fields'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_entry -> 'expectedBookingVersion') is distinct from 'number'
    or jsonb_typeof(p_entry -> 'expectedRootTransactionVersion') is distinct from 'number'
    or jsonb_typeof(p_entry -> 'expectedPreviousAdjustmentId') not in ('string', 'null')
    or jsonb_typeof(p_entry -> 'newFareGbp') is distinct from 'number'
    or jsonb_typeof(p_entry -> 'effectiveOn') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'currency') is distinct from 'string'
    or jsonb_typeof(p_entry -> 'notes') not in ('string', 'null')
  then
    raise exception 'Low Fare adjustment contains invalid value types'
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
    expected_previous_adjustment_id_value :=
      (p_entry ->> 'expectedPreviousAdjustmentId')::uuid;
    new_fare_input := (p_entry ->> 'newFareGbp')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Low Fare versions, predecessor, or fare value is invalid'
      using errcode = '22023';
  end;

  if expected_booking_version_value < 1
    or expected_root_version_value < 1
    or new_fare_input <= 0
    or new_fare_input > 99999999.99
    or scale(new_fare_input) > 2
    or p_entry ->> 'currency' <> 'GBP'
  then
    raise exception 'Low Fare adjustment requires positive versions and a valid GBP fare'
      using errcode = '22023';
  end if;

  new_fare_value := new_fare_input::numeric(14,2);

  begin
    if p_entry ->> 'effectiveOn' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise invalid_datetime_format;
    end if;
    effective_on_value := (p_entry ->> 'effectiveOn')::date;
    if to_char(effective_on_value, 'YYYY-MM-DD') <> p_entry ->> 'effectiveOn' then
      raise invalid_datetime_format;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Low Fare effectiveOn must be a valid YYYY-MM-DD date'
      using errcode = '22023';
  end;

  notes_value := case
    when p_entry ->> 'notes' is null then null
    else nullif(btrim(p_entry ->> 'notes'), '')
  end;

  if notes_value is not null and length(notes_value) > 1000 then
    raise exception 'Low Fare notes cannot exceed 1000 characters'
      using errcode = '22023';
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedBookingVersion', expected_booking_version_value,
    'expectedRootTransactionVersion', expected_root_version_value,
    'expectedPreviousAdjustmentId', expected_previous_adjustment_id_value,
    'newFareGbp', new_fare_value,
    'effectiveOn', effective_on_value,
    'currency', 'GBP',
    'notes', notes_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  -- Low Fare is intentionally shared: an authorised actor may append to
  -- another employee's eligible booking, but never assumes its ownership.
  select booking.*
  into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  select transaction.*
  into root_row
  from public.ticket_transactions transaction
  where transaction.booking_id = booking_row.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  for share;

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
      raise exception 'Idempotency key was reused with a different Low Fare adjustment'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Low Fare idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if booking_row.archived_at is not null
    or booking_row.operational_status <> 'issued'
    or booking_row.normalized_pnr is null
    or root_row.service_type <> 'TK'
    or root_row.parent_transaction_id is not null
    or root_row.operational_status <> 'issued'
    or root_row.owner_employee_id <> booking_row.owner_employee_id
    or root_row.currency <> 'GBP'
    or root_row.supplier_cost_source is null
    or root_row.supplier_cost_gbp is null
    or root_row.supplier_cost_source <> root_row.supplier_cost_gbp
    or root_row.supplier_cost_gbp < 0
    or root_row.supplier_cost_gbp > 99999999.99
    or root_row.passenger_ticket_count <= 0
  then
    raise exception 'Ticket record is not eligible for a Low Fare adjustment'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if booking_row.version <> expected_booking_version_value
    or root_row.version <> expected_root_version_value
  then
    raise exception 'Ticket versions are stale'
      using
        errcode = '40001',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'rootTransactionVersion', root_row.version
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

  select adjustment.*
  into previous_row
  from public.ticket_fare_adjustments adjustment
  where adjustment.booking_id = booking_row.id
  order by adjustment.sequence_number desc
  limit 1
  for update;

  if expected_previous_adjustment_id_value is distinct from previous_row.id then
    raise exception 'Low Fare adjustment predecessor is stale'
      using
        errcode = '23505',
        detail = jsonb_build_object(
          'currentPreviousAdjustmentId', previous_row.id,
          'currentSequenceNumber', previous_row.sequence_number
        )::text,
        hint = 'TICKETING_FARE_ADJUSTMENT_LINEAGE_CONFLICT';
  end if;

  original_fare_value := coalesce(previous_row.new_fare_gbp, root_row.supplier_cost_gbp);
  sequence_number_value := coalesce(previous_row.sequence_number, 0) + 1;
  difference_value := round(original_fare_value - new_fare_value, 2);

  if difference_value = 0 then
    raise exception 'Low Fare adjustment must change the current supplier fare'
      using errcode = '22023', hint = 'TICKETING_ZERO_FARE_DIFFERENCE';
  end if;

  select source_event.effective_on
  into root_issued_business_date
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key =
      'transaction:' || root_row.id::text || ':issued'
  order by source_event.event_version desc
  limit 1;

  root_issued_business_date := coalesce(
    root_issued_business_date,
    (root_row.issued_at at time zone booking_timezone)::date
  );

  if root_issued_business_date is null
    or effective_on_value < root_issued_business_date
    or (
      previous_row.id is not null
      and effective_on_value < previous_row.effective_on
    )
  then
    raise exception 'Low Fare effective date cannot predate its root issue date or current adjustment tail'
      using
        errcode = '22023',
        hint = 'TICKETING_DATE_CONFLICT';
  end if;

  perform 1
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null
  order by link.id
  for share;

  select coalesce(array_agg(link.id order by link.id), array[]::uuid[])
  into package_link_ids_value
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

  insert into public.ticket_fare_adjustments (
    id,
    booking_id,
    root_transaction_id,
    previous_adjustment_id,
    sequence_number,
    acting_employee_id,
    owner_employee_id,
    actor_location_id,
    booking_location_id,
    currency,
    original_fare_source,
    original_fare_gbp,
    new_fare_source,
    new_fare_gbp,
    passenger_ticket_count,
    effective_on,
    notes,
    package_match_status,
    commission_scope,
    package_link_ids,
    package_id,
    reservation_id,
    group_id,
    package_type,
    created_at
  ) values (
    adjustment_id_value,
    booking_row.id,
    root_row.id,
    previous_row.id,
    sequence_number_value,
    p_actor_employee_id,
    booking_row.owner_employee_id,
    actor_location_id_value,
    booking_row.location_id,
    'GBP',
    original_fare_value,
    original_fare_value,
    new_fare_value,
    new_fare_value,
    root_row.passenger_ticket_count,
    effective_on_value,
    notes_value,
    booking_row.package_match_status,
    booking_row.commission_scope,
    package_link_ids_value,
    matched_package_id,
    matched_reservation_id,
    matched_group_id,
    matched_package_type,
    now_value
  )
  returning * into adjustment_row;

  -- Advance the aggregate freshness/version token only for a real append. The
  -- root transaction and its supplier-cost baseline stay immutable.
  update public.ticket_bookings booking
  set updated_by = p_actor_employee_id
  where booking.id = booking_row.id
  returning booking.version into booking_version_value;

  event_type_value := case
    when adjustment_row.difference_gbp > 0 then 'ticket_low_fare_adjusted'
    else 'ticket_higher_fare_adjusted'
  end;

  variables_value := jsonb_build_object(
    'adjustment_id', adjustment_row.id,
    'booking_id', booking_row.id,
    'root_transaction_id', root_row.id,
    'previous_adjustment_id', adjustment_row.previous_adjustment_id,
    'sequence_number', adjustment_row.sequence_number,
    'currency', 'GBP',
    'original_fare_source', adjustment_row.original_fare_source,
    'original_fare_gbp', adjustment_row.original_fare_gbp,
    'new_fare_source', adjustment_row.new_fare_source,
    'new_fare_gbp', adjustment_row.new_fare_gbp,
    'difference_source', adjustment_row.difference_source,
    'difference_gbp', adjustment_row.difference_gbp,
    'passenger_ticket_count', adjustment_row.passenger_ticket_count,
    'effective_on', adjustment_row.effective_on,
    'pnr', booking_row.normalized_pnr,
    'airline_id', booking_row.airline_id,
    'actor_location_id', actor_location_id_value,
    'booking_location_id', booking_row.location_id,
    'package_link_ids', to_jsonb(package_link_ids_value),
    'package_id', matched_package_id,
    'reservation_id', matched_reservation_id,
    'group_id', matched_group_id,
    'package_type', matched_package_type,
    'package_match_status', booking_row.package_match_status,
    'commission_scope', booking_row.commission_scope,
    'service_type', root_row.service_type,
    'operational_status', root_row.operational_status,
    'payment_status', root_row.payment_status,
    'issued_at', root_row.issued_at,
    'paid_at', root_row.paid_at,
    'cancelled_at', root_row.cancelled_at,
    'refunded_at', root_row.refunded_at,
    'root_supplier_cost_source', root_row.supplier_cost_source,
    'root_supplier_cost_gbp', root_row.supplier_cost_gbp,
    'issued_ticket_target_units', 0
  );

  source_event_key := 'tklf:v1:' || encode(digest(
    p_actor_employee_id::text || ':' || idempotency_key_value || ':adjusted',
    'sha256'
  ), 'hex');

  source_event_result := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', source_event_id_value,
    'source_fact_key', 'fare-adjustment:' || adjustment_row.id::text || ':recorded',
    'source_record_id', adjustment_row.id,
    'event_type', event_type_value,
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', p_actor_employee_id,
    'owner_employee_id', booking_row.owner_employee_id,
    'location_id', actor_location_id_value,
    'occurred_at', now_value,
    'effective_on', effective_on_value,
    'source_path', '/dashboard/ticketing/low-fare',
    'variables', variables_value,
    'idempotency_key', source_event_key
  ));

  -- Deliberately omit customer, PNR, notes, and fare amounts from the audit
  -- payload. The immutable adjustment/event facts hold authorised detail.
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
    'booking',
    booking_row.id,
    booking_row.id,
    root_row.id,
    'append_fare_adjustment',
    p_actor_employee_id,
    null,
    jsonb_build_object(
      'adjustment_id', adjustment_row.id,
      'previous_adjustment_id', adjustment_row.previous_adjustment_id,
      'sequence_number', adjustment_row.sequence_number,
      'direction', case when adjustment_row.difference_gbp > 0 then 'lower' else 'higher' end,
      'passenger_ticket_count', adjustment_row.passenger_ticket_count,
      'package_match_status', booking_row.package_match_status,
      'commission_scope', booking_row.commission_scope,
      'source_event_id', source_event_id_value
    ),
    now_value
  );

  response_value := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking_row.id,
      'version', booking_version_value,
      'ownerEmployeeId', booking_row.owner_employee_id,
      'locationId', booking_row.location_id
    ),
    'rootTransaction', jsonb_build_object(
      'id', root_row.id,
      'version', root_row.version,
      'passengerTicketCount', root_row.passenger_ticket_count,
      'supplierCostSource', root_row.supplier_cost_source,
      'supplierCostGbp', root_row.supplier_cost_gbp
    ),
    'adjustment', jsonb_build_object(
      'id', adjustment_row.id,
      'bookingId', adjustment_row.booking_id,
      'rootTransactionId', adjustment_row.root_transaction_id,
      'previousAdjustmentId', adjustment_row.previous_adjustment_id,
      'sequenceNumber', adjustment_row.sequence_number,
      'actingEmployeeId', adjustment_row.acting_employee_id,
      'ownerEmployeeId', adjustment_row.owner_employee_id,
      'actorLocationId', adjustment_row.actor_location_id,
      'bookingLocationId', adjustment_row.booking_location_id,
      'currency', adjustment_row.currency,
      'originalFareSource', adjustment_row.original_fare_source,
      'originalFareGbp', adjustment_row.original_fare_gbp,
      'newFareSource', adjustment_row.new_fare_source,
      'newFareGbp', adjustment_row.new_fare_gbp,
      'differenceSource', adjustment_row.difference_source,
      'differenceGbp', adjustment_row.difference_gbp,
      'passengerTicketCount', adjustment_row.passenger_ticket_count,
      'effectiveOn', adjustment_row.effective_on,
      'notes', adjustment_row.notes,
      'packageMatchStatus', adjustment_row.package_match_status,
      'commissionScope', adjustment_row.commission_scope,
      'packageLinkIds', to_jsonb(adjustment_row.package_link_ids),
      'packageId', adjustment_row.package_id,
      'reservationId', adjustment_row.reservation_id,
      'groupId', adjustment_row.group_id,
      'packageType', adjustment_row.package_type,
      'createdAt', adjustment_row.created_at
    ),
    'sourceEvent', jsonb_build_object(
      'sourceEventId', source_event_result ->> 'sourceEventId',
      'eventType', event_type_value,
      'eventVersion', (source_event_result ->> 'eventVersion')::integer
    ),
    'auditEventId', audit_event_id_value,
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
    raise exception 'Low Fare adjustment contains an invalid date'
      using errcode = '22023';
end
$$;

comment on function public.ticketing_append_fare_adjustment(uuid, uuid, text, jsonb) is
  'Service-role-only shared append of a whole-PNR GBP supplier-fare adjustment. Original fare, passenger total, booking owner, branch, package scope, Commission variables, audit, and chain lineage are server-derived atomically.';

alter table public.ticket_fare_adjustments enable row level security;

drop policy if exists "Service role reads ticket_fare_adjustments"
  on public.ticket_fare_adjustments;
create policy "Service role reads ticket_fare_adjustments"
  on public.ticket_fare_adjustments
  for select
  to service_role
  using (true);

revoke all on table public.ticket_fare_adjustments
  from public, anon, authenticated, service_role;
grant select on table public.ticket_fare_adjustments to service_role;

revoke all on table public.ticket_fare_adjustment_current
  from public, anon, authenticated, service_role;
grant select on table public.ticket_fare_adjustment_current to service_role;

revoke all on function public.validate_ticket_fare_adjustment_lineage_2026082401()
  from public, anon, authenticated, service_role;

revoke all on function public.serialize_ticket_package_scope_2026082401()
  from public, anon, authenticated, service_role;

revoke all on function public.ticketing_append_fare_adjustment(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_append_fare_adjustment(uuid, uuid, text, jsonb)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082401,
  now(),
  jsonb_build_object(
    'migration', '20260824_ticketing_low_fare_adjustments.sql',
    'capabilities', coalesce(
      (
        select schema_version.details -> 'capabilities'
        from public.portal_schema_versions schema_version
        where schema_version.component = 'ticketing'
          and jsonb_typeof(schema_version.details -> 'capabilities') = 'array'
      ),
      '[]'::jsonb
    ) || jsonb_build_array(
      'shared-low-fare-adjustments',
      'whole-pnr-gbp-fare-lineage',
      'server-snapshotted-original-fare',
      'target-safe-fare-adjustment-events',
      'immutable-fare-adjustment-history'
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
    'ready', coalesce(version >= 2026082401, false),
    'version', version,
    'requiredVersion', greatest(version, 2026082401),
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
