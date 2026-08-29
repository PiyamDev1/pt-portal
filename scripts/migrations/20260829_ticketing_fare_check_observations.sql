-- Forward-only Ticketing capability 2026082904.
-- Records no-change supplier-fare observations without inventing Commission events.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_fare_check_forward_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions where component = 'ticketing' for update;
  if installed_version is null or installed_version < 2026082903 then
    raise exception 'Ticketing capability 2026082903 is required before fare-check capability 2026082904'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026082904 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082904, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_fare_check_forward_guard$;

create table if not exists public.ticket_fare_checks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  booking_version bigint not null check (booking_version > 0),
  root_transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  root_transaction_version bigint not null check (root_transaction_version > 0),
  current_adjustment_id uuid references public.ticket_fare_adjustments(id) on delete restrict,
  checked_by_employee_id uuid not null references public.employees(id) on delete restrict,
  currency char(3) not null default 'GBP',
  observed_fare_source numeric(14, 2) not null,
  observed_fare_gbp numeric(14, 2) not null,
  effective_on date not null,
  package_match_status text not null,
  commission_scope text not null,
  package_id uuid references public.travel_packages(id) on delete set null,
  reservation_id uuid references public.travel_package_reservations(id) on delete set null,
  group_id uuid references public.travel_package_groups(id) on delete set null,
  notes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint ticket_fare_checks_currency_check check (currency = upper(currency)),
  constraint ticket_fare_checks_amount_check check (
    observed_fare_source >= 0 and observed_fare_gbp >= 0
  ),
  constraint ticket_fare_checks_package_scope_check check (
    (package_match_status = 'unmatched' and commission_scope = 'ticket')
    or (package_match_status in ('matched', 'manually_resolved') and commission_scope = 'package')
    or (package_match_status = 'ambiguous' and commission_scope = 'unresolved')
  ),
  constraint ticket_fare_checks_notes_check
    check (notes is null or length(btrim(notes)) between 1 and 1000),
  constraint ticket_fare_checks_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint ticket_fare_checks_actor_idempotency
    unique (checked_by_employee_id, idempotency_key)
);

alter table public.ticket_fare_checks
  add column if not exists booking_version bigint,
  add column if not exists root_transaction_version bigint;
update public.ticket_fare_checks fare_check
set booking_version = booking.version,
    root_transaction_version = root_transaction.version
from public.ticket_bookings booking, public.ticket_transactions root_transaction
where fare_check.booking_id = booking.id
  and fare_check.root_transaction_id = root_transaction.id
  and (fare_check.booking_version is null or fare_check.root_transaction_version is null);
alter table public.ticket_fare_checks
  alter column booking_version set not null,
  alter column root_transaction_version set not null;
do $fare_check_version_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ticket_fare_checks'::regclass
      and conname = 'ticket_fare_checks_booking_version_check'
  ) then
    alter table public.ticket_fare_checks add constraint ticket_fare_checks_booking_version_check
      check (booking_version > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ticket_fare_checks'::regclass
      and conname = 'ticket_fare_checks_root_transaction_version_check'
  ) then
    alter table public.ticket_fare_checks add constraint ticket_fare_checks_root_transaction_version_check
      check (root_transaction_version > 0);
  end if;
end
$fare_check_version_constraints$;

create index if not exists ticket_fare_checks_booking_effective_idx
  on public.ticket_fare_checks (booking_id, effective_on desc, created_at desc, id desc);

create or replace view public.ticket_fare_check_current
with (security_invoker = true)
as
select distinct on (fare_check.booking_id) fare_check.*
from public.ticket_fare_checks fare_check
order by fare_check.booking_id, fare_check.effective_on desc,
  fare_check.created_at desc, fare_check.id desc;

create or replace view public.ticket_low_fare_filter_owners
with (security_invoker = true)
as
select distinct booking.owner_employee_id as employee_id,
  coalesce(nullif(btrim(employee.full_name), ''), 'Unnamed agent') as full_name
from public.ticket_bookings booking
join public.ticket_transactions root_transaction
  on root_transaction.booking_id = booking.id
  and root_transaction.service_type = 'TK'
  and root_transaction.parent_transaction_id is null
  and root_transaction.operational_status = 'issued'
  and root_transaction.currency = 'GBP'
  and root_transaction.supplier_cost_source is not null
  and root_transaction.supplier_cost_gbp is not null
  and root_transaction.passenger_ticket_count > 0
join public.employees employee on employee.id = booking.owner_employee_id
where booking.archived_at is null and booking.operational_status = 'issued';

alter table public.ticket_fare_checks enable row level security;
revoke all on table public.ticket_fare_checks from public, anon, authenticated;
grant select on table public.ticket_fare_checks to service_role;
revoke all on table public.ticket_fare_check_current from public, anon, authenticated;
grant select on table public.ticket_fare_check_current to service_role;
revoke all on table public.ticket_low_fare_filter_owners from public, anon, authenticated;
grant select on table public.ticket_low_fare_filter_owners to service_role;

drop trigger if exists ticket_fare_checks_immutable_2904 on public.ticket_fare_checks;
create trigger ticket_fare_checks_immutable_2904
  before update or delete on public.ticket_fare_checks
  for each row execute function public.reject_immutable_event_mutation();

create or replace function public.ticketing_record_fare_check_2026082904(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_expected_booking_version bigint,
  p_expected_root_transaction_version bigint,
  p_expected_previous_adjustment_id uuid,
  p_effective_on date,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings;
  root_row public.ticket_transactions;
  existing_row public.ticket_fare_checks;
  check_row public.ticket_fare_checks;
  package_row record;
  current_source numeric(14,2);
  current_gbp numeric(14,2);
  current_adjustment_id_value uuid;
  current_adjustment_source numeric(14,2);
  current_adjustment_gbp numeric(14,2);
  current_adjustment_effective date;
  minimum_date date;
  branch_timezone text;
begin
  if p_actor_employee_id is null or p_booking_id is null
    or p_expected_booking_version is null or p_expected_booking_version < 1
    or p_expected_root_transaction_version is null or p_expected_root_transaction_version < 1
    or p_effective_on is null or p_effective_on > current_date
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or (p_notes is not null and length(btrim(p_notes)) not between 1 and 1000)
  then
    raise exception 'Invalid fare-check observation' using errcode = '22023';
  end if;

  select * into existing_row from public.ticket_fare_checks
  where checked_by_employee_id = p_actor_employee_id
    and idempotency_key = p_idempotency_key;
  if found then
    if existing_row.booking_id is distinct from p_booking_id
      or existing_row.current_adjustment_id is distinct from p_expected_previous_adjustment_id
      or existing_row.effective_on is distinct from p_effective_on
      or existing_row.notes is distinct from nullif(btrim(p_notes), '')
    then
      raise exception 'Fare-check idempotency key was reused with different input'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'checkId', existing_row.id,
      'bookingId', existing_row.booking_id,
      'bookingVersion', existing_row.booking_version,
      'rootTransactionId', existing_row.root_transaction_id,
      'rootTransactionVersion', existing_row.root_transaction_version,
      'effectiveDate', existing_row.effective_on,
      'observedFareGbp', existing_row.observed_fare_gbp,
      'packageMatchStatus', existing_row.package_match_status,
      'createdAt', existing_row.created_at,
      'idempotentReplay', true
    );
  end if;

  if not exists (
    select 1 from public.employees employee
    where employee.id = p_actor_employee_id and employee.is_active
  ) then
    raise exception 'Active employee was not found' using errcode = '42501';
  end if;

  select * into booking_row from public.ticket_bookings
  where id = p_booking_id and archived_at is null for update;
  if not found then raise exception 'Ticket was not found' using errcode = 'P0002'; end if;
  select location.timezone into branch_timezone
  from public.locations location where location.id = booking_row.location_id;
  branch_timezone := coalesce(branch_timezone, booking_row.time_limit_timezone, 'Europe/London');

  select * into root_row from public.ticket_transactions
  where booking_id = p_booking_id and service_type = 'TK'
    and parent_transaction_id is null and operational_status = 'issued'
  for update;
  if not found then raise exception 'Issued root TK was not found' using errcode = 'P0002'; end if;

  if booking_row.version <> p_expected_booking_version
    or root_row.version <> p_expected_root_transaction_version then
    raise exception 'Ticket changed; reload before recording the fare check'
      using errcode = '40001', hint = 'TICKETING_VERSION_CONFLICT',
      detail = jsonb_build_object(
        'bookingVersion', booking_row.version,
        'rootTransactionVersion', root_row.version
      )::text;
  end if;

  select adjustment.id, adjustment.new_fare_source, adjustment.new_fare_gbp,
    adjustment.effective_on
  into current_adjustment_id_value, current_adjustment_source,
    current_adjustment_gbp, current_adjustment_effective
  from public.ticket_fare_adjustment_current adjustment
  where adjustment.booking_id = booking_row.id;
  if current_adjustment_id_value is distinct from p_expected_previous_adjustment_id then
    raise exception 'Supplier fare history changed; reload before recording the check'
      using errcode = '40001', hint = 'TICKETING_FARE_LINEAGE_CONFLICT';
  end if;

  if current_adjustment_id_value is null then
    current_source := root_row.supplier_cost_source;
    current_gbp := root_row.supplier_cost_gbp;
    minimum_date := (root_row.issued_at at time zone branch_timezone)::date;
  else
    current_source := current_adjustment_source;
    current_gbp := current_adjustment_gbp;
    minimum_date := current_adjustment_effective;
  end if;
  if root_row.currency <> 'GBP' or current_source is null or current_gbp is null then
    raise exception 'Only complete GBP supplier fares can be checked in this queue'
      using errcode = '22023';
  end if;
  if p_effective_on < minimum_date then
    raise exception 'Fare check cannot predate the current supplier fare'
      using errcode = '22023';
  end if;

  perform public.ticketing_reconcile_package_booking_2026082902(booking_row.id);
  select * into booking_row from public.ticket_bookings where id = p_booking_id;
  select link.package_id, link.reservation_id, link.group_id
  into package_row
  from public.ticket_package_links link
  where link.booking_id = booking_row.id and link.match_status = 'matched'
    and link.retired_at is null
  order by link.detected_at desc, link.id
  limit 1;

  insert into public.ticket_fare_checks (
    booking_id, booking_version, root_transaction_id, root_transaction_version,
    current_adjustment_id, checked_by_employee_id,
    currency, observed_fare_source, observed_fare_gbp, effective_on,
    package_match_status, commission_scope, package_id, reservation_id, group_id,
    notes, idempotency_key
  ) values (
    booking_row.id, booking_row.version, root_row.id, root_row.version,
    current_adjustment_id_value, p_actor_employee_id,
    root_row.currency, current_source, current_gbp, p_effective_on,
    booking_row.package_match_status, booking_row.commission_scope,
    package_row.package_id, package_row.reservation_id, package_row.group_id,
    nullif(btrim(p_notes), ''), p_idempotency_key
  ) returning * into check_row;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action, actor_employee_id,
    after_state
  ) values (
    'booking', check_row.id, check_row.booking_id, check_row.root_transaction_id,
    'supplier_fare_checked_no_change', p_actor_employee_id,
    jsonb_build_object(
      'checkId', check_row.id,
      'effectiveDate', check_row.effective_on,
      'observedFareGbp', check_row.observed_fare_gbp,
      'packageMatchStatus', check_row.package_match_status,
      'commissionScope', check_row.commission_scope,
      'commissionEventCreated', false
    )
  );

  return jsonb_build_object(
    'checkId', check_row.id,
    'bookingId', check_row.booking_id,
    'bookingVersion', check_row.booking_version,
    'rootTransactionId', root_row.id,
    'rootTransactionVersion', check_row.root_transaction_version,
    'effectiveDate', check_row.effective_on,
    'observedFareGbp', check_row.observed_fare_gbp,
    'packageMatchStatus', check_row.package_match_status,
    'createdAt', check_row.created_at,
    'idempotentReplay', false
  );
end
$$;

revoke all on function public.ticketing_record_fare_check_2026082904(
  uuid,uuid,bigint,bigint,uuid,date,text,text
) from public, anon, authenticated;
grant execute on function public.ticketing_record_fare_check_2026082904(
  uuid,uuid,bigint,bigint,uuid,date,text,text
) to service_role;
revoke all on function public.reject_immutable_event_mutation()
  from public, anon, authenticated;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing', 2026082904, now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260829_ticketing_fare_check_observations.sql',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'no-change-supplier-fare-observations',
        'target-safe-fare-check-audit',
        'package-scoped-fare-check-snapshots'
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
    'ready', coalesce(schema_version.version >= 2026082904, false)
      and to_regprocedure('public.ticketing_record_fare_check_2026082904(uuid,uuid,bigint,bigint,uuid,date,text,text)') is not null
      and to_regclass('public.ticket_fare_checks') is not null
      and to_regclass('public.ticket_fare_check_current') is not null
      and to_regclass('public.ticket_low_fare_filter_owners') is not null
      and to_regprocedure('public.ticketing_append_voucher_event_2026082903(uuid,uuid,integer,text,numeric,date,uuid,text,integer,uuid,text,text,text,text)') is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082904),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version where component = 'ticketing'
$$;
revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
