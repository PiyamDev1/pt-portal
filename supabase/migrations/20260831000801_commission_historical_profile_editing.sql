-- Commission capability 2026083008.
-- Allows an administrator to correct a closed employee plan without changing
-- its dates or disturbing the plans immediately before and after it.

begin;
select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));
do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083007 then
    raise exception 'Commission capability 2026083007 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083008 then
    raise exception 'Refusing to replay Commission capability 2026083008 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;
do $historical_edit_prerequisites$
begin
  if to_regprocedure(
      'public.commission_replace_employee_profile_2026083006(uuid,uuid,text,date,uuid,jsonb,text,text)'
    ) is null
    or to_regprocedure(
      'public.commission_create_policy_2026082901(uuid,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.commission_create_policy_version_2026082901(uuid,uuid,jsonb,text)'
    ) is null
    or to_regprocedure(
      'public.commission_activate_policy_version_2026082901(uuid,uuid,uuid,text)'
    ) is null
    or to_regprocedure(
      'public.commission_create_assignment_2026082901(uuid,uuid,uuid,text,text,text,uuid,date,date,text)'
    ) is null
    or to_regprocedure(
      'public.commission_record_exception_2026082902(uuid,uuid,uuid,text,jsonb)'
    ) is null
  then
    raise exception 'Commission profile editing prerequisites are not installed'
      using errcode = '55000';
  end if;
end
$historical_edit_prerequisites$;
-- PKR calculation support was added to the processor before the exception
-- whitelist was expanded on some databases. Without this repair, a legitimate
-- missing-rate result rolls the whole batch back and leaves a stale needs_policy
-- exception visible.
alter table public.commission_exceptions
  drop constraint if exists commission_exceptions_code_check;
alter table public.commission_exceptions
  add constraint commission_exceptions_code_check check (exception_code in (
    'needs_policy', 'ambiguous_assignment', 'unsupported_contract_version',
    'missing_required_variable', 'missing_exchange_rate', 'inactive_recipient',
    'invalid_source_lineage', 'unresolved_package_scope',
    'package_source_not_authoritative', 'bonus_period_incomplete',
    'calculation_failed'
  ));
-- One source event can have only one current blocker. When recalculation
-- discovers a different blocker (for example, a valid redirected policy whose
-- PKR month lacks a book rate), retire the obsolete warning before recording
-- the new one.
create or replace function public.commission_record_exception_2026082902(
  p_run_id uuid,
  p_source_event_id uuid,
  p_employee_id uuid,
  p_exception_code text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare resolver_employee_id uuid;
begin
  select run.triggered_by into resolver_employee_id
  from public.commission_calculation_runs run
  where run.id = p_run_id;
  resolver_employee_id := coalesce(resolver_employee_id, p_employee_id);

  update public.commission_exceptions exception
  set status = 'resolved',
      resolved_by = resolver_employee_id,
      resolved_at = clock_timestamp(),
      resolution_note = left(
        'Superseded by current exception: ' || p_exception_code,
        500
      )
  where exception.source_event_id = p_source_event_id
    and exception.status = 'open'
    and exception.exception_code <> p_exception_code;

  insert into public.commission_exceptions (
    run_id, source_event_id, employee_id, exception_code, details
  ) values (
    p_run_id, p_source_event_id, p_employee_id, p_exception_code,
    coalesce(p_details, '{}'::jsonb)
  )
  on conflict (source_event_id, exception_code)
    where status = 'open' and source_event_id is not null
  do update set
    run_id = excluded.run_id,
    employee_id = excluded.employee_id,
    details = excluded.details;
end
$function$;
-- Repair rows produced before the invariant above was installed. The newest
-- open exception remains actionable; older blockers become resolved evidence.
update public.commission_exceptions older
set status = 'resolved',
    resolved_by = coalesce((
      select run.triggered_by
      from public.commission_calculation_runs run
      where run.id = newer.run_id
    ), older.employee_id),
    resolved_at = clock_timestamp(),
    resolution_note = left(
      'Superseded by current exception: ' || newer.exception_code,
      500
    )
from (
  select distinct on (exception.source_event_id)
    exception.id,
    exception.source_event_id,
    exception.run_id,
    exception.exception_code,
    exception.created_at
  from public.commission_exceptions exception
  where exception.status = 'open' and exception.source_event_id is not null
  order by exception.source_event_id, exception.created_at desc, exception.id desc
) newer
where older.source_event_id = newer.source_event_id
  and older.status = 'open'
  and older.id <> newer.id
  and (
    newer.created_at > older.created_at
    or (newer.created_at = older.created_at and newer.id > older.id)
  );
create or replace function public.commission_replace_employee_profile_2026083008(
  p_actor_employee_id uuid,
  p_profile_id uuid,
  p_label text,
  p_effective_from date,
  p_location_id uuid,
  p_configuration jsonb,
  p_change_reason text,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  profile_row public.employee_commission_profiles%rowtype;
  replacement_profile_id uuid := gen_random_uuid();
  employee_name text;
  service jsonb;
  policy_result jsonb;
  version_result jsonb;
  assignment_result jsonb;
  result_json jsonb;
  assignments_json jsonb := '[]'::jsonb;
  service_index integer := 0;
  service_code_value text;
  source_module_value text;
  recipient_role_value text;
  service_request_key text;
  rule_name_value text;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_profile_id is null
    or p_effective_from is null
    or length(btrim(coalesce(p_label, ''))) not between 2 and 100
    or length(btrim(coalesce(p_change_reason, ''))) not between 8 and 500
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 120
    or jsonb_typeof(p_configuration) is distinct from 'object'
    or jsonb_typeof(p_configuration -> 'services') is distinct from 'array'
    or jsonb_array_length(p_configuration -> 'services') not between 1 and 16
  then
    raise exception 'Invalid Commission profile replacement request'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile-replace:' || p_actor_employee_id::text || ':' || p_request_key,
    0
  ));
  select audit.after_state into result_json
  from public.commission_audit_events audit
  where audit.actor_employee_id = p_actor_employee_id
    and audit.action in ('employee_profile.replaced', 'employee_profile.historical_replaced')
    and audit.request_key = p_request_key
  order by audit.created_at desc
  limit 1;
  if result_json is not null then
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into profile_row
  from public.employee_commission_profiles
  where id = p_profile_id and cancelled_at is null;
  if not found then
    raise exception 'Active Commission profile was not found' using errcode = 'P0002';
  end if;

  -- Current and future plans retain the existing replacement path. The special
  -- bounded path below is only for a plan whose complete range is in the past.
  if profile_row.effective_to is null or profile_row.effective_to >= current_date then
    return public.commission_replace_employee_profile_2026083006(
      p_actor_employee_id,
      p_profile_id,
      p_label,
      p_effective_from,
      p_location_id,
      p_configuration,
      p_change_reason,
      p_request_key
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile:' || profile_row.employee_id::text || ':'
      || coalesce(profile_row.location_id::text, 'all'),
    0
  ));
  select * into profile_row
  from public.employee_commission_profiles
  where id = p_profile_id and cancelled_at is null
  for update;
  if not found then
    raise exception 'Active Commission profile was not found' using errcode = 'P0002';
  end if;
  if profile_row.effective_to is null or profile_row.effective_to >= current_date then
    raise exception 'The selected plan is no longer a closed previous plan'
      using errcode = '55000', hint = 'COMMISSION_PROFILE_TIMELINE_CHANGED';
  end if;
  if p_effective_from is distinct from profile_row.effective_from then
    raise exception 'A previous plan keeps its original effective date'
      using errcode = '22023', hint = 'COMMISSION_HISTORICAL_DATES_IMMUTABLE';
  end if;
  if p_location_id is distinct from profile_row.location_id then
    raise exception 'A previous plan keeps its original branch scope'
      using errcode = '22023', hint = 'COMMISSION_HISTORICAL_SCOPE_IMMUTABLE';
  end if;
  begin
    if nullif(p_configuration #>> '{draft,employeeId}', '') is not null
      and (p_configuration #>> '{draft,employeeId}')::uuid is distinct from profile_row.employee_id
    then
      raise exception 'The edited Commission plan belongs to a different employee'
        using errcode = '22023', hint = 'COMMISSION_PROFILE_EMPLOYEE_MISMATCH';
    end if;
  exception when invalid_text_representation then
    raise exception 'The edited Commission plan contains an invalid employee'
      using errcode = '22023', hint = 'COMMISSION_PROFILE_EMPLOYEE_MISMATCH';
  end;
  if exists (
    select 1
    from public.employee_commission_profiles other_profile
    where other_profile.employee_id = profile_row.employee_id
      and other_profile.location_id is not distinct from profile_row.location_id
      and other_profile.cancelled_at is null
      and other_profile.id <> profile_row.id
      and other_profile.effective_from <= profile_row.effective_to
      and (other_profile.effective_to is null
        or other_profile.effective_to >= profile_row.effective_from)
  ) then
    raise exception 'The previous plan now overlaps another active plan'
      using errcode = '23P01', hint = 'COMMISSION_PROFILE_TIMELINE_CHANGED';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_configuration -> 'services') item
  ) <> (
    select count(distinct lower(btrim(item ->> 'serviceCode')))
    from jsonb_array_elements(p_configuration -> 'services') item
  ) then
    raise exception 'A Commission profile cannot repeat a service'
      using errcode = '22023';
  end if;

  select full_name into employee_name
  from public.employees
  where id = profile_row.employee_id and is_active;
  if employee_name is null then
    raise exception 'Active employee was not found' using errcode = 'P0002';
  end if;

  -- Validate the complete service graph before archiving the old snapshot.
  for service in select value from jsonb_array_elements(p_configuration -> 'services')
  loop
    service_index := service_index + 1;
    service_code_value := lower(btrim(service ->> 'serviceCode'));
    source_module_value := lower(btrim(service ->> 'sourceModule'));
    recipient_role_value := lower(btrim(service ->> 'recipientRole'));
    if service_code_value not in (
        'tk_primary', 'tk_assistance', 'dc', 'r_er', 'low_fare', 'higher_fare',
        'package_sale', 'application_nadra', 'application_nadra_urgent',
        'application_passport_pk', 'application_passport_pk_urgent',
        'application_passport_gb', 'application_visa', 'sales_bonus'
      )
      or jsonb_typeof(service -> 'components') is distinct from 'array'
      or jsonb_array_length(service -> 'components') < 1
      or (service_code_value = 'package_sale'
        and (source_module_value <> 'packages' or recipient_role_value <> 'package_sales'))
      or (service_code_value like 'application_%'
        and (source_module_value <> 'applications' or recipient_role_value <> 'application_agent'))
      or (service_code_value = 'tk_primary'
        and (source_module_value <> 'ticketing' or recipient_role_value <> 'primary'))
      or (service_code_value = 'tk_assistance'
        and (source_module_value <> 'ticketing' or recipient_role_value <> 'assistant'))
      or (service_code_value in ('dc', 'r_er')
        and (source_module_value <> 'ticketing' or recipient_role_value <> 'primary'))
      or (service_code_value in ('low_fare', 'higher_fare')
        and (source_module_value <> 'ticketing' or recipient_role_value <> 'low_fare_actor'))
      or (service_code_value = 'sales_bonus'
        and (source_module_value <> 'ticketing' or recipient_role_value <> 'sales_bonus'))
    then
      raise exception 'Invalid Commission service configuration at position %', service_index
        using errcode = '22023';
    end if;
  end loop;

  update public.employee_commission_profiles
  set cancelled_at = clock_timestamp(),
      cancelled_by = p_actor_employee_id,
      cancellation_reason = left(
        '[overwritten] Historical correction: ' || btrim(p_change_reason),
        500
      )
  where id = profile_row.id;

  delete from public.employee_commission_assignments
  where profile_id = profile_row.id;

  insert into public.employee_commission_profiles (
    id, employee_id, label, effective_from, effective_to, location_id,
    copied_from_profile_id, configuration, change_reason, created_by
  ) values (
    replacement_profile_id, profile_row.employee_id, btrim(p_label),
    profile_row.effective_from, profile_row.effective_to, profile_row.location_id,
    profile_row.copied_from_profile_id, p_configuration, btrim(p_change_reason),
    p_actor_employee_id
  );

  service_index := 0;
  for service in select value from jsonb_array_elements(p_configuration -> 'services')
  loop
    service_index := service_index + 1;
    service_code_value := lower(btrim(service ->> 'serviceCode'));
    service_request_key := p_request_key || ':' || service_index::text;
    rule_name_value := left(
      employee_name || ' - ' || service_code_value || ' - '
        || profile_row.effective_from::text || ' - ' || left(replacement_profile_id::text, 8),
      100
    );

    policy_result := public.commission_create_policy_2026082901(
      p_actor_employee_id,
      rule_name_value,
      'Employee-owned historical profile ' || replacement_profile_id::text
        || ' for ' || service_code_value,
      service_request_key || ':policy'
    );
    perform set_config('pt_portal.commission_profile_id', replacement_profile_id::text, true);
    update public.commission_rules
    set profile_id = replacement_profile_id
    where id = (policy_result ->> 'id')::uuid;
    version_result := public.commission_create_policy_version_2026082901(
      p_actor_employee_id,
      (policy_result ->> 'id')::uuid,
      service -> 'components',
      service_request_key || ':version'
    );
    perform public.commission_activate_policy_version_2026082901(
      p_actor_employee_id,
      (policy_result ->> 'id')::uuid,
      (version_result ->> 'id')::uuid,
      service_request_key || ':activate'
    );
    assignment_result := public.commission_create_assignment_2026082901(
      p_actor_employee_id,
      profile_row.employee_id,
      (version_result ->> 'id')::uuid,
      service ->> 'sourceModule',
      service_code_value,
      service ->> 'recipientRole',
      profile_row.location_id,
      profile_row.effective_from,
      profile_row.effective_to,
      service_request_key || ':assign'
    );
    assignments_json := assignments_json || jsonb_build_array(
      assignment_result || jsonb_build_object(
        'policyId', policy_result ->> 'id',
        'profileId', replacement_profile_id
      )
    );
  end loop;
  perform set_config('pt_portal.commission_profile_id', '', true);

  result_json := jsonb_build_object(
    'id', replacement_profile_id,
    'employeeId', profile_row.employee_id,
    'label', btrim(p_label),
    'effectiveFrom', profile_row.effective_from,
    'effectiveTo', profile_row.effective_to,
    'locationId', profile_row.location_id,
    'replacedProfileId', profile_row.id,
    'historicalEdit', true,
    'assignments', assignments_json,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason,
    before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'employee_profile.historical_replaced',
    'employee_commission_profile', replacement_profile_id, btrim(p_change_reason),
    to_jsonb(profile_row), result_json, p_request_key
  );
  return result_json;
end
$function$;
revoke all on function public.commission_replace_employee_profile_2026083008(
  uuid,uuid,text,date,uuid,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.commission_replace_employee_profile_2026083008(
  uuid,uuid,text,date,uuid,jsonb,text,text
) to service_role;
insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083008,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260831_commission_historical_profile_editing.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'historical-employee-profile-editing',
        'missing-exchange-rate-exception',
        'current-source-exception-only'
      )
    )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (public.portal_schema_versions.version = excluded.version
       and (
         not coalesce(public.portal_schema_versions.details -> 'capabilities'
           ? 'historical-employee-profile-editing', false)
         or not coalesce(public.portal_schema_versions.details -> 'capabilities'
           ? 'missing-exchange-rate-exception', false)
         or not coalesce(public.portal_schema_versions.details -> 'capabilities'
           ? 'current-source-exception-only', false)
       ));
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
    'packageIntegrationReady', coalesce(version >= 2026083003, false),
    'packageReadinessReady', coalesce(version >= 2026083004, false),
    'applicationIntegrationReady', coalesce(version >= 2026083007, false),
    'historicalProfileEditingReady', coalesce(version >= 2026083008, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026083008,
    'mode', coalesce(details ->> 'mode', 'unavailable'),
    'appliedAt', applied_at,
    'details', coalesce(details, '{}'::jsonb)
  )
  from (
    select schema_version.version, schema_version.applied_at, schema_version.details
    from public.portal_schema_versions schema_version
    where schema_version.component = 'commission'
    union all
    select 0::bigint, null::timestamptz, '{}'::jsonb
    where not exists (select 1 from public.portal_schema_versions where component = 'commission')
    limit 1
  ) status;
$function$;
revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;
commit;
