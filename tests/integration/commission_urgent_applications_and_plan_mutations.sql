\set ON_ERROR_STOP on

do $assert_capability_and_overwrite$
declare
  profile_row public.employee_commission_profiles%rowtype;
  configuration_value jsonb;
  result_value jsonb;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083006
    or public.commission_schema_status() ->> 'applicationIntegrationReady' <> 'true'
  then
    raise exception 'Commission capability 2026083006 is not ready';
  end if;
  if (
    length(pg_get_functiondef(
      'public.commission_process_package_shadow_event_2026083003(uuid,uuid)'::regprocedure
    )) - length(replace(pg_get_functiondef(
      'public.commission_process_package_shadow_event_2026083003(uuid,uuid)'::regprocedure
    ), 'marginal_ticket_tier', ''))
  ) / length('marginal_ticket_tier') < 2 then
    raise exception 'Package processor does not accept marginal passenger tiers';
  end if;

  select * into profile_row
  from public.employee_commission_profiles
  where employee_id = '42000000-0000-0000-0000-000000000006'
    and cancelled_at is null
  order by effective_from desc
  limit 1;

  configuration_value := jsonb_set(
    profile_row.configuration,
    '{services}',
    profile_row.configuration -> 'services' || jsonb_build_array(
      jsonb_build_object(
        'sourceModule', 'applications',
        'serviceCode', 'application_nadra_urgent',
        'recipientRole', 'application_agent',
        'components', jsonb_build_array(jsonb_build_object(
          'componentType', 'fixed_per_event',
          'recipientRole', 'application_agent',
          'rateValue', 15,
          'eligibleServices', jsonb_build_array('application_nadra_urgent'),
          'config', jsonb_build_object('serviceCode', 'application_nadra_urgent', 'payCurrency', 'GBP')
        ))
      ),
      jsonb_build_object(
        'sourceModule', 'applications',
        'serviceCode', 'application_passport_pk_urgent',
        'recipientRole', 'application_agent',
        'components', jsonb_build_array(jsonb_build_object(
          'componentType', 'fixed_per_event',
          'recipientRole', 'application_agent',
          'rateValue', 25,
          'eligibleServices', jsonb_build_array('application_passport_pk_urgent'),
          'config', jsonb_build_object('serviceCode', 'application_passport_pk_urgent', 'payCurrency', 'GBP')
        ))
      )
    )
  );

  result_value := public.commission_replace_employee_profile_2026083006(
    '42000000-0000-0000-0000-000000000001',
    profile_row.id,
    'Application agreement corrected',
    profile_row.effective_from,
    profile_row.location_id,
    configuration_value,
    'Add separate urgent application rates',
    'urgent-profile-replace-0001'
  );
  if result_value ->> 'replacedProfileId' <> profile_row.id::text then
    raise exception 'Profile overwrite did not identify its predecessor: %', result_value;
  end if;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = profile_row.id and cancelled_at is not null
      and cancellation_reason like '[removed] [overwritten]%'
  ) then raise exception 'Overwritten profile was not archived for audit'; end if;
  if (
    select count(*) from public.employee_commission_assignments assignment
    where assignment.profile_id = (result_value ->> 'id')::uuid
      and assignment.service_code in ('application_nadra_urgent', 'application_passport_pk_urgent')
  ) <> 2 then raise exception 'Urgent Application assignments were not created'; end if;

  result_value := public.commission_replace_employee_profile_2026083006(
    '42000000-0000-0000-0000-000000000001', profile_row.id,
    'Application agreement corrected', profile_row.effective_from, profile_row.location_id,
    configuration_value, 'Add separate urgent application rates',
    'urgent-profile-replace-0001'
  );
  if result_value ->> 'idempotentReplay' <> 'true' then
    raise exception 'Profile overwrite replay was not idempotent: %', result_value;
  end if;
end
$assert_capability_and_overwrite$;

insert into public.nicop_cnic_details (id, service_option)
values ('80000000-0000-0000-0000-000000000101', 'Executive')
on conflict (id) do update set service_option = excluded.service_option;

insert into public.pakistani_passport_applications (
  id, employee_id, application_date, status, is_refunded,
  application_type, category, speed, page_count, tracking_number
) values (
  '80000000-0000-0000-0000-000000000106',
  '42000000-0000-0000-0000-000000000006', current_timestamp,
  'Collected', false, 'Renewal', 'Ordinary', 'Executive', '36', 'PK-URGENT-106'
);

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001', 100, 'urgent-application-process-0001'
);

do $assert_urgent_rates$
declare nadra_amount numeric;
declare passport_amount numeric;
begin
  select coalesce(sum(entry.amount_gbp), 0) into nadra_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:nadra:80000000-0000-0000-0000-000000000101'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  select coalesce(sum(entry.amount_gbp), 0) into passport_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:passport_pk:80000000-0000-0000-0000-000000000106'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if nadra_amount <> 15 then
    raise exception 'Urgent NADRA application earned %, expected 15', nadra_amount;
  end if;
  if passport_amount <> 25 then
    raise exception 'Urgent Pakistani passport earned %, expected 25', passport_amount;
  end if;
  if not exists (
    select 1 from public.commission_source_events event
    where event.source_record_id = '80000000-0000-0000-0000-000000000101'
      and event.event_version >= 2
      and event.variables ->> 'service_code' = 'application_nadra_urgent'
  ) then raise exception 'NADRA urgency change did not emit a correction event'; end if;
end
$assert_urgent_rates$;

do $assert_remove_previous_plan$
declare profile_id_value uuid;
declare result_value jsonb;
begin
  select id into profile_id_value
  from public.employee_commission_profiles
  where employee_id = '42000000-0000-0000-0000-000000000007'
    and cancelled_at is null
  order by effective_from desc limit 1;
  result_value := public.commission_remove_employee_profile_2026083006(
    '42000000-0000-0000-0000-000000000001', profile_id_value,
    'Remove obsolete application plan', 'urgent-profile-remove-0001'
  );
  if result_value ->> 'removed' <> 'true'
    or exists (select 1 from public.employee_commission_assignments where profile_id = profile_id_value)
    or not exists (
      select 1 from public.employee_commission_profiles
      where id = profile_id_value and cancellation_reason like '[removed]%'
    )
  then raise exception 'Previous plan was not removed safely: %', result_value; end if;
end
$assert_remove_previous_plan$;
