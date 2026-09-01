-- Customer loyalty source lifecycle.
--
-- This migration deliberately integrates at the database state boundary. The
-- existing Ticketing and Package endpoints already update these authoritative
-- rows, so status changes cannot skip activation or reversal by taking a
-- different HTTP route. A service adapter records separate completed and paid
-- evidence because the current application tables do not expose one safe,
-- common paid-state field.

begin;

create unique index if not exists customer_loyalty_awards_reversal_uq
  on public.customer_loyalty_awards(reversal_of)
  where reversal_of is not null;

create table if not exists public.customer_loyalty_source_links (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  source_type text not null check (source_type in ('ticket', 'service', 'package')),
  source_namespace text,
  source_record_id uuid not null,
  source_reference text not null unique,
  description text not null check (length(btrim(description)) between 1 and 180),
  points integer not null check (points > 0),
  activation_milestone text not null check (
    activation_milestone in ('issued_and_paid', 'completed_and_paid', 'fully_paid')
  ),
  created_at timestamptz not null default clock_timestamp(),
  constraint customer_loyalty_source_namespace_check check (
    (
      source_type = 'service'
      and source_namespace ~ '^[a-z][a-z0-9_]{0,31}$'
    )
    or (source_type <> 'service' and source_namespace is null)
  )
);

create unique index if not exists customer_loyalty_source_record_uq
  on public.customer_loyalty_source_links(source_type, source_record_id)
  where source_type in ('ticket', 'package');
create unique index if not exists customer_loyalty_service_source_record_uq
  on public.customer_loyalty_source_links(source_namespace, source_record_id)
  where source_type = 'service';

create table if not exists public.customer_loyalty_service_states (
  source_namespace text not null check (source_namespace ~ '^[a-z][a-z0-9_]{0,31}$'),
  source_record_id uuid not null,
  completed_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (source_namespace, source_record_id)
);

create table if not exists public.customer_loyalty_service_events (
  event_reference text primary key check (length(btrim(event_reference)) between 1 and 200),
  source_namespace text not null check (source_namespace ~ '^[a-z][a-z0-9_]{0,31}$'),
  source_record_id uuid not null,
  event_type text not null check (event_type in ('completed', 'paid', 'cancelled', 'refunded')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp()
);

create index if not exists customer_loyalty_service_events_source_idx
  on public.customer_loyalty_service_events(source_namespace, source_record_id, occurred_at);

create table if not exists public.customer_loyalty_lifecycle_events (
  id bigint generated always as identity primary key,
  source_reference text not null references public.customer_loyalty_source_links(source_reference)
    on delete restrict,
  award_id uuid not null references public.customer_loyalty_awards(id) on delete restrict,
  transition text not null check (transition in ('pending', 'activated', 'reversed')),
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (source_reference, transition)
);

create or replace function public.customer_loyalty_source_reference_v1(
  p_source_type text,
  p_source_namespace text,
  p_source_record_id uuid
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_namespace text := lower(btrim(coalesce(p_source_namespace, '')));
begin
  if p_source_type not in ('ticket', 'service', 'package') then
    raise exception 'invalid loyalty source type';
  end if;
  if p_source_type = 'service' then
    if normalized_namespace !~ '^[a-z][a-z0-9_]{0,31}$' then
      raise exception 'invalid loyalty service namespace';
    end if;
    return 'service.v1:' || normalized_namespace || ':' || p_source_record_id::text;
  end if;
  if nullif(btrim(coalesce(p_source_namespace, '')), '') is not null then
    raise exception 'non-service loyalty sources cannot have a namespace';
  end if;
  return p_source_type || '.v1:' || p_source_record_id::text;
end;
$$;

-- Keep the existing ledger useful to staff consumers while the portal uses the
-- richer pending/available/reversed award projection. Only available points are
-- written as Earned. A reversal of a pending award therefore never creates a
-- negative legacy balance.
create or replace function public.customer_loyalty_award_activate(p_source_reference text)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  existing public.customer_loyalty_awards%rowtype;
  ledger_row public.loyalty_points_ledger%rowtype;
begin
  select * into existing
  from public.customer_loyalty_awards
  where source_reference = p_source_reference
  for update;
  if not found then raise exception 'loyalty award not found'; end if;
  if existing.state = 'reversed' then raise exception 'reversed loyalty award cannot be activated'; end if;

  if existing.state = 'pending' then
    update public.customer_loyalty_awards
    set state = 'available', activated_at = clock_timestamp()
    where id = existing.id
    returning * into existing;
  end if;

  insert into public.loyalty_points_ledger (
    mobile_user_id,
    transaction_type,
    points_change,
    reason,
    customer_state,
    customer_source_reference,
    customer_activation_milestone
  ) values (
    existing.mobile_user_id,
    'Earned',
    existing.points,
    existing.description,
    'available',
    existing.source_reference,
    existing.activation_milestone
  )
  on conflict (customer_source_reference)
    where customer_source_reference is not null
    do nothing;

  select * into ledger_row
  from public.loyalty_points_ledger
  where customer_source_reference = existing.source_reference;
  if not found
    or ledger_row.mobile_user_id is distinct from existing.mobile_user_id
    or ledger_row.points_change is distinct from existing.points
    or ledger_row.transaction_type::text is distinct from 'Earned' then
    raise exception 'loyalty ledger source reference reused with different data';
  end if;
  return existing;
end;
$$;

create or replace function public.customer_loyalty_award_pending(
  p_mobile_user_id uuid,
  p_source_type text,
  p_source_reference text,
  p_description text,
  p_points integer,
  p_activation_milestone text
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  existing public.customer_loyalty_awards%rowtype;
begin
  if p_points <= 0 or p_source_type not in ('ticket', 'service', 'package', 'adjustment') then
    raise exception 'invalid loyalty award';
  end if;
  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points, state, activation_milestone
  ) values (
    p_mobile_user_id,
    p_source_type,
    p_source_reference,
    p_description,
    p_points,
    'pending',
    p_activation_milestone
  ) on conflict (source_reference) do nothing;

  select * into existing
  from public.customer_loyalty_awards
  where source_reference = p_source_reference
  for update;
  if existing.mobile_user_id is distinct from p_mobile_user_id
    or existing.source_type is distinct from p_source_type
    or existing.description is distinct from p_description
    or existing.points is distinct from p_points
    or existing.activation_milestone is distinct from p_activation_milestone then
    raise exception 'loyalty source reference reused with different data';
  end if;
  return existing;
end;
$$;

create or replace function public.customer_loyalty_award_reverse(
  p_source_reference text,
  p_reversal_source_reference text,
  p_description text
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  original public.customer_loyalty_awards%rowtype;
  reversal public.customer_loyalty_awards%rowtype;
  earned_ledger public.loyalty_points_ledger%rowtype;
  reversal_ledger public.loyalty_points_ledger%rowtype;
  was_activated boolean;
begin
  select * into original
  from public.customer_loyalty_awards
  where source_reference = p_source_reference
  for update;
  if not found then raise exception 'loyalty award not found'; end if;

  select * into reversal
  from public.customer_loyalty_awards
  where reversal_of = original.id;
  if found then
    if reversal.source_reference is distinct from p_reversal_source_reference then
      raise exception 'loyalty award already reversed by another source';
    end if;
    return reversal;
  end if;

  was_activated := original.activated_at is not null;
  update public.customer_loyalty_awards
  set state = 'reversed', reversed_at = clock_timestamp()
  where id = original.id;

  insert into public.customer_loyalty_awards (
    mobile_user_id,
    source_type,
    source_reference,
    description,
    points,
    state,
    activation_milestone,
    reversal_of,
    reversed_at
  ) values (
    original.mobile_user_id,
    'adjustment',
    p_reversal_source_reference,
    p_description,
    -original.points,
    'reversed',
    original.activation_milestone,
    original.id,
    clock_timestamp()
  ) returning * into reversal;

  if was_activated then
    -- Backfill the positive entry as well when upgrading an already-available
    -- award created before this lifecycle migration.
    insert into public.loyalty_points_ledger (
      mobile_user_id,
      transaction_type,
      points_change,
      reason,
      customer_state,
      customer_source_reference,
      customer_activation_milestone
    ) values (
      original.mobile_user_id,
      'Earned',
      original.points,
      original.description,
      'reversed',
      original.source_reference,
      original.activation_milestone
    )
    on conflict (customer_source_reference)
      where customer_source_reference is not null
      do update set customer_state = 'reversed';

    select * into earned_ledger
    from public.loyalty_points_ledger
    where customer_source_reference = original.source_reference;
    if not found
      or earned_ledger.mobile_user_id is distinct from original.mobile_user_id
      or earned_ledger.points_change is distinct from original.points
      or earned_ledger.transaction_type::text is distinct from 'Earned' then
      raise exception 'loyalty ledger source reference reused with different data';
    end if;

    insert into public.loyalty_points_ledger (
      mobile_user_id,
      transaction_type,
      points_change,
      reason,
      source_ledger_id,
      customer_state,
      customer_source_reference,
      customer_activation_milestone,
      customer_reversal_of
    ) values (
      original.mobile_user_id,
      'Adjusted',
      -original.points,
      p_description,
      earned_ledger.id,
      'reversed',
      p_reversal_source_reference,
      original.activation_milestone,
      original.id
    )
    on conflict (customer_source_reference)
      where customer_source_reference is not null
      do nothing;

    select * into reversal_ledger
    from public.loyalty_points_ledger
    where customer_source_reference = p_reversal_source_reference;
    if not found
      or reversal_ledger.mobile_user_id is distinct from original.mobile_user_id
      or reversal_ledger.points_change is distinct from -original.points
      or reversal_ledger.transaction_type::text is distinct from 'Adjusted' then
      raise exception 'loyalty reversal source reference reused with different data';
    end if;
  end if;
  return reversal;
end;
$$;

create or replace function public.customer_loyalty_reconcile_source_v1(
  p_source_type text,
  p_source_namespace text,
  p_source_record_id uuid
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  link_row public.customer_loyalty_source_links%rowtype;
  award_row public.customer_loyalty_awards%rowtype;
  package_row public.travel_packages%rowtype;
  state_row public.customer_loyalty_service_states%rowtype;
  transaction_operational_status text;
  transaction_payment_status text;
  booking_scope text;
  has_active_refund boolean := false;
  is_eligible boolean := false;
  is_terminal boolean := false;
  transition_reason text := 'Qualifying loyalty milestone withdrawn.';
  reversal_reference text;
begin
  select * into link_row
  from public.customer_loyalty_source_links
  where source_type = p_source_type
    and source_namespace is not distinct from nullif(lower(btrim(coalesce(p_source_namespace, ''))), '')
    and source_record_id = p_source_record_id;
  if not found then return null; end if;

  select * into award_row
  from public.customer_loyalty_awards
  where source_reference = link_row.source_reference;
  if not found then raise exception 'loyalty source is missing its pending award'; end if;
  if award_row.state = 'reversed' then return award_row; end if;

  if link_row.source_type = 'ticket' then
    select transaction.operational_status, transaction.payment_status, booking.commission_scope
      into transaction_operational_status, transaction_payment_status, booking_scope
    from public.ticket_transactions transaction
    join public.ticket_bookings booking on booking.id = transaction.booking_id
    where transaction.id = link_row.source_record_id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null;
    if not found then return award_row; end if;
    select exists (
      select 1
      from public.ticket_refunds refund
      where refund.transaction_id = link_row.source_record_id
        and refund.status <> 'voided'
    ) into has_active_refund;
    is_eligible := transaction_operational_status = 'issued'
      and transaction_payment_status = 'paid'
      and booking_scope = 'ticket'
      and not has_active_refund;
    is_terminal := transaction_operational_status in ('cancelled', 'part_refunded', 'refunded')
      or has_active_refund;
    transition_reason := case
      when has_active_refund then 'Ticket refund recorded.'
      when transaction_operational_status = 'cancelled' then 'Ticket cancelled.'
      when transaction_operational_status in ('part_refunded', 'refunded') then 'Ticket refunded.'
      when booking_scope <> 'ticket' then 'Ticket moved into package earning scope.'
      else 'Issued-and-paid ticket milestone withdrawn.'
    end;
  elsif link_row.source_type = 'package' then
    select * into package_row
    from public.travel_packages
    where id = link_row.source_record_id;
    if not found then return award_row; end if;
    is_eligible := package_row.payment_status = 'paid'
      and package_row.status <> 'cancelled';
    is_terminal := package_row.status = 'cancelled' or package_row.payment_status = 'refunded';
    transition_reason := case
      when package_row.status = 'cancelled' then 'Package cancelled.'
      when package_row.payment_status = 'refunded' then 'Package refunded.'
      else 'Fully-paid package milestone withdrawn.'
    end;
  else
    select * into state_row
    from public.customer_loyalty_service_states
    where source_namespace = link_row.source_namespace
      and source_record_id = link_row.source_record_id;
    if not found then return award_row; end if;
    is_eligible := state_row.completed_at is not null
      and state_row.paid_at is not null
      and state_row.cancelled_at is null
      and state_row.refunded_at is null;
    is_terminal := state_row.cancelled_at is not null or state_row.refunded_at is not null;
    transition_reason := case
      when state_row.cancelled_at is not null then 'Service cancelled.'
      when state_row.refunded_at is not null then 'Service refunded.'
      else 'Completed-and-paid service milestone withdrawn.'
    end;
  end if;

  if is_terminal or (award_row.state = 'available' and not is_eligible) then
    reversal_reference := link_row.source_reference || ':reversal.v1';
    award_row := public.customer_loyalty_award_reverse(
      link_row.source_reference,
      reversal_reference,
      transition_reason
    );
    insert into public.customer_loyalty_lifecycle_events (
      source_reference, award_id, transition, reason
    ) values (
      link_row.source_reference, award_row.id, 'reversed', transition_reason
    ) on conflict (source_reference, transition) do nothing;
  elsif award_row.state = 'pending' and is_eligible then
    award_row := public.customer_loyalty_award_activate(link_row.source_reference);
    insert into public.customer_loyalty_lifecycle_events (
      source_reference, award_id, transition, reason
    ) values (
      link_row.source_reference,
      award_row.id,
      'activated',
      link_row.activation_milestone
    ) on conflict (source_reference, transition) do nothing;
  end if;
  return award_row;
end;
$$;

create or replace function public.customer_loyalty_register_source_v1(
  p_mobile_user_id uuid,
  p_source_type text,
  p_source_namespace text,
  p_source_record_id uuid,
  p_description text,
  p_points integer
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_namespace text := nullif(lower(btrim(coalesce(p_source_namespace, ''))), '');
  source_reference_value text;
  milestone_value text;
  link_row public.customer_loyalty_source_links%rowtype;
  award_row public.customer_loyalty_awards%rowtype;
  booking_scope text;
begin
  if not exists (select 1 from public.mobile_users where id = p_mobile_user_id) then
    raise exception 'loyalty customer not found';
  end if;
  if p_points <= 0 or length(btrim(coalesce(p_description, ''))) not between 1 and 180 then
    raise exception 'invalid loyalty award details';
  end if;

  source_reference_value := public.customer_loyalty_source_reference_v1(
    p_source_type, normalized_namespace, p_source_record_id
  );
  milestone_value := case p_source_type
    when 'ticket' then 'issued_and_paid'
    when 'service' then 'completed_and_paid'
    when 'package' then 'fully_paid'
  end;

  if p_source_type = 'ticket' then
    select booking.commission_scope
      into booking_scope
    from public.ticket_transactions transaction
    join public.ticket_bookings booking on booking.id = transaction.booking_id
    where transaction.id = p_source_record_id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null;
    if not found then raise exception 'ticket loyalty source not found'; end if;
    if booking_scope <> 'ticket' then
      raise exception 'package-linked tickets must earn through the package source';
    end if;
  elsif p_source_type = 'package' then
    if not exists (select 1 from public.travel_packages where id = p_source_record_id) then
      raise exception 'package loyalty source not found';
    end if;
  end if;

  insert into public.customer_loyalty_source_links (
    mobile_user_id,
    source_type,
    source_namespace,
    source_record_id,
    source_reference,
    description,
    points,
    activation_milestone
  ) values (
    p_mobile_user_id,
    p_source_type,
    normalized_namespace,
    p_source_record_id,
    source_reference_value,
    btrim(p_description),
    p_points,
    milestone_value
  ) on conflict (source_reference) do nothing;

  select * into link_row
  from public.customer_loyalty_source_links
  where source_reference = source_reference_value
  for update;
  if link_row.mobile_user_id is distinct from p_mobile_user_id
    or link_row.description is distinct from btrim(p_description)
    or link_row.points is distinct from p_points
    or link_row.activation_milestone is distinct from milestone_value then
    raise exception 'loyalty source reference reused with different data';
  end if;

  award_row := public.customer_loyalty_award_pending(
    p_mobile_user_id,
    p_source_type,
    source_reference_value,
    btrim(p_description),
    p_points,
    milestone_value
  );
  insert into public.customer_loyalty_lifecycle_events (
    source_reference, award_id, transition, reason
  ) values (
    source_reference_value, award_row.id, 'pending', 'Customer code linked to sale source.'
  ) on conflict (source_reference, transition) do nothing;

  return public.customer_loyalty_reconcile_source_v1(
    p_source_type, normalized_namespace, p_source_record_id
  );
end;
$$;

create or replace function public.customer_loyalty_record_service_event_v1(
  p_source_namespace text,
  p_source_record_id uuid,
  p_event_reference text,
  p_event_type text,
  p_occurred_at timestamptz
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_namespace text := lower(btrim(coalesce(p_source_namespace, '')));
  existing_event public.customer_loyalty_service_events%rowtype;
begin
  perform public.customer_loyalty_source_reference_v1(
    'service', normalized_namespace, p_source_record_id
  );
  if p_event_type not in ('completed', 'paid', 'cancelled', 'refunded')
    or length(btrim(coalesce(p_event_reference, ''))) not between 1 and 200
    or p_occurred_at is null then
    raise exception 'invalid loyalty service event';
  end if;

  insert into public.customer_loyalty_service_events (
    event_reference, source_namespace, source_record_id, event_type, occurred_at
  ) values (
    btrim(p_event_reference), normalized_namespace, p_source_record_id, p_event_type, p_occurred_at
  ) on conflict (event_reference) do nothing;

  select * into existing_event
  from public.customer_loyalty_service_events
  where event_reference = btrim(p_event_reference);
  if existing_event.source_namespace is distinct from normalized_namespace
    or existing_event.source_record_id is distinct from p_source_record_id
    or existing_event.event_type is distinct from p_event_type then
    raise exception 'loyalty service event reference reused with different data';
  end if;

  insert into public.customer_loyalty_service_states as current_state (
    source_namespace,
    source_record_id,
    completed_at,
    paid_at,
    cancelled_at,
    refunded_at
  ) values (
    normalized_namespace,
    p_source_record_id,
    case when p_event_type = 'completed' then existing_event.occurred_at end,
    case when p_event_type = 'paid' then existing_event.occurred_at end,
    case when p_event_type = 'cancelled' then existing_event.occurred_at end,
    case when p_event_type = 'refunded' then existing_event.occurred_at end
  ) on conflict (source_namespace, source_record_id) do update set
    completed_at = coalesce(current_state.completed_at, excluded.completed_at),
    paid_at = coalesce(current_state.paid_at, excluded.paid_at),
    cancelled_at = coalesce(current_state.cancelled_at, excluded.cancelled_at),
    refunded_at = coalesce(current_state.refunded_at, excluded.refunded_at),
    updated_at = clock_timestamp();

  return public.customer_loyalty_reconcile_source_v1(
    'service', normalized_namespace, p_source_record_id
  );
end;
$$;

create or replace function public.customer_loyalty_register_code_source_v1(
  p_customer_code text,
  p_source_type text,
  p_source_namespace text,
  p_source_record_id uuid,
  p_description text,
  p_points integer
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  mobile_user_id_value uuid;
  normalized_code text := upper(btrim(coalesce(p_customer_code, '')));
begin
  if normalized_code !~ '^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$' then
    raise exception 'invalid customer code';
  end if;
  select id into mobile_user_id_value
  from public.mobile_users
  where customer_code = normalized_code
    and customer_lifecycle_status = 'active';
  if not found then raise exception 'active loyalty customer not found'; end if;

  return public.customer_loyalty_register_source_v1(
    mobile_user_id_value,
    p_source_type,
    p_source_namespace,
    p_source_record_id,
    p_description,
    p_points
  );
end;
$$;

create or replace function public.customer_loyalty_ticket_source_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.customer_loyalty_reconcile_source_v1('ticket', null, new.id);
  return new;
end;
$$;

create or replace function public.customer_loyalty_package_source_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.customer_loyalty_reconcile_source_v1('package', null, new.id);
  return new;
end;
$$;

create or replace function public.customer_loyalty_ticket_refund_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.customer_loyalty_reconcile_source_v1('ticket', null, new.transaction_id);
  return new;
end;
$$;

create or replace function public.customer_loyalty_ticket_scope_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  source_row record;
begin
  for source_row in
    select transaction.id
    from public.ticket_transactions transaction
    where transaction.booking_id = new.id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
  loop
    perform public.customer_loyalty_reconcile_source_v1('ticket', null, source_row.id);
  end loop;
  return new;
end;
$$;

create or replace function public.customer_loyalty_service_source_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.customer_loyalty_reconcile_source_v1(
    'service', new.source_namespace, new.source_record_id
  );
  return new;
end;
$$;

drop trigger if exists customer_loyalty_ticket_source_changed_v1 on public.ticket_transactions;
create trigger customer_loyalty_ticket_source_changed_v1
  after insert or update of operational_status, payment_status on public.ticket_transactions
  for each row execute function public.customer_loyalty_ticket_source_changed_v1();

drop trigger if exists customer_loyalty_package_source_changed_v1 on public.travel_packages;
create trigger customer_loyalty_package_source_changed_v1
  after insert or update of status, payment_status on public.travel_packages
  for each row execute function public.customer_loyalty_package_source_changed_v1();

drop trigger if exists customer_loyalty_ticket_refund_changed_v1 on public.ticket_refunds;
create trigger customer_loyalty_ticket_refund_changed_v1
  after insert or update of status on public.ticket_refunds
  for each row execute function public.customer_loyalty_ticket_refund_changed_v1();

drop trigger if exists customer_loyalty_ticket_scope_changed_v1 on public.ticket_bookings;
create trigger customer_loyalty_ticket_scope_changed_v1
  after update of commission_scope on public.ticket_bookings
  for each row execute function public.customer_loyalty_ticket_scope_changed_v1();

drop trigger if exists customer_loyalty_service_source_changed_v1
  on public.customer_loyalty_service_states;
create trigger customer_loyalty_service_source_changed_v1
  after insert or update on public.customer_loyalty_service_states
  for each row execute function public.customer_loyalty_service_source_changed_v1();

alter table public.customer_loyalty_source_links enable row level security;
alter table public.customer_loyalty_service_states enable row level security;
alter table public.customer_loyalty_service_events enable row level security;
alter table public.customer_loyalty_lifecycle_events enable row level security;

drop policy if exists customer_loyalty_source_links_service_role
  on public.customer_loyalty_source_links;
create policy customer_loyalty_source_links_service_role
  on public.customer_loyalty_source_links for select to service_role using (true);
drop policy if exists customer_loyalty_service_states_service_role
  on public.customer_loyalty_service_states;
create policy customer_loyalty_service_states_service_role
  on public.customer_loyalty_service_states for select to service_role using (true);
drop policy if exists customer_loyalty_service_events_service_role
  on public.customer_loyalty_service_events;
create policy customer_loyalty_service_events_service_role
  on public.customer_loyalty_service_events for select to service_role using (true);
drop policy if exists customer_loyalty_lifecycle_events_service_role
  on public.customer_loyalty_lifecycle_events;
create policy customer_loyalty_lifecycle_events_service_role
  on public.customer_loyalty_lifecycle_events for select to service_role using (true);

revoke all on public.customer_loyalty_source_links,
  public.customer_loyalty_service_states,
  public.customer_loyalty_service_events,
  public.customer_loyalty_lifecycle_events from public, anon, authenticated, service_role;
grant select on public.customer_loyalty_source_links,
  public.customer_loyalty_service_states,
  public.customer_loyalty_service_events,
  public.customer_loyalty_lifecycle_events to service_role;
revoke all on public.customer_loyalty_awards from service_role;
grant select on public.customer_loyalty_awards to service_role;

revoke all on function public.customer_loyalty_source_reference_v1(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.customer_loyalty_reconcile_source_v1(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.customer_loyalty_register_source_v1(uuid, text, text, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_record_service_event_v1(text, uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.customer_loyalty_register_code_source_v1(text, text, text, uuid, text, integer)
  from public, anon, authenticated;
-- These primitives are intentionally unavailable to the API service role.
-- Only the source-aware functions below may move award state.
revoke all on function public.customer_loyalty_award_pending(uuid, text, text, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_award_activate(text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_award_reverse(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_ticket_source_changed_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_package_source_changed_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_ticket_refund_changed_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_ticket_scope_changed_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_service_source_changed_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_reconcile_source_v1(text, text, uuid)
  to service_role;
grant execute on function public.customer_loyalty_record_service_event_v1(text, uuid, text, text, timestamptz)
  to service_role;
grant execute on function public.customer_loyalty_register_code_source_v1(text, text, text, uuid, text, integer)
  to service_role;

commit;
