\set ON_ERROR_STOP on

do $create_application_profiles$
declare
  first_configuration jsonb;
  second_configuration jsonb;
  application_services jsonb;
  backfilled_event public.commission_source_events%rowtype;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083005
    or public.commission_schema_status() ->> 'applicationIntegrationReady' <> 'true'
  then
    raise exception 'Commission Application capability 2026083005 is not ready';
  end if;

  select * into backfilled_event
  from public.commission_source_events event
  where event.source_module = 'applications'
    and event.source_fact_key =
      'application:nadra:80000000-0000-0000-0000-000000000101';
  if not found
    or backfilled_event.event_version <> 1
    or backfilled_event.event_type <> 'application_completed'
    or backfilled_event.effective_on <> (current_date - 1)
    or backfilled_event.variables ->> 'service_code' <> 'application_nadra'
  then
    raise exception 'Existing completed NADRA work was not backfilled correctly: %',
      backfilled_event;
  end if;

  application_services := jsonb_build_array(
    jsonb_build_object(
      'sourceModule', 'applications',
      'serviceCode', 'application_nadra',
      'recipientRole', 'application_agent',
      'components', jsonb_build_array(jsonb_build_object(
        'componentType', 'fixed_per_event',
        'recipientRole', 'application_agent',
        'rateValue', 10,
        'eligibleServices', jsonb_build_array('application_nadra'),
        'config', jsonb_build_object(
          'serviceCode', 'application_nadra', 'payCurrency', 'GBP'
        )
      ))
    ),
    jsonb_build_object(
      'sourceModule', 'applications',
      'serviceCode', 'application_passport_pk',
      'recipientRole', 'application_agent',
      'components', jsonb_build_array(jsonb_build_object(
        'componentType', 'fixed_per_event',
        'recipientRole', 'application_agent',
        'rateValue', 20,
        'eligibleServices', jsonb_build_array('application_passport_pk'),
        'config', jsonb_build_object(
          'serviceCode', 'application_passport_pk', 'payCurrency', 'GBP'
        )
      ))
    ),
    jsonb_build_object(
      'sourceModule', 'applications',
      'serviceCode', 'application_passport_gb',
      'recipientRole', 'application_agent',
      'components', jsonb_build_array(jsonb_build_object(
        'componentType', 'fixed_per_event',
        'recipientRole', 'application_agent',
        'rateValue', 30,
        'eligibleServices', jsonb_build_array('application_passport_gb'),
        'config', jsonb_build_object(
          'serviceCode', 'application_passport_gb', 'payCurrency', 'GBP'
        )
      ))
    ),
    jsonb_build_object(
      'sourceModule', 'applications',
      'serviceCode', 'application_visa',
      'recipientRole', 'application_agent',
      'components', jsonb_build_array(jsonb_build_object(
        'componentType', 'fixed_per_event',
        'recipientRole', 'application_agent',
        'rateValue', 40,
        'eligibleServices', jsonb_build_array('application_visa'),
        'config', jsonb_build_object(
          'serviceCode', 'application_visa', 'payCurrency', 'GBP'
        )
      ))
    )
  );
  first_configuration := jsonb_build_object(
    'uiVersion', 4,
    'draft', '{}'::jsonb,
    'services', application_services
  );
  second_configuration := jsonb_set(
    jsonb_build_object(
      'uiVersion', 4,
      'draft', '{}'::jsonb,
      'services', application_services
    ),
    '{services,2,components,0,rateValue}',
    '35'::jsonb
  );

  perform public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000006',
    'Application agreement',
    date_trunc('month', current_date)::date,
    null,
    null,
    first_configuration,
    'Application completion commission test',
    'application-profile-create-0001'
  );
  perform public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000007',
    'Application agreement two',
    date_trunc('month', current_date)::date,
    null,
    null,
    second_configuration,
    'Application reassignment commission test',
    'application-profile-create-0002'
  );

  if (
    select count(*)
    from public.employee_commission_assignments assignment
    where assignment.employee_id in (
      '42000000-0000-0000-0000-000000000006',
      '42000000-0000-0000-0000-000000000007'
    )
      and assignment.source_module = 'applications'
      and assignment.recipient_role = 'application_agent'
  ) <> 8
  then raise exception 'Application profiles did not create eight independent assignments'; end if;
end
$create_application_profiles$;

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-backfill-0001'
);

do $assert_backfilled_earning$
declare active_amount numeric;
begin
  select coalesce(sum(entry.amount_gbp), 0) into active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:nadra:80000000-0000-0000-0000-000000000101'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_amount <> 10 then
    raise exception 'Backfilled NADRA completion earned %, expected 10', active_amount;
  end if;
end
$assert_backfilled_earning$;

insert into public.pakistani_passport_applications (
  id, employee_id, application_date, status, is_refunded,
  application_type, category, speed, page_count, tracking_number
)
values (
  '80000000-0000-0000-0000-000000000102',
  '42000000-0000-0000-0000-000000000006',
  current_timestamp,
  'Processing',
  false,
  'Renewal',
  'Ordinary',
  'Normal',
  '36',
  'PK-COMMISSION-102'
);

do $assert_pending_application_has_no_event$
begin
  if exists (
    select 1 from public.commission_source_events event
    where event.source_module = 'applications'
      and event.source_record_id = '80000000-0000-0000-0000-000000000102'
  ) then raise exception 'An unfinished Pakistani passport emitted Commission work'; end if;
end
$assert_pending_application_has_no_event$;

update public.pakistani_passport_applications
set status = 'Collected'
where id = '80000000-0000-0000-0000-000000000102';

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-pakistani-0001'
);

do $assert_collected_passport_earning$
declare active_amount numeric;
begin
  select coalesce(sum(entry.amount_gbp), 0) into active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:passport_pk:80000000-0000-0000-0000-000000000102'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_amount <> 20 then
    raise exception 'Collected Pakistani passport earned %, expected 20', active_amount;
  end if;
end
$assert_collected_passport_earning$;

update public.pakistani_passport_applications
set is_refunded = true, refunded_at = current_timestamp
where id = '80000000-0000-0000-0000-000000000102';

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-refund-0001'
);

do $assert_refund_reversal$
declare active_amount numeric;
begin
  select coalesce(sum(entry.amount_gbp), 0) into active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:passport_pk:80000000-0000-0000-0000-000000000102'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_amount <> 0 then
    raise exception 'Refunded Pakistani passport retained active earnings: %', active_amount;
  end if;
  if not exists (
    select 1 from public.commission_source_events event
    where event.source_record_id = '80000000-0000-0000-0000-000000000102'
      and event.event_version = 2
      and event.event_type = 'application_reversed'
      and event.variables ->> 'refunded' = 'true'
  ) then raise exception 'Passport refund did not emit a reversal correction'; end if;
end
$assert_refund_reversal$;

insert into public.british_passport_applications (
  id, employee_id, application_date, status, age_group, pages, service_type, pex_number
)
values (
  '80000000-0000-0000-0000-000000000103',
  '42000000-0000-0000-0000-000000000006',
  current_timestamp,
  'Completed',
  'Adult',
  'Standard',
  'Normal',
  'PEX-COMMISSION-103'
);

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-gb-initial-0001'
);

update public.british_passport_applications
set employee_id = '42000000-0000-0000-0000-000000000007'
where id = '80000000-0000-0000-0000-000000000103';

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-gb-reassigned-0001'
);

do $assert_reassigned_application$
declare active_amount numeric;
declare paid_employee uuid;
begin
  select coalesce(sum(entry.amount_gbp), 0) into active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:passport_gb:80000000-0000-0000-0000-000000000103'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  select entry.recipient_employee_id into paid_employee
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:passport_gb:80000000-0000-0000-0000-000000000103'
    and entry.amount_gbp > 0
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_amount <> 35
    or paid_employee <> '42000000-0000-0000-0000-000000000007'
  then
    raise exception 'Reassigned British passport did not leave only the new 35 earning';
  end if;
end
$assert_reassigned_application$;

insert into public.visa_applications (
  id, employee_id, application_date, status, visa_country_id, visa_type_id,
  validity, is_part_of_package, package_id, internal_tracking_number
)
values (
  '80000000-0000-0000-0000-000000000104',
  '42000000-0000-0000-0000-000000000006',
  current_timestamp,
  'Completed',
  '82000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000002',
  '90 days',
  true,
  '82000000-0000-0000-0000-000000000003',
  'VISA-COMMISSION-104'
);

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-visa-initial-0001'
);

delete from public.visa_applications
where id = '80000000-0000-0000-0000-000000000104';

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'application-process-visa-delete-0001'
);

do $assert_delete_reversal_and_overview$
declare active_amount numeric;
declare overview jsonb;
declare applications jsonb;
begin
  select coalesce(sum(entry.amount_gbp), 0) into active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'applications:application:visa:80000000-0000-0000-0000-000000000104'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_amount <> 0 then
    raise exception 'Deleted Visa application retained active earnings: %', active_amount;
  end if;
  if not exists (
    select 1 from public.commission_source_events event
    where event.source_record_id = '80000000-0000-0000-0000-000000000104'
      and event.event_version = 2
      and event.event_type = 'application_reversed'
      and event.variables ->> 'deleted' = 'true'
  ) then raise exception 'Visa deletion did not emit a reversal correction'; end if;

  overview := public.commission_source_module_overview_2026083005(
    '42000000-0000-0000-0000-000000000001'
  );
  select value into applications
  from jsonb_array_elements(overview)
  where value ->> 'sourceModule' = 'applications';
  if applications is null
    or (applications ->> 'processedEvents')::integer < 7
    or (applications ->> 'closedRecordsMissingEvent')::integer <> 0
    or (applications ->> 'closedRecordsMissingOwner')::integer <> 0
    or (applications ->> 'totalGbp')::numeric <> 45
  then raise exception 'Application source-module overview is incomplete: %', overview; end if;
end
$assert_delete_reversal_and_overview$;

select 'commission application shadow integration assertions passed' as result;
