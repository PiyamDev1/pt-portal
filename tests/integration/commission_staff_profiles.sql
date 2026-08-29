\set ON_ERROR_STOP on

insert into public.roles (id, name, level)
values
  ('12000000-0000-0000-0000-000000000001', 'Admin', 90),
  ('12000000-0000-0000-0000-000000000002', 'Employee', 1)
on conflict (id) do nothing;

insert into auth.users (id, email)
values
  ('42000000-0000-0000-0000-000000000001', 'profile-admin@example.test'),
  ('42000000-0000-0000-0000-000000000002', 'profile-source@example.test'),
  ('42000000-0000-0000-0000-000000000003', 'profile-target@example.test'),
  ('42000000-0000-0000-0000-000000000004', 'profile-other@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values
  (
    '42000000-0000-0000-0000-000000000001', 'Profile Admin',
    'profile-admin@example.test', '12000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '42000000-0000-0000-0000-000000000002', 'Profile Source',
    'profile-source@example.test', '12000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '42000000-0000-0000-0000-000000000003', 'Profile Target',
    'profile-target@example.test', '12000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '42000000-0000-0000-0000-000000000004', 'Profile Other',
    'profile-other@example.test', '12000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

do $profile_creation$
declare
  configuration jsonb := $json$
    {
      "uiVersion": 1,
      "draft": {},
      "services": [
        {
          "sourceModule": "ticketing",
          "serviceCode": "tk_primary",
          "recipientRole": "primary",
          "components": [{
            "componentType": "fixed_per_unit",
            "sourceVariable": "passenger_ticket_count",
            "recipientRole": "primary",
            "rateValue": 5,
            "eligibleServices": ["tk_primary"],
            "config": {"serviceCode": "tk_primary"}
          }]
        },
        {
          "sourceModule": "ticketing",
          "serviceCode": "tk_assistance",
          "recipientRole": "assistant",
          "components": [{
            "componentType": "explicit_zero",
            "recipientRole": "assistant",
            "rateValue": 0,
            "eligibleServices": ["tk_assistance"],
            "config": {"serviceCode": "tk_assistance"}
          }]
        },
        {
          "sourceModule": "ticketing",
          "serviceCode": "dc",
          "recipientRole": "primary",
          "components": [{
            "componentType": "fixed_per_event",
            "recipientRole": "primary",
            "rateValue": 5,
            "eligibleServices": ["dc"],
            "config": {"serviceCode": "dc"}
          }]
        },
        {
          "sourceModule": "ticketing",
          "serviceCode": "r_er",
          "recipientRole": "primary",
          "components": [{
            "componentType": "explicit_zero",
            "recipientRole": "primary",
            "rateValue": 0,
            "eligibleServices": ["r_er"],
            "config": {"serviceCode": "r_er"}
          }]
        },
        {
          "sourceModule": "ticketing",
          "serviceCode": "low_fare",
          "recipientRole": "low_fare_actor",
          "components": [{
            "componentType": "percentage_of_variable",
            "sourceVariable": "difference_gbp",
            "recipientRole": "low_fare_actor",
            "rateValue": 10,
            "eligibleServices": ["low_fare"],
            "config": {"serviceCode": "low_fare"}
          }]
        },
        {
          "sourceModule": "ticketing",
          "serviceCode": "higher_fare",
          "recipientRole": "low_fare_actor",
          "components": [{
            "componentType": "signed_percentage",
            "sourceVariable": "difference_gbp",
            "recipientRole": "low_fare_actor",
            "rateValue": 100,
            "eligibleServices": ["higher_fare"],
            "config": {"serviceCode": "higher_fare"}
          }]
        },
        {
          "sourceModule": "packages",
          "serviceCode": "package_sale",
          "recipientRole": "package_sales",
          "components": [{
            "componentType": "explicit_zero",
            "recipientRole": "package_sales",
            "rateValue": 0,
            "eligibleServices": ["package_sale"],
            "config": {"serviceCode": "package_sale"}
          }]
        }
      ]
    }
  $json$::jsonb;
  source_result jsonb;
  target_result jsonb;
  source_profile_id uuid;
  target_profile_id uuid;
  source_version_id uuid;
  month_start date := date_trunc('month', current_date)::date;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026082904 then
    raise exception 'Commission staff-profile capability 2026082904 is not ready';
  end if;

  source_result := public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000002',
    'Source agreement', month_start, null, null, configuration,
    'Initial source employee agreement', 'profile-source-create-0001'
  );
  source_profile_id := (source_result ->> 'id')::uuid;
  if (select count(*) from public.employee_commission_assignments
      where profile_id = source_profile_id) <> 7
  then raise exception 'Source profile did not create seven independent assignments'; end if;
  if (select count(*) from public.commission_rules
      where profile_id = source_profile_id) <> 7
  then raise exception 'Source profile did not create seven independent rules'; end if;

  target_result := public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000003',
    'Copied agreement', month_start, null, source_profile_id, configuration,
    'One-time copy for target employee', 'profile-target-create-0001'
  );
  target_profile_id := (target_result ->> 'id')::uuid;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = target_profile_id and copied_from_profile_id = source_profile_id
  ) then raise exception 'Copied profile provenance was not stored'; end if;
  if exists (
    select 1
    from public.employee_commission_assignments source_assignment
    join public.employee_commission_assignments target_assignment
      on target_assignment.policy_version_id = source_assignment.policy_version_id
    where source_assignment.profile_id = source_profile_id
      and target_assignment.profile_id = target_profile_id
  ) then raise exception 'Copied employees unexpectedly share a mutable policy version'; end if;

  select policy_version_id into source_version_id
  from public.employee_commission_assignments
  where profile_id = source_profile_id
  order by id
  limit 1;
  begin
    perform public.commission_create_assignment_2026082901(
      '42000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000004', source_version_id,
      'ticketing', 'tk_primary', 'primary', null,
      month_start, null, 'profile-cross-assignment-0001'
    );
    raise exception 'Employee-owned policy was assigned outside its profile transaction';
  exception when insufficient_privilege then
    null;
  end;
end
$profile_creation$;

do $scheduled_replacement_and_cancel$
declare
  current_profile public.employee_commission_profiles%rowtype;
  scheduled_result jsonb;
  scheduled_profile_id uuid;
  future_start date := (date_trunc('month', current_date) + interval '1 month')::date;
  cancel_result jsonb;
begin
  select * into current_profile
  from public.employee_commission_profiles
  where employee_id = '42000000-0000-0000-0000-000000000003'
    and cancelled_at is null;

  scheduled_result := public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    current_profile.employee_id,
    'Scheduled target update', future_start, null, current_profile.id,
    current_profile.configuration,
    'Scheduled independent target update', 'profile-target-update-0001'
  );
  scheduled_profile_id := (scheduled_result ->> 'id')::uuid;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = current_profile.id and effective_to = future_start - 1
  ) then raise exception 'Scheduling did not close the preceding profile'; end if;

  cancel_result := public.commission_cancel_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    scheduled_profile_id,
    'Scheduled agreement entered in error',
    'profile-target-cancel-0001'
  );
  if cancel_result ->> 'cancelled' <> 'true' then
    raise exception 'Scheduled cancellation did not report success: %', cancel_result;
  end if;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = scheduled_profile_id and cancelled_at is not null
      and cancellation_reason = 'Scheduled agreement entered in error'
  ) then raise exception 'Scheduled profile cancellation was not retained'; end if;
  if exists (
    select 1 from public.employee_commission_assignments
    where profile_id = scheduled_profile_id
  ) then raise exception 'Cancelled future assignments were retained'; end if;
  if not exists (
    select 1 from public.employee_commission_profiles
    where id = current_profile.id and effective_to is null
  ) or exists (
    select 1 from public.employee_commission_assignments
    where profile_id = current_profile.id and effective_to is not null
  ) then raise exception 'Cancellation did not restore the preceding agreement'; end if;

  cancel_result := public.commission_cancel_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    scheduled_profile_id,
    'Scheduled agreement entered in error',
    'profile-target-cancel-0001'
  );
  if cancel_result ->> 'idempotentReplay' <> 'true' then
    raise exception 'Cancellation replay was not idempotent: %', cancel_result;
  end if;
end
$scheduled_replacement_and_cancel$;

do $immutability_and_privilege$
declare
  profile_id_value uuid;
begin
  select id into profile_id_value
  from public.employee_commission_profiles
  where employee_id = '42000000-0000-0000-0000-000000000002'
  limit 1;
  begin
    update public.employee_commission_profiles
    set label = 'Mutated label'
    where id = profile_id_value;
    raise exception 'Profile snapshot accepted a direct metadata edit';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  if has_table_privilege('authenticated', 'public.employee_commission_profiles', 'SELECT')
    or has_function_privilege(
      'authenticated',
      'public.commission_create_employee_profile_2026082904(uuid,uuid,text,date,uuid,uuid,jsonb,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.commission_cancel_employee_profile_2026082904(uuid,uuid,text,text)',
      'EXECUTE'
    )
  then raise exception 'Authenticated received direct Commission profile access'; end if;

  if not has_table_privilege('service_role', 'public.employee_commission_profiles', 'SELECT')
    or has_table_privilege('service_role', 'public.employee_commission_profiles', 'INSERT')
    or has_table_privilege('service_role', 'public.employee_commission_profiles', 'UPDATE')
  then
    raise exception 'Service access must be read-only outside the audited profile functions';
  end if;
end
$immutability_and_privilege$;

select 'commission staff profile assertions passed' as result;
