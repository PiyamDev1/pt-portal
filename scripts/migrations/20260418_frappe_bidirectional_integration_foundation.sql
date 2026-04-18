-- 20260418_frappe_bidirectional_integration_foundation.sql
-- Foundation tables for real bidirectional sync between PT Portal and Frappe HR.

-- -----------------------------
-- Shared timestamp helper
-- -----------------------------
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------
-- Integration identity map
-- -----------------------------
create table if not exists public.integration_identity_map (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  supabase_employee_id uuid not null references public.employees(id) on delete cascade,
  frappe_employee_id text,
  frappe_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_identity_map_domain_supabase_employee_uq
  on public.integration_identity_map(domain, supabase_employee_id);

create unique index if not exists integration_identity_map_domain_frappe_employee_uq
  on public.integration_identity_map(domain, frappe_employee_id)
  where frappe_employee_id is not null;

create index if not exists integration_identity_map_domain_idx
  on public.integration_identity_map(domain);

-- -----------------------------
-- Integration outbox
-- -----------------------------
create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  event_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  dedupe_key text not null,
  source_system text not null default 'pt_portal',
  status text not null default 'pending',
  attempts integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint integration_outbox_status_chk check (status in ('pending', 'processing', 'processed', 'failed', 'dead_letter'))
);

create unique index if not exists integration_outbox_dedupe_key_uq
  on public.integration_outbox(dedupe_key);

create index if not exists integration_outbox_status_next_retry_idx
  on public.integration_outbox(status, next_retry_at);

create index if not exists integration_outbox_domain_created_idx
  on public.integration_outbox(domain, created_at);

-- -----------------------------
-- Integration inbox
-- -----------------------------
create table if not exists public.integration_inbox (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  source_event_id text not null,
  payload jsonb not null,
  status text not null default 'pending',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint integration_inbox_status_chk check (status in ('pending', 'processed', 'failed', 'dead_letter'))
);

create unique index if not exists integration_inbox_source_event_uq
  on public.integration_inbox(source, source_event_id);

create index if not exists integration_inbox_status_received_idx
  on public.integration_inbox(status, received_at);

-- -----------------------------
-- Integration sync state
-- -----------------------------
create table if not exists public.integration_sync_state (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  last_pull_cursor text,
  last_pull_at timestamptz,
  last_push_at timestamptz,
  health_status text not null default 'unknown',
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_sync_state_health_chk check (health_status in ('unknown', 'healthy', 'degraded', 'failed'))
);

-- -----------------------------
-- Integration conflict registry
-- -----------------------------
create table if not exists public.integration_conflicts (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  entity_id text not null,
  supabase_snapshot jsonb not null,
  frappe_snapshot jsonb not null,
  resolution_strategy text,
  resolved_by uuid references public.employees(id),
  resolved_at timestamptz,
  notes text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_conflicts_status_chk check (status in ('open', 'resolved', 'ignored'))
);

create index if not exists integration_conflicts_domain_status_idx
  on public.integration_conflicts(domain, status);

-- -----------------------------
-- Minimal HR leave tables (if absent)
-- -----------------------------
create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  is_paid boolean not null default true,
  requires_approval boolean not null default true,
  include_holidays boolean not null default false,
  max_consecutive_days integer,
  default_annual_allocation numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_types_code_uq unique (code)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  from_date date not null,
  to_date date not null,
  half_day boolean not null default false,
  half_day_date date,
  requested_days numeric(8,2) not null,
  status text not null default 'pending',
  approver_id uuid references public.employees(id),
  approved_at timestamptz,
  rejection_reason text,
  override_by uuid references public.employees(id),
  override_reason text,
  source_system text not null default 'pt_portal',
  frappe_docname text,
  sync_version bigint not null default 1,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_status_chk check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index if not exists leave_requests_employee_status_idx
  on public.leave_requests(employee_id, status);

create index if not exists leave_requests_date_span_idx
  on public.leave_requests(from_date, to_date);

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  balance_year integer not null,
  allocated_days numeric(8,2) not null default 0,
  used_days numeric(8,2) not null default 0,
  pending_days numeric(8,2) not null default 0,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_balances_employee_leave_year_uq unique (employee_id, leave_type_id, balance_year)
);

-- -----------------------------
-- Triggers for updated_at
-- -----------------------------
drop trigger if exists trg_integration_identity_map_updated_at on public.integration_identity_map;
create trigger trg_integration_identity_map_updated_at
before update on public.integration_identity_map
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_integration_outbox_updated_at on public.integration_outbox;
create trigger trg_integration_outbox_updated_at
before update on public.integration_outbox
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_integration_inbox_updated_at on public.integration_inbox;
create trigger trg_integration_inbox_updated_at
before update on public.integration_inbox
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_integration_sync_state_updated_at on public.integration_sync_state;
create trigger trg_integration_sync_state_updated_at
before update on public.integration_sync_state
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_integration_conflicts_updated_at on public.integration_conflicts;
create trigger trg_integration_conflicts_updated_at
before update on public.integration_conflicts
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_leave_types_updated_at on public.leave_types;
create trigger trg_leave_types_updated_at
before update on public.leave_types
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
create trigger trg_leave_requests_updated_at
before update on public.leave_requests
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_leave_balances_updated_at on public.leave_balances;
create trigger trg_leave_balances_updated_at
before update on public.leave_balances
for each row execute function public.set_updated_at_timestamp();

-- -----------------------------
-- RLS baseline (safe default)
-- -----------------------------
alter table public.integration_identity_map enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.integration_inbox enable row level security;
alter table public.integration_sync_state enable row level security;
alter table public.integration_conflicts enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_balances enable row level security;

-- Service-role oriented policies for integration infrastructure.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_identity_map' and policyname = 'integration_identity_map_service_role_all'
  ) then
    create policy integration_identity_map_service_role_all on public.integration_identity_map
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_outbox' and policyname = 'integration_outbox_service_role_all'
  ) then
    create policy integration_outbox_service_role_all on public.integration_outbox
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_inbox' and policyname = 'integration_inbox_service_role_all'
  ) then
    create policy integration_inbox_service_role_all on public.integration_inbox
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_sync_state' and policyname = 'integration_sync_state_service_role_all'
  ) then
    create policy integration_sync_state_service_role_all on public.integration_sync_state
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_conflicts' and policyname = 'integration_conflicts_service_role_all'
  ) then
    create policy integration_conflicts_service_role_all on public.integration_conflicts
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'leave_types' and policyname = 'leave_types_service_role_all'
  ) then
    create policy leave_types_service_role_all on public.leave_types
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'leave_requests' and policyname = 'leave_requests_service_role_all'
  ) then
    create policy leave_requests_service_role_all on public.leave_requests
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'leave_balances' and policyname = 'leave_balances_service_role_all'
  ) then
    create policy leave_balances_service_role_all on public.leave_balances
      for all to service_role using (true) with check (true);
  end if;
end
$$;
