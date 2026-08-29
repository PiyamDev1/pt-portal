-- Agent-specific Ticket Assistance scope for employee-owned Commission plans.
-- Existing components without assistanceScope continue to apply to every primary agent.

begin;

select pg_advisory_xact_lock(hashtextextended('pt-portal:commission-schema-migration', 0));

do $migration_guard$
declare
  installed_version bigint;
begin
  if to_regclass('public.portal_schema_versions') is null then
    raise exception 'Commission staff-profile capability 2026082904 is required first'
      using errcode = '55000';
  end if;

  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission';

  if installed_version is null or installed_version < 2026082904 then
    raise exception 'Commission staff-profile capability 2026082904 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026082905 then
    raise exception 'Refusing to replay Commission capability 2026082905 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

create or replace function public.commission_component_amount_2026082902(
  p_component_id uuid,
  p_variables jsonb,
  p_units integer,
  p_prior_units integer default 0
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  component public.commission_policy_components%rowtype;
  basis_value numeric;
  result_value numeric;
  assistance_scope jsonb;
  assistance_scope_mode text;
  primary_employee_id text;
begin
  select * into component
  from public.commission_policy_components where id = p_component_id;
  if not found or component.component_type = 'sales_profit_bonus' then
    raise exception 'Unsupported Commission component' using errcode = '22023';
  end if;

  if component.recipient_role = 'assistant' then
    assistance_scope := component.config -> 'assistanceScope';
    assistance_scope_mode := coalesce(assistance_scope ->> 'mode', 'all');

    if assistance_scope is not null
      and jsonb_typeof(assistance_scope) is distinct from 'object'
    then
      raise exception 'Ticket Assistance scope must be an object' using errcode = '22023';
    end if;
    if assistance_scope_mode not in ('all', 'specific_agents') then
      raise exception 'Unsupported Ticket Assistance scope mode: %', assistance_scope_mode
        using errcode = '22023';
    end if;

    if assistance_scope_mode = 'specific_agents' then
      if jsonb_typeof(assistance_scope -> 'employeeIds') is distinct from 'array'
        or jsonb_array_length(assistance_scope -> 'employeeIds') = 0
      then
        raise exception 'Specific-agent Ticket Assistance requires at least one primary agent'
          using errcode = '22023';
      end if;

      primary_employee_id := nullif(btrim(p_variables ->> 'primary_responsible_employee_id'), '');
      if primary_employee_id is null then
        raise exception 'Ticket Assistance source is missing its primary responsible employee'
          using errcode = '22023';
      end if;

      if not exists (
        select 1
        from jsonb_array_elements_text(assistance_scope -> 'employeeIds') allowed(employee_id)
        where lower(allowed.employee_id) = lower(primary_employee_id)
      ) then
        return 0;
      end if;
    end if;
  end if;

  if component.component_type = 'marginal_ticket_tier' then
    if p_units is null or p_units < 0 or coalesce(p_prior_units, 0) < 0 then
      raise exception 'Valid marginal units are required' using errcode = '22023';
    end if;
    select coalesce(round(sum(unit_rate), 2), 0) into result_value
    from (
      select (
        select tier.rate_gbp
        from public.commission_policy_tiers tier
        where tier.component_id = component.id and tier.min_unit <= unit_number
        order by tier.min_unit desc limit 1
      ) unit_rate
      from generate_series(
        coalesce(p_prior_units, 0) + 1,
        coalesce(p_prior_units, 0) + p_units
      ) unit_number
    ) rates;
    if p_units > 0 and result_value is null then
      raise exception 'Marginal Commission tiers do not cover the supplied units'
        using errcode = '22023';
    end if;
    return coalesce(result_value, 0);
  end if;

  if component.source_variable is not null then
    if not (p_variables ? component.source_variable)
      or jsonb_typeof(p_variables -> component.source_variable) not in ('number', 'string')
    then
      raise exception 'Required Commission source variable is missing: %',
        component.source_variable using errcode = '22023';
    end if;
    begin
      basis_value := (p_variables ->> component.source_variable)::numeric;
    exception when invalid_text_representation then
      raise exception 'Commission source variable is not numeric: %',
        component.source_variable using errcode = '22023';
    end;
  end if;

  return public.commission_calculate_component_2026082901(
    component.component_type,
    component.rate_value,
    basis_value,
    p_units,
    component.minimum_amount_gbp,
    component.maximum_amount_gbp
  );
end
$function$;

revoke all on function public.commission_component_amount_2026082902(
  uuid, jsonb, integer, integer
) from public, anon, authenticated;
grant execute on function public.commission_component_amount_2026082902(
  uuid, jsonb, integer, integer
) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026082905,
  clock_timestamp(),
  jsonb_build_object(
    'migration', '20260829_commission_staff_profiles_assistance_scope.sql',
    'mode', 'shadow',
    'capabilities', jsonb_build_array(
      'employee-owned-profile-snapshots',
      'one-time-profile-copy',
      'effective-dated-profile-replacement',
      'scheduled-profile-cancellation',
      'independent-service-policy-versions',
      'assistant-primary-agent-scope'
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
set row_security = off
as $function$
  select jsonb_build_object(
    'ready', coalesce(version >= 2026082904, false),
    'profileReady', coalesce(version >= 2026082905, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026082905,
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
