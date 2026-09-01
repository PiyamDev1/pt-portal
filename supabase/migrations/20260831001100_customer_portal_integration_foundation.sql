begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.customer_integration_nonces (
  key_id text not null,
  nonce text not null,
  request_id text not null,
  received_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  primary key (key_id, nonce)
);
create index if not exists customer_integration_nonces_expiry_idx
  on public.customer_integration_nonces(expires_at);

create table if not exists public.customer_integration_idempotency (
  key_id text not null,
  route_key text not null,
  idempotency_key text not null,
  request_digest text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days'),
  primary key (key_id, route_key, idempotency_key)
);
create index if not exists customer_integration_idempotency_expiry_idx
  on public.customer_integration_idempotency(expires_at);

create table if not exists public.customer_portal_resource_aliases (
  resource_type text not null check (resource_type in ('application', 'appointment', 'trip', 'document', 'branch', 'service')),
  internal_id uuid not null,
  public_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (resource_type, internal_id),
  unique (public_id)
);

create table if not exists public.customer_portal_access_grants (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  resource_type text not null check (resource_type in ('application', 'appointment', 'trip')),
  internal_id uuid not null,
  public_id uuid not null,
  customer_subject text,
  scopes text[] not null default '{}',
  single_use boolean not null default false,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);
create index if not exists customer_portal_access_grants_resource_idx
  on public.customer_portal_access_grants(resource_type, public_id, expires_at desc)
  where revoked_at is null;
create index if not exists customer_portal_access_grants_subject_idx
  on public.customer_portal_access_grants(customer_subject, expires_at desc)
  where customer_subject is not null and revoked_at is null;

create table if not exists public.customer_portal_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('link_application', 'link_trip', 'claim_appointment')),
  resource_type text not null check (resource_type in ('application', 'appointment', 'trip')),
  internal_id uuid not null,
  public_id uuid not null,
  customer_subject text not null,
  contact_email text not null,
  otp_hash text not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists customer_portal_otp_challenges_active_idx
  on public.customer_portal_otp_challenges(customer_subject, purpose, expires_at desc)
  where consumed_at is null and revoked_at is null;

create table if not exists public.customer_portal_availability_slots (
  public_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.booking_services(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupied_until timestamptz not null,
  group_size integer not null check (group_size between 1 and 100),
  capacity integer not null check (capacity >= 1),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint customer_portal_slot_time_order check (starts_at < ends_at and ends_at <= occupied_until)
);
create index if not exists customer_portal_availability_slots_expiry_idx
  on public.customer_portal_availability_slots(expires_at);

alter table public.booking_services
  add column if not exists customer_visible boolean not null default true,
  add column if not exists customer_description text,
  add column if not exists customer_max_group_size integer not null default 20,
  add column if not exists customer_modification_cutoff_hours integer not null default 24;

alter table public.bookings
  add column if not exists customer_public_reference text,
  add column if not exists customer_subject text,
  add column if not exists customer_version integer not null default 1,
  add column if not exists customer_cancelled_at timestamptz;

create or replace function public.generate_customer_appointment_reference()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'APT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
$$;

update public.bookings
set customer_public_reference = public.generate_customer_appointment_reference()
where customer_public_reference is null;

alter table public.bookings
  alter column customer_public_reference set default public.generate_customer_appointment_reference(),
  alter column customer_public_reference set not null;

create unique index if not exists bookings_customer_public_reference_uq
  on public.bookings(customer_public_reference);

create or replace function public.bump_booking_customer_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.customer_version := old.customer_version + 1;
  return new;
end;
$$;

drop trigger if exists bookings_bump_customer_version on public.bookings;
create trigger bookings_bump_customer_version
before update on public.bookings
for each row execute function public.bump_booking_customer_version();

create table if not exists public.customer_portal_trip_invitations (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid(),
  trip_id uuid not null references public.travel_packages(id) on delete cascade,
  inviter_subject text not null,
  invitee_email citext not null,
  invitee_email_hash text not null,
  token_hash text not null unique,
  requested_financial_scope boolean not null default false,
  accepted_subject text,
  accepted_financial_scope boolean,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
alter table public.customer_portal_trip_invitations
  add column if not exists public_id uuid default gen_random_uuid(),
  add column if not exists invitee_email_hash text;
update public.customer_portal_trip_invitations
set public_id = gen_random_uuid()
where public_id is null;
update public.customer_portal_trip_invitations
set invitee_email_hash = encode(digest(lower(invitee_email::text), 'sha256'), 'hex')
where invitee_email_hash is null;
alter table public.customer_portal_trip_invitations
  alter column public_id set not null,
  alter column invitee_email_hash set not null;
create unique index if not exists customer_portal_trip_invitations_public_id_uq
  on public.customer_portal_trip_invitations(public_id);
create index if not exists customer_portal_trip_invitations_trip_idx
  on public.customer_portal_trip_invitations(trip_id, created_at desc);

create table if not exists public.customer_portal_audit_events (
  id bigint generated always as identity primary key,
  request_id text not null,
  event_type text not null,
  actor_kind text not null check (actor_kind in ('customer_server', 'guest', 'customer', 'system')),
  customer_subject text,
  resource_type text,
  resource_public_id uuid,
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_portal_audit_events_resource_idx
  on public.customer_portal_audit_events(resource_type, resource_public_id, occurred_at desc);
create index if not exists customer_portal_audit_events_subject_idx
  on public.customer_portal_audit_events(customer_subject, occurred_at desc)
  where customer_subject is not null;

create or replace function public.prevent_customer_portal_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'customer portal audit events are immutable';
end;
$$;
drop trigger if exists customer_portal_audit_events_immutable on public.customer_portal_audit_events;
create trigger customer_portal_audit_events_immutable
before update or delete on public.customer_portal_audit_events
for each row execute function public.prevent_customer_portal_audit_mutation();

alter table public.mobile_users
  add column if not exists external_customer_subject text,
  add column if not exists customer_code text,
  add column if not exists customer_lifecycle_status text not null default 'active';
create unique index if not exists mobile_users_external_customer_subject_uq
  on public.mobile_users(external_customer_subject)
  where external_customer_subject is not null;
create unique index if not exists mobile_users_customer_code_uq
  on public.mobile_users(customer_code)
  where customer_code is not null;

create table if not exists public.customer_loyalty_awards (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete cascade,
  source_type text not null check (source_type in ('ticket', 'service', 'package', 'adjustment')),
  source_reference text not null,
  description text not null,
  points integer not null check (points <> 0),
  state text not null check (state in ('pending', 'available', 'reversed')),
  activation_milestone text,
  legacy_ledger_id uuid,
  reversal_of uuid references public.customer_loyalty_awards(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  reversed_at timestamptz,
  unique (source_reference)
);
create index if not exists customer_loyalty_awards_user_time_idx
  on public.customer_loyalty_awards(mobile_user_id, created_at desc);

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
as $$
declare
  existing public.customer_loyalty_awards%rowtype;
begin
  if p_points <= 0 or p_source_type not in ('ticket', 'service', 'package', 'adjustment') then
    raise exception 'invalid loyalty award';
  end if;
  select * into existing
  from public.customer_loyalty_awards
  where source_reference = p_source_reference;
  if found then
    if existing.mobile_user_id is distinct from p_mobile_user_id
      or existing.source_type is distinct from p_source_type
      or existing.description is distinct from p_description
      or existing.points is distinct from p_points
      or existing.activation_milestone is distinct from p_activation_milestone then
      raise exception 'loyalty source reference reused with different data';
    end if;
    return existing;
  end if;
  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points, state, activation_milestone
  ) values (
    p_mobile_user_id, p_source_type, p_source_reference, p_description, p_points, 'pending', p_activation_milestone
  ) returning * into existing;
  return existing;
end;
$$;

create or replace function public.customer_loyalty_award_activate(p_source_reference text)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.customer_loyalty_awards%rowtype;
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
as $$
declare
  original public.customer_loyalty_awards%rowtype;
  reversal public.customer_loyalty_awards%rowtype;
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
    original.source_type,
    p_reversal_source_reference,
    p_description,
    -original.points,
    'reversed',
    'refund_or_cancellation',
    original.id,
    clock_timestamp()
  ) returning * into reversal;
  return reversal;
end;
$$;

revoke all on function public.customer_loyalty_award_pending(uuid, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.customer_loyalty_award_activate(text) from public, anon, authenticated;
revoke all on function public.customer_loyalty_award_reverse(text, text, text) from public, anon, authenticated;
grant execute on function public.customer_loyalty_award_pending(uuid, text, text, text, integer, text) to service_role;
grant execute on function public.customer_loyalty_award_activate(text) to service_role;
grant execute on function public.customer_loyalty_award_reverse(text, text, text) to service_role;

alter table public.loyalty_points_ledger
  add column if not exists customer_state text,
  add column if not exists customer_source_reference text,
  add column if not exists customer_activation_milestone text,
  add column if not exists customer_reversal_of uuid;
create unique index if not exists loyalty_points_ledger_customer_source_uq
  on public.loyalty_points_ledger(customer_source_reference)
  where customer_source_reference is not null;

alter table public.customer_integration_nonces enable row level security;
alter table public.customer_integration_idempotency enable row level security;
alter table public.customer_portal_resource_aliases enable row level security;
alter table public.customer_portal_access_grants enable row level security;
alter table public.customer_portal_otp_challenges enable row level security;
alter table public.customer_portal_availability_slots enable row level security;
alter table public.customer_portal_trip_invitations enable row level security;
alter table public.customer_portal_audit_events enable row level security;
alter table public.customer_loyalty_awards enable row level security;

drop policy if exists customer_integration_nonces_service_role on public.customer_integration_nonces;
create policy customer_integration_nonces_service_role on public.customer_integration_nonces for all to service_role using (true) with check (true);
drop policy if exists customer_integration_idempotency_service_role on public.customer_integration_idempotency;
create policy customer_integration_idempotency_service_role on public.customer_integration_idempotency for all to service_role using (true) with check (true);
drop policy if exists customer_portal_resource_aliases_service_role on public.customer_portal_resource_aliases;
create policy customer_portal_resource_aliases_service_role on public.customer_portal_resource_aliases for all to service_role using (true) with check (true);
drop policy if exists customer_portal_access_grants_service_role on public.customer_portal_access_grants;
create policy customer_portal_access_grants_service_role on public.customer_portal_access_grants for all to service_role using (true) with check (true);
drop policy if exists customer_portal_otp_challenges_service_role on public.customer_portal_otp_challenges;
create policy customer_portal_otp_challenges_service_role on public.customer_portal_otp_challenges for all to service_role using (true) with check (true);
drop policy if exists customer_portal_availability_slots_service_role on public.customer_portal_availability_slots;
create policy customer_portal_availability_slots_service_role on public.customer_portal_availability_slots for all to service_role using (true) with check (true);
drop policy if exists customer_portal_trip_invitations_service_role on public.customer_portal_trip_invitations;
create policy customer_portal_trip_invitations_service_role on public.customer_portal_trip_invitations for all to service_role using (true) with check (true);
drop policy if exists customer_portal_audit_events_service_role on public.customer_portal_audit_events;
create policy customer_portal_audit_events_service_role on public.customer_portal_audit_events for all to service_role using (true) with check (true);
drop policy if exists customer_loyalty_awards_service_role on public.customer_loyalty_awards;
create policy customer_loyalty_awards_service_role on public.customer_loyalty_awards for all to service_role using (true) with check (true);

grant all on public.customer_integration_nonces,
  public.customer_integration_idempotency,
  public.customer_portal_resource_aliases,
  public.customer_portal_access_grants,
  public.customer_portal_otp_challenges,
  public.customer_portal_availability_slots,
  public.customer_portal_trip_invitations,
  public.customer_portal_audit_events,
  public.customer_loyalty_awards to service_role;
grant usage, select on sequence public.customer_portal_audit_events_id_seq to service_role;

commit;
