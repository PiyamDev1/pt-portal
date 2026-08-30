-- Commission capability 2026083007.
-- Separates Application work ownership from the employee entitled to commission,
-- and corrects Package passenger tiers to one flat band amount per package.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083006 then
    raise exception 'Commission capability 2026083006 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083007 then
    raise exception 'Refusing to replay Commission capability 2026083007 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

do $upgrade_package_band_calculator$
declare
  signature constant regprocedure :=
    'public.commission_component_values_2026083001(uuid,jsonb,integer,integer,date)'::regprocedure;
  definition text;
  updated_definition text;
  old_marker constant text :=
    E'  if component.component_type = ''marginal_ticket_tier'' then';
  replacement constant text := $replacement$  if component.component_type = 'marginal_ticket_tier'
    and component.config ->> 'marginalUnit' in (
      'package_passenger', 'package_passenger_band'
    )
  then
    if p_units is null or p_units < 0 then
      raise exception 'A valid Package passenger count is required' using errcode = '22023';
    end if;
    if p_units = 0 then
      raw_value := 0;
    else
      select tier.rate_gbp into raw_value
      from public.commission_policy_tiers tier
      where tier.component_id = component.id and tier.min_unit <= p_units
      order by tier.min_unit desc limit 1;
      if raw_value is null then
        raise exception 'Package passenger bands do not cover the supplied passenger count'
          using errcode = '22023';
      end if;
    end if;
  elsif component.component_type = 'marginal_ticket_tier' then$replacement$;
begin
  definition := pg_get_functiondef(signature);
  if position('package_passenger_band' in definition) = 0 then
    updated_definition := replace(definition, old_marker, replacement);
    if updated_definition = definition then
      raise exception 'Commission Package passenger-band calculator upgrade did not match'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end if;
end
$upgrade_package_band_calculator$;

-- Existing active components stay immutable. The calculator accepts both the
-- legacy package_passenger marker and the new package_passenger_band marker.

create or replace function public.commission_application_routing_2026083007(
  p_performer_employee_id uuid,
  p_location_id uuid,
  p_effective_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  profile_record public.employee_commission_profiles%rowtype;
  mode_value text := 'self';
  recipient_text text;
  recipient_id_value uuid;
begin
  select profile.* into profile_record
  from public.employee_commission_profiles profile
  where profile.employee_id = p_performer_employee_id
    and profile.cancelled_at is null
    and profile.effective_from <= p_effective_on
    and (profile.effective_to is null or profile.effective_to >= p_effective_on)
    and (profile.location_id is null or profile.location_id = p_location_id)
  order by (profile.location_id is not null) desc, profile.effective_from desc, profile.created_at desc
  limit 1;

  if found then
    mode_value := coalesce(
      nullif(profile_record.configuration #>> '{draft,applicationRouting,mode}', ''),
      'self'
    );
    recipient_text := nullif(
      profile_record.configuration #>> '{draft,applicationRouting,recipientEmployeeId}',
      ''
    );
  end if;

  if mode_value not in ('self', 'another_employee', 'none') then
    mode_value := 'invalid';
  end if;

  if mode_value = 'self' then
    recipient_id_value := p_performer_employee_id;
  elsif mode_value = 'another_employee' and recipient_text is not null then
    begin
      recipient_id_value := recipient_text::uuid;
    exception when invalid_text_representation then
      mode_value := 'invalid';
      recipient_id_value := null;
    end;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'mode', mode_value,
    'recipientEmployeeId', recipient_id_value,
    'routingProfileId', profile_record.id
  ));
end
$function$;

create or replace function public.commission_process_application_shadow_event_2026083007(
  p_run_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  event public.commission_source_events%rowtype;
  component public.commission_policy_components%rowtype;
  prior_entry public.commission_entries%rowtype;
  policy_version_id_value uuid;
  performer_employee_id_value uuid;
  recipient_employee_id_value uuid;
  routing_profile_id_value uuid;
  routing_value jsonb;
  routing_mode_value text;
  service_code_value text;
  period_start_value date;
  period_end_value date;
  case_key_value text;
  revision_value integer;
  amount_value numeric;
  entry_count_value integer := 0;
  eligible_value boolean;
  desired_component_count integer := 0;
  active_entitlement_count integer := 0;
  matching_entitlement_count integer := 0;
  failure_code_value text;
  failure_details_value jsonb := '{}'::jsonb;
begin
  select * into event
  from public.commission_source_events source_event
  where source_event.id = p_event_id;
  if not found
    or event.source_module <> 'applications'
    or event.event_type not in ('application_completed', 'application_reversed')
  then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'calculation_failed',
      'failureDetails', jsonb_build_object('reason', 'unsupported_application_event')
    );
  end if;

  service_code_value := event.variables ->> 'service_code';
  if service_code_value not in (
    'application_nadra', 'application_nadra_urgent',
    'application_passport_pk', 'application_passport_pk_urgent',
    'application_passport_gb', 'application_visa'
  ) then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'calculation_failed',
      'failureDetails', jsonb_build_object(
        'reason', 'unsupported_application_service',
        'serviceCode', service_code_value
      )
    );
  end if;

  performer_employee_id_value := coalesce(event.owner_employee_id, event.employee_id);
  period_start_value := date_trunc('month', event.effective_on)::date;
  period_end_value := (period_start_value + interval '1 month - 1 day')::date;
  case_key_value := event.source_module || ':' || event.source_fact_key;
  eligible_value := event.event_type = 'application_completed'
    and coalesce((event.variables ->> 'eligible')::boolean, false);

  routing_value := public.commission_application_routing_2026083007(
    performer_employee_id_value,
    event.location_id,
    event.effective_on
  );
  routing_mode_value := coalesce(routing_value ->> 'mode', 'self');
  begin
    recipient_employee_id_value := nullif(routing_value ->> 'recipientEmployeeId', '')::uuid;
    routing_profile_id_value := nullif(routing_value ->> 'routingProfileId', '')::uuid;
  exception when invalid_text_representation then
    routing_mode_value := 'invalid';
    recipient_employee_id_value := null;
    routing_profile_id_value := null;
  end;

  if eligible_value and routing_mode_value = 'invalid' then
    failure_code_value := 'calculation_failed';
    failure_details_value := jsonb_build_object(
      'reason', 'invalid_application_commission_routing',
      'performerEmployeeId', performer_employee_id_value
    );
  elsif eligible_value and routing_mode_value = 'another_employee'
    and recipient_employee_id_value is null
  then
    failure_code_value := 'calculation_failed';
    failure_details_value := jsonb_build_object(
      'reason', 'missing_application_commission_recipient',
      'performerEmployeeId', performer_employee_id_value
    );
  elsif eligible_value and routing_mode_value <> 'none' then
    perform 1 from public.employees employee
    where employee.id = recipient_employee_id_value and employee.is_active;
    if not found then
      failure_code_value := 'inactive_recipient';
      failure_details_value := jsonb_build_object(
        'recipientEmployeeId', recipient_employee_id_value,
        'performedByEmployeeId', performer_employee_id_value,
        'serviceCode', service_code_value
      );
    else
      policy_version_id_value := public.commission_resolve_assignment_2026082901(
        recipient_employee_id_value,
        'applications',
        service_code_value,
        'application_agent',
        event.location_id,
        event.effective_on
      );
      if policy_version_id_value is null then
        failure_code_value := 'needs_policy';
        failure_details_value := jsonb_build_object(
          'recipientEmployeeId', recipient_employee_id_value,
          'performedByEmployeeId', performer_employee_id_value,
          'serviceCode', service_code_value,
          'recipientRole', 'application_agent'
        );
      else
        select count(*) into desired_component_count
        from public.commission_policy_components policy_component
        where policy_component.policy_version_id = policy_version_id_value
          and policy_component.recipient_role = 'application_agent'
          and policy_component.component_type in ('fixed_per_event', 'explicit_zero');
        if desired_component_count = 0 then
          failure_code_value := 'needs_policy';
          failure_details_value := jsonb_build_object(
            'reason', 'no_matching_component',
            'policyVersionId', policy_version_id_value,
            'serviceCode', service_code_value
          );
        end if;
      end if;
    end if;
  end if;

  select count(*) into active_entitlement_count
  from public.commission_entries entry
  where entry.entry_mode = 'shadow'
    and entry.entry_kind = 'ordinary'
    and entry.source_case_key = case_key_value
    and not (entry.explanation ? 'reason')
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );

  if failure_code_value is null
    and eligible_value
    and routing_mode_value <> 'none'
    and desired_component_count > 0
  then
    select count(*) into matching_entitlement_count
    from public.commission_entries entry
    join public.commission_policy_components policy_component
      on policy_component.id = entry.component_id
     and policy_component.policy_version_id = policy_version_id_value
     and policy_component.recipient_role = 'application_agent'
     and policy_component.component_type in ('fixed_per_event', 'explicit_zero')
    where entry.entry_mode = 'shadow'
      and entry.entry_kind = 'ordinary'
      and entry.source_case_key = case_key_value
      and entry.source_event_id = event.id
      and entry.recipient_employee_id = recipient_employee_id_value
      and entry.profit_owner_employee_id = performer_employee_id_value
      and coalesce(entry.amount_pay_currency, entry.amount_gbp)
        = public.commission_component_amount_2026082902(
        policy_component.id,
        event.variables || jsonb_build_object('_commission_period_start', period_start_value),
        1,
        0
      )
      and entry.basis_snapshot ->> 'routingMode' = routing_mode_value
      and coalesce(entry.basis_snapshot ->> 'routingProfileId', '')
        = coalesce(routing_profile_id_value::text, '')
      and not (entry.explanation ? 'reason')
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      );
  end if;

  if active_entitlement_count <> desired_component_count
    or matching_entitlement_count <> desired_component_count
  then
    for prior_entry in
      select entry.* from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and entry.entry_kind = 'ordinary'
        and entry.source_case_key = case_key_value
        and not (entry.explanation ? 'reason')
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
        )
    loop
      select coalesce(max(entry.revision), 0) + 1 into revision_value
      from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and entry.source_case_key = case_key_value
        and entry.recipient_employee_id = prior_entry.recipient_employee_id
        and entry.component_id = prior_entry.component_id;
      insert into public.commission_entries (
        run_id, entry_mode, entry_kind, source_event_id, source_case_key,
        recipient_employee_id, profit_owner_employee_id, location_id,
        policy_version_id, component_id, earning_on, period_start, period_end,
        amount_gbp, basis_snapshot, explanation, revision, supersedes_entry_id,
        idempotency_key
      ) values (
        p_run_id, 'shadow', prior_entry.entry_kind, event.id, case_key_value,
        prior_entry.recipient_employee_id, prior_entry.profit_owner_employee_id,
        prior_entry.location_id, prior_entry.policy_version_id, prior_entry.component_id,
        prior_entry.earning_on, prior_entry.period_start, prior_entry.period_end,
        0,
        prior_entry.basis_snapshot || jsonb_build_object(
          'correctedBySourceEventId', event.id,
          'nextRoutingMode', routing_mode_value
        ),
        prior_entry.explanation || jsonb_build_object(
          'reason', 'application_commission_recipient_reconciled',
          'supersededAmountGbp', prior_entry.amount_gbp,
          'performedByEmployeeId', performer_employee_id_value,
          'nextRecipientEmployeeId', recipient_employee_id_value
        ),
        revision_value,
        prior_entry.id,
        'application-routing-clear:' || event.id::text || ':' || prior_entry.id::text
      ) on conflict (entry_mode, idempotency_key) do nothing;
      if found then entry_count_value := entry_count_value + 1; end if;
    end loop;
  end if;

  if failure_code_value is not null then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', failure_code_value,
      'failureDetails', failure_details_value
    );
  end if;
  if not eligible_value or routing_mode_value = 'none' then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', null,
      'failureDetails', '{}'::jsonb
    );
  end if;
  if active_entitlement_count = desired_component_count
    and matching_entitlement_count = desired_component_count
  then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', null,
      'failureDetails', '{}'::jsonb
    );
  end if;

  for component in
    select policy_component.*
    from public.commission_policy_components policy_component
    where policy_component.policy_version_id = policy_version_id_value
      and policy_component.recipient_role = 'application_agent'
      and policy_component.component_type in ('fixed_per_event', 'explicit_zero')
    order by policy_component.sequence
  loop
    amount_value := public.commission_component_amount_2026082902(
      component.id,
      event.variables || jsonb_build_object('_commission_period_start', period_start_value),
      1,
      0
    );
    select coalesce(max(entry.revision), 0) + 1 into revision_value
    from public.commission_entries entry
    where entry.entry_mode = 'shadow'
      and entry.source_case_key = case_key_value
      and entry.recipient_employee_id = recipient_employee_id_value
      and entry.component_id = component.id;

    insert into public.commission_entries (
      run_id, entry_mode, entry_kind, source_event_id, source_case_key,
      recipient_employee_id, profit_owner_employee_id, location_id,
      policy_version_id, component_id, earning_on, period_start, period_end,
      amount_gbp, basis_snapshot, explanation, revision, supersedes_entry_id,
      idempotency_key
    ) values (
      p_run_id, 'shadow', 'ordinary', event.id, case_key_value,
      recipient_employee_id_value, performer_employee_id_value, event.location_id,
      policy_version_id_value, component.id, event.effective_on,
      period_start_value, period_end_value, amount_value,
      jsonb_strip_nulls(jsonb_build_object(
        'sourceVariable', component.source_variable,
        'basisValue', null,
        'units', 1,
        'applicationKind', event.variables -> 'application_kind',
        'status', event.variables -> 'status',
        'snapshotHash', event.variables -> 'snapshot_hash',
        'performedByEmployeeId', performer_employee_id_value,
        'commissionRecipientEmployeeId', recipient_employee_id_value,
        'routingMode', routing_mode_value,
        'routingProfileId', routing_profile_id_value
      )),
      jsonb_build_object(
        'componentType', component.component_type,
        'serviceCode', service_code_value,
        'recipientRole', 'application_agent',
        'sourceModule', 'applications',
        'performedByEmployeeId', performer_employee_id_value,
        'commissionRecipientEmployeeId', recipient_employee_id_value,
        'applicationCommissionRoutingMode', routing_mode_value,
        'routed', recipient_employee_id_value <> performer_employee_id_value,
        'nonPayable', true
      ),
      revision_value,
      null,
      'application-routed:' || event.id::text || ':' || recipient_employee_id_value::text
        || ':' || component.id::text || ':r' || revision_value::text
    ) on conflict (entry_mode, idempotency_key) do nothing;
    if found then entry_count_value := entry_count_value + 1; end if;
  end loop;

  return jsonb_build_object(
    'entryCount', entry_count_value,
    'failureCode', null,
    'failureDetails', '{}'::jsonb
  );
end
$function$;

do $upgrade_processor$
declare
  signature constant regprocedure :=
    'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  if position('commission_process_application_shadow_event_2026083007' in definition) > 0 then
    return;
  end if;
  updated_definition := replace(
    definition,
    'commission_process_application_shadow_event_2026083005',
    'commission_process_application_shadow_event_2026083007'
  );
  if updated_definition = definition then
    raise exception 'Commission Application routing processor upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$upgrade_processor$;

create or replace function public.commission_requeue_application_profile_events_2026083007()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare changed_employee_id uuid := coalesce(new.employee_id, old.employee_id);
begin
  update public.commission_source_event_states state
  set processing_status = 'pending', next_attempt_at = null, last_error = null,
      updated_at = clock_timestamp()
  from public.commission_source_events event
  where state.event_id = event.id
    and state.processing_status in ('processed', 'held', 'rejected')
    and event.source_module = 'applications'
    and (
      coalesce(event.owner_employee_id, event.employee_id) = changed_employee_id
      or public.commission_application_routing_2026083007(
        coalesce(event.owner_employee_id, event.employee_id),
        event.location_id,
        event.effective_on
      ) ->> 'recipientEmployeeId' = changed_employee_id::text
    );
  return coalesce(new, old);
end
$function$;

drop trigger if exists employee_commission_profiles_application_requeue_3007
  on public.employee_commission_profiles;
create trigger employee_commission_profiles_application_requeue_3007
  after insert or update or delete on public.employee_commission_profiles
  for each row execute function
    public.commission_requeue_application_profile_events_2026083007();

-- Reconcile already-calculated Application entries with the explicit performer and
-- recipient model on the next bounded processor run.
update public.commission_source_event_states state
set processing_status = 'pending', next_attempt_at = null, last_error = null,
    updated_at = clock_timestamp()
from public.commission_source_events event
where state.event_id = event.id
  and event.source_module = 'applications'
  and state.processing_status in ('processed', 'held', 'rejected');

update public.commission_source_event_states state
set processing_status = 'pending', next_attempt_at = null, last_error = null,
    updated_at = clock_timestamp()
from public.commission_source_events event
where state.event_id = event.id
  and event.source_module = 'packages'
  and state.processing_status in ('processed', 'held', 'rejected');

revoke all on function
  public.commission_application_routing_2026083007(uuid,uuid,date),
  public.commission_process_application_shadow_event_2026083007(uuid,uuid),
  public.commission_requeue_application_profile_events_2026083007()
  from public, anon, authenticated;
grant execute on function
  public.commission_application_routing_2026083007(uuid,uuid,date),
  public.commission_process_application_shadow_event_2026083007(uuid,uuid),
  public.commission_requeue_application_profile_events_2026083007()
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083007,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260830_commission_application_recipient_routing.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'application-commission-recipient-routing',
        'package-passenger-bands'
      )
    )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (public.portal_schema_versions.version = excluded.version
       and not coalesce(public.portal_schema_versions.details -> 'capabilities'
         ? 'application-commission-recipient-routing', false));

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
    'version', coalesce(version, 0),
    'requiredVersion', 2026083007,
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
