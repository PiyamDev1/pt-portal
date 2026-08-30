\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('42000000-0000-0000-0000-000000000005', 'profile-historical@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values (
  '42000000-0000-0000-0000-000000000005',
  'Profile Historical',
  'profile-historical@example.test',
  '12000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

do $past_effective_dates$
declare
  admin_id constant uuid := '42000000-0000-0000-0000-000000000001';
  employee_id_value constant uuid := '42000000-0000-0000-0000-000000000005';
  configuration jsonb;
  initial_start date := (date_trunc('month', current_date) - interval '12 months')::date;
  replacement_start date := (date_trunc('month', current_date) - interval '6 months')::date;
  conflicting_start date := (date_trunc('month', current_date) - interval '9 months')::date;
  initial_result jsonb;
  replacement_result jsonb;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083002 then
    raise exception 'Commission effective-date capability 2026083002 is not ready';
  end if;

  select profile.configuration into configuration
  from public.employee_commission_profiles profile
  where profile.employee_id = '42000000-0000-0000-0000-000000000002'
    and profile.cancelled_at is null
  order by profile.effective_from desc
  limit 1;

  initial_result := public.commission_create_employee_profile_2026082904(
    admin_id,
    employee_id_value,
    'Historical initial commission',
    initial_start,
    null,
    null,
    configuration,
    'Historical initial agreement entered after the fact',
    'profile-past-initial-0001'
  );
  if (initial_result ->> 'effectiveFrom')::date <> initial_start then
    raise exception 'Initial historical Commission date was not accepted: %', initial_result;
  end if;

  replacement_result := public.commission_create_employee_profile_2026082904(
    admin_id,
    employee_id_value,
    'Historical replacement commission',
    replacement_start,
    null,
    null,
    configuration,
    'Historical replacement with a conflict-free boundary',
    'profile-past-replacement-0001'
  );
  if (replacement_result ->> 'effectiveFrom')::date <> replacement_start
    or not exists (
      select 1
      from public.employee_commission_profiles profile
      where profile.id = (initial_result ->> 'id')::uuid
        and profile.effective_to = replacement_start - 1
    )
  then
    raise exception 'Historical replacement did not close the preceding plan correctly';
  end if;

  begin
    perform public.commission_create_employee_profile_2026082904(
      admin_id,
      employee_id_value,
      'Conflicting historical commission',
      conflicting_start,
      null,
      null,
      configuration,
      'This request must conflict with the existing timeline',
      'profile-past-conflict-0001'
    );
    raise exception 'Conflicting historical Commission date was accepted';
  exception when exclusion_violation then
    if sqlerrm not like '%effective date conflicts%' then
      raise;
    end if;
  end;
end
$past_effective_dates$;

select 'commission profile effective-date assertions passed' as result;
