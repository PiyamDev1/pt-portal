-- Live Accounting branch/company ledger sheets.
-- Operational modules remain the source of truth; their results are read at runtime
-- and are never copied into these tables as editable accounting entries.

create or replace function public.accounting_can_manage_ledger_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.employees employee
    left join public.roles role on role.id = employee.role_id
    where employee.id = auth.uid()
      and employee.is_active
      and (
        regexp_replace(lower(btrim(coalesce(role.name, ''))), '[_-]+', ' ', 'g')
          in ('admin', 'master admin', 'super admin')
        or exists (
          select 1
          from public.employee_departments membership
          join public.departments department on department.id = membership.department_id
          where membership.employee_id = employee.id
            and regexp_replace(lower(btrim(department.name)), '[_-]+', ' ', 'g')
              in ('accounts', 'accounting')
        )
      )
  );
$$;

revoke all on function public.accounting_can_manage_ledger_v1() from public;
grant execute on function public.accounting_can_manage_ledger_v1() to authenticated, service_role;

create table public.accounting_ledger_sheets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('BRANCH', 'COMPANY')),
  location_id uuid references public.locations(id) on delete restrict,
  month_start date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'FINALISED')),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  finalised_at timestamptz,
  finalised_by_employee_id uuid references public.employees(id) on delete restrict,
  created_by_employee_id uuid not null references public.employees(id) on delete restrict,
  updated_by_employee_id uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint accounting_ledger_sheets_scope_location_check check (
    (scope = 'BRANCH' and location_id is not null)
    or (scope = 'COMPANY' and location_id is null)
  ),
  constraint accounting_ledger_sheets_month_check check (
    month_start = date_trunc('month', month_start)::date
  ),
  constraint accounting_ledger_sheets_payload_check check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 1048576
  ),
  constraint accounting_ledger_sheets_finalised_check check (
    (status = 'OPEN' and finalised_at is null and finalised_by_employee_id is null)
    or (status = 'FINALISED' and finalised_at is not null and finalised_by_employee_id is not null)
  )
);

create unique index accounting_ledger_sheets_branch_month_uidx
  on public.accounting_ledger_sheets(location_id, month_start)
  where scope = 'BRANCH';

create unique index accounting_ledger_sheets_company_month_uidx
  on public.accounting_ledger_sheets(month_start)
  where scope = 'COMPANY';

create index accounting_ledger_sheets_month_scope_idx
  on public.accounting_ledger_sheets(month_start desc, scope, location_id);

create table public.accounting_ledger_sheet_events (
  id bigint generated always as identity primary key,
  sheet_id uuid not null references public.accounting_ledger_sheets(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  month_start date not null,
  event_type text not null check (event_type in ('CREATED', 'SAVED', 'FINALISED')),
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  previous_revision bigint,
  next_revision bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint accounting_ledger_sheet_events_snapshot_check check (
    jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 1048576
  )
);

create index accounting_ledger_sheet_events_sheet_created_idx
  on public.accounting_ledger_sheet_events(sheet_id, created_at desc);

create index accounting_ledger_sheet_events_month_location_idx
  on public.accounting_ledger_sheet_events(month_start desc, location_id, created_at desc);

create or replace function public.accounting_touch_ledger_sheet_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.scope is distinct from old.scope
    or new.location_id is distinct from old.location_id
    or new.month_start is distinct from old.month_start
    or new.created_by_employee_id is distinct from old.created_by_employee_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Ledger sheet identity cannot be changed'
      using errcode = '42501', hint = 'ACCOUNTING_LEDGER_IDENTITY_LOCKED';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  if old.status = 'FINALISED' then
    raise exception 'Finalised ledger sheets cannot be changed'
      using errcode = '55000', hint = 'ACCOUNTING_LEDGER_FINALISED';
  end if;
  return new;
end;
$$;

revoke all on function public.accounting_touch_ledger_sheet_v1() from public;

create trigger accounting_ledger_sheets_touch
before update on public.accounting_ledger_sheets
for each row execute function public.accounting_touch_ledger_sheet_v1();

create or replace function public.accounting_audit_ledger_sheet_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.accounting_ledger_sheet_events (
    sheet_id,
    location_id,
    month_start,
    event_type,
    actor_employee_id,
    previous_revision,
    next_revision,
    snapshot
  )
  values (
    new.id,
    new.location_id,
    new.month_start,
    case
      when tg_op = 'INSERT' then 'CREATED'
      when old.status is distinct from new.status and new.status = 'FINALISED' then 'FINALISED'
      else 'SAVED'
    end,
    new.updated_by_employee_id,
    case when tg_op = 'INSERT' then null else old.revision end,
    new.revision,
    jsonb_build_object(
      'scope', new.scope,
      'status', new.status,
      'payload', new.payload,
      'finalisedAt', new.finalised_at
    )
  );
  return new;
end;
$$;

revoke all on function public.accounting_audit_ledger_sheet_v1() from public;

create trigger accounting_ledger_sheets_audit
after insert or update on public.accounting_ledger_sheets
for each row execute function public.accounting_audit_ledger_sheet_v1();

alter table public.accounting_ledger_sheets enable row level security;
alter table public.accounting_ledger_sheet_events enable row level security;

create policy accounting_ledger_sheets_select
on public.accounting_ledger_sheets
for select
to authenticated
using (public.accounting_can_manage_ledger_v1());

create policy accounting_ledger_sheets_insert
on public.accounting_ledger_sheets
for insert
to authenticated
with check (
  public.accounting_can_manage_ledger_v1()
  and created_by_employee_id = auth.uid()
  and updated_by_employee_id = auth.uid()
  and revision = 1
  and (status = 'OPEN' or finalised_by_employee_id = auth.uid())
);

create policy accounting_ledger_sheets_update
on public.accounting_ledger_sheets
for update
to authenticated
using (public.accounting_can_manage_ledger_v1())
with check (
  public.accounting_can_manage_ledger_v1()
  and updated_by_employee_id = auth.uid()
  and (status = 'OPEN' or finalised_by_employee_id = auth.uid())
);

create policy accounting_ledger_sheet_events_select
on public.accounting_ledger_sheet_events
for select
to authenticated
using (public.accounting_can_manage_ledger_v1());

revoke all on table public.accounting_ledger_sheets from anon, authenticated;
revoke all on table public.accounting_ledger_sheet_events from anon, authenticated;
grant select, insert, update on table public.accounting_ledger_sheets to authenticated;
grant select on table public.accounting_ledger_sheet_events to authenticated;
grant all on table public.accounting_ledger_sheets to service_role;
grant all on table public.accounting_ledger_sheet_events to service_role;
grant usage, select on sequence public.accounting_ledger_sheet_events_id_seq to service_role;

create or replace function public.accounting_ledger_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ready',
      to_regclass('public.accounting_ledger_sheets') is not null
      and to_regclass('public.accounting_ledger_sheet_events') is not null,
    'version', '2026092701'
  );
$$;

revoke all on function public.accounting_ledger_schema_status() from public;
grant execute on function public.accounting_ledger_schema_status() to authenticated, service_role;

comment on table public.accounting_ledger_sheets is
  'Revisioned monthly branch and company Accounting sheets. Module results are joined live and not copied here.';
comment on table public.accounting_ledger_sheet_events is
  'Immutable audit trail for Accounting ledger sheet creation, saves, and finalisation.';
