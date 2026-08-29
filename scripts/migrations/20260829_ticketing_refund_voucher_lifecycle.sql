-- Forward-only Ticketing capability 2026082903.
-- Adds saved refund previews/settlement events and controlled voucher lifecycle events.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_refund_voucher_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026082902 then
    raise exception 'Ticketing capability 2026082902 is required before refund/voucher lifecycle capability 2026082903'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026082903 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082903, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_refund_voucher_forward_guard$;

create table if not exists public.ticket_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  transaction_passenger_id uuid not null
    references public.ticket_transaction_passengers(id) on delete restrict,
  passenger_id uuid not null references public.ticket_passengers(id) on delete restrict,
  airline_id uuid not null references public.airlines(id) on delete restrict,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  created_by_employee_id uuid not null references public.employees(id) on delete restrict,
  replacement_booking_id uuid references public.ticket_bookings(id) on delete restrict,
  replacement_transaction_passenger_id uuid
    references public.ticket_transaction_passengers(id) on delete restrict,
  package_link_id uuid references public.ticket_package_links(id) on delete set null,
  package_id uuid references public.travel_packages(id) on delete set null,
  package_reservation_id uuid references public.travel_package_reservations(id) on delete set null,
  package_group_id uuid references public.travel_package_groups(id) on delete set null,
  pnr text not null,
  ticket_number text not null,
  passenger_name text,
  passenger_type text not null,
  settlement_mode text not null,
  replacement_source text,
  package_match_status text not null,
  commission_scope text not null,
  package_type_snapshot text,
  formula_version text not null,
  original_sale_price_gbp numeric(14, 2) not null,
  original_supplier_cost_gbp numeric(14, 2) not null,
  airline_cancellation_fee_gbp numeric(14, 2) not null,
  supplier_cancellation_charge_gbp numeric(14, 2) not null,
  retained_agent_commission_gbp numeric(14, 2) not null,
  desired_company_markup_gbp numeric(14, 2) not null,
  proposed_cancellation_charge_gbp numeric(14, 2) not null,
  proposed_customer_refund_gbp numeric(14, 2) not null,
  expected_airline_recovery_gbp numeric(14, 2) not null,
  expected_company_result_gbp numeric(14, 2) not null,
  replacement_supplier_cost_gbp numeric(14, 2),
  replacement_sale_price_gbp numeric(14, 2),
  replacement_agent_commission_gbp numeric(14, 2),
  replacement_desired_markup_gbp numeric(14, 2),
  replacement_net_zero_price_gbp numeric(14, 2),
  replacement_safe_price_gbp numeric(14, 2),
  cancellation_credit_applied_gbp numeric(14, 2),
  replacement_extra_payment_gbp numeric(14, 2),
  customer_credit_remaining_gbp numeric(14, 2),
  replacement_company_result_gbp numeric(14, 2),
  customer_settled_gbp numeric(14, 2) not null default 0,
  airline_recovered_gbp numeric(14, 2) not null default 0,
  other_actual_costs_gbp numeric(14, 2) not null default 0,
  airline_recovery_final boolean not null default false,
  actual_company_result_gbp numeric(14, 2),
  status text not null default 'recorded',
  notes text,
  override_reason text,
  idempotency_key text not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint ticket_refunds_passenger_type_check
    check (passenger_type in ('ADT', 'YTH', 'CHD', 'INF')),
  constraint ticket_refunds_settlement_mode_check
    check (settlement_mode in ('refund', 'replacement')),
  constraint ticket_refunds_replacement_source_check check (
    (settlement_mode = 'refund' and replacement_source is null)
    or (settlement_mode = 'replacement' and replacement_source in ('manual', 'ledger'))
  ),
  constraint ticket_refunds_status_check check (
    status in ('recorded', 'part_settled', 'recovery_pending', 'settled', 'closed', 'voided')
  ),
  constraint ticket_refunds_package_scope_check check (
    (package_match_status = 'unmatched' and commission_scope = 'ticket')
    or (package_match_status in ('matched', 'manually_resolved') and commission_scope = 'package')
    or (package_match_status = 'ambiguous' and commission_scope = 'unresolved')
  ),
  constraint ticket_refunds_package_type_check check (
    package_type_snapshot is null or package_type_snapshot in ('umrah', 'holiday', 'ziyarat')
  ),
  constraint ticket_refunds_nonnegative_inputs_check check (
    original_sale_price_gbp >= 0
    and original_supplier_cost_gbp >= 0
    and airline_cancellation_fee_gbp >= 0
    and supplier_cancellation_charge_gbp >= 0
    and retained_agent_commission_gbp >= 0
    and desired_company_markup_gbp >= 0
    and proposed_cancellation_charge_gbp >= 0
    and proposed_customer_refund_gbp >= 0
    and customer_settled_gbp >= 0
    and airline_recovered_gbp >= 0
    and other_actual_costs_gbp >= 0
  ),
  constraint ticket_refunds_replacement_values_check check (
    settlement_mode = 'refund'
    or (
      replacement_supplier_cost_gbp is not null and replacement_supplier_cost_gbp >= 0
      and replacement_sale_price_gbp is not null and replacement_sale_price_gbp >= 0
      and replacement_agent_commission_gbp is not null
        and replacement_agent_commission_gbp >= 0
      and replacement_desired_markup_gbp is not null
        and replacement_desired_markup_gbp >= 0
      and replacement_net_zero_price_gbp is not null and replacement_net_zero_price_gbp >= 0
      and replacement_safe_price_gbp is not null and replacement_safe_price_gbp >= 0
      and cancellation_credit_applied_gbp is not null
        and cancellation_credit_applied_gbp >= 0
      and replacement_extra_payment_gbp is not null and replacement_extra_payment_gbp >= 0
      and customer_credit_remaining_gbp is not null and customer_credit_remaining_gbp >= 0
      and replacement_company_result_gbp is not null
    )
  ),
  constraint ticket_refunds_replacement_link_check check (
    replacement_source <> 'ledger'
    or (replacement_booking_id is not null and replacement_transaction_passenger_id is not null)
  ),
  constraint ticket_refunds_notes_check
    check (notes is null or length(btrim(notes)) between 1 and 2000),
  constraint ticket_refunds_override_reason_check
    check (override_reason is null or length(btrim(override_reason)) between 1 and 500),
  constraint ticket_refunds_formula_check
    check (length(btrim(formula_version)) between 1 and 100),
  constraint ticket_refunds_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint ticket_refunds_actor_idempotency unique (created_by_employee_id, idempotency_key)
);

create unique index if not exists ticket_refunds_one_active_passenger_idx
  on public.ticket_refunds (transaction_passenger_id)
  where status <> 'voided';
create index if not exists ticket_refunds_owner_status_created_idx
  on public.ticket_refunds (owner_employee_id, status, created_at desc, id desc);
create index if not exists ticket_refunds_package_idx
  on public.ticket_refunds (package_id, created_at desc, id desc)
  where package_id is not null;

create table if not exists public.ticket_refund_events (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.ticket_refunds(id) on delete restrict,
  event_type text not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  amount_gbp numeric(14, 2),
  event_date date not null,
  reference text,
  notes text,
  event_data jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint ticket_refund_events_type_check check (
    event_type in (
      'recorded', 'customer_settlement', 'airline_recovery', 'other_cost',
      'recovery_finalised', 'closed', 'voided'
    )
  ),
  constraint ticket_refund_events_amount_check check (amount_gbp is null or amount_gbp >= 0),
  constraint ticket_refund_events_reference_check
    check (reference is null or length(btrim(reference)) between 1 and 200),
  constraint ticket_refund_events_notes_check
    check (notes is null or length(btrim(notes)) between 1 and 2000),
  constraint ticket_refund_events_data_check check (jsonb_typeof(event_data) = 'object'),
  constraint ticket_refund_events_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint ticket_refund_events_actor_idempotency unique (actor_employee_id, idempotency_key)
);

create index if not exists ticket_refund_events_refund_created_idx
  on public.ticket_refund_events (refund_id, created_at, id);

create table if not exists public.ticket_refund_write_contexts (
  id uuid primary key,
  refund_id uuid not null references public.ticket_refunds(id) on delete cascade,
  actor_employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ticket_refunds enable row level security;
alter table public.ticket_refund_events enable row level security;
alter table public.ticket_refund_write_contexts enable row level security;
revoke all on table
  public.ticket_refunds, public.ticket_refund_events, public.ticket_refund_write_contexts
  from public, anon, authenticated;
grant select on table public.ticket_refunds, public.ticket_refund_events to service_role;

create or replace function public.ticketing_guard_refund_row_2026082903()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  context_id uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket refund rows cannot be deleted' using errcode = '55000';
  end if;

  begin
    context_id := nullif(current_setting('ticketing.refund_context_id', true), '')::uuid;
  exception when others then
    context_id := null;
  end;

  if context_id is null or not exists (
    select 1 from public.ticket_refund_write_contexts context
    where context.id = context_id and context.refund_id = old.id
  ) then
    raise exception 'Ticket refund rows change only through the lifecycle operation'
      using errcode = '55000';
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists ticket_refunds_guard_2903 on public.ticket_refunds;
create trigger ticket_refunds_guard_2903
  before update or delete on public.ticket_refunds
  for each row execute function public.ticketing_guard_refund_row_2026082903();
drop trigger if exists ticket_refund_events_immutable_2903 on public.ticket_refund_events;
create trigger ticket_refund_events_immutable_2903
  before update or delete on public.ticket_refund_events
  for each row execute function public.reject_immutable_event_mutation();

alter table public.ticket_audit_events
  drop constraint if exists ticket_audit_events_entity_type_check;
alter table public.ticket_audit_events
  add constraint ticket_audit_events_entity_type_check
  check (entity_type in (
    'booking', 'transaction', 'passenger', 'sector', 'package_link', 'voucher', 'refund',
    'legacy_migration'
  ));

create or replace function public.ticketing_record_refund_2026082903(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_passenger_type text,
  p_passenger_position integer,
  p_settlement_mode text,
  p_replacement_booking_id uuid,
  p_replacement_passenger_type text,
  p_replacement_passenger_position integer,
  p_manual_replacement_supplier_cost_gbp numeric,
  p_manual_replacement_sale_price_gbp numeric,
  p_airline_cancellation_fee_gbp numeric,
  p_supplier_cancellation_charge_gbp numeric,
  p_retained_agent_commission_gbp numeric,
  p_desired_company_markup_gbp numeric,
  p_replacement_agent_commission_gbp numeric,
  p_replacement_desired_markup_gbp numeric,
  p_formula_version text,
  p_notes text,
  p_override_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  source_row record;
  replacement_row record;
  replacement_booking_id_value uuid;
  replacement_allocation_id_value uuid;
  existing_row public.ticket_refunds;
  refund_row public.ticket_refunds;
  actor_is_admin boolean;
  package_row record;
  proposed_charge numeric(14,2);
  proposed_refund numeric(14,2);
  expected_recovery numeric(14,2);
  replacement_source_value text;
  replacement_supplier numeric(14,2);
  replacement_sale numeric(14,2);
  replacement_net_zero numeric(14,2);
  replacement_safe numeric(14,2);
  replacement_result numeric(14,2);
  credit_applied numeric(14,2);
  extra_payment numeric(14,2);
  credit_remaining numeric(14,2);
  requires_override boolean := false;
begin
  if p_actor_employee_id is null or p_booking_id is null then
    raise exception 'Actor and booking are required' using errcode = '22023';
  end if;
  if upper(btrim(coalesce(p_passenger_type, ''))) not in ('ADT', 'YTH', 'CHD', 'INF')
    or p_passenger_position is null or p_passenger_position not between 1 and 99 then
    raise exception 'Select a valid passenger ticket' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_settlement_mode, ''))) not in ('refund', 'replacement') then
    raise exception 'Select how the customer value will be settled' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_formula_version, ''))) not between 1 and 100
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'Formula version and idempotency key are required' using errcode = '22023';
  end if;
  if p_notes is not null and length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Refund notes are invalid' using errcode = '22023';
  end if;
  if p_override_reason is not null and length(btrim(p_override_reason)) not between 1 and 500 then
    raise exception 'Override reason is invalid' using errcode = '22023';
  end if;
  if p_airline_cancellation_fee_gbp is null or p_airline_cancellation_fee_gbp < 0
    or p_supplier_cancellation_charge_gbp is null
      or p_supplier_cancellation_charge_gbp < 0
    or p_retained_agent_commission_gbp is null or p_retained_agent_commission_gbp < 0
    or p_desired_company_markup_gbp is null or p_desired_company_markup_gbp < 0
  then
    raise exception 'Refund amounts must be non-negative' using errcode = '22023';
  end if;

  select * into existing_row
  from public.ticket_refunds
  where created_by_employee_id = p_actor_employee_id
    and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'refundId', existing_row.id,
      'bookingId', existing_row.booking_id,
      'status', existing_row.status,
      'version', existing_row.version,
      'idempotentReplay', true
    );
  end if;

  select
    booking.id as booking_id,
    booking.owner_employee_id,
    booking.airline_id,
    booking.pnr,
    booking.package_match_status,
    booking.commission_scope,
    transaction.id as transaction_id,
    allocation.id as allocation_id,
    allocation.passenger_id,
    allocation.ticket_number,
    passenger.full_name as passenger_name,
    passenger.passenger_type,
    fare.unit_sale_price_gbp,
    fare.unit_supplier_cost_gbp
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
  join public.ticket_passengers passenger
    on passenger.id = allocation.passenger_id
    and passenger.passenger_type = upper(btrim(p_passenger_type))
  join public.ticket_passenger_fare_lines fare on fare.id = allocation.fare_line_id
  where booking.id = p_booking_id
    and booking.archived_at is null;

  if not found then
    raise exception 'Issued passenger ticket was not found' using errcode = 'P0002';
  end if;
  if source_row.unit_sale_price_gbp is null or source_row.unit_supplier_cost_gbp is null
    or length(btrim(coalesce(source_row.ticket_number, ''))) < 1 then
    raise exception 'Complete the passenger sale, supplier cost, and ticket number first'
      using errcode = '22023';
  end if;

  actor_is_admin := public.ticketing_actor_is_admin_2026082802(p_actor_employee_id);
  if p_actor_employee_id <> source_row.owner_employee_id and not actor_is_admin then
    raise exception 'Only the ticket owner or an administrator may record this refund'
      using errcode = '42501';
  end if;

  perform public.ticketing_reconcile_package_booking_2026082902(source_row.booking_id);

  select booking.package_match_status, booking.commission_scope
  into source_row.package_match_status, source_row.commission_scope
  from public.ticket_bookings booking where booking.id = source_row.booking_id;

  select
    link.id as package_link_id,
    link.package_id,
    link.reservation_id,
    link.group_id,
    link.package_type_snapshot
  into package_row
  from public.ticket_package_links link
  where link.booking_id = source_row.booking_id
    and link.match_status = 'matched'
    and link.retired_at is null
  order by link.detected_at desc, link.id
  limit 1;

  proposed_charge := round(
    p_airline_cancellation_fee_gbp + p_supplier_cancellation_charge_gbp
      + p_retained_agent_commission_gbp + p_desired_company_markup_gbp,
    2
  );
  proposed_refund := greatest(round(source_row.unit_sale_price_gbp - proposed_charge, 2), 0);
  expected_recovery := round(
    source_row.unit_supplier_cost_gbp - p_airline_cancellation_fee_gbp,
    2
  );
  requires_override := proposed_charge > source_row.unit_sale_price_gbp;

  if lower(btrim(p_settlement_mode)) = 'replacement' then
    if p_replacement_agent_commission_gbp is null or p_replacement_agent_commission_gbp < 0
      or p_replacement_desired_markup_gbp is null or p_replacement_desired_markup_gbp < 0 then
      raise exception 'Replacement commission and markup are required' using errcode = '22023';
    end if;

    if p_replacement_booking_id is not null then
      replacement_source_value := 'ledger';
      if upper(btrim(coalesce(p_replacement_passenger_type, '')))
          not in ('ADT', 'YTH', 'CHD', 'INF')
        or p_replacement_passenger_position is null
        or p_replacement_passenger_position not between 1 and 99 then
        raise exception 'Select the exact replacement passenger ticket' using errcode = '22023';
      end if;

      select
        booking.id as booking_id,
        booking.airline_id,
        allocation.id as allocation_id,
        fare.unit_supplier_cost_gbp,
        fare.unit_sale_price_gbp
      into replacement_row
      from public.ticket_bookings booking
      join public.ticket_transactions transaction
        on transaction.booking_id = booking.id
        and transaction.service_type = 'TK'
        and transaction.parent_transaction_id is null
        and transaction.operational_status in ('held', 'issued')
      join public.ticket_transaction_passengers allocation
        on allocation.transaction_id = transaction.id
        and allocation.position = p_replacement_passenger_position
      join public.ticket_passengers passenger
        on passenger.id = allocation.passenger_id
        and passenger.passenger_type = upper(btrim(p_replacement_passenger_type))
      join public.ticket_passenger_fare_lines fare on fare.id = allocation.fare_line_id
      where booking.id = p_replacement_booking_id
        and booking.id <> source_row.booking_id
        and booking.archived_at is null;

      if not found or replacement_row.unit_supplier_cost_gbp is null
        or replacement_row.unit_sale_price_gbp is null then
        raise exception 'Replacement passenger ticket was not found or is incomplete'
          using errcode = 'P0002';
      end if;
      replacement_supplier := replacement_row.unit_supplier_cost_gbp;
      replacement_sale := replacement_row.unit_sale_price_gbp;
      replacement_booking_id_value := replacement_row.booking_id;
      replacement_allocation_id_value := replacement_row.allocation_id;
    else
      replacement_source_value := 'manual';
      if p_manual_replacement_supplier_cost_gbp is null
        or p_manual_replacement_supplier_cost_gbp < 0
        or p_manual_replacement_sale_price_gbp is null
        or p_manual_replacement_sale_price_gbp < 0 then
        raise exception 'Manual replacement supplier cost and sale price are required'
          using errcode = '22023';
      end if;
      replacement_supplier := round(p_manual_replacement_supplier_cost_gbp, 2);
      replacement_sale := round(p_manual_replacement_sale_price_gbp, 2);
    end if;

    replacement_net_zero := round(
      replacement_supplier + p_replacement_agent_commission_gbp,
      2
    );
    replacement_safe := round(
      replacement_net_zero + p_replacement_desired_markup_gbp,
      2
    );
    replacement_result := round(replacement_sale - replacement_net_zero, 2);
    credit_applied := least(proposed_refund, replacement_sale);
    extra_payment := greatest(replacement_sale - proposed_refund, 0);
    credit_remaining := greatest(proposed_refund - replacement_sale, 0);
    requires_override := requires_override or replacement_sale < replacement_safe;
  end if;

  if requires_override and (
    not actor_is_admin or length(btrim(coalesce(p_override_reason, ''))) < 1
  ) then
    raise exception 'Manager/Admin approval is required for a shortfall or reduced result'
      using errcode = '42501', hint = 'TICKETING_REFUND_OVERRIDE_REQUIRED';
  end if;

  insert into public.ticket_refunds (
    booking_id, transaction_id, transaction_passenger_id, passenger_id, airline_id,
    owner_employee_id, created_by_employee_id,
    replacement_booking_id, replacement_transaction_passenger_id,
    package_link_id, package_id, package_reservation_id, package_group_id,
    pnr, ticket_number, passenger_name, passenger_type,
    settlement_mode, replacement_source, package_match_status, commission_scope,
    package_type_snapshot, formula_version,
    original_sale_price_gbp, original_supplier_cost_gbp,
    airline_cancellation_fee_gbp, supplier_cancellation_charge_gbp,
    retained_agent_commission_gbp, desired_company_markup_gbp,
    proposed_cancellation_charge_gbp, proposed_customer_refund_gbp,
    expected_airline_recovery_gbp, expected_company_result_gbp,
    replacement_supplier_cost_gbp, replacement_sale_price_gbp,
    replacement_agent_commission_gbp, replacement_desired_markup_gbp,
    replacement_net_zero_price_gbp, replacement_safe_price_gbp,
    cancellation_credit_applied_gbp, replacement_extra_payment_gbp,
    customer_credit_remaining_gbp, replacement_company_result_gbp,
    notes, override_reason, idempotency_key
  ) values (
    source_row.booking_id, source_row.transaction_id, source_row.allocation_id,
    source_row.passenger_id, source_row.airline_id,
    source_row.owner_employee_id, p_actor_employee_id,
    replacement_booking_id_value, replacement_allocation_id_value,
    package_row.package_link_id, package_row.package_id, package_row.reservation_id,
    package_row.group_id,
    source_row.pnr, btrim(source_row.ticket_number),
    nullif(btrim(source_row.passenger_name), ''), source_row.passenger_type,
    lower(btrim(p_settlement_mode)), replacement_source_value,
    source_row.package_match_status, source_row.commission_scope,
    package_row.package_type_snapshot, btrim(p_formula_version),
    source_row.unit_sale_price_gbp, source_row.unit_supplier_cost_gbp,
    round(p_airline_cancellation_fee_gbp, 2),
    round(p_supplier_cancellation_charge_gbp, 2),
    round(p_retained_agent_commission_gbp, 2), round(p_desired_company_markup_gbp, 2),
    proposed_charge, proposed_refund, expected_recovery,
    round(p_desired_company_markup_gbp, 2),
    replacement_supplier, replacement_sale,
    case when replacement_source_value is null then null
      else round(p_replacement_agent_commission_gbp, 2) end,
    case when replacement_source_value is null then null
      else round(p_replacement_desired_markup_gbp, 2) end,
    replacement_net_zero, replacement_safe, credit_applied, extra_payment,
    credit_remaining, replacement_result,
    nullif(btrim(p_notes), ''), nullif(btrim(p_override_reason), ''), p_idempotency_key
  ) returning * into refund_row;

  insert into public.ticket_refund_events (
    refund_id, event_type, actor_employee_id, event_date, notes, event_data, idempotency_key
  ) values (
    refund_row.id, 'recorded', p_actor_employee_id, current_date, refund_row.notes,
    jsonb_build_object(
      'status', refund_row.status,
      'settlementMode', refund_row.settlement_mode,
      'proposedCustomerRefundGbp', refund_row.proposed_customer_refund_gbp,
      'expectedAirlineRecoveryGbp', refund_row.expected_airline_recovery_gbp,
      'commissionSource', 'manual_pending_commission_module',
      'packageMatchStatus', refund_row.package_match_status,
      'commissionScope', refund_row.commission_scope
    ),
    'refund-created:' || refund_row.id::text
  );

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action, actor_employee_id,
    reason, after_state
  ) values (
    'refund', refund_row.id, refund_row.booking_id, refund_row.transaction_id,
    'refund_recorded', p_actor_employee_id, refund_row.override_reason,
    jsonb_build_object(
      'status', refund_row.status,
      'settlementMode', refund_row.settlement_mode,
      'formulaVersion', refund_row.formula_version,
      'packageMatchStatus', refund_row.package_match_status,
      'commissionScope', refund_row.commission_scope,
      'replacementBookingId', refund_row.replacement_booking_id
    )
  );

  return jsonb_build_object(
    'refundId', refund_row.id,
    'bookingId', refund_row.booking_id,
    'status', refund_row.status,
    'version', refund_row.version,
    'packageMatchStatus', refund_row.package_match_status,
    'commissionScope', refund_row.commission_scope,
    'idempotentReplay', false
  );
exception
  when unique_violation then
    if exists (
      select 1 from public.ticket_refunds refund
      where refund.transaction_passenger_id = source_row.allocation_id
        and refund.status <> 'voided'
    ) then
      raise exception 'An active refund already exists for this passenger ticket'
        using errcode = '23505', hint = 'TICKETING_REFUND_EXISTS';
    end if;
    raise;
end
$$;

create or replace function public.ticketing_append_refund_event_2026082903(
  p_actor_employee_id uuid,
  p_refund_id uuid,
  p_expected_version bigint,
  p_event_type text,
  p_amount_gbp numeric,
  p_event_date date,
  p_reference text,
  p_notes text,
  p_override_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  refund_row public.ticket_refunds;
  event_row public.ticket_refund_events;
  context_id uuid := gen_random_uuid();
  event_type_value text := lower(btrim(coalesce(p_event_type, '')));
  amount_value numeric(14,2);
  next_customer_settled numeric(14,2);
  next_airline_recovered numeric(14,2);
  next_other_costs numeric(14,2);
  next_recovery_final boolean;
  next_status text;
  next_actual_result numeric(14,2);
  reason_value text := nullif(btrim(p_override_reason), '');
begin
  if p_actor_employee_id is null or p_refund_id is null or p_expected_version is null then
    raise exception 'Actor, refund, and expected version are required' using errcode = '22023';
  end if;
  if event_type_value not in (
    'customer_settlement', 'airline_recovery', 'other_cost',
    'recovery_finalised', 'closed', 'voided'
  ) then
    raise exception 'Refund event type is invalid' using errcode = '22023';
  end if;
  if p_event_date is null or p_event_date > current_date
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'Event date and idempotency key are invalid' using errcode = '22023';
  end if;
  if p_reference is not null and length(btrim(p_reference)) not between 1 and 200
    or p_notes is not null and length(btrim(p_notes)) not between 1 and 2000
    or reason_value is not null and length(reason_value) > 500 then
    raise exception 'Refund event text is invalid' using errcode = '22023';
  end if;

  select * into event_row
  from public.ticket_refund_events
  where actor_employee_id = p_actor_employee_id and idempotency_key = p_idempotency_key;
  if found then
    select * into refund_row from public.ticket_refunds where id = event_row.refund_id;
    return jsonb_build_object(
      'refundId', refund_row.id,
      'eventId', event_row.id,
      'status', refund_row.status,
      'version', refund_row.version,
      'idempotentReplay', true
    );
  end if;

  select * into refund_row from public.ticket_refunds
  where id = p_refund_id for update;
  if not found then
    raise exception 'Refund was not found' using errcode = 'P0002';
  end if;
  if refund_row.version <> p_expected_version then
    raise exception 'Refund changed; reload before recording another event'
      using errcode = '40001', hint = 'TICKETING_REFUND_VERSION_CONFLICT';
  end if;
  if refund_row.status in ('closed', 'voided') then
    raise exception 'Closed or voided refunds cannot accept another event' using errcode = '55000';
  end if;
  if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id) then
    raise exception 'Only an administrator may record refund settlement events'
      using errcode = '42501';
  end if;

  amount_value := case when p_amount_gbp is null then null else round(p_amount_gbp, 2) end;
  if event_type_value in ('customer_settlement', 'airline_recovery', 'other_cost')
    and (amount_value is null or amount_value <= 0) then
    raise exception 'A positive event amount is required' using errcode = '22023';
  end if;
  if event_type_value in ('recovery_finalised', 'closed', 'voided')
    and amount_value is not null then
    raise exception 'This refund event does not accept an amount' using errcode = '22023';
  end if;
  if event_type_value in ('closed', 'voided') and reason_value is null then
    raise exception 'A reason is required to close or void a refund' using errcode = '22023';
  end if;

  next_customer_settled := refund_row.customer_settled_gbp
    + case when event_type_value = 'customer_settlement' then amount_value else 0 end;
  next_airline_recovered := refund_row.airline_recovered_gbp
    + case when event_type_value = 'airline_recovery' then amount_value else 0 end;
  next_other_costs := refund_row.other_actual_costs_gbp
    + case when event_type_value = 'other_cost' then amount_value else 0 end;
  next_recovery_final := refund_row.airline_recovery_final
    or event_type_value = 'recovery_finalised';

  if next_customer_settled > refund_row.proposed_customer_refund_gbp and reason_value is null then
    raise exception 'Customer settlement exceeds the proposed refund; provide an override reason'
      using errcode = '22023';
  end if;

  if event_type_value = 'voided' then
    next_status := 'voided';
  elsif event_type_value = 'closed' then
    next_status := 'closed';
  elsif next_recovery_final
    and next_customer_settled >= refund_row.proposed_customer_refund_gbp then
    next_status := 'settled';
  elsif next_customer_settled > 0 or next_airline_recovered > 0 or next_other_costs > 0 then
    next_status := 'part_settled';
  elsif next_recovery_final then
    next_status := 'recovery_pending';
  else
    next_status := 'recorded';
  end if;

  next_actual_result := case when next_recovery_final then round(
    refund_row.original_sale_price_gbp - refund_row.original_supplier_cost_gbp
      + next_airline_recovered - next_customer_settled - next_other_costs
      - refund_row.retained_agent_commission_gbp,
    2
  ) else null end;

  insert into public.ticket_refund_write_contexts (id, refund_id, actor_employee_id)
  values (context_id, refund_row.id, p_actor_employee_id);
  perform set_config('ticketing.refund_context_id', context_id::text, true);

  update public.ticket_refunds
  set customer_settled_gbp = next_customer_settled,
      airline_recovered_gbp = next_airline_recovered,
      other_actual_costs_gbp = next_other_costs,
      airline_recovery_final = next_recovery_final,
      actual_company_result_gbp = next_actual_result,
      status = next_status,
      closed_at = case when next_status in ('closed', 'voided') then now() else null end,
      override_reason = coalesce(reason_value, override_reason)
  where id = refund_row.id
  returning * into refund_row;

  delete from public.ticket_refund_write_contexts where id = context_id;
  perform set_config('ticketing.refund_context_id', '', true);

  insert into public.ticket_refund_events (
    refund_id, event_type, actor_employee_id, amount_gbp, event_date,
    reference, notes, event_data, idempotency_key
  ) values (
    refund_row.id, event_type_value, p_actor_employee_id, amount_value, p_event_date,
    nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''),
    jsonb_build_object(
      'status', refund_row.status,
      'version', refund_row.version,
      'customerSettledGbp', refund_row.customer_settled_gbp,
      'airlineRecoveredGbp', refund_row.airline_recovered_gbp,
      'otherActualCostsGbp', refund_row.other_actual_costs_gbp,
      'airlineRecoveryFinal', refund_row.airline_recovery_final,
      'actualCompanyResultGbp', refund_row.actual_company_result_gbp,
      'overrideReason', reason_value
    ),
    p_idempotency_key
  ) returning * into event_row;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action, actor_employee_id,
    reason, after_state
  ) values (
    'refund', refund_row.id, refund_row.booking_id, refund_row.transaction_id,
    'refund_' || event_type_value, p_actor_employee_id, reason_value,
    event_row.event_data
  );

  return jsonb_build_object(
    'refundId', refund_row.id,
    'eventId', event_row.id,
    'status', refund_row.status,
    'version', refund_row.version,
    'actualCompanyResultGbp', refund_row.actual_company_result_gbp,
    'idempotentReplay', false
  );
end
$$;

-- Voucher rows remain immutable to direct callers but may be advanced by one controlled context.
create table if not exists public.ticket_voucher_write_contexts (
  id uuid primary key,
  voucher_id uuid not null references public.ticket_vouchers(id) on delete cascade,
  actor_employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.ticket_voucher_write_contexts enable row level security;
revoke all on table public.ticket_voucher_write_contexts from public, anon, authenticated;

-- Backfill the new event key while the migration transaction owns the table. The replacement
-- immutable trigger is installed below before this transaction can commit.
drop trigger if exists ticket_voucher_events_immutable_2026082901
  on public.ticket_voucher_events;
drop trigger if exists ticket_voucher_events_immutable_2903
  on public.ticket_voucher_events;

alter table public.ticket_voucher_events
  add column if not exists linked_transaction_passenger_id uuid
    references public.ticket_transaction_passengers(id) on delete restrict,
  add column if not exists refund_id uuid references public.ticket_refunds(id) on delete restrict,
  add column if not exists idempotency_key text;

update public.ticket_voucher_events
set idempotency_key = 'legacy-voucher-event:' || id::text
where idempotency_key is null;

alter table public.ticket_voucher_events alter column idempotency_key set not null;
alter table public.ticket_voucher_events
  drop constraint if exists ticket_voucher_events_idempotency_check;
alter table public.ticket_voucher_events
  add constraint ticket_voucher_events_idempotency_check
  check (length(btrim(idempotency_key)) between 8 and 200);
create unique index if not exists ticket_voucher_events_actor_idempotency_idx
  on public.ticket_voucher_events (actor_employee_id, idempotency_key);

create trigger ticket_voucher_events_immutable_2903
  before update or delete on public.ticket_voucher_events
  for each row execute function public.reject_immutable_event_mutation();

create or replace function public.ticketing_guard_voucher_row_2026082903()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  context_id uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket voucher rows cannot be deleted' using errcode = '55000';
  end if;
  begin
    context_id := nullif(current_setting('ticketing.voucher_context_id', true), '')::uuid;
  exception when others then
    context_id := null;
  end;
  if context_id is null or not exists (
    select 1 from public.ticket_voucher_write_contexts context
    where context.id = context_id and context.voucher_id = old.id
  ) then
    raise exception 'Ticket voucher rows change only through the lifecycle operation'
      using errcode = '55000';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists ticket_vouchers_immutable_2026082901 on public.ticket_vouchers;
drop trigger if exists ticket_vouchers_guard_2903 on public.ticket_vouchers;
create trigger ticket_vouchers_guard_2903
  before update or delete on public.ticket_vouchers
  for each row execute function public.ticketing_guard_voucher_row_2026082903();

-- Keep the foundation create function compatible while historical rows remain append-only.
create or replace function public.ticketing_default_voucher_event_key_2026082903()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.idempotency_key is null then
    new.idempotency_key := case
      when new.event_type = 'created' then 'voucher-created:' || new.voucher_id::text
      else 'voucher-event:' || new.id::text
    end;
  end if;
  return new;
end
$$;
drop trigger if exists ticket_voucher_events_default_key_2903
  on public.ticket_voucher_events;
create trigger ticket_voucher_events_default_key_2903
  before insert on public.ticket_voucher_events
  for each row execute function public.ticketing_default_voucher_event_key_2026082903();

create or replace function public.ticketing_append_voucher_event_2026082903(
  p_actor_employee_id uuid,
  p_voucher_id uuid,
  p_expected_version integer,
  p_event_type text,
  p_amount_gbp numeric,
  p_event_date date,
  p_linked_booking_id uuid,
  p_linked_passenger_type text,
  p_linked_passenger_position integer,
  p_refund_id uuid,
  p_airline_reference text,
  p_notes text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  voucher_row public.ticket_vouchers;
  event_row public.ticket_voucher_events;
  linked_row record;
  linked_booking_id_value uuid;
  linked_allocation_id_value uuid;
  context_id uuid := gen_random_uuid();
  event_type_value text := lower(btrim(coalesce(p_event_type, '')));
  amount_value numeric(14,2);
  next_status text;
  next_confirmed numeric(14,2);
  next_remaining numeric(14,2);
  actor_is_admin boolean;
  actor_can_follow_up boolean;
  reason_value text := nullif(btrim(p_reason), '');
begin
  if p_actor_employee_id is null or p_voucher_id is null or p_expected_version is null
    or p_event_date is null or p_event_date > current_date
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'Voucher event identity, date, and idempotency key are required'
      using errcode = '22023';
  end if;
  if event_type_value not in (
    'claim_submitted', 'value_confirmed', 'part_used', 'used_on_new_ticket',
    'refund_received', 'expired', 'closed', 'deadline_corrected'
  ) then
    raise exception 'Voucher event type is invalid' using errcode = '22023';
  end if;

  select * into event_row from public.ticket_voucher_events
  where actor_employee_id = p_actor_employee_id and idempotency_key = p_idempotency_key;
  if found then
    select * into voucher_row from public.ticket_vouchers where id = event_row.voucher_id;
    return jsonb_build_object(
      'voucherId', voucher_row.id,
      'eventId', event_row.id,
      'status', voucher_row.status,
      'remainingValueGbp', voucher_row.remaining_value_gbp,
      'version', voucher_row.version,
      'idempotentReplay', true
    );
  end if;

  select * into voucher_row from public.ticket_vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Voucher was not found' using errcode = 'P0002'; end if;
  if voucher_row.version <> p_expected_version then
    raise exception 'Voucher changed; reload before recording another event'
      using errcode = '40001', hint = 'TICKETING_VOUCHER_VERSION_CONFLICT';
  end if;
  if voucher_row.status in ('used_on_new_ticket', 'refund_received', 'expired', 'closed') then
    raise exception 'This voucher is already complete' using errcode = '55000';
  end if;

  actor_is_admin := public.ticketing_actor_is_admin_2026082802(p_actor_employee_id);
  actor_can_follow_up := p_actor_employee_id in (
    voucher_row.owner_employee_id, voucher_row.follow_up_employee_id
  );
  if event_type_value = 'claim_submitted' then
    if not actor_can_follow_up and not actor_is_admin then
      raise exception 'Only the owner, follow-up owner, or an administrator may submit the claim'
        using errcode = '42501';
    end if;
  elsif not actor_is_admin then
    raise exception 'Only an administrator may confirm or allocate voucher value'
      using errcode = '42501';
  end if;

  amount_value := case when p_amount_gbp is null then null else round(p_amount_gbp, 2) end;
  next_status := voucher_row.status;
  next_confirmed := voucher_row.confirmed_value_gbp;
  next_remaining := voucher_row.remaining_value_gbp;

  if event_type_value = 'claim_submitted' then
    if voucher_row.status <> 'unclaimed' or amount_value is not null then
      raise exception 'Only an unclaimed voucher can be submitted without an amount'
        using errcode = '22023';
    end if;
    next_status := 'claim_submitted';
  elsif event_type_value = 'value_confirmed' then
    if voucher_row.status not in ('unclaimed', 'claim_submitted')
      or amount_value is null or amount_value <= 0 then
      raise exception 'A positive airline-confirmed value is required' using errcode = '22023';
    end if;
    next_confirmed := amount_value;
    next_remaining := amount_value;
    next_status := 'airline_credit_confirmed';
  elsif event_type_value in ('part_used', 'used_on_new_ticket') then
    if voucher_row.status not in ('airline_credit_confirmed', 'part_used')
      or amount_value is null or amount_value <= 0 or amount_value > voucher_row.remaining_value_gbp
      or p_linked_booking_id is null then
      raise exception 'Voucher use requires an available amount and replacement booking'
        using errcode = '22023';
    end if;
    if upper(btrim(coalesce(p_linked_passenger_type, ''))) not in ('ADT', 'YTH', 'CHD', 'INF')
      or p_linked_passenger_position is null
      or p_linked_passenger_position not between 1 and 99 then
      raise exception 'Select the exact replacement passenger ticket' using errcode = '22023';
    end if;

    select booking.id as booking_id, booking.airline_id, allocation.id as allocation_id
    into linked_row
    from public.ticket_bookings booking
    join public.ticket_transactions transaction
      on transaction.booking_id = booking.id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
      and transaction.operational_status in ('held', 'issued')
    join public.ticket_transaction_passengers allocation
      on allocation.transaction_id = transaction.id
      and allocation.position = p_linked_passenger_position
    join public.ticket_passengers passenger
      on passenger.id = allocation.passenger_id
      and passenger.passenger_type = upper(btrim(p_linked_passenger_type))
    where booking.id = p_linked_booking_id and booking.archived_at is null;
    if not found then raise exception 'Replacement passenger ticket was not found' using errcode = 'P0002'; end if;
    if linked_row.airline_id <> voucher_row.airline_id then
      raise exception 'Airline credit or voucher reuse must use the same airline'
        using errcode = '23514', hint = 'TICKETING_VOUCHER_AIRLINE_MISMATCH';
    end if;
    linked_booking_id_value := linked_row.booking_id;
    linked_allocation_id_value := linked_row.allocation_id;
    next_remaining := round(voucher_row.remaining_value_gbp - amount_value, 2);
    next_status := case when next_remaining = 0 then 'used_on_new_ticket' else 'part_used' end;
  elsif event_type_value = 'refund_received' then
    if voucher_row.status not in ('airline_credit_confirmed', 'part_used')
      or amount_value is null or amount_value <= 0 or amount_value > voucher_row.remaining_value_gbp then
      raise exception 'Refund receipt exceeds the available voucher value' using errcode = '22023';
    end if;
    next_remaining := round(voucher_row.remaining_value_gbp - amount_value, 2);
    next_status := case when next_remaining = 0 then 'refund_received' else 'part_used' end;
  elsif event_type_value = 'expired' then
    if p_event_date < voucher_row.claim_by_date then
      raise exception 'Voucher cannot expire before its claim deadline' using errcode = '22023';
    end if;
    next_status := 'expired';
  elsif event_type_value = 'closed' then
    if reason_value is null then raise exception 'A closure reason is required' using errcode = '22023'; end if;
    next_status := 'closed';
  elsif event_type_value = 'deadline_corrected' then
    if p_event_date <= voucher_row.cancellation_date or reason_value is null then
      raise exception 'Corrected deadline and reason are required' using errcode = '22023';
    end if;
  end if;

  insert into public.ticket_voucher_write_contexts (id, voucher_id, actor_employee_id)
  values (context_id, voucher_row.id, p_actor_employee_id);
  perform set_config('ticketing.voucher_context_id', context_id::text, true);

  update public.ticket_vouchers
  set status = next_status,
      confirmed_value_gbp = next_confirmed,
      remaining_value_gbp = next_remaining,
      claim_by_date = case when event_type_value = 'deadline_corrected'
        then p_event_date else claim_by_date end,
      airline_reference = coalesce(nullif(btrim(p_airline_reference), ''), airline_reference),
      notes = coalesce(nullif(btrim(p_notes), ''), notes)
  where id = voucher_row.id
  returning * into voucher_row;

  delete from public.ticket_voucher_write_contexts where id = context_id;
  perform set_config('ticketing.voucher_context_id', '', true);

  insert into public.ticket_voucher_events (
    voucher_id, event_type, actor_employee_id, linked_booking_id,
    linked_transaction_passenger_id, refund_id, amount_gbp, event_date,
    notes, event_data, idempotency_key
  ) values (
    voucher_row.id, event_type_value, p_actor_employee_id, linked_booking_id_value,
    linked_allocation_id_value, p_refund_id, amount_value, p_event_date,
    nullif(btrim(p_notes), ''),
    jsonb_build_object(
      'status', voucher_row.status,
      'confirmedValueGbp', voucher_row.confirmed_value_gbp,
      'remainingValueGbp', voucher_row.remaining_value_gbp,
      'claimByDate', voucher_row.claim_by_date,
      'airlineReference', voucher_row.airline_reference,
      'reason', reason_value
    ),
    p_idempotency_key
  ) returning * into event_row;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action, actor_employee_id,
    reason, after_state
  ) values (
    'voucher', voucher_row.id, voucher_row.booking_id, voucher_row.transaction_id,
    'voucher_' || event_type_value, p_actor_employee_id, reason_value, event_row.event_data
  );

  return jsonb_build_object(
    'voucherId', voucher_row.id,
    'eventId', event_row.id,
    'status', voucher_row.status,
    'confirmedValueGbp', voucher_row.confirmed_value_gbp,
    'remainingValueGbp', voucher_row.remaining_value_gbp,
    'claimByDate', voucher_row.claim_by_date,
    'version', voucher_row.version,
    'idempotentReplay', false
  );
end
$$;

revoke all on function public.ticketing_record_refund_2026082903(
  uuid,uuid,text,integer,text,uuid,text,integer,numeric,numeric,numeric,numeric,numeric,
  numeric,numeric,numeric,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.ticketing_record_refund_2026082903(
  uuid,uuid,text,integer,text,uuid,text,integer,numeric,numeric,numeric,numeric,numeric,
  numeric,numeric,numeric,text,text,text,text
) to service_role;
revoke all on function public.ticketing_append_refund_event_2026082903(
  uuid,uuid,bigint,text,numeric,date,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.ticketing_append_refund_event_2026082903(
  uuid,uuid,bigint,text,numeric,date,text,text,text,text
) to service_role;
revoke all on function public.ticketing_append_voucher_event_2026082903(
  uuid,uuid,integer,text,numeric,date,uuid,text,integer,uuid,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.ticketing_append_voucher_event_2026082903(
  uuid,uuid,integer,text,numeric,date,uuid,text,integer,uuid,text,text,text,text
) to service_role;
revoke all on function public.ticketing_guard_refund_row_2026082903()
  from public, anon, authenticated;
revoke all on function public.ticketing_guard_voucher_row_2026082903()
  from public, anon, authenticated;
revoke all on function public.ticketing_default_voucher_event_key_2026082903()
  from public, anon, authenticated;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing', 2026082903, now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260829_ticketing_refund_voucher_lifecycle.sql',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'saved-refund-formula-snapshots',
        'refund-settlement-events',
        'actual-refund-company-result',
        'package-scoped-refund-snapshots',
        'voucher-claim-and-value-confirmation',
        'partial-voucher-allocation',
        'same-airline-voucher-enforcement',
        'voucher-refund-expiry-and-closure'
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
    'ready', coalesce(schema_version.version >= 2026082903, false)
      and to_regprocedure('public.ticketing_reconcile_package_booking_2026082902(uuid)') is not null
      and to_regclass('public.ticket_refunds') is not null
      and to_regclass('public.ticket_refund_events') is not null
      and to_regprocedure(
        'public.ticketing_record_refund_2026082903(uuid,uuid,text,integer,text,uuid,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_append_voucher_event_2026082903(uuid,uuid,integer,text,numeric,date,uuid,text,integer,uuid,text,text,text,text)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082903),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
