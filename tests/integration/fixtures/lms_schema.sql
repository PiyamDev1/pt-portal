create extension if not exists pgcrypto;

do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end
$$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end
$$;

do $$
begin
  create role service_role nologin;
exception when duplicate_object then null;
end
$$;

create type public.loan_status_type as enum ('Active', 'Defaulted', 'Paid Off', 'Written Off');
create type public.loan_transaction_type as enum ('DEBT', 'PAYMENT', 'service', 'payment', 'fee');

create table public.employees (
  id uuid primary key,
  name text,
  email text
);

create table public.loan_customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone_number text,
  email text,
  address text,
  date_of_birth date,
  created_by_employee_id uuid references public.employees(id),
  link_status text not null default 'New Entry',
  created_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  loan_customer_id uuid not null references public.loan_customers(id),
  employee_id uuid not null references public.employees(id),
  total_debt_amount numeric not null,
  current_balance numeric not null,
  term_months integer,
  next_due_date date,
  status public.loan_status_type not null default 'Active',
  created_at timestamptz not null default now()
);

create table public.loan_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.loan_transactions (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  transaction_type public.loan_transaction_type not null,
  amount numeric not null,
  payment_method_id uuid references public.loan_payment_methods(id),
  remark text,
  due_date date,
  transaction_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.loan_account_notes (
  id uuid primary key default gen_random_uuid(),
  loan_customer_id uuid not null references public.loan_customers(id),
  created_by uuid not null references public.employees(id),
  note text not null,
  created_at timestamptz default now()
);

create table public.loan_collections_log (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade
);

create table public.loan_package_links (
  id uuid primary key default gen_random_uuid(),
  loan_transaction_id uuid references public.loan_transactions(id) on delete cascade
);

create table public.daily_payment_splits (
  id uuid primary key default gen_random_uuid(),
  clearing_lms_transaction_id uuid references public.loan_transactions(id) on delete set null
);

create table public.deletion_logs (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  deleted_record_data jsonb not null,
  deleted_by uuid,
  auth_code_used text,
  created_at timestamptz not null default now()
);

create table public.backup_codes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  code_hash text not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
