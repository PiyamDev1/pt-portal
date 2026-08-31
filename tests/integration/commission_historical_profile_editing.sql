\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('42000000-0000-0000-0000-000000000008', 'historical-profile@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values (
  '42000000-0000-0000-0000-000000000008',
  'Historical Profile Agent',
  'historical-profile@example.test',
  '12000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

do $assert_historical_profile_editing$
declare
  source_configuration jsonb;
  corrected_configuration jsonb;
  historical_profile_id uuid := '43000000-0000-0000-0000-000000000081';
  successor_profile_id uuid := '43000000-0000-0000-0000-000000000082';
  replacement_profile_id uuid;
  historical_start date := current_date - 730;
  historical_end date := current_date - 366;
  successor_start date := current_date - 365;
  service_count integer;
  visa_index integer;
  result_value jsonb;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083008
    or public.commission_schema_status() ->> 'historicalProfileEditingReady' <> 'true'
  then
    raise exception 'Commission historical profile editing capability is not ready';
  end if;
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.commission_exceptions'::regclass
      and constraint_row.conname = 'commission_exceptions_code_check'
      and position('missing_exchange_rate' in pg_get_constraintdef(constraint_row.oid)) > 0
  ) then
    raise exception 'The missing exchange-rate exception is not permitted';
  end if;

  select configuration into source_configuration
  from public.employee_commission_profiles
  where employee_id = '42000000-0000-0000-0000-000000000006'
    and cancelled_at is null
  order by effective_from desc
  limit 1;
  if source_configuration is null then
    raise exception 'Historical editing fixture could not find a complete source configuration';
  end if;
  source_configuration := jsonb_set(
    source_configuration,
    '{draft,employeeId}',
    to_jsonb('42000000-0000-0000-0000-000000000008'::text),
    true
  );
  service_count := jsonb_array_length(source_configuration -> 'services');

  insert into public.employee_commission_profiles (
    id, employee_id, label, effective_from, effective_to, location_id,
    configuration, change_reason, created_by
  ) values (
    historical_profile_id,
    '42000000-0000-0000-0000-000000000008',
    'Commission 2025',
    historical_start,
    historical_end,
    null,
    source_configuration,
    'Initial historical policy fixture',
    '42000000-0000-0000-0000-000000000001'
  );
  insert into public.employee_commission_profiles (
    id, employee_id, label, effective_from, effective_to, location_id,
    configuration, change_reason, created_by
  ) values (
    successor_profile_id,
    '42000000-0000-0000-0000-000000000008',
    'Commission 2026',
    successor_start,
    null,
    null,
    source_configuration,
    'Successor policy fixture',
    '42000000-0000-0000-0000-000000000001'
  );

  select service.ordinality::integer - 1 into visa_index
  from jsonb_array_elements(source_configuration -> 'services')
    with ordinality as service(value, ordinality)
  where service.value ->> 'serviceCode' = 'application_visa';
  corrected_configuration := jsonb_set(
    source_configuration,
    array['services', visa_index::text, 'components', '0', 'rateValue'],
    '77'::jsonb
  );

  result_value := public.commission_replace_employee_profile_2026083008(
    '42000000-0000-0000-0000-000000000001',
    historical_profile_id,
    'Commission 2025 corrected',
    historical_start,
    null,
    corrected_configuration,
    'Correct the previous Application commission policy',
    'historical-profile-replace-0001'
  );
  replacement_profile_id := (result_value ->> 'id')::uuid;

  if result_value ->> 'historicalEdit' <> 'true'
    or result_value ->> 'replacedProfileId' <> historical_profile_id::text
  then
    raise exception 'Historical replacement result is incomplete: %', result_value;
  end if;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = historical_profile_id
      and cancelled_at is not null
      and cancellation_reason like '[overwritten] Historical correction:%'
  ) then
    raise exception 'The prior historical snapshot was not archived';
  end if;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = replacement_profile_id
      and effective_from = historical_start
      and effective_to = historical_end
      and cancelled_at is null
  ) then
    raise exception 'The corrected historical snapshot did not retain its exact dates';
  end if;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = successor_profile_id
      and effective_from = successor_start
      and effective_to is null
      and cancelled_at is null
  ) then
    raise exception 'Editing history changed the successor plan';
  end if;
  if (
    select count(*) from public.employee_commission_assignments
    where profile_id = replacement_profile_id
      and start_date = historical_start
      and effective_to = historical_end
  ) <> service_count then
    raise exception 'Corrected historical assignments were not bounded to the original period';
  end if;
  if not exists (
    select 1
    from public.employee_commission_assignments assignment
    join public.commission_policy_components component
      on component.policy_version_id = assignment.policy_version_id
    where assignment.profile_id = replacement_profile_id
      and assignment.service_code = 'application_visa'
      and component.rate_value = 77
  ) then
    raise exception 'The corrected historical Application rate was not materialised';
  end if;

  result_value := public.commission_replace_employee_profile_2026083008(
    '42000000-0000-0000-0000-000000000001',
    historical_profile_id,
    'Commission 2025 corrected',
    historical_start,
    null,
    corrected_configuration,
    'Correct the previous Application commission policy',
    'historical-profile-replace-0001'
  );
  if result_value ->> 'idempotentReplay' <> 'true'
    or result_value ->> 'id' <> replacement_profile_id::text
  then
    raise exception 'Historical replacement replay was not idempotent: %', result_value;
  end if;

  begin
    perform public.commission_replace_employee_profile_2026083008(
      '42000000-0000-0000-0000-000000000001',
      replacement_profile_id,
      'Commission 2025 corrected again',
      historical_start + 1,
      null,
      corrected_configuration,
      'Attempt to move a historical plan boundary',
      'historical-profile-move-0001'
    );
    raise exception 'Historical editing allowed its effective date to move';
  exception when sqlstate '22023' then
    if sqlerrm <> 'A previous plan keeps its original effective date' then raise; end if;
  end;
end
$assert_historical_profile_editing$;
