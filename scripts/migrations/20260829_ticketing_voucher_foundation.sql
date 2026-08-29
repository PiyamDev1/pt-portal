-- Forward-only Ticketing capability 2026082901.
-- Creates immutable cancelled-ticket voucher entitlements with unknown initial value.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_voucher_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026082802 then
    raise exception 'Ticketing capability 2026082802 is required before voucher capability 2026082901'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026082901 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082901, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_voucher_forward_guard$;

create table if not exists public.ticket_vouchers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  transaction_passenger_id uuid not null
    references public.ticket_transaction_passengers(id) on delete restrict,
  passenger_id uuid not null references public.ticket_passengers(id) on delete restrict,
  airline_id uuid not null references public.airlines(id) on delete restrict,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  follow_up_employee_id uuid not null references public.employees(id) on delete restrict,
  created_by_employee_id uuid not null references public.employees(id) on delete restrict,
  pnr text not null,
  ticket_number text not null,
  passenger_name text,
  passenger_type text not null,
  issue_date date not null,
  cancellation_date date not null,
  claim_by_date date not null,
  status text not null default 'unclaimed',
  confirmed_value_gbp numeric(14, 2),
  remaining_value_gbp numeric(14, 2),
  airline_reference text,
  notes text,
  version integer not null default 1,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_vouchers_passenger_type_check
    check (passenger_type in ('ADT', 'YTH', 'CHD', 'INF')),
  constraint ticket_vouchers_status_check
    check (status in (
      'unclaimed', 'claim_submitted', 'airline_credit_confirmed', 'part_used',
      'used_on_new_ticket', 'refund_received', 'expired', 'closed'
    )),
  constraint ticket_vouchers_pnr_check
    check (length(btrim(pnr)) between 1 and 20),
  constraint ticket_vouchers_ticket_number_check
    check (length(btrim(ticket_number)) between 1 and 50),
  constraint ticket_vouchers_dates_check
    check (cancellation_date >= issue_date and claim_by_date > cancellation_date),
  constraint ticket_vouchers_values_check
    check (
      (confirmed_value_gbp is null and remaining_value_gbp is null)
      or (
        confirmed_value_gbp is not null and confirmed_value_gbp >= 0
        and remaining_value_gbp is not null and remaining_value_gbp >= 0
        and remaining_value_gbp <= confirmed_value_gbp
      )
    ),
  constraint ticket_vouchers_initial_value_status_check
    check (status not in ('airline_credit_confirmed', 'part_used', 'used_on_new_ticket', 'refund_received')
      or confirmed_value_gbp is not null),
  constraint ticket_vouchers_reference_check
    check (airline_reference is null or length(btrim(airline_reference)) between 1 and 120),
  constraint ticket_vouchers_notes_check
    check (notes is null or length(btrim(notes)) between 1 and 2000),
  constraint ticket_vouchers_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint ticket_vouchers_one_per_passenger unique (transaction_passenger_id),
  constraint ticket_vouchers_actor_idempotency unique (created_by_employee_id, idempotency_key)
);

create index if not exists ticket_vouchers_owner_status_deadline_idx
  on public.ticket_vouchers (owner_employee_id, status, claim_by_date, id);
create index if not exists ticket_vouchers_follow_up_status_deadline_idx
  on public.ticket_vouchers (follow_up_employee_id, status, claim_by_date, id);
create index if not exists ticket_vouchers_booking_created_idx
  on public.ticket_vouchers (booking_id, created_at desc, id desc);

create table if not exists public.ticket_voucher_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.ticket_vouchers(id) on delete restrict,
  event_type text not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  linked_booking_id uuid references public.ticket_bookings(id) on delete restrict,
  amount_gbp numeric(14, 2),
  event_date date not null,
  notes text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ticket_voucher_events_type_check
    check (event_type in (
      'created', 'claim_submitted', 'value_confirmed', 'part_used', 'used_on_new_ticket',
      'refund_received', 'expired', 'closed', 'deadline_corrected'
    )),
  constraint ticket_voucher_events_amount_check check (amount_gbp is null or amount_gbp >= 0),
  constraint ticket_voucher_events_notes_check
    check (notes is null or length(btrim(notes)) between 1 and 2000),
  constraint ticket_voucher_events_data_check check (jsonb_typeof(event_data) = 'object')
);

create index if not exists ticket_voucher_events_voucher_created_idx
  on public.ticket_voucher_events (voucher_id, created_at, id);

alter table public.ticket_vouchers enable row level security;
alter table public.ticket_voucher_events enable row level security;

revoke all on table public.ticket_vouchers, public.ticket_voucher_events
  from public, anon, authenticated;
grant select on table public.ticket_vouchers, public.ticket_voucher_events to service_role;

create or replace function public.ticketing_voucher_rows_are_immutable_2026082901()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'Ticket voucher rows are immutable; append a voucher event instead'
    using errcode = '55000';
end
$$;

drop trigger if exists ticket_vouchers_immutable_2026082901 on public.ticket_vouchers;
create trigger ticket_vouchers_immutable_2026082901
  before update or delete on public.ticket_vouchers
  for each row execute function public.ticketing_voucher_rows_are_immutable_2026082901();

drop trigger if exists ticket_voucher_events_immutable_2026082901 on public.ticket_voucher_events;
create trigger ticket_voucher_events_immutable_2026082901
  before update or delete on public.ticket_voucher_events
  for each row execute function public.ticketing_voucher_rows_are_immutable_2026082901();

alter table public.ticket_audit_events
  drop constraint if exists ticket_audit_events_entity_type_check;
alter table public.ticket_audit_events
  add constraint ticket_audit_events_entity_type_check
  check (entity_type in (
    'booking', 'transaction', 'passenger', 'sector', 'package_link', 'voucher',
    'legacy_migration'
  ));

create or replace function public.ticketing_create_voucher_2026082901(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_passenger_type text,
  p_passenger_position integer,
  p_follow_up_employee_id uuid,
  p_cancellation_date date,
  p_claim_by_date date,
  p_airline_reference text,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  source_row record;
  default_claim_by date;
  effective_claim_by date;
  voucher_row public.ticket_vouchers;
  existing_row public.ticket_vouchers;
  actor_is_admin boolean;
  response_value jsonb;
begin
  if p_actor_employee_id is null or p_booking_id is null then
    raise exception 'Actor and booking are required' using errcode = '22023';
  end if;
  if upper(btrim(coalesce(p_passenger_type, ''))) not in ('ADT', 'YTH', 'CHD', 'INF')
    or p_passenger_position is null
    or p_passenger_position not between 1 and 99 then
    raise exception 'Select a valid passenger ticket' using errcode = '22023';
  end if;
  if p_cancellation_date is null or p_cancellation_date > current_date then
    raise exception 'Cancellation date must be today or earlier' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  if p_airline_reference is not null
    and length(btrim(p_airline_reference)) not between 1 and 120 then
    raise exception 'Airline reference is invalid' using errcode = '22023';
  end if;
  if p_notes is not null and length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Voucher notes are invalid' using errcode = '22023';
  end if;

  select * into existing_row
  from public.ticket_vouchers
  where created_by_employee_id = p_actor_employee_id
    and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'voucherId', existing_row.id,
      'bookingId', existing_row.booking_id,
      'status', existing_row.status,
      'claimByDate', existing_row.claim_by_date,
      'idempotentReplay', true
    );
  end if;

  select
    booking.id as booking_id,
    booking.owner_employee_id,
    booking.pnr,
    booking.airline_id,
    transaction.id as transaction_id,
    transaction.issued_at,
    allocation.id as allocation_id,
    allocation.passenger_id,
    allocation.ticket_number,
    passenger.full_name as passenger_name,
    passenger.passenger_type
  into source_row
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  join public.ticket_transaction_passengers allocation
    on allocation.transaction_id = transaction.id
    and allocation.position = p_passenger_position
  join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
    and passenger.passenger_type = upper(btrim(p_passenger_type))
  where booking.id = p_booking_id
    and booking.operational_status = 'issued'
    and booking.archived_at is null;

  if not found then
    raise exception 'Issued passenger ticket was not found' using errcode = 'P0002';
  end if;
  if source_row.issued_at is null then
    raise exception 'Ticket issue date is unavailable' using errcode = '22023';
  end if;
  if length(btrim(coalesce(source_row.ticket_number, ''))) < 1 then
    raise exception 'Complete the passenger ticket number before creating a voucher'
      using errcode = '22023';
  end if;

  actor_is_admin := public.ticketing_actor_is_admin_2026082802(p_actor_employee_id);
  if p_actor_employee_id <> source_row.owner_employee_id and not actor_is_admin then
    raise exception 'Only the ticket owner or an administrator may create this voucher'
      using errcode = '42501';
  end if;
  if coalesce(p_follow_up_employee_id, source_row.owner_employee_id) <> source_row.owner_employee_id
    and not actor_is_admin then
    raise exception 'Only an administrator may assign another follow-up owner'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.employees
    where id = coalesce(p_follow_up_employee_id, source_row.owner_employee_id)
      and is_active = true
  ) then
    raise exception 'Select an active follow-up owner' using errcode = '22023';
  end if;

  default_claim_by :=
    ((source_row.issued_at at time zone 'UTC')::date + interval '11 months')::date;
  if p_claim_by_date is not null
    and p_claim_by_date <> default_claim_by
    and not actor_is_admin then
    raise exception 'Only an administrator may override the default claim deadline'
      using errcode = '42501';
  end if;
  effective_claim_by := coalesce(p_claim_by_date, default_claim_by);
  if p_cancellation_date < (source_row.issued_at at time zone 'UTC')::date
    or effective_claim_by <= p_cancellation_date then
    raise exception 'Voucher dates are outside the valid claim window' using errcode = '22023';
  end if;

  insert into public.ticket_vouchers (
    booking_id, transaction_id, transaction_passenger_id, passenger_id, airline_id,
    owner_employee_id, follow_up_employee_id, created_by_employee_id, pnr, ticket_number,
    passenger_name, passenger_type, issue_date, cancellation_date, claim_by_date,
    status, confirmed_value_gbp, remaining_value_gbp, airline_reference, notes, idempotency_key
  ) values (
    source_row.booking_id, source_row.transaction_id, source_row.allocation_id,
    source_row.passenger_id, source_row.airline_id, source_row.owner_employee_id,
    coalesce(p_follow_up_employee_id, source_row.owner_employee_id), p_actor_employee_id,
    source_row.pnr, btrim(source_row.ticket_number), nullif(btrim(source_row.passenger_name), ''),
    source_row.passenger_type, (source_row.issued_at at time zone 'UTC')::date,
    p_cancellation_date, effective_claim_by, 'unclaimed', null, null,
    nullif(btrim(p_airline_reference), ''), nullif(btrim(p_notes), ''), p_idempotency_key
  )
  returning * into voucher_row;

  insert into public.ticket_voucher_events (
    voucher_id, event_type, actor_employee_id, event_date, notes, event_data
  ) values (
    voucher_row.id, 'created', p_actor_employee_id, p_cancellation_date,
    voucher_row.notes,
    jsonb_build_object('status', 'unclaimed', 'claimByDate', voucher_row.claim_by_date)
  );

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action, actor_employee_id, after_state
  ) values (
    'voucher', voucher_row.id, voucher_row.booking_id, voucher_row.transaction_id,
    'voucher_created', p_actor_employee_id,
    jsonb_build_object(
      'status', voucher_row.status,
      'claimByDate', voucher_row.claim_by_date,
      'followUpEmployeeId', voucher_row.follow_up_employee_id,
      'valueKnown', false
    )
  );

  insert into public.ticket_notification_events (
    entity_type, entity_id, booking_id, notification_type, threshold_key,
    recipient_employee_id, scheduled_for, delivery_status
  )
  select
    'voucher', voucher_row.id, voucher_row.booking_id, 'voucher_claim', reminder.threshold_key,
    voucher_row.follow_up_employee_id,
    (voucher_row.claim_by_date::timestamp - reminder.offset_value) at time zone 'UTC',
    'pending'
  from (values
    ('90d', interval '90 days'),
    ('30d', interval '30 days'),
    ('7d', interval '7 days')
  ) as reminder(threshold_key, offset_value)
  where (voucher_row.claim_by_date::timestamp - reminder.offset_value) at time zone 'UTC' > now()
  on conflict do nothing;

  response_value := jsonb_build_object(
    'voucherId', voucher_row.id,
    'bookingId', voucher_row.booking_id,
    'status', voucher_row.status,
    'claimByDate', voucher_row.claim_by_date,
    'idempotentReplay', false
  );
  return response_value;
exception
  when unique_violation then
    select * into existing_row
    from public.ticket_vouchers
    where transaction_passenger_id = source_row.allocation_id;
    if found then
      raise exception 'A voucher already exists for this passenger ticket'
        using errcode = '23505', hint = 'TICKETING_VOUCHER_EXISTS';
    end if;
    raise;
end
$$;

revoke all on function public.ticketing_create_voucher_2026082901(
  uuid, uuid, text, integer, uuid, date, date, text, text, text
) from public, anon, authenticated;
grant execute on function public.ticketing_create_voucher_2026082901(
  uuid, uuid, text, integer, uuid, date, date, text, text, text
) to service_role;

revoke all on function public.ticketing_voucher_rows_are_immutable_2026082901()
  from public, anon, authenticated;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing', 2026082901, now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260829_ticketing_voucher_foundation.sql',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'immutable-ticket-vouchers',
        'unknown-initial-voucher-value',
        'issue-date-plus-eleven-month-claim-window',
        'voucher-90-30-7-day-reminder-claims'
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
    'ready', coalesce(schema_version.version >= 2026082901, false)
      and to_regprocedure('public.ticketing_archive_booking(uuid,uuid,text)') is not null
      and to_regprocedure('public.ticketing_create_quick_tk_supplied(uuid,text,jsonb)') is not null
      and to_regprocedure('public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)') is not null
      and to_regprocedure('public.ticketing_request_booking_change(uuid,uuid,text,text)') is not null
      and to_regprocedure('public.ticketing_import_airport_reference_2026082802(jsonb)') is not null
      and to_regclass('public.ticket_flight_api_usage') is not null
      and to_regclass('public.ticket_vouchers') is not null
      and to_regclass('public.ticket_voucher_events') is not null
      and to_regprocedure(
        'public.ticketing_create_voucher_2026082901(uuid,uuid,text,integer,uuid,date,date,text,text,text)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082901),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
