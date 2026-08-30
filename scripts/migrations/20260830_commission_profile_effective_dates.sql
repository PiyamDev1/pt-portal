-- Allow safe historical Commission effective dates while retaining one conflict-free timeline.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083001 then
    raise exception 'Commission capability 2026083001 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083002 then
    raise exception 'Refusing to replay Commission capability 2026083002 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

do $upgrade_profile_effective_date_validation$
declare
  signature constant regprocedure :=
    'public.commission_create_employee_profile_2026082904(uuid,uuid,text,date,uuid,uuid,jsonb,text,text)'::regprocedure;
  definition text;
  updated_definition text;
  old_fragment text := $old$  if p_effective_from < current_date
    and (
      exists (
        select 1 from public.employee_commission_profiles
        where employee_id = p_employee_id
          and location_id is not distinct from p_location_id
          and cancelled_at is null
      )
      or p_effective_from < date_trunc('month', current_date)::date
    )
  then
    raise exception 'A replacement cannot be backdated; an initial profile may start this month'
      using errcode = '22023', hint = 'COMMISSION_PROFILE_BACKDATE_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.employee_commission_profiles profile
    where profile.employee_id = p_employee_id
      and profile.location_id is not distinct from p_location_id
      and profile.cancelled_at is null
      and profile.effective_from >= p_effective_from
      and (profile.effective_to is null or profile.effective_to >= p_effective_from)
  ) then
    raise exception 'A current or scheduled profile already begins on or after this date'
      using errcode = '23P01', hint = 'COMMISSION_PROFILE_START_CONFLICT';
  end if;$old$;
  new_fragment text := $new$  if exists (
    select 1
    from public.employee_commission_profiles profile
    where profile.employee_id = p_employee_id
      and profile.location_id is not distinct from p_location_id
      and profile.cancelled_at is null
      and profile.effective_from >= p_effective_from
      and (profile.effective_to is null or profile.effective_to >= p_effective_from)
  ) then
    raise exception 'The effective date conflicts with a Commission plan that begins on or after it'
      using errcode = '23P01', hint = 'COMMISSION_PROFILE_START_CONFLICT';
  end if;

  if exists (
    select 1
    from public.employee_commission_profiles profile
    where profile.employee_id = p_employee_id
      and profile.location_id is not distinct from p_location_id
      and profile.cancelled_at is null
      and profile.effective_from < p_effective_from
      and profile.effective_to is not null
      and profile.effective_to >= p_effective_from
  ) then
    raise exception 'The effective date falls inside a completed Commission plan'
      using errcode = '23P01', hint = 'COMMISSION_PROFILE_HISTORICAL_CONFLICT';
  end if;

  if p_effective_from < current_date
    and exists (
      select 1
      from public.employee_commission_profiles profile
      join public.commission_rules rule on rule.profile_id = profile.id
      join public.commission_policy_versions version_row on version_row.rule_id = rule.id
      join public.commission_entries entry on entry.policy_version_id = version_row.id
      where profile.employee_id = p_employee_id
        and profile.location_id is not distinct from p_location_id
        and profile.cancelled_at is null
        and profile.effective_from < p_effective_from
        and profile.effective_to is null
        and entry.entry_mode = 'shadow'
        and entry.earning_on >= p_effective_from
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode
            and newer.supersedes_entry_id = entry.id
        )
    )
  then
    raise exception 'Calculated Commission results already exist on or after this effective date'
      using errcode = '23P01', hint = 'COMMISSION_PROFILE_CALCULATED_CONFLICT';
  end if;$new$;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position('COMMISSION_PROFILE_CALCULATED_CONFLICT' in definition) > 0 then
    return;
  end if;

  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission profile effective-date upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$upgrade_profile_effective_date_validation$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083002,
  clock_timestamp(),
  coalesce((
    select details from public.portal_schema_versions where component = 'commission'
  ), '{}'::jsonb) || jsonb_build_object(
    'migration', '20260830_commission_profile_effective_dates.sql',
    'mode', 'shadow',
    'capabilities', coalesce((
      select details -> 'capabilities'
      from public.portal_schema_versions
      where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array(
      'past-effective-dates-with-conflict-validation',
      'calculated-history-date-protection'
    )
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (
     public.portal_schema_versions.version = excluded.version
     and not coalesce(
       public.portal_schema_versions.details -> 'capabilities'
         ? 'past-effective-dates-with-conflict-validation',
       false
     )
   );

create or replace function public.commission_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
  select jsonb_build_object(
    'ready', coalesce(version >= 2026082904, false),
    'profileReady', coalesce(version >= 2026083002, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026083002,
    'mode', coalesce(details ->> 'mode', 'unavailable'),
    'appliedAt', applied_at,
    'details', coalesce(details, '{}'::jsonb)
  )
  from (
    select schema_version.version, schema_version.applied_at, schema_version.details
    from public.portal_schema_versions schema_version
    where schema_version.component = 'commission'
    union all
    select 0, null::timestamptz, '{}'::jsonb
    limit 1
  ) status_row
$function$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
