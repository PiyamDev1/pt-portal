-- Forward-only Ticketing capability 2026090202.
-- Grants Maintenance Admin audited team-ledger operations without archive/delete authority.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_2026090202_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026090201 then
    raise exception 'Ticketing capability 2026090201 is required before capability 2026090202'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026090202 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026090202, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_2026090202_guard$;

create or replace function public.ticketing_actor_can_maintain_2026090202(p_employee_id uuid)
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
    join public.roles role on role.id = employee.role_id
    where employee.id = p_employee_id
      and employee.is_active
      and regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g')
        in ('maintenance admin', 'admin', 'master admin', 'super admin')
  )
$$;

-- These mature security-definer routines are retained byte-for-byte except for
-- their explicit actor role predicates. Assertions make migration drift fail
-- closed instead of silently granting a broader permission.
do $ticketing_2026090202_upgrade$
declare
  definition text;
  upgraded text;
  candidate text;
begin
  if coalesce((
    select version from public.portal_schema_versions where component = 'ticketing'
  ), 0) >= 2026090202 then
    return;
  end if;

  definition := pg_get_functiondef(
    'public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)'::regprocedure
  );
  upgraded := replace(definition,
    $old$actor_is_admin := employee_lock_row.role_name in (
        'admin', 'master admin', 'super admin'
      );$old$,
    $new$actor_is_admin := employee_lock_row.role_name in (
        'maintenance admin', 'admin', 'master admin', 'super admin'
      );$new$
  );
  if upgraded = definition then
    raise exception 'Quick-entry administrator predicate has drifted' using errcode = '55000';
  end if;
  candidate := replace(upgraded,
    $old$actor_is_manager_or_admin := employee_lock_row.role_name in (
        'manager', 'admin', 'master admin', 'super admin'
      );$old$,
    $new$actor_is_manager_or_admin := employee_lock_row.role_name in (
        'manager', 'maintenance admin', 'admin', 'master admin', 'super admin'
      );$new$
  );
  if candidate = upgraded then
    raise exception 'Quick-entry oversight predicate has drifted' using errcode = '55000';
  end if;
  upgraded := candidate;
  execute upgraded;

  definition := pg_get_functiondef(
    'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
  );
  upgraded := replace(definition,
    $old$actor_role_name not in ('manager', 'admin', 'master admin', 'super admin')$old$,
    $new$actor_role_name not in ('manager', 'maintenance admin', 'admin', 'master admin', 'super admin')$new$
  );
  if upgraded = definition then
    raise exception 'Itinerary access predicate has drifted' using errcode = '55000';
  end if;
  candidate := replace(upgraded,
    $old$actor_role_name not in ('admin', 'master admin', 'super admin')$old$,
    $new$actor_role_name not in ('maintenance admin', 'admin', 'master admin', 'super admin')$new$
  );
  if candidate = upgraded then
    raise exception 'Itinerary on-behalf predicate has drifted' using errcode = '55000';
  end if;
  upgraded := candidate;
  execute upgraded;

  definition := pg_get_functiondef(
    'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure
  );
  upgraded := replace(definition,
    $old$actor_role_name not in ('manager', 'admin', 'master admin', 'super admin')$old$,
    $new$actor_role_name not in ('manager', 'maintenance admin', 'admin', 'master admin', 'super admin')$new$
  );
  if upgraded = definition then
    raise exception 'Completion access predicate has drifted' using errcode = '55000';
  end if;
  candidate := replace(upgraded,
    $old$actor_role_name not in ('admin', 'master admin', 'super admin')$old$,
    $new$actor_role_name not in ('maintenance admin', 'admin', 'master admin', 'super admin')$new$
  );
  if candidate = upgraded then
    raise exception 'Completion on-behalf predicate has drifted' using errcode = '55000';
  end if;
  upgraded := candidate;
  execute upgraded;

  definition := pg_get_functiondef(
    'public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb)'::regprocedure
  );
  upgraded := replace(definition,
    $old$actor_is_admin := employee_lock_row.role_name in (
        'admin', 'master admin', 'super admin'
      );$old$,
    $new$actor_is_admin := employee_lock_row.role_name in (
        'maintenance admin', 'admin', 'master admin', 'super admin'
      );$new$
  );
  if upgraded = definition then
    raise exception 'Staff-correction authorization definition has drifted'
      using errcode = '55000';
  end if;
  execute upgraded;

  definition := pg_get_functiondef(
    'public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)'::regprocedure
  );
  upgraded := replace(definition,
    'if not public.ticketing_actor_is_admin_2026082802(p_actor_employee_id) then',
    'if not public.ticketing_actor_can_maintain_2026090202(p_actor_employee_id) then'
  );
  if upgraded = definition then
    raise exception 'Sale-correction authorization definition has drifted'
      using errcode = '55000';
  end if;
  execute upgraded;
end
$ticketing_2026090202_upgrade$;

revoke all on function public.ticketing_actor_can_maintain_2026090202(uuid)
  from public, anon, authenticated, service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026090202,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260902_ticketing_maintenance_admin_operations.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array('maintenance-admin-ticketing-operations')
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
