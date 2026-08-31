drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists extensions cascade;
create schema public;
create schema auth;
create schema extensions;

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

-- Supabase installs pgcrypto outside public. Keep the disposable database
-- faithful so restricted Ticketing function search paths cannot accidentally
-- rely on PostgreSQL's local default extension layout.
create extension if not exists pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key,
  email text
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  level integer not null default 1
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_code text
);

create table public.employees (
  id uuid primary key references auth.users(id),
  full_name text,
  email text,
  role_id uuid not null references public.roles(id),
  location_id uuid references public.locations(id),
  manager_id uuid references public.employees(id),
  is_active boolean not null default true
);

create table public.employee_departments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  department_id uuid not null references public.departments(id)
);

create table public.airlines (
  id uuid primary key default gen_random_uuid(),
  iata_code character(2) not null unique,
  name text not null
);

create table public.travel_packages (
  id uuid primary key default gen_random_uuid(),
  package_reference text not null unique,
  package_type text not null default 'umrah',
  status text not null default 'selected',
  selected_quote_snapshot jsonb not null default '{}'::jsonb,
  archived_at timestamptz
);

create table public.travel_package_groups (
  id uuid primary key default gen_random_uuid(),
  group_reference text not null unique,
  status text not null default 'active'
);

create table public.travel_package_reservations (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.travel_packages(id),
  reservation_type text not null default 'other',
  title text,
  booking_reference text,
  status text not null default 'not_started',
  metadata jsonb not null default '{}'::jsonb
);

create table public.packages (
  id uuid primary key default gen_random_uuid()
);

create type public.ticket_service_type as enum ('TK', 'DC', 'PT', 'RF', 'SF');
create type public.ticket_booking_status as enum ('Held', 'Issued', 'Cancelled', 'Expired');
create type public.ticket_payment_status as enum ('Unpaid', 'Partial Paid', 'Paid');

create table public.ticket_ledger (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  passenger_name text,
  contact_phone text,
  pnr text not null,
  airline_id uuid references public.airlines(id),
  departure_date date,
  return_date date,
  booking_deadline timestamptz,
  issued_date date,
  booking_type public.ticket_service_type not null,
  total_passengers integer not null default 1,
  sale_cost numeric(10,2),
  initial_fare_cost numeric(10,2),
  final_fare_cost numeric(10,2),
  booking_status public.ticket_booking_status not null default 'Held',
  payment_status public.ticket_payment_status not null default 'Unpaid',
  created_at timestamptz not null default now(),
  package_id uuid references public.packages(id),
  final_agent_id uuid references public.employees(id),
  is_loyalty_claimed boolean not null default false
);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null
);

create table public.commission_rate_components (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commission_rules(id),
  rate_value numeric(10,4) not null
);

create table public.commission_tiers (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commission_rules(id),
  min_threshold numeric(10,2) not null
);

create table public.employee_commission_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  rule_id uuid not null references public.commission_rules(id),
  start_date date not null
);

grant all on table public.airlines to anon, authenticated, service_role;
grant all on table public.ticket_ledger to anon, authenticated, service_role;
grant all on table public.commission_rules to anon, authenticated, service_role;
grant all on table public.commission_rate_components to anon, authenticated, service_role;
grant all on table public.commission_tiers to anon, authenticated, service_role;
grant all on table public.employee_commission_assignments to anon, authenticated, service_role;

alter table public.ticket_ledger enable row level security;
create policy ticketing_department_write
  on public.ticket_ledger for insert to authenticated with check (true);

insert into public.roles (id, name, level)
values ('10000000-0000-0000-0000-000000000001', 'Agent', 1);

insert into public.departments (id, name)
values ('20000000-0000-0000-0000-000000000001', 'Ticketing');

insert into public.locations (id, name, branch_code)
values ('30000000-0000-0000-0000-000000000001', 'Test Branch', 'TST');

insert into auth.users (id, email)
values ('40000000-0000-0000-0000-000000000001', 'agent@example.test');

insert into public.employees (id, full_name, email, role_id, location_id)
values (
  '40000000-0000-0000-0000-000000000001',
  'Test Agent',
  'agent@example.test',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001'
);

insert into public.employee_departments (employee_id, department_id)
values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001'
);

insert into public.airlines (id, iata_code, name)
values ('50000000-0000-0000-0000-000000000001', 'tk', ' Turkish Airlines ');

insert into public.travel_packages (id, package_reference)
values ('60000000-0000-0000-0000-000000000001', 'PKG-TEST');

insert into public.packages (id)
values ('61000000-0000-0000-0000-000000000001');

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
)
values (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'flight',
  ' ab c-12 ',
  'confirmed'
);

insert into public.ticket_ledger (
  id,
  employee_id,
  passenger_name,
  pnr,
  airline_id,
  issued_date,
  booking_type,
  total_passengers,
  sale_cost,
  initial_fare_cost,
  final_fare_cost,
  booking_status,
  payment_status,
  package_id
)
values (
  '71000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Legacy Passenger',
  'LEGACY1',
  '50000000-0000-0000-0000-000000000001',
  '2026-08-01',
  'TK',
  2,
  500,
  400,
  400,
  'Issued',
  'Paid',
  '61000000-0000-0000-0000-000000000001'
);
