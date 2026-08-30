-- Extends the compact Ticketing fixture with the package finance fields used by
-- the authoritative Commission package-source migration.

alter table public.travel_packages
  add column if not exists sales_employee_id uuid references public.employees(id),
  add column if not exists sales_responsible_employee_id uuid references public.employees(id),
  add column if not exists location_id uuid references public.locations(id),
  add column if not exists group_id uuid,
  add column if not exists payment_status text not null default 'not_requested',
  add column if not exists earned_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.travel_package_reservations
  add column if not exists currency text not null default 'GBP',
  add column if not exists booked_cost_total numeric(12,2) not null default 0,
  add column if not exists sold_price_total numeric(12,2) not null default 0,
  add column if not exists discount_total numeric(12,2) not null default 0,
  add column if not exists commission_received_total numeric(12,2) not null default 0,
  add column if not exists supplier_refund_total numeric(12,2) not null default 0,
  add column if not exists customer_refund_total numeric(12,2) not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.travel_package_passengers (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.travel_packages(id) on delete cascade,
  first_name text,
  last_name text
);

create table if not exists public.travel_package_invoices (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.travel_packages(id) on delete cascade,
  invoice_number text not null unique,
  status text not null default 'draft',
  currency text not null default 'GBP',
  balance_due numeric(12,2) not null default 0,
  total_sold numeric(12,2) not null default 0,
  total_booked_cost numeric(12,2) not null default 0,
  received_commission_total numeric(12,2) not null default 0
);

create table if not exists public.travel_package_payments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.travel_packages(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  currency text not null default 'GBP',
  payment_type text not null default 'payment',
  payment_status text not null default 'pending'
);
