-- Commission capability 2026083006.
-- Separates urgent/executive NADRA and Pakistani passport rates, and adds
-- transactional overwrite/removal for employee-owned commission plans.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083005 then
    raise exception 'Commission capability 2026083005 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083006 then
    raise exception 'Refusing to replay Commission capability 2026083006 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

alter table public.employee_commission_assignments
  drop constraint if exists employee_commission_assignments_scope_check;
alter table public.employee_commission_assignments
  add constraint employee_commission_assignments_scope_check check (
    source_module in ('ticketing', 'packages', 'applications')
    and service_code in (
      'tk_primary', 'tk_assistance', 'dc', 'r_er', 'low_fare',
      'higher_fare', 'package_sale', 'application_nadra',
      'application_nadra_urgent', 'application_passport_pk',
      'application_passport_pk_urgent', 'application_passport_gb',
      'application_visa', 'sales_bonus'
    )
    and recipient_role in (
      'primary', 'assistant', 'low_fare_actor', 'package_sales',
      'application_agent', 'sales_bonus'
    )
  );

-- The employee-profile creator is intentionally kept as the single graph builder.
-- Extend each of its application service lists without depending on formatting.
do $upgrade_profile_creation$
declare
  signature constant regprocedure :=
    'public.commission_create_employee_profile_2026082904(uuid,uuid,text,date,uuid,uuid,jsonb,text,text)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  if position('application_nadra_urgent' in definition) = 0 then
    updated_definition := replace(
      definition,
      quote_literal('application_visa'),
      quote_literal('application_visa') || ', ' || quote_literal('application_nadra_urgent')
        || ', ' || quote_literal('application_passport_pk_urgent')
    );
    if updated_definition = definition then
      raise exception 'Commission urgent application profile upgrade did not match'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end if;
end
$upgrade_profile_creation$;

create or replace function public.commission_application_service_code_2026083006(
  p_application_kind text,
  p_record jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  kind_value text := lower(btrim(coalesce(p_application_kind, '')));
  option_value text;
  record_id_value uuid;
  urgent_value boolean := false;
begin
  begin
    record_id_value := (p_record ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Application Commission source contains an invalid record ID'
      using errcode = '22023';
  end;

  if kind_value = 'nadra' then
    select coalesce(
      (select details.service_option::text
       from public.nicop_cnic_details details where details.id = record_id_value),
      (select details.service_option::text
       from public.poc_details details where details.id = record_id_value),
      p_record ->> 'service_option'
    ) into option_value;
  elsif kind_value = 'passport_pk' then
    option_value := p_record ->> 'speed';
  end if;

  urgent_value := lower(btrim(coalesce(option_value, ''))) ~ '(urgent|executive|fast[ -]?track)';
  return case kind_value
    when 'nadra' then case when urgent_value
      then 'application_nadra_urgent' else 'application_nadra' end
    when 'passport_pk' then case when urgent_value
      then 'application_passport_pk_urgent' else 'application_passport_pk' end
    when 'passport_gb' then 'application_passport_gb'
    when 'visa' then 'application_visa'
    else null
  end;
end
$function$;

do $upgrade_application_emitter$
declare
  signature constant regprocedure :=
    'public.commission_emit_application_event_2026083005(text,jsonb,boolean,date)'::regprocedure;
  definition text;
  updated_definition text;
  insertion text := $insert$
  service_code_value := public.commission_application_service_code_2026083006(
    application_kind_value,
    p_record
  );
  if service_code_value is null then
    raise exception 'Unsupported Application Commission kind: %', application_kind_value
      using errcode = '22023';
  end if;
  variant_value := variant_value || jsonb_build_object(
    'commissionUrgency', case
      when service_code_value in ('application_nadra_urgent', 'application_passport_pk_urgent')
        then 'urgent'
      else 'normal'
    end
  );

$insert$;
begin
  definition := pg_get_functiondef(signature);
  if position('commission_application_service_code_2026083006' in definition) = 0 then
    updated_definition := regexp_replace(
      definition,
      $pattern$([[:space:]]+perform[[:space:]]+pg_advisory_xact_lock\(hashtextextended\()$pattern$,
      insertion || E'  perform pg_advisory_xact_lock(hashtextextended('
    );
    if updated_definition = definition then
      raise exception 'Commission urgent application emitter upgrade did not match'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    updated_definition := replace(updated_definition, '''integration_version'', 2026083005', '''integration_version'', 2026083006');
    execute updated_definition;
  end if;
end
$upgrade_application_emitter$;

-- The 3005 processor remains the dispatcher target; widen its explicit service allow-list.
do $upgrade_application_processor$
declare
  signature constant regprocedure :=
    'public.commission_process_application_shadow_event_2026083005(uuid,uuid)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  if position('application_nadra_urgent' in definition) = 0 then
    updated_definition := replace(
      definition,
      quote_literal('application_visa'),
      quote_literal('application_visa') || ', ' || quote_literal('application_nadra_urgent')
        || ', ' || quote_literal('application_passport_pk_urgent')
    );
    if updated_definition = definition then
      raise exception 'Commission urgent application processor upgrade did not match'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end if;
end
$upgrade_application_processor$;

-- Package marginal tiers use the already-authoritative passenger_count and the
-- shared marginal calculator, but the package processor previously filtered the
-- component type out before calculation.
do $upgrade_package_processor$
declare
  signature constant regprocedure :=
    'public.commission_process_package_shadow_event_2026083003(uuid,uuid)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  if definition !~ $pattern$'percentage_of_package_profit'[[:space:]]*,[[:space:]]*'marginal_ticket_tier'$pattern$ then
    updated_definition := regexp_replace(
      definition,
      $pattern$'percentage_of_package_profit'[[:space:]]*,[[:space:]]*'explicit_zero'$pattern$,
      $replacement$'percentage_of_package_profit', 'marginal_ticket_tier', 'explicit_zero'$replacement$,
      'g'
    );
    if updated_definition = definition then
      raise exception 'Commission package passenger-tier processor upgrade did not match'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end if;
end
$upgrade_package_processor$;

create or replace function public.commission_capture_nadra_option_2026083006()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare parent_record public.nadra_services%rowtype;
begin
  select * into parent_record
  from public.nadra_services
  where id = coalesce(new.id, old.id);
  if found then
    perform public.commission_emit_application_event_2026083005(
      'nadra', to_jsonb(parent_record), false, null
    );
  end if;
  return coalesce(new, old);
end
$function$;

drop trigger if exists commission_application_nadra_nicop_option_3006
  on public.nicop_cnic_details;
create trigger commission_application_nadra_nicop_option_3006
  after insert or update or delete on public.nicop_cnic_details
  for each row execute function public.commission_capture_nadra_option_2026083006();

drop trigger if exists commission_application_nadra_poc_option_3006
  on public.poc_details;
create trigger commission_application_nadra_poc_option_3006
  after insert or update or delete on public.poc_details
  for each row execute function public.commission_capture_nadra_option_2026083006();

create or replace function public.commission_remove_employee_profile_2026083006(
  p_actor_employee_id uuid,
  p_profile_id uuid,
  p_reason text,
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
  previous_profile public.employee_commission_profiles%rowtype;
  next_profile public.employee_commission_profiles%rowtype;
  restored_effective_to date;
  result_json jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_profile_id is null
    or length(btrim(coalesce(p_reason, ''))) not between 8 and 480
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 120
  then
    raise exception 'Invalid Commission profile removal request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile-remove:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'employee_profile.removed'
    and request_key = p_request_key;
  if result_json is not null then
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into profile_row
  from public.employee_commission_profiles
  where id = p_profile_id;
  if not found then
    raise exception 'Commission profile was not found' using errcode = 'P0002';
  end if;
  if profile_row.cancelled_at is not null then
    raise exception 'Commission profile is already inactive'
      using errcode = '55000', hint = 'COMMISSION_PROFILE_ALREADY_INACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile:' || profile_row.employee_id::text || ':'
      || coalesce(profile_row.location_id::text, 'all'), 0
  ));
  select * into profile_row
  from public.employee_commission_profiles
  where id = p_profile_id
  for update;

  select * into previous_profile
  from public.employee_commission_profiles previous
  where previous.employee_id = profile_row.employee_id
    and previous.location_id is not distinct from profile_row.location_id
    and previous.cancelled_at is null
    and previous.id <> profile_row.id
    and previous.effective_from < profile_row.effective_from
  order by previous.effective_from desc
  limit 1
  for update;

  select * into next_profile
  from public.employee_commission_profiles successor
  where successor.employee_id = profile_row.employee_id
    and successor.location_id is not distinct from profile_row.location_id
    and successor.cancelled_at is null
    and successor.id <> profile_row.id
    and successor.effective_from > profile_row.effective_from
  order by successor.effective_from
  limit 1
  for update;

  update public.employee_commission_profiles
  set cancelled_at = clock_timestamp(),
      cancelled_by = p_actor_employee_id,
      cancellation_reason = '[removed] ' || btrim(p_reason)
  where id = profile_row.id;

  delete from public.employee_commission_assignments
  where profile_id = profile_row.id;

  if previous_profile.id is not null then
    restored_effective_to := case when next_profile.id is null
      then null else next_profile.effective_from - 1 end;
    update public.employee_commission_profiles
    set effective_to = restored_effective_to
    where id = previous_profile.id;
    update public.employee_commission_assignments
    set effective_to = restored_effective_to
    where profile_id = previous_profile.id;
  end if;

  result_json := jsonb_build_object(
    'removed', true,
    'profileId', profile_row.id,
    'employeeId', profile_row.employee_id,
    'restoredProfileId', previous_profile.id,
    'restoredEffectiveTo', restored_effective_to,
    'retainedAccountingEvidence', exists (
      select 1
      from public.commission_rules rule
      join public.commission_policy_versions version_row on version_row.rule_id = rule.id
      join public.commission_entries entry on entry.policy_version_id = version_row.id
      where rule.profile_id = profile_row.id
    ),
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason,
    before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'employee_profile.removed', 'employee_commission_profile',
    profile_row.id, btrim(p_reason), to_jsonb(profile_row), result_json, p_request_key
  );
  return result_json;
end
$function$;

create or replace function public.commission_replace_employee_profile_2026083006(
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
  result_json jsonb;
  create_result jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_request_key, ''))) not between 8 and 100 then
    raise exception 'Invalid Commission profile replacement request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile-replace:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'employee_profile.replaced'
    and request_key = p_request_key;
  if result_json is not null then
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into profile_row
  from public.employee_commission_profiles
  where id = p_profile_id and cancelled_at is null;
  if not found then
    raise exception 'Active Commission profile was not found' using errcode = 'P0002';
  end if;
  if p_location_id is distinct from profile_row.location_id then
    raise exception 'Create a new plan to change the branch scope'
      using errcode = '22023', hint = 'COMMISSION_PROFILE_SCOPE_CHANGE_REQUIRES_NEW';
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

  perform public.commission_remove_employee_profile_2026083006(
    p_actor_employee_id,
    p_profile_id,
    left('[overwritten] ' || btrim(p_change_reason), 480),
    p_request_key || ':archive'
  );
  create_result := public.commission_create_employee_profile_2026082904(
    p_actor_employee_id,
    profile_row.employee_id,
    p_label,
    p_effective_from,
    p_location_id,
    null,
    p_configuration,
    p_change_reason,
    p_request_key || ':create'
  );
  result_json := create_result || jsonb_build_object(
    'replacedProfileId', p_profile_id,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason,
    before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'employee_profile.replaced', 'employee_commission_profile',
    (create_result ->> 'id')::uuid, btrim(p_change_reason),
    jsonb_build_object('replacedProfileId', p_profile_id), result_json, p_request_key
  );
  return result_json;
end
$function$;

-- Reclassify completed work. The emitter keeps the original earning date and
-- produces a correction version only where the normal/urgent snapshot changes.
do $backfill_urgent_application_classification$
declare application_record record;
begin
  for application_record in
    select application.* from public.nadra_services application
    where application.status = 'Completed' and not application.is_refunded
  loop
    perform public.commission_emit_application_event_2026083005(
      'nadra', to_jsonb(application_record), false, null
    );
  end loop;
  for application_record in
    select application.* from public.pakistani_passport_applications application
    where application.status = 'Collected' and not application.is_refunded
  loop
    perform public.commission_emit_application_event_2026083005(
      'passport_pk', to_jsonb(application_record), false, null
    );
  end loop;
end
$backfill_urgent_application_classification$;

revoke all on function
  public.commission_application_service_code_2026083006(text,jsonb),
  public.commission_capture_nadra_option_2026083006(),
  public.commission_remove_employee_profile_2026083006(uuid,uuid,text,text),
  public.commission_replace_employee_profile_2026083006(uuid,uuid,text,date,uuid,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function
  public.commission_remove_employee_profile_2026083006(uuid,uuid,text,text),
  public.commission_replace_employee_profile_2026083006(uuid,uuid,text,date,uuid,jsonb,text,text)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083006,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260830_commission_urgent_applications_and_plan_mutations.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'urgent-application-rates',
        'package-passenger-marginal-tiers',
        'commission-profile-overwrite',
        'commission-profile-removal'
      )
    )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (public.portal_schema_versions.version = excluded.version
       and not coalesce(public.portal_schema_versions.details -> 'capabilities'
         ? 'urgent-application-rates', false));

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
    'applicationIntegrationReady', coalesce(version >= 2026083006, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026083006,
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
