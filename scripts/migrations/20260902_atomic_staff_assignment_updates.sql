-- Atomically update an employee profile and its canonical department memberships.
-- The HTTP route performs actor/target authorization before invoking this
-- service-role-only function.

begin;

create table if not exists public.staff_admin_approval_requests (
  id uuid primary key default gen_random_uuid(),
  target_employee_id uuid not null references public.employees(id) on delete restrict,
  requested_by uuid not null references public.employees(id) on delete restrict,
  expected_full_name text not null,
  expected_role_id uuid references public.roles(id) on delete restrict,
  expected_department_ids uuid[] not null,
  expected_location_id uuid references public.locations(id) on delete restrict,
  expected_manager_id uuid references public.employees(id) on delete restrict,
  proposed_full_name text not null,
  proposed_role_id uuid not null references public.roles(id) on delete restrict,
  proposed_department_ids uuid[] not null,
  proposed_location_id uuid references public.locations(id) on delete restrict,
  proposed_manager_id uuid references public.employees(id) on delete restrict,
  request_reason text not null,
  status text not null default 'pending',
  reviewed_by uuid references public.employees(id) on delete restrict,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint staff_admin_approval_name_check
    check (
      length(btrim(expected_full_name)) between 1 and 200
      and length(btrim(proposed_full_name)) between 1 and 200
    ),
  constraint staff_admin_approval_departments_check
    check (
      cardinality(expected_department_ids) between 0 and 50
      and cardinality(proposed_department_ids) between 1 and 50
    ),
  constraint staff_admin_approval_request_reason_check
    check (length(btrim(request_reason)) between 10 and 1000),
  constraint staff_admin_approval_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint staff_admin_approval_review_check
    check (
      (status = 'pending' and reviewed_by is null and reviewed_at is null and review_reason is null)
      or (
        status <> 'pending'
        and reviewed_by is not null
        and reviewed_at is not null
        and length(btrim(review_reason)) between 3 and 1000
      )
    ),
  constraint staff_admin_approval_manager_check
    check (proposed_manager_id is null or proposed_manager_id <> target_employee_id)
);

create unique index if not exists staff_admin_approval_one_pending_idx
  on public.staff_admin_approval_requests (requested_by, target_employee_id)
  where status = 'pending';

create index if not exists staff_admin_approval_pending_created_idx
  on public.staff_admin_approval_requests (created_at)
  where status = 'pending';

alter table public.staff_admin_approval_requests enable row level security;

drop policy if exists staff_admin_approval_service_role_all
  on public.staff_admin_approval_requests;
create policy staff_admin_approval_service_role_all
  on public.staff_admin_approval_requests
  for all to service_role
  using (true)
  with check (true);

comment on table public.staff_admin_approval_requests is
  'Maintenance Admin proposals for staff profile, access, and hierarchy changes. Admin review executes approved proposals atomically.';

create or replace function public.admin_update_employee_assignments_20260902(
  p_employee_id uuid,
  p_full_name text,
  p_role_id uuid,
  p_department_ids uuid[],
  p_location_id uuid,
  p_manager_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $$
declare
  manager_cursor uuid := p_manager_id;
  visited_managers uuid[] := array[]::uuid[];
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' then
    raise exception 'Service role access is required'
      using errcode = '42501';
  end if;

  if coalesce(cardinality(p_department_ids), 0) = 0 then
    raise exception 'At least one department is required'
      using errcode = '22023';
  end if;

  if p_manager_id = p_employee_id then
    raise exception 'An employee cannot manage themselves'
      using errcode = '22023';
  end if;

  while manager_cursor is not null loop
    if manager_cursor = p_employee_id then
      raise exception 'The proposed manager would create a reporting cycle'
        using errcode = '22023';
    end if;
    exit when manager_cursor = any(visited_managers);
    visited_managers := array_append(visited_managers, manager_cursor);
    select employee.manager_id into manager_cursor
    from public.employees employee
    where employee.id = manager_cursor;
    if not found then
      raise exception 'Manager not found'
        using errcode = 'P0002';
    end if;
  end loop;

  update public.employees
  set full_name = p_full_name,
      role_id = p_role_id,
      department_id = p_department_ids[1],
      location_id = p_location_id,
      manager_id = p_manager_id
  where id = p_employee_id;

  if not found then
    raise exception 'Employee not found'
      using errcode = 'P0002';
  end if;

  delete from public.employee_departments membership
  where membership.employee_id = p_employee_id
    and not (membership.department_id = any(p_department_ids));

  insert into public.employee_departments (employee_id, department_id)
  select p_employee_id, department_id
  from unnest(p_department_ids) as department_id
  on conflict (employee_id, department_id) do nothing;
end
$$;

revoke all on function public.admin_update_employee_assignments_20260902(
  uuid,
  text,
  uuid,
  uuid[],
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.admin_update_employee_assignments_20260902(
  uuid,
  text,
  uuid,
  uuid[],
  uuid,
  uuid
) to service_role;

comment on function public.admin_update_employee_assignments_20260902(
  uuid,
  text,
  uuid,
  uuid[],
  uuid,
  uuid
) is
  'Service-role-only atomic employee profile and canonical department membership update.';

create or replace function public.admin_review_staff_approval_20260902(
  p_actor_employee_id uuid,
  p_request_id uuid,
  p_decision text,
  p_review_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $$
declare
  request_row public.staff_admin_approval_requests%rowtype;
  actor_role text;
  current_role text;
  proposed_role text;
  is_privileged_actor boolean;
  changes_hr_membership boolean;
  current_full_name text;
  current_role_id uuid;
  current_location_id uuid;
  current_manager_id uuid;
  current_department_ids uuid[];
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' then
    raise exception 'Service role access is required'
      using errcode = '42501';
  end if;

  select lower(btrim(role_row.name)) into actor_role
  from public.employees employee
  join public.roles role_row on role_row.id = employee.role_id
  where employee.id = p_actor_employee_id
    and employee.is_active;

  if actor_role not in ('admin', 'master admin', 'super admin') then
    raise exception 'Admin access is required to review staff changes'
      using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_review_reason, ''))) not between 3 and 1000 then
    raise exception 'A review note of at least 3 characters is required'
      using errcode = '22023';
  end if;

  select request.* into request_row
  from public.staff_admin_approval_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found'
      using errcode = 'P0002';
  end if;
  if request_row.status <> 'pending' then
    return jsonb_build_object(
      'requestId', request_row.id,
      'status', request_row.status,
      'idempotentReplay', true
    );
  end if;

  if p_decision = 'approved' then
    select
      employee.full_name,
      employee.role_id,
      employee.location_id,
      employee.manager_id,
      lower(btrim(role_row.name))
    into
      current_full_name,
      current_role_id,
      current_location_id,
      current_manager_id,
      current_role
    from public.employees employee
    join public.roles role_row on role_row.id = employee.role_id
    where employee.id = request_row.target_employee_id;

    select coalesce(array_agg(membership.department_id order by membership.department_id), array[]::uuid[])
    into current_department_ids
    from public.employee_departments membership
    where membership.employee_id = request_row.target_employee_id;

    if current_full_name is distinct from request_row.expected_full_name
      or current_role_id is distinct from request_row.expected_role_id
      or current_location_id is distinct from request_row.expected_location_id
      or current_manager_id is distinct from request_row.expected_manager_id
      or current_department_ids is distinct from (
        select coalesce(array_agg(department_id order by department_id), array[]::uuid[])
        from unnest(request_row.expected_department_ids) as department_id
      )
    then
      raise exception 'The employee changed after this request was submitted; create a fresh request'
        using errcode = '40001';
    end if;

    select lower(btrim(role_row.name)) into proposed_role
    from public.roles role_row
    where role_row.id = request_row.proposed_role_id;

    is_privileged_actor := actor_role in ('master admin', 'super admin');
    if not is_privileged_actor and (
      current_role in ('master admin', 'super admin')
      or proposed_role in ('master admin', 'super admin')
    ) then
      raise exception 'Master or Super Admin review is required for this account or role'
        using errcode = '42501';
    end if;

    select exists (
      select 1
      from public.departments department
      where regexp_replace(lower(btrim(department.name)), '[^a-z0-9]+', '', 'g')
        in ('hr', 'humanresource', 'humanresources')
        and (
          department.id = any(request_row.proposed_department_ids)
          or exists (
            select 1
            from public.employee_departments membership
            where membership.employee_id = request_row.target_employee_id
              and membership.department_id = department.id
          )
        )
        and (
          (department.id = any(request_row.proposed_department_ids)) is distinct from exists (
            select 1
            from public.employee_departments membership
            where membership.employee_id = request_row.target_employee_id
              and membership.department_id = department.id
          )
        )
    ) into changes_hr_membership;

    if changes_hr_membership and not is_privileged_actor then
      raise exception 'Master or Super Admin review is required for HR membership'
        using errcode = '42501';
    end if;

    perform public.admin_update_employee_assignments_20260902(
      request_row.target_employee_id,
      request_row.proposed_full_name,
      request_row.proposed_role_id,
      request_row.proposed_department_ids,
      request_row.proposed_location_id,
      request_row.proposed_manager_id
    );
  end if;

  update public.staff_admin_approval_requests
  set status = p_decision,
      reviewed_by = p_actor_employee_id,
      review_reason = btrim(p_review_reason),
      reviewed_at = clock_timestamp()
  where id = request_row.id;

  return jsonb_build_object(
    'requestId', request_row.id,
    'status', p_decision,
    'idempotentReplay', false
  );
end
$$;

revoke all on function public.admin_review_staff_approval_20260902(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.admin_review_staff_approval_20260902(
  uuid,
  uuid,
  text,
  text
) to service_role;

comment on function public.admin_review_staff_approval_20260902(uuid, uuid, text, text) is
  'Service-role-only Admin review that atomically applies approved staff proposals and records reviewer evidence.';

commit;
