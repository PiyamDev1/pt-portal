-- Commission capability 2026082903
-- Derives human access from active HR department membership and records scheduled
-- processing as a system action instead of impersonating an employee.

begin;

do $hr_department$
begin
  if not exists (
    select 1
    from public.departments department
    where regexp_replace(lower(btrim(department.name)), '[^a-z0-9]+', '', 'g')
      in ('hr', 'humanresource', 'humanresources')
  ) then
    insert into public.departments (name) values ('HR');
  end if;
end
$hr_department$;

create or replace function public.commission_guard_hr_membership_2026082903()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $$
declare
  affected_department_id uuid;
  jwt_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  actor_id uuid;
begin
  affected_department_id := case when tg_op = 'DELETE' then old.department_id
    else new.department_id end;
  if not exists (
    select 1
    from public.departments department
    where department.id = affected_department_id
      and regexp_replace(lower(btrim(department.name)), '[^a-z0-9]+', '', 'g')
        in ('hr', 'humanresource', 'humanresources')
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if jwt_role is null or jwt_role = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if jwt_role <> 'authenticated' then
    raise exception 'Master Admin access is required to change HR department membership'
      using errcode = '42501';
  end if;

  actor_id := auth.uid();
  if not exists (
    select 1
    from public.employees employee
    join public.roles role_row on role_row.id = employee.role_id
    where employee.id = actor_id
      and employee.is_active
      and role_row.name in ('Master Admin', 'Super Admin')
  ) then
    raise exception 'Master Admin access is required to change HR department membership'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists employee_departments_hr_membership_guard
  on public.employee_departments;
create trigger employee_departments_hr_membership_guard
before insert or update or delete on public.employee_departments
for each row execute function public.commission_guard_hr_membership_2026082903();

create or replace function public.commission_actor_can_manage_2026082901(
  p_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.employees employee
    left join public.roles role_row on role_row.id = employee.role_id
    where employee.id = p_employee_id
      and employee.is_active
      and (
        role_row.name in ('Admin', 'Master Admin', 'Super Admin')
        or exists (
          select 1
          from public.employee_departments membership
          join public.departments department on department.id = membership.department_id
          where membership.employee_id = employee.id
            and regexp_replace(lower(btrim(department.name)), '[^a-z0-9]+', '', 'g')
              in ('hr', 'humanresource', 'humanresources')
        )
      )
  )
$$;

comment on function public.commission_actor_can_manage_2026082901(uuid) is
  'Allows active Admin roles or active employees assigned to the HR department in Staff Management.';

alter table public.commission_audit_events
  alter column actor_employee_id drop not null,
  add column if not exists actor_type text not null default 'employee';

update public.commission_audit_events
set actor_type = case when actor_employee_id is null then 'system' else 'employee' end
where actor_type is distinct from
  case when actor_employee_id is null then 'system' else 'employee' end;

alter table public.commission_audit_events
  drop constraint if exists commission_audit_events_actor_check;
alter table public.commission_audit_events
  add constraint commission_audit_events_actor_check check (
    (actor_type = 'employee' and actor_employee_id is not null)
    or (actor_type = 'system' and actor_employee_id is null)
  );

create or replace function public.commission_set_audit_actor_2026082903()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.actor_type := case when new.actor_employee_id is null then 'system' else 'employee' end;
  return new;
end
$$;

drop trigger if exists commission_audit_events_actor_trigger
  on public.commission_audit_events;
create trigger commission_audit_events_actor_trigger
before insert on public.commission_audit_events
for each row execute function public.commission_set_audit_actor_2026082903();

create unique index if not exists commission_audit_events_system_request_unique_idx
  on public.commission_audit_events (action, request_key)
  where actor_employee_id is null and request_key is not null;

alter table public.commission_exceptions
  drop constraint if exists commission_exceptions_resolution_check;
alter table public.commission_exceptions
  add constraint commission_exceptions_resolution_check check (
    (status = 'open' and resolved_by is null and resolved_at is null)
    or (status <> 'open' and resolved_at is not null)
  );

comment on column public.commission_exceptions.resolved_by is
  'Employee resolver; NULL with resolved_at set means the scheduled system processor resolved it.';

do $system_processor$
declare
  process_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure
  ) into process_definition;

  if strpos(
    process_definition,
    'if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then'
  ) > 0 then
    if strpos(
      process_definition,
      '''commission-process:'' || p_actor_employee_id::text || '':'' || p_request_key'
    ) = 0 or strpos(
      process_definition,
      'where actor_employee_id = p_actor_employee_id and action = ''shadow.processed'''
    ) = 0 then
      raise exception 'Commission processor system-attribution contract was not found';
    end if;

    updated_definition := replace(
      process_definition,
      'if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then',
      'if p_actor_employee_id is not null
    and not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then'
    );
    updated_definition := replace(
      updated_definition,
      '''commission-process:'' || p_actor_employee_id::text || '':'' || p_request_key',
      '''commission-process:'' || coalesce(p_actor_employee_id::text, ''system'') || '':'' || p_request_key'
    );
    updated_definition := replace(
      updated_definition,
      'where actor_employee_id = p_actor_employee_id and action = ''shadow.processed''',
      'where actor_employee_id is not distinct from p_actor_employee_id
    and action = ''shadow.processed'''
    );
    execute updated_definition;
  elsif strpos(process_definition, 'if p_actor_employee_id is not null') = 0
    or strpos(process_definition, 'coalesce(p_actor_employee_id::text, ''system'')') = 0
    or strpos(
      process_definition,
      'actor_employee_id is not distinct from p_actor_employee_id'
    ) = 0
  then
    raise exception 'Commission processor authorization contract was not found';
  end if;
end
$system_processor$;

comment on function public.commission_process_shadow_2026082902(uuid,integer,text) is
  'Runs shadow processing. A NULL actor is reserved for the service-role scheduled system worker.';

create or replace function public.commission_grant_access_2026082901(
  p_actor_employee_id uuid,
  p_employee_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  raise exception 'Commission access is managed through HR department membership in Staff Management'
    using errcode = '55000', hint = 'COMMISSION_ACCESS_USES_HR_DEPARTMENT';
end
$$;

create or replace function public.commission_revoke_access_2026082901(
  p_actor_employee_id uuid,
  p_grant_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  raise exception 'Commission access is managed through HR department membership in Staff Management'
    using errcode = '55000', hint = 'COMMISSION_ACCESS_USES_HR_DEPARTMENT';
end
$$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission', 2026082903, now(),
  jsonb_build_object(
    'migration', '20260829_commission_hr_department_access.sql',
    'mode', 'shadow',
    'capabilities', jsonb_build_array(
      'hr-department-policy-access',
      'staff-management-access-source',
      'system-scheduled-processing-audit',
      'no-commission-cron-employee-environment-variable'
    )
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.commission_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready', coalesce(schema_version.version >= 2026082903, false)
      and to_regprocedure(
        'public.commission_process_shadow_2026082902(uuid,integer,text)'
      ) is not null
      and exists (
        select 1
        from information_schema.columns column_row
        where column_row.table_schema = 'public'
          and column_row.table_name = 'commission_audit_events'
          and column_row.column_name = 'actor_type'
      ),
    'version', schema_version.version,
    'requiredVersion', 2026082903,
    'mode', 'shadow',
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'commission'
$$;

revoke all on function
  public.commission_set_audit_actor_2026082903(),
  public.commission_guard_hr_membership_2026082903()
  from public, anon, authenticated, service_role;
revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
