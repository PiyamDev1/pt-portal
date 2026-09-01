\set ON_ERROR_STOP on

drop schema if exists public cascade;
create schema public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

create table public.locations (
  id uuid primary key,
  name text not null
);

create table public.booking_services (
  id uuid primary key,
  name text not null
);

create table public.bookings (
  id uuid primary key,
  contact_name text
);

create table public.travel_packages (
  id uuid primary key,
  status text not null,
  payment_status text not null
);

create table public.mobile_users (
  id uuid primary key
);

create table public.loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete cascade,
  transaction_type text not null,
  points_change integer not null,
  reason text not null,
  source_ledger_id uuid references public.loyalty_points_ledger(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

create table public.ticket_bookings (
  id uuid primary key,
  commission_scope text not null
);

create table public.ticket_transactions (
  id uuid primary key,
  booking_id uuid not null references public.ticket_bookings(id) on delete cascade,
  service_type text not null,
  parent_transaction_id uuid references public.ticket_transactions(id) on delete restrict,
  operational_status text not null,
  payment_status text not null
);

create table public.ticket_refunds (
  id uuid primary key,
  transaction_id uuid not null references public.ticket_transactions(id) on delete cascade,
  status text not null
);

insert into public.locations (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Test branch');

insert into public.booking_services (id, name)
values ('20000000-0000-0000-0000-000000000001', 'Test service');

-- Proves the gateway migration backfills references on existing appointments.
insert into public.bookings (id, contact_name)
values ('30000000-0000-0000-0000-000000000001', 'Existing customer');
