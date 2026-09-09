\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

alter table public.locations
  add column if not exists branch_code text,
  add column if not exists timezone text not null default 'Europe/London';

update public.locations
set branch_code = coalesce(branch_code, 'TST-001'), timezone = 'Europe/London';

create table public.roles (
  id uuid primary key,
  name text not null,
  level integer not null
);

create table public.employees (
  id uuid primary key,
  location_id uuid references public.locations(id),
  role_id uuid not null references public.roles(id),
  full_name text,
  is_active boolean not null default true
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.employee_departments (
  employee_id uuid not null references public.employees(id),
  department_id uuid not null references public.departments(id),
  primary key (employee_id, department_id)
);

create table public.supplier_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor_type text,
  is_approved boolean not null default false
);

create table public.service_pricing (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  cost_price numeric(12,2),
  created_at timestamptz not null default clock_timestamp(),
  is_active boolean not null default true,
  notes text,
  sale_price numeric(12,2) not null default 0,
  section text not null default 'General',
  service_name text not null,
  service_option text,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.portal_schema_versions (
  component text primary key,
  version bigint not null,
  applied_at timestamptz not null default clock_timestamp(),
  details jsonb not null default '{}'::jsonb
);

create or replace function public.lms_record_payment(
  p_loan_id uuid,
  p_agent_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_remark text,
  p_transaction_date timestamptz,
  p_idempotency_key text
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'transactionId', gen_random_uuid(),
    'recordedPaymentLoanId', p_loan_id,
    'amount', p_amount
  )
$$;

insert into public.roles (id, name, level) values
  ('00000000-0000-0000-0000-000000000001', 'Master Admin', 1),
  ('00000000-0000-0000-0000-000000000002', 'Manager', 2),
  ('00000000-0000-0000-0000-000000000003', 'Agent', 3);

insert into public.locations (id, name, branch_code, timezone) values
  ('10000000-0000-0000-0000-000000000002', 'Other branch', 'TST-002', 'Europe/London');

insert into public.employees (id, location_id, role_id, full_name) values
  ('00000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Test Agent'),
  ('00000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Test Manager'),
  ('00000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Second Manager'),
  ('00000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'Other Agent');

insert into public.mobile_users (id, customer_code, customer_lifecycle_status) values
  ('00000000-0000-0000-0000-000000000201', 'PYM-2345-6789-A', 'active');
