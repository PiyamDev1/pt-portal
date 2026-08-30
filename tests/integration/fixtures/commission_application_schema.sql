-- Compact Application schema used by the Commission completion-source tests.

create table if not exists public.nadra_services (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  application_date timestamptz not null default now(),
  status text not null default 'Pending Submission',
  is_refunded boolean not null default false,
  refunded_at timestamptz,
  service_type text not null default 'NICOP',
  tracking_number text
);

create table if not exists public.nadra_status_history (
  id uuid primary key default gen_random_uuid(),
  nadra_service_id uuid references public.nadra_services(id) on delete cascade,
  new_status text,
  changed_at timestamptz default now()
);

create table if not exists public.pakistani_passport_applications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  application_date timestamptz not null default now(),
  status text not null default 'Pending Submission',
  is_refunded boolean not null default false,
  refunded_at timestamptz,
  application_type text not null default 'Renewal',
  category text not null default 'Ordinary',
  speed text not null default 'Normal',
  page_count text,
  tracking_number text
);

create table if not exists public.pakistani_passport_status_history (
  id uuid primary key default gen_random_uuid(),
  passport_application_id uuid
    references public.pakistani_passport_applications(id) on delete cascade,
  new_status text,
  changed_at timestamptz default now()
);

create table if not exists public.british_passport_applications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  application_date timestamptz not null default now(),
  status text not null default 'Pending Submission',
  age_group text not null default 'Adult',
  pages text not null default 'Standard',
  service_type text not null default 'Normal',
  pex_number text
);

create table if not exists public.british_passport_status_history (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid references public.british_passport_applications(id) on delete cascade,
  new_status text,
  changed_at timestamptz default now()
);

create table if not exists public.visa_applications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  application_date timestamptz not null default now(),
  status text not null default 'Pending Submission',
  visa_country_id uuid not null default gen_random_uuid(),
  visa_type_id uuid not null default gen_random_uuid(),
  validity text,
  is_part_of_package boolean not null default false,
  package_id uuid,
  internal_tracking_number text not null default 'VISA-TEST'
);

create table if not exists public.visa_status_history (
  id uuid primary key default gen_random_uuid(),
  visa_application_id uuid not null references public.visa_applications(id) on delete cascade,
  new_status text not null,
  changed_at timestamptz default now()
);
