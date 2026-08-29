-- Employee-owned Commission profiles.
--
-- A profile is an effective-dated agreement snapshot for one employee. Reusing another
-- employee's setup is a one-time copy: each service receives its own immutable policy/version,
-- so later changes cannot alter the source employee or historical calculations.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $commission_profile_forward_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;
  if installed_version is null or installed_version < 2026082903 then
    raise exception 'Commission capability 2026082903 is required before employee profiles'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026082904 then
    raise exception 'Commission profile capability % cannot run after installed capability %',
      2026082904, installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$commission_profile_forward_guard$;

do $commission_profile_prerequisites$
begin
  if to_regprocedure(
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
  then
    raise exception 'Commission policy engine 2026082901 must be installed first'
      using errcode = '55000';
  end if;
end
$commission_profile_prerequisites$;

create table if not exists public.employee_commission_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  label text not null,
  effective_from date not null,
  effective_to date,
  location_id uuid references public.locations(id) on delete restrict,
  copied_from_profile_id uuid references public.employee_commission_profiles(id) on delete restrict,
  configuration jsonb not null,
  change_reason text not null,
  created_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.employees(id) on delete restrict,
  cancellation_reason text,
  constraint employee_commission_profiles_label_check
    check (length(btrim(label)) between 2 and 100),
  constraint employee_commission_profiles_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint employee_commission_profiles_configuration_check
    check (
      jsonb_typeof(configuration) = 'object'
      and jsonb_typeof(configuration -> 'services') = 'array'
      and jsonb_array_length(configuration -> 'services') between 1 and 8
    ),
  constraint employee_commission_profiles_reason_check
    check (length(btrim(change_reason)) between 8 and 500),
  constraint employee_commission_profiles_cancellation_check
    check (
      (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
      or (
        cancelled_at is not null
        and cancelled_by is not null
        and length(btrim(cancellation_reason)) between 8 and 500
      )
    )
);

alter table public.employee_commission_profiles
  add column if not exists cancelled_at timestamptz;
alter table public.employee_commission_profiles
  add column if not exists cancelled_by uuid references public.employees(id) on delete restrict;
alter table public.employee_commission_profiles
  add column if not exists cancellation_reason text;

do $commission_profile_cancellation_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employee_commission_profiles'::regclass
      and conname = 'employee_commission_profiles_cancellation_check'
  ) then
    alter table public.employee_commission_profiles
      add constraint employee_commission_profiles_cancellation_check
      check (
        (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
        or (
          cancelled_at is not null
          and cancelled_by is not null
          and length(btrim(cancellation_reason)) between 8 and 500
        )
      );
  end if;
end
$commission_profile_cancellation_constraint$;

alter table public.employee_commission_assignments
  add column if not exists profile_id uuid;
alter table public.commission_rules
  add column if not exists profile_id uuid;

do $commission_profile_assignment_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employee_commission_assignments'::regclass
      and conname = 'employee_commission_assignments_profile_id_fkey'
  ) then
    alter table public.employee_commission_assignments
      add constraint employee_commission_assignments_profile_id_fkey
      foreign key (profile_id)
      references public.employee_commission_profiles(id)
      on delete restrict;
  end if;
end
$commission_profile_assignment_fk$;

do $commission_profile_rule_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.commission_rules'::regclass
      and conname = 'commission_rules_profile_id_fkey'
  ) then
    alter table public.commission_rules
      add constraint commission_rules_profile_id_fkey
      foreign key (profile_id)
      references public.employee_commission_profiles(id)
      on delete restrict;
  end if;
end
$commission_profile_rule_fk$;

create index if not exists employee_commission_profiles_employee_dates_idx
  on public.employee_commission_profiles (
    employee_id,
    location_id,
    effective_from desc,
    effective_to
  );

create index if not exists employee_commission_profiles_active_dates_idx
  on public.employee_commission_profiles (employee_id, effective_from desc)
  where cancelled_at is null;

create index if not exists employee_commission_assignments_profile_idx
  on public.employee_commission_assignments (profile_id)
  where profile_id is not null;

create index if not exists commission_rules_profile_idx
  on public.commission_rules (profile_id)
  where profile_id is not null;

create or replace function public.commission_guard_profile_assignment_2026082904()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  owning_profile_id uuid;
  profile_row public.employee_commission_profiles%rowtype;
  context_profile_id uuid;
begin
  select rule.profile_id into owning_profile_id
  from public.commission_policy_versions version
  join public.commission_rules rule on rule.id = version.rule_id
  where version.id = new.policy_version_id;

  if owning_profile_id is null then
    if new.profile_id is not null then
      raise exception 'A standalone policy assignment cannot claim an employee profile'
        using errcode = '42501', hint = 'COMMISSION_PROFILE_ASSIGNMENT_FORBIDDEN';
    end if;
    return new;
  end if;

  begin
    context_profile_id := nullif(
      current_setting('pt_portal.commission_profile_id', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    context_profile_id := null;
  end;
  if context_profile_id is distinct from owning_profile_id then
    raise exception 'Employee-owned policies can only be assigned by their profile transaction'
      using errcode = '42501', hint = 'COMMISSION_PROFILE_ASSIGNMENT_FORBIDDEN';
  end if;

  select * into profile_row
  from public.employee_commission_profiles
  where id = owning_profile_id;
  if not found
    or profile_row.cancelled_at is not null
    or new.employee_id is distinct from profile_row.employee_id
    or new.location_id is distinct from profile_row.location_id
    or new.start_date is distinct from profile_row.effective_from
  then
    raise exception 'Employee-owned assignment does not match its profile snapshot'
      using errcode = '22023';
  end if;
  new.profile_id := owning_profile_id;
  return new;
end
$function$;

drop trigger if exists employee_commission_assignments_profile_guard_2904
  on public.employee_commission_assignments;
create trigger employee_commission_assignments_profile_guard_2904
  before insert or update of policy_version_id, employee_id, location_id, start_date, profile_id
  on public.employee_commission_assignments
  for each row execute function public.commission_guard_profile_assignment_2026082904();

create or replace function public.commission_guard_profile_policy_version_2026082904()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  owning_profile_id uuid;
  context_profile_id uuid;
begin
  select profile_id into owning_profile_id
  from public.commission_rules
  where id = new.rule_id;
  if owning_profile_id is null then return new; end if;

  begin
    context_profile_id := nullif(
      current_setting('pt_portal.commission_profile_id', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    context_profile_id := null;
  end;
  if context_profile_id is distinct from owning_profile_id then
    raise exception 'Employee-owned policy versions are controlled by their profile snapshot'
      using errcode = '42501', hint = 'COMMISSION_PROFILE_POLICY_FORBIDDEN';
  end if;
  return new;
end
$function$;

drop trigger if exists commission_policy_versions_profile_guard_2904
  on public.commission_policy_versions;
create trigger commission_policy_versions_profile_guard_2904
  before insert or update on public.commission_policy_versions
  for each row execute function public.commission_guard_profile_policy_version_2026082904();

create or replace function public.commission_guard_employee_profile_2026082904()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Commission employee profiles are append-only'
      using errcode = '55000';
  end if;

  if new.id is distinct from old.id
    or new.employee_id is distinct from old.employee_id
    or new.label is distinct from old.label
    or new.effective_from is distinct from old.effective_from
    or new.location_id is distinct from old.location_id
    or new.copied_from_profile_id is distinct from old.copied_from_profile_id
    or new.configuration is distinct from old.configuration
    or new.change_reason is distinct from old.change_reason
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Commission employee profile snapshots are immutable'
      using errcode = '55000';
  end if;

  if old.cancelled_at is not null
    and (
      new.cancelled_at is distinct from old.cancelled_at
      or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason
    )
  then
    raise exception 'A cancelled Commission profile is immutable'
      using errcode = '55000';
  end if;

  if new.cancelled_at is distinct from old.cancelled_at
    or new.cancelled_by is distinct from old.cancelled_by
    or new.cancellation_reason is distinct from old.cancellation_reason
  then
    if old.cancelled_at is not null
      or new.cancelled_at is null
      or new.cancelled_by is null
      or length(btrim(coalesce(new.cancellation_reason, ''))) not between 8 and 500
    then
      raise exception 'Invalid Commission profile cancellation'
        using errcode = '22023';
    end if;
  end if;

  if old.effective_to is not null
    and new.effective_to is distinct from old.effective_to
    and not exists (
      select 1
      from public.employee_commission_profiles cancelled_successor
      where cancelled_successor.employee_id = old.employee_id
        and cancelled_successor.location_id is not distinct from old.location_id
        and cancelled_successor.effective_from = old.effective_to + 1
        and cancelled_successor.cancelled_at is not null
    )
  then
    raise exception 'A closed Commission profile cannot be reopened or extended'
      using errcode = '55000';
  end if;

  if new.effective_to is not null and new.effective_to < new.effective_from then
    raise exception 'Commission profile end date cannot precede its start date'
      using errcode = '22023';
  end if;
  return new;
end
$function$;

drop trigger if exists employee_commission_profiles_guard_2904
  on public.employee_commission_profiles;
create trigger employee_commission_profiles_guard_2904
  before update or delete on public.employee_commission_profiles
  for each row execute function public.commission_guard_employee_profile_2026082904();

create or replace function public.commission_create_employee_profile_2026082904(
  p_actor_employee_id uuid,
  p_employee_id uuid,
  p_label text,
  p_effective_from date,
  p_location_id uuid,
  p_copied_from_profile_id uuid,
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
  profile_id_value uuid := gen_random_uuid();
  employee_name text;
  service jsonb;
  policy_result jsonb;
  version_result jsonb;
  assignment_result jsonb;
  result_json jsonb;
  assignments_json jsonb := '[]'::jsonb;
  closed_profile_ids jsonb := '[]'::jsonb;
  service_index integer := 0;
  service_code_value text;
  service_request_key text;
  rule_name_value text;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_employee_id is null
    or p_effective_from is null
    or length(btrim(coalesce(p_label, ''))) not between 2 and 100
    or length(btrim(coalesce(p_change_reason, ''))) not between 8 and 500
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 120
    or jsonb_typeof(p_configuration) is distinct from 'object'
    or jsonb_typeof(p_configuration -> 'services') is distinct from 'array'
    or jsonb_array_length(p_configuration -> 'services') not between 1 and 8
  then
    raise exception 'Invalid Commission employee-profile request'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile-request:' || p_actor_employee_id::text || ':' || p_request_key,
    0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'employee_profile.created'
    and request_key = p_request_key;
  if result_json is not null then
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile:' || p_employee_id::text || ':'
      || coalesce(p_location_id::text, 'all'),
    0
  ));

  select full_name into employee_name
  from public.employees
  where id = p_employee_id and is_active;
  if employee_name is null then
    raise exception 'Active employee was not found' using errcode = 'P0002';
  end if;
  if p_location_id is not null
    and not exists (select 1 from public.locations where id = p_location_id)
  then
    raise exception 'Commission profile location was not found' using errcode = 'P0002';
  end if;
  if p_copied_from_profile_id is not null
    and not exists (
      select 1 from public.employee_commission_profiles
      where id = p_copied_from_profile_id
    )
  then
    raise exception 'Copied Commission profile was not found' using errcode = 'P0002';
  end if;

  if p_effective_from < current_date
    and (
      exists (
        select 1 from public.employee_commission_profiles
        where employee_id = p_employee_id
          and location_id is not distinct from p_location_id
          and cancelled_at is null
      )
      or p_effective_from < date_trunc('month', current_date)::date
    )
  then
    raise exception 'A replacement cannot be backdated; an initial profile may start this month'
      using errcode = '22023', hint = 'COMMISSION_PROFILE_BACKDATE_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.employee_commission_profiles profile
    where profile.employee_id = p_employee_id
      and profile.location_id is not distinct from p_location_id
      and profile.cancelled_at is null
      and profile.effective_from >= p_effective_from
      and (profile.effective_to is null or profile.effective_to >= p_effective_from)
  ) then
    raise exception 'A current or scheduled profile already begins on or after this date'
      using errcode = '23P01', hint = 'COMMISSION_PROFILE_START_CONFLICT';
  end if;

  select coalesce(jsonb_agg(profile.id order by profile.effective_from), '[]'::jsonb)
  into closed_profile_ids
  from public.employee_commission_profiles profile
  where profile.employee_id = p_employee_id
    and profile.location_id is not distinct from p_location_id
    and profile.cancelled_at is null
    and profile.effective_from < p_effective_from
    and (profile.effective_to is null or profile.effective_to >= p_effective_from);

  update public.employee_commission_profiles profile
  set effective_to = p_effective_from - 1
  where profile.id in (
    select (value #>> '{}')::uuid from jsonb_array_elements(closed_profile_ids)
  );

  update public.employee_commission_assignments assignment
  set effective_to = p_effective_from - 1
  where assignment.profile_id in (
    select (value #>> '{}')::uuid from jsonb_array_elements(closed_profile_ids)
  )
    and assignment.start_date < p_effective_from
    and (assignment.effective_to is null or assignment.effective_to >= p_effective_from);

  insert into public.employee_commission_profiles (
    id,
    employee_id,
    label,
    effective_from,
    location_id,
    copied_from_profile_id,
    configuration,
    change_reason,
    created_by
  ) values (
    profile_id_value,
    p_employee_id,
    btrim(p_label),
    p_effective_from,
    p_location_id,
    p_copied_from_profile_id,
    p_configuration,
    btrim(p_change_reason),
    p_actor_employee_id
  );

  if (
    select count(*)
    from jsonb_array_elements(p_configuration -> 'services') item
  ) <> (
    select count(distinct item ->> 'serviceCode')
    from jsonb_array_elements(p_configuration -> 'services') item
  ) then
    raise exception 'A Commission profile cannot repeat a service'
      using errcode = '22023';
  end if;

  for service in
    select value from jsonb_array_elements(p_configuration -> 'services')
  loop
    service_index := service_index + 1;
    service_code_value := lower(btrim(service ->> 'serviceCode'));
    if service_code_value not in (
        'tk_primary', 'tk_assistance', 'dc', 'r_er',
        'low_fare', 'higher_fare', 'package_sale', 'sales_bonus'
      )
      or lower(btrim(service ->> 'recipientRole')) not in (
        'primary', 'assistant', 'low_fare_actor', 'package_sales', 'sales_bonus'
      )
      or jsonb_typeof(service -> 'components') is distinct from 'array'
      or jsonb_array_length(service -> 'components') < 1
    then
      raise exception 'Invalid Commission service configuration at position %', service_index
        using errcode = '22023';
    end if;

    if (
        service_code_value = 'package_sale'
        and lower(btrim(service ->> 'sourceModule')) <> 'packages'
      )
      or (
        service_code_value <> 'package_sale'
        and lower(btrim(service ->> 'sourceModule')) <> 'ticketing'
      )
      or (service_code_value = 'tk_primary' and service ->> 'recipientRole' <> 'primary')
      or (service_code_value = 'tk_assistance' and service ->> 'recipientRole' <> 'assistant')
      or (service_code_value in ('dc', 'r_er') and service ->> 'recipientRole' <> 'primary')
      or (
        service_code_value in ('low_fare', 'higher_fare')
        and service ->> 'recipientRole' <> 'low_fare_actor'
      )
      or (service_code_value = 'package_sale' and service ->> 'recipientRole' <> 'package_sales')
      or (service_code_value = 'sales_bonus' and service ->> 'recipientRole' <> 'sales_bonus')
    then
      raise exception 'Commission service and recipient role do not match at position %',
        service_index using errcode = '22023';
    end if;

    service_request_key := p_request_key || ':' || service_index::text;
    rule_name_value := left(
      employee_name || ' - ' || service_code_value || ' - '
        || p_effective_from::text || ' - ' || left(profile_id_value::text, 8),
      100
    );

    policy_result := public.commission_create_policy_2026082901(
      p_actor_employee_id,
      rule_name_value,
      'Employee-owned profile ' || profile_id_value::text || ' for ' || service_code_value,
      service_request_key || ':policy'
    );
    perform set_config('pt_portal.commission_profile_id', profile_id_value::text, true);
    update public.commission_rules
    set profile_id = profile_id_value
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
      p_employee_id,
      (version_result ->> 'id')::uuid,
      service ->> 'sourceModule',
      service_code_value,
      service ->> 'recipientRole',
      p_location_id,
      p_effective_from,
      null,
      service_request_key || ':assign'
    );

    assignments_json := assignments_json || jsonb_build_array(
      assignment_result || jsonb_build_object(
        'policyId', policy_result ->> 'id',
        'profileId', profile_id_value
      )
    );
  end loop;

  result_json := jsonb_build_object(
    'id', profile_id_value,
    'employeeId', p_employee_id,
    'label', btrim(p_label),
    'effectiveFrom', p_effective_from,
    'locationId', p_location_id,
    'copiedFromProfileId', p_copied_from_profile_id,
    'closedProfileIds', closed_profile_ids,
    'assignments', assignments_json,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    request_key
  ) values (
    p_actor_employee_id,
    'employee_profile.created',
    'employee_commission_profile',
    profile_id_value,
    btrim(p_change_reason),
    jsonb_build_object('closedProfileIds', closed_profile_ids),
    result_json,
    p_request_key
  );
  return result_json;
end
$function$;

create or replace function public.commission_cancel_employee_profile_2026082904(
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
  deleted_assignment_count integer := 0;
  result_json jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_profile_id is null
    or length(btrim(coalesce(p_reason, ''))) not between 8 and 500
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 120
  then
    raise exception 'Invalid Commission profile cancellation request'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile-cancel:' || p_actor_employee_id::text || ':' || p_request_key,
    0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'employee_profile.cancelled'
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
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-employee-profile:' || profile_row.employee_id::text || ':'
      || coalesce(profile_row.location_id::text, 'all'),
    0
  ));
  select * into profile_row
  from public.employee_commission_profiles
  where id = p_profile_id
  for update;
  if profile_row.cancelled_at is not null then
    raise exception 'Commission profile is already cancelled'
      using errcode = '55000', hint = 'COMMISSION_PROFILE_ALREADY_CANCELLED';
  end if;
  if profile_row.effective_from <= current_date then
    raise exception 'Only a future Commission profile can be cancelled'
      using errcode = '22023', hint = 'COMMISSION_PROFILE_ALREADY_EFFECTIVE';
  end if;

  select * into previous_profile
  from public.employee_commission_profiles previous
  where previous.employee_id = profile_row.employee_id
    and previous.location_id is not distinct from profile_row.location_id
    and previous.cancelled_at is null
    and previous.effective_from < profile_row.effective_from
  order by previous.effective_from desc
  limit 1
  for update;

  update public.employee_commission_profiles
  set cancelled_at = clock_timestamp(),
      cancelled_by = p_actor_employee_id,
      cancellation_reason = btrim(p_reason)
  where id = profile_row.id;

  delete from public.employee_commission_assignments
  where profile_id = profile_row.id;
  get diagnostics deleted_assignment_count = row_count;

  if previous_profile.id is not null
    and previous_profile.effective_to = profile_row.effective_from - 1
  then
    select * into next_profile
    from public.employee_commission_profiles next
    where next.employee_id = profile_row.employee_id
      and next.location_id is not distinct from profile_row.location_id
      and next.cancelled_at is null
      and next.effective_from > profile_row.effective_from
    order by next.effective_from
    limit 1;

    restored_effective_to := case
      when next_profile.id is null then null
      else next_profile.effective_from - 1
    end;
    update public.employee_commission_profiles
    set effective_to = restored_effective_to
    where id = previous_profile.id;
    update public.employee_commission_assignments
    set effective_to = restored_effective_to
    where profile_id = previous_profile.id
      and effective_to = profile_row.effective_from - 1;
  end if;

  result_json := jsonb_build_object(
    'id', profile_row.id,
    'employeeId', profile_row.employee_id,
    'cancelled', true,
    'restoredProfileId', previous_profile.id,
    'restoredEffectiveTo', restored_effective_to,
    'deletedAssignmentCount', deleted_assignment_count,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    request_key
  ) values (
    p_actor_employee_id,
    'employee_profile.cancelled',
    'employee_commission_profile',
    profile_row.id,
    btrim(p_reason),
    jsonb_build_object(
      'effectiveFrom', profile_row.effective_from,
      'effectiveTo', profile_row.effective_to,
      'employeeId', profile_row.employee_id
    ),
    result_json,
    p_request_key
  );
  return result_json;
end
$function$;

alter table public.employee_commission_profiles enable row level security;
drop policy if exists "Service role manages employee_commission_profiles"
  on public.employee_commission_profiles;
create policy "Service role manages employee_commission_profiles"
  on public.employee_commission_profiles
  for all to service_role using (true) with check (true);

revoke all on table public.employee_commission_profiles from public, anon, authenticated;
revoke all on table public.employee_commission_profiles from service_role;
grant select on table public.employee_commission_profiles to service_role;

revoke all on function public.commission_guard_employee_profile_2026082904() from public;
revoke all on function public.commission_guard_profile_assignment_2026082904() from public;
revoke all on function public.commission_guard_profile_policy_version_2026082904() from public;
revoke all on function public.commission_create_employee_profile_2026082904(
  uuid, uuid, text, date, uuid, uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.commission_create_employee_profile_2026082904(
  uuid, uuid, text, date, uuid, uuid, jsonb, text, text
) to service_role;

revoke all on function public.commission_cancel_employee_profile_2026082904(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.commission_cancel_employee_profile_2026082904(
  uuid, uuid, text, text
) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026082904,
  clock_timestamp(),
  jsonb_build_object(
    'migration', '20260829_commission_staff_profiles.sql',
    'mode', 'shadow',
    'capabilities', jsonb_build_array(
      'employee-owned-profile-snapshots',
      'one-time-profile-copy',
      'effective-dated-profile-replacement',
      'scheduled-profile-cancellation',
      'independent-service-policy-versions'
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
    'version', coalesce(version, 0),
    'requiredVersion', 2026082904,
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
