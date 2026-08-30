\set ON_ERROR_STOP on

do $assert_capability$
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083007
    or public.commission_schema_status() ->> 'applicationIntegrationReady' <> 'true'
  then
    raise exception 'Commission Application recipient routing capability is not ready';
  end if;
  if position(
    'commission_process_application_shadow_event_2026083007'
    in pg_get_functiondef(
      'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure
    )
  ) = 0 then
    raise exception 'The bounded processor does not use Application recipient routing';
  end if;
end
$assert_capability$;

do $assert_package_passenger_bands$
declare component_id_value uuid;
declare rule_id_value uuid;
declare version_id_value uuid;
declare amount_three numeric;
declare amount_four numeric;
declare amount_eight numeric;
begin
  insert into public.commission_rules (rule_name, description, created_by)
  values (
    'Package passenger band calculation test',
    'Draft-only integration fixture',
    '42000000-0000-0000-0000-000000000001'
  ) returning id into rule_id_value;
  insert into public.commission_policy_versions (
    rule_id, version_number, status, created_by
  ) values (
    rule_id_value, 1, 'draft', '42000000-0000-0000-0000-000000000001'
  ) returning id into version_id_value;
  insert into public.commission_policy_components (
    policy_version_id, sequence, component_type, recipient_role,
    eligible_services, config
  ) values (
    version_id_value,
    1,
    'marginal_ticket_tier',
    'package_sales',
    jsonb_build_array('package_sale'),
    jsonb_build_object(
      'serviceCode', 'package_sale',
      'payCurrency', 'GBP',
      'marginalUnit', 'package_passenger_band'
    )
  ) returning id into component_id_value;
  insert into public.commission_policy_tiers (component_id, min_unit, rate_gbp)
  values
    (component_id_value, 1, 100),
    (component_id_value, 4, 150);

  amount_three := public.commission_component_amount_2026082902(
    component_id_value, '{}'::jsonb, 3, 0
  );
  amount_four := public.commission_component_amount_2026082902(
    component_id_value, '{}'::jsonb, 4, 0
  );
  amount_eight := public.commission_component_amount_2026082902(
    component_id_value, '{}'::jsonb, 8, 0
  );
  if amount_three <> 100 or amount_four <> 150 or amount_eight <> 150 then
    raise exception 'Package passenger bands calculated %, %, % instead of 100, 150, 150',
      amount_three, amount_four, amount_eight;
  end if;
end
$assert_package_passenger_bands$;

do $configure_routing$
declare
  source_profile public.employee_commission_profiles%rowtype;
  source_configuration jsonb;
  target_configuration jsonb;
  visa_index integer;
  result_value jsonb;
begin
  select * into source_profile
  from public.employee_commission_profiles profile
  where profile.employee_id = '42000000-0000-0000-0000-000000000006'
    and profile.cancelled_at is null
  order by profile.effective_from desc limit 1;
  if not found then raise exception 'Routing source profile is missing'; end if;

  select service.ordinality::integer - 1 into visa_index
  from jsonb_array_elements(source_profile.configuration -> 'services')
    with ordinality as service(value, ordinality)
  where service.value ->> 'serviceCode' = 'application_visa';
  if visa_index is null then raise exception 'Visa service is missing from the source profile'; end if;

  target_configuration := jsonb_set(
    source_profile.configuration,
    array['services', visa_index::text, 'components', '0', 'rateValue'],
    '55'::jsonb
  );
  target_configuration := jsonb_set(
    target_configuration,
    '{draft,applicationRouting}',
    jsonb_build_object('mode', 'self', 'recipientEmployeeId', null),
    true
  );
  perform public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000007',
    'Application commission recipient',
    source_profile.effective_from,
    source_profile.location_id,
    null,
    target_configuration,
    'Standard Application rate for routed work',
    'application-routing-target-create-0001'
  );

  source_configuration := jsonb_set(
    source_profile.configuration,
    '{draft,applicationRouting}',
    jsonb_build_object(
      'mode', 'another_employee',
      'recipientEmployeeId', '42000000-0000-0000-0000-000000000007'
    ),
    true
  );
  result_value := public.commission_replace_employee_profile_2026083006(
    '42000000-0000-0000-0000-000000000001',
    source_profile.id,
    'Application work routed separately',
    source_profile.effective_from,
    source_profile.location_id,
    source_configuration,
    'Redirect completed Application commission to the standard recipient',
    'application-routing-source-replace-0001'
  );
  if result_value ->> 'id' is null then
    raise exception 'Application routing source profile was not saved: %', result_value;
  end if;
end
$configure_routing$;

insert into public.visa_applications (
  id, employee_id, application_date, status, visa_country_id, visa_type_id,
  validity, is_part_of_package, internal_tracking_number
)
values (
  '80000000-0000-0000-0000-000000000107',
  '42000000-0000-0000-0000-000000000006',
  current_timestamp,
  'Completed',
  '82000000-0000-0000-0000-000000000011',
  '82000000-0000-0000-0000-000000000012',
  '90 days',
  false,
  'VISA-ROUTED-107'
);

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  200,
  'application-routing-process-0001'
);

do $assert_routed_earning$
declare earning public.commission_entries%rowtype;
declare active_count integer;
begin
  select count(*) into active_count
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:visa:80000000-0000-0000-0000-000000000107'
    and not (entry.explanation ? 'reason')
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  select entry.* into earning
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:visa:80000000-0000-0000-0000-000000000107'
    and not (entry.explanation ? 'reason')
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_count <> 1
    or not found
    or earning.recipient_employee_id <> '42000000-0000-0000-0000-000000000007'
    or earning.profit_owner_employee_id <> '42000000-0000-0000-0000-000000000006'
    or earning.amount_gbp <> 55
    or earning.explanation ->> 'routed' <> 'true'
    or earning.explanation ->> 'performedByEmployeeId'
      <> '42000000-0000-0000-0000-000000000006'
  then
    raise exception 'Application earning did not preserve performer and use recipient rate: %',
      to_jsonb(earning);
  end if;
end
$assert_routed_earning$;

update public.commission_source_event_states state
set processing_status = 'pending', next_attempt_at = null, last_error = null
from public.commission_source_events event
where state.event_id = event.id
  and event.source_record_id = '80000000-0000-0000-0000-000000000107';

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  200,
  'application-routing-process-repeat-0001'
);

do $assert_idempotent_recalculation$
declare active_count integer;
declare active_amount numeric;
begin
  select count(*), coalesce(sum(entry.amount_gbp), 0)
  into active_count, active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:visa:80000000-0000-0000-0000-000000000107'
    and not (entry.explanation ? 'reason')
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_count <> 1 or active_amount <> 55 then
    raise exception 'Reprocessing unchanged routing duplicated or removed its earning';
  end if;
end
$assert_idempotent_recalculation$;

do $update_recipient_rate$
declare target_profile public.employee_commission_profiles%rowtype;
declare target_configuration jsonb;
declare visa_index integer;
begin
  select * into target_profile
  from public.employee_commission_profiles profile
  where profile.employee_id = '42000000-0000-0000-0000-000000000007'
    and profile.cancelled_at is null
  order by profile.effective_from desc limit 1;
  select service.ordinality::integer - 1 into visa_index
  from jsonb_array_elements(target_profile.configuration -> 'services')
    with ordinality as service(value, ordinality)
  where service.value ->> 'serviceCode' = 'application_visa';
  target_configuration := jsonb_set(
    target_profile.configuration,
    array['services', visa_index::text, 'components', '0', 'rateValue'],
    '65'::jsonb
  );
  perform public.commission_replace_employee_profile_2026083006(
    '42000000-0000-0000-0000-000000000001',
    target_profile.id,
    'Application recipient standard rate updated',
    target_profile.effective_from,
    target_profile.location_id,
    target_configuration,
    'Update the recipient standard Application commission rate',
    'application-routing-target-replace-0001'
  );
end
$update_recipient_rate$;

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  200,
  'application-routing-process-target-rate-0001'
);

do $assert_recipient_rate_refresh$
declare active_count integer;
declare active_amount numeric;
begin
  select count(*), coalesce(sum(entry.amount_gbp), 0)
  into active_count, active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:visa:80000000-0000-0000-0000-000000000107'
    and not (entry.explanation ? 'reason')
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_count <> 1 or active_amount <> 65 then
    raise exception 'Changing the recipient plan did not refresh routed Applications';
  end if;
end
$assert_recipient_rate_refresh$;

do $disable_routing$
declare source_profile public.employee_commission_profiles%rowtype;
declare source_configuration jsonb;
begin
  select * into source_profile
  from public.employee_commission_profiles profile
  where profile.employee_id = '42000000-0000-0000-0000-000000000006'
    and profile.cancelled_at is null
  order by profile.effective_from desc limit 1;
  source_configuration := jsonb_set(
    source_profile.configuration,
    '{draft,applicationRouting}',
    jsonb_build_object('mode', 'none', 'recipientEmployeeId', null),
    true
  );
  perform public.commission_replace_employee_profile_2026083006(
    '42000000-0000-0000-0000-000000000001',
    source_profile.id,
    'Application commission disabled',
    source_profile.effective_from,
    source_profile.location_id,
    source_configuration,
    'Keep Application work operational without paying commission',
    'application-routing-source-replace-0002'
  );
end
$disable_routing$;

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  200,
  'application-routing-process-0002'
);

do $assert_disabled_reconciliation$
begin
  if exists (
    select 1 from public.commission_entries entry
    where entry.source_case_key =
        'applications:application:visa:80000000-0000-0000-0000-000000000107'
      and not (entry.explanation ? 'reason')
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
  ) then
    raise exception 'Disabled Application routing retained an active entitlement';
  end if;
  if not exists (
    select 1 from public.commission_entries entry
    where entry.source_case_key =
        'applications:application:visa:80000000-0000-0000-0000-000000000107'
      and entry.recipient_employee_id = '42000000-0000-0000-0000-000000000007'
      and entry.explanation ->> 'reason' = 'application_commission_recipient_reconciled'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
  ) then
    raise exception 'Disabled Application routing did not reverse the prior recipient earning';
  end if;
end
$assert_disabled_reconciliation$;

select 'Commission Application recipient routing assertions passed' as result;
