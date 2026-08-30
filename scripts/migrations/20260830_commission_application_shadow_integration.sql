-- Commission capability 2026083005.
-- Adds completion-based NADRA, Pakistani passport, British passport, and Visa
-- work to the immutable, correction-safe Commission shadow ledger.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083004 then
    raise exception 'Commission capability 2026083004 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083005 then
    raise exception 'Refusing to replay Commission capability 2026083005 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

alter table public.commission_policy_components
  drop constraint if exists commission_policy_components_recipient_check;
alter table public.commission_policy_components
  add constraint commission_policy_components_recipient_check check (recipient_role in (
    'primary', 'assistant', 'low_fare_actor', 'package_sales',
    'application_agent', 'sales_bonus'
  ));

alter table public.employee_commission_assignments
  drop constraint if exists employee_commission_assignments_scope_check;
alter table public.employee_commission_assignments
  add constraint employee_commission_assignments_scope_check check (
    source_module in ('ticketing', 'packages', 'applications')
    and service_code in (
      'tk_primary', 'tk_assistance', 'dc', 'r_er', 'low_fare',
      'higher_fare', 'package_sale', 'application_nadra',
      'application_passport_pk', 'application_passport_gb', 'application_visa',
      'sales_bonus'
    )
    and recipient_role in (
      'primary', 'assistant', 'low_fare_actor', 'package_sales',
      'application_agent', 'sales_bonus'
    )
  );

alter table public.employee_commission_profiles
  drop constraint if exists employee_commission_profiles_configuration_check;
alter table public.employee_commission_profiles
  add constraint employee_commission_profiles_configuration_check check (
    jsonb_typeof(configuration) = 'object'
    and jsonb_typeof(configuration -> 'services') = 'array'
    and jsonb_array_length(configuration -> 'services') between 1 and 16
  );

do $upgrade_profile_creation$
declare
  signature constant regprocedure :=
    'public.commission_create_employee_profile_2026082904(uuid,uuid,text,date,uuid,uuid,jsonb,text,text)'::regprocedure;
  definition text;
  updated_definition text;
  old_fragment text;
  new_fragment text;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position($needle$'application_nadra'$needle$ in definition) > 0 then
    return;
  end if;

  updated_definition := replace(
    definition,
    $old$jsonb_array_length(p_configuration -> 'services') not between 1 and 8$old$,
    $new$jsonb_array_length(p_configuration -> 'services') not between 1 and 16$new$
  );
  if updated_definition = definition then
    raise exception 'Commission application profile-size upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$      'tk_primary', 'tk_assistance', 'dc', 'r_er',
        'low_fare', 'higher_fare', 'package_sale', 'sales_bonus'$old$;
  new_fragment := $new$      'tk_primary', 'tk_assistance', 'dc', 'r_er',
        'low_fare', 'higher_fare', 'package_sale', 'application_nadra',
        'application_passport_pk', 'application_passport_gb', 'application_visa',
        'sales_bonus'$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission application service-code upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$      'primary', 'assistant', 'low_fare_actor', 'package_sales', 'sales_bonus'$old$;
  new_fragment := $new$      'primary', 'assistant', 'low_fare_actor', 'package_sales',
        'application_agent', 'sales_bonus'$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission application recipient-role upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$    if (
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
    then$old$;
  new_fragment := $new$    if (
        service_code_value = 'package_sale'
        and lower(btrim(service ->> 'sourceModule')) <> 'packages'
      )
      or (
        service_code_value in (
          'application_nadra', 'application_passport_pk',
          'application_passport_gb', 'application_visa'
        )
        and lower(btrim(service ->> 'sourceModule')) <> 'applications'
      )
      or (
        service_code_value not in (
          'package_sale', 'application_nadra', 'application_passport_pk',
          'application_passport_gb', 'application_visa'
        )
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
      or (
        service_code_value in (
          'application_nadra', 'application_passport_pk',
          'application_passport_gb', 'application_visa'
        )
        and service ->> 'recipientRole' <> 'application_agent'
      )
      or (service_code_value = 'sales_bonus' and service ->> 'recipientRole' <> 'sales_bonus')
    then$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission application service-scope upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;

  execute updated_definition;
end
$upgrade_profile_creation$;

create or replace function public.commission_emit_application_event_2026083005(
  p_application_kind text,
  p_record jsonb,
  p_deleted boolean default false,
  p_effective_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  application_kind_value text := lower(btrim(coalesce(p_application_kind, '')));
  record_id_value uuid;
  employee_id_value uuid;
  location_id_value uuid;
  service_code_value text;
  source_path_value text;
  status_value text;
  terminal_status_value text;
  refunded_value boolean := false;
  eligible_value boolean;
  variant_value jsonb := '{}'::jsonb;
  variables_value jsonb;
  latest_event public.commission_source_events%rowtype;
  next_version integer := 1;
  effective_on_value date;
  source_event_id_value uuid := gen_random_uuid();
  emitted_result jsonb;
begin
  if p_record is null or jsonb_typeof(p_record) is distinct from 'object' then
    raise exception 'Application Commission source must be a JSON object'
      using errcode = '22023';
  end if;

  begin
    record_id_value := (p_record ->> 'id')::uuid;
    employee_id_value := (p_record ->> 'employee_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Application Commission source contains invalid identifiers'
      using errcode = '22023';
  end;
  if record_id_value is null or employee_id_value is null then
    raise exception 'Application Commission source requires a record and employee'
      using errcode = '22023';
  end if;

  status_value := btrim(coalesce(p_record ->> 'status', ''));
  refunded_value := coalesce(nullif(p_record ->> 'is_refunded', '')::boolean, false);
  case application_kind_value
    when 'nadra' then
      service_code_value := 'application_nadra';
      terminal_status_value := 'Completed';
      source_path_value := '/dashboard/applications/nadra';
      variant_value := jsonb_build_object(
        'serviceType', p_record ->> 'service_type',
        'trackingNumber', p_record ->> 'tracking_number'
      );
    when 'passport_pk' then
      service_code_value := 'application_passport_pk';
      terminal_status_value := 'Collected';
      source_path_value := '/dashboard/applications/passports';
      variant_value := jsonb_build_object(
        'applicationType', p_record ->> 'application_type',
        'category', p_record ->> 'category',
        'speed', p_record ->> 'speed',
        'pageCount', p_record ->> 'page_count',
        'trackingNumber', p_record ->> 'tracking_number'
      );
    when 'passport_gb' then
      service_code_value := 'application_passport_gb';
      terminal_status_value := 'Completed';
      source_path_value := '/dashboard/applications/passports-gb';
      variant_value := jsonb_build_object(
        'ageGroup', p_record ->> 'age_group',
        'pages', p_record ->> 'pages',
        'serviceType', p_record ->> 'service_type',
        'pexNumber', p_record ->> 'pex_number'
      );
    when 'visa' then
      service_code_value := 'application_visa';
      terminal_status_value := 'Completed';
      source_path_value := '/dashboard/applications/visa';
      variant_value := jsonb_build_object(
        'visaCountryId', p_record ->> 'visa_country_id',
        'visaTypeId', p_record ->> 'visa_type_id',
        'validity', p_record ->> 'validity',
        'isPartOfPackage', coalesce(nullif(p_record ->> 'is_part_of_package', '')::boolean, false),
        'packageId', p_record ->> 'package_id',
        'trackingNumber', p_record ->> 'internal_tracking_number'
      );
    else
      raise exception 'Unsupported Application Commission kind: %', application_kind_value
        using errcode = '22023';
  end case;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-application-source:' || application_kind_value || ':' || record_id_value::text,
    0
  ));

  select employee.location_id into location_id_value
  from public.employees employee
  where employee.id = employee_id_value;
  if not found then
    raise exception 'Application employee was not found' using errcode = 'P0002';
  end if;

  eligible_value := not p_deleted
    and not refunded_value
    and status_value = terminal_status_value;

  select * into latest_event
  from public.commission_source_events source_event
  where source_event.source_module = 'applications'
    and source_event.source_fact_key =
      'application:' || application_kind_value || ':' || record_id_value::text
  order by source_event.event_version desc, source_event.created_at desc
  limit 1
  for update;

  if not found and not eligible_value then
    return jsonb_build_object('emitted', false, 'reason', 'application_not_complete');
  end if;
  if found then next_version := latest_event.event_version + 1; end if;

  effective_on_value := case
    when next_version > 1 then latest_event.effective_on
    else coalesce(p_effective_on, current_date)
  end;
  variables_value := jsonb_strip_nulls(jsonb_build_object(
    'commission_scope', 'application',
    'integration_version', 2026083005,
    'application_kind', application_kind_value,
    'application_id', record_id_value,
    'service_code', service_code_value,
    'recipient_role', 'application_agent',
    'application_count', 1,
    'status', status_value,
    'terminal_status', terminal_status_value,
    'eligible', eligible_value,
    'refunded', refunded_value,
    'deleted', p_deleted,
    'responsible_employee_id', employee_id_value,
    'booking_location_id', location_id_value,
    'variant', jsonb_strip_nulls(variant_value)
  ));
  variables_value := variables_value || jsonb_build_object(
    'snapshot_hash', public.commission_sha256_2026082901(variables_value::text)
  );

  if next_version > 1
    and latest_event.variables ->> 'snapshot_hash' = variables_value ->> 'snapshot_hash'
  then
    return jsonb_build_object(
      'emitted', false,
      'reason', 'unchanged_snapshot',
      'id', latest_event.id,
      'eventVersion', latest_event.event_version
    );
  end if;

  emitted_result := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'applications',
    'source_event_id', source_event_id_value,
    'source_fact_key',
      'application:' || application_kind_value || ':' || record_id_value::text,
    'source_record_id', record_id_value,
    'event_type', case when eligible_value
      then 'application_completed' else 'application_reversed' end,
    'contract_version', 1,
    'event_version', next_version,
    'supersedes_event_id', case when next_version = 1
      then null else latest_event.source_event_id end,
    'employee_id', employee_id_value,
    'owner_employee_id', employee_id_value,
    'location_id', location_id_value,
    'occurred_at', clock_timestamp(),
    'effective_on', effective_on_value,
    'source_path', source_path_value,
    'variables', variables_value,
    'idempotency_key', 'application:' || application_kind_value || ':'
      || record_id_value::text || ':v' || next_version::text || ':'
      || left(variables_value ->> 'snapshot_hash', 32)
  ));

  return emitted_result || jsonb_build_object(
    'emitted', true,
    'eligible', eligible_value,
    'serviceCode', service_code_value
  );
end
$function$;

comment on function public.commission_emit_application_event_2026083005(text,jsonb,boolean,date) is
  'Emits immutable completion or reversal facts for Application Commission. It never calculates pay.';

create or replace function public.commission_capture_application_source_2026083005()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare application_kind_value text;
declare row_value jsonb;
begin
  application_kind_value := case tg_table_name
    when 'nadra_services' then 'nadra'
    when 'pakistani_passport_applications' then 'passport_pk'
    when 'british_passport_applications' then 'passport_gb'
    when 'visa_applications' then 'visa'
    else null
  end;
  if application_kind_value is null then
    raise exception 'Unsupported Application Commission trigger table: %', tg_table_name
      using errcode = '22023';
  end if;

  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  perform public.commission_emit_application_event_2026083005(
    application_kind_value,
    row_value,
    tg_op = 'DELETE',
    null
  );
  return coalesce(new, old);
end
$function$;

drop trigger if exists commission_application_source_nadra_3005 on public.nadra_services;
create trigger commission_application_source_nadra_3005
  after insert or update or delete on public.nadra_services
  for each row execute function public.commission_capture_application_source_2026083005();

drop trigger if exists commission_application_source_passport_pk_3005
  on public.pakistani_passport_applications;
create trigger commission_application_source_passport_pk_3005
  after insert or update or delete on public.pakistani_passport_applications
  for each row execute function public.commission_capture_application_source_2026083005();

drop trigger if exists commission_application_source_passport_gb_3005
  on public.british_passport_applications;
create trigger commission_application_source_passport_gb_3005
  after insert or update or delete on public.british_passport_applications
  for each row execute function public.commission_capture_application_source_2026083005();

drop trigger if exists commission_application_source_visa_3005 on public.visa_applications;
create trigger commission_application_source_visa_3005
  after insert or update or delete on public.visa_applications
  for each row execute function public.commission_capture_application_source_2026083005();

create or replace function public.commission_process_application_shadow_event_2026083005(
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
  employee_id_value uuid;
  service_code_value text;
  period_start_value date;
  period_end_value date;
  case_key_value text;
  revision_value integer;
  amount_value numeric;
  entry_count_value integer := 0;
  eligible_value boolean;
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
    'application_nadra', 'application_passport_pk',
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

  period_start_value := date_trunc('month', event.effective_on)::date;
  period_end_value := (period_start_value + interval '1 month - 1 day')::date;
  case_key_value := event.source_module || ':' || event.source_fact_key;

  if event.supersedes_event_id is not null then
    for prior_entry in
      select entry.* from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and entry.entry_kind = 'ordinary'
        and entry.source_case_key = case_key_value
        and entry.source_event_id <> event.id
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode
            and newer.supersedes_entry_id = entry.id
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
          'correctedBySourceEventId', event.id
        ),
        prior_entry.explanation || jsonb_build_object(
          'reason', 'application_source_corrected',
          'supersededAmountGbp', prior_entry.amount_gbp
        ),
        revision_value, prior_entry.id,
        'application-correction-clear:' || event.id::text || ':' || prior_entry.id::text
      ) on conflict (entry_mode, idempotency_key) do nothing;
      if found then entry_count_value := entry_count_value + 1; end if;
    end loop;
  end if;

  eligible_value := coalesce((event.variables ->> 'eligible')::boolean, false);
  if event.event_type = 'application_reversed' or not eligible_value then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', null,
      'failureDetails', '{}'::jsonb
    );
  end if;

  employee_id_value := coalesce(event.owner_employee_id, event.employee_id);
  perform 1 from public.employees employee
  where employee.id = employee_id_value and employee.is_active;
  if not found then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', 'inactive_recipient',
      'failureDetails', jsonb_build_object(
        'recipientEmployeeId', employee_id_value,
        'serviceCode', service_code_value
      )
    );
  end if;

  policy_version_id_value := public.commission_resolve_assignment_2026082901(
    employee_id_value,
    'applications',
    service_code_value,
    'application_agent',
    event.location_id,
    event.effective_on
  );
  if policy_version_id_value is null then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', 'needs_policy',
      'failureDetails', jsonb_build_object(
        'recipientEmployeeId', employee_id_value,
        'serviceCode', service_code_value,
        'recipientRole', 'application_agent'
      )
    );
  end if;

  if not exists (
    select 1 from public.commission_policy_components policy_component
    where policy_component.policy_version_id = policy_version_id_value
      and policy_component.recipient_role = 'application_agent'
      and policy_component.component_type in ('fixed_per_event', 'explicit_zero')
  ) then
    return jsonb_build_object(
      'entryCount', entry_count_value,
      'failureCode', 'needs_policy',
      'failureDetails', jsonb_build_object(
        'reason', 'no_matching_component',
        'policyVersionId', policy_version_id_value,
        'serviceCode', service_code_value
      )
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

    select entry.* into prior_entry
    from public.commission_entries entry
    where entry.entry_mode = 'shadow'
      and entry.source_case_key = case_key_value
      and entry.recipient_employee_id = employee_id_value
      and entry.component_id = component.id
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
    order by entry.revision desc limit 1;
    revision_value := case when found then prior_entry.revision + 1 else 1 end;

    insert into public.commission_entries (
      run_id, entry_mode, entry_kind, source_event_id, source_case_key,
      recipient_employee_id, profit_owner_employee_id, location_id,
      policy_version_id, component_id, earning_on, period_start, period_end,
      amount_gbp, basis_snapshot, explanation, revision, supersedes_entry_id,
      idempotency_key
    ) values (
      p_run_id, 'shadow', 'ordinary', event.id, case_key_value,
      employee_id_value, employee_id_value, event.location_id,
      policy_version_id_value, component.id, event.effective_on,
      period_start_value, period_end_value, amount_value,
      jsonb_build_object(
        'sourceVariable', component.source_variable,
        'basisValue', null,
        'units', 1,
        'applicationKind', event.variables -> 'application_kind',
        'status', event.variables -> 'status',
        'snapshotHash', event.variables -> 'snapshot_hash'
      ),
      jsonb_build_object(
        'componentType', component.component_type,
        'serviceCode', service_code_value,
        'recipientRole', 'application_agent',
        'sourceModule', 'applications',
        'nonPayable', true
      ),
      revision_value, prior_entry.id,
      'application-ordinary:' || event.id::text || ':' || employee_id_value::text
        || ':' || component.id::text || ':amount:' || amount_value::text
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
  old_fragment text;
  new_fragment text;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position('commission_process_application_shadow_event_2026083005' in definition) > 0 then
    return;
  end if;

  old_fragment := $old$      elsif event.source_module <> 'ticketing' then
        failure_code := 'package_source_not_authoritative';
        failure_details := jsonb_build_object('sourceModule', event.source_module);$old$;
  new_fragment := $new$      elsif event.source_module = 'applications' then
        package_result := public.commission_process_application_shadow_event_2026083005(
          run_id_value, event.id
        );
        failure_code := nullif(package_result ->> 'failureCode', '');
        failure_details := coalesce(package_result -> 'failureDetails', '{}'::jsonb);
        entry_count_value := entry_count_value
          + coalesce((package_result ->> 'entryCount')::integer, 0);
      elsif event.source_module <> 'ticketing' then
        failure_code := 'package_source_not_authoritative';
        failure_details := jsonb_build_object('sourceModule', event.source_module);$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission application processor branch upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;

  execute updated_definition;
end
$upgrade_processor$;

create or replace function public.commission_requeue_application_assignment_events_2026083005()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
begin
  if new.source_module <> 'applications'
    or new.recipient_role <> 'application_agent'
  then
    return new;
  end if;

  update public.commission_source_event_states state
  set processing_status = 'pending', next_attempt_at = null, last_error = null,
      updated_at = clock_timestamp()
  from public.commission_source_events event
  where state.event_id = event.id
    and state.processing_status = 'held'
    and state.last_error = 'needs_policy'
    and event.source_module = 'applications'
    and event.event_type = 'application_completed'
    and event.variables ->> 'service_code' = new.service_code
    and coalesce(event.owner_employee_id, event.employee_id) = new.employee_id
    and event.effective_on >= new.start_date
    and (new.effective_to is null or event.effective_on <= new.effective_to)
    and (new.location_id is null or event.location_id = new.location_id);
  return new;
end
$function$;

drop trigger if exists employee_commission_assignments_application_requeue_3005
  on public.employee_commission_assignments;
create trigger employee_commission_assignments_application_requeue_3005
  after insert or update on public.employee_commission_assignments
  for each row execute function
    public.commission_requeue_application_assignment_events_2026083005();

create or replace function public.commission_source_module_overview_2026083005(
  p_actor_employee_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare result_value jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;

  with modules(source_module, label) as (
    values
      ('ticketing'::text, 'Ticketing'::text),
      ('packages'::text, 'Packages'::text),
      ('applications'::text, 'Applications'::text)
  ), event_counts as (
    select
      event.source_module,
      count(*) filter (where state.processing_status = 'pending') as pending_events,
      count(*) filter (where state.processing_status = 'processed') as processed_events,
      count(*) filter (where state.processing_status = 'held') as held_events
    from public.commission_source_events event
    join public.commission_source_event_states state on state.event_id = event.id
    where event.source_module in ('ticketing', 'packages', 'applications')
    group by event.source_module
  ), active_entries as (
    select
      source_event.source_module,
      count(*) as active_entries,
      coalesce(sum(entry.amount_gbp), 0) as total_gbp
    from public.commission_entries entry
    join public.commission_source_events source_event on source_event.id = entry.source_event_id
    where entry.entry_mode = 'shadow'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
    group by source_event.source_module
  ), package_gaps as (
    select
      count(*) filter (
        where coalesce(package_folder.sales_responsible_employee_id,
          package_folder.sales_employee_id) is null
      ) as missing_owner,
      count(*) filter (
        where not exists (
          select 1 from public.commission_source_events source_event
          where source_event.source_module = 'packages'
            and source_event.source_fact_key = 'package-sale:' || package_folder.id::text
        )
      ) as missing_event
    from public.travel_packages package_folder
    where package_folder.status = 'closed'
  ), completed_applications as (
    select 'nadra'::text as application_kind, application.id, application.employee_id
    from public.nadra_services application
    where application.status = 'Completed' and not application.is_refunded
    union all
    select 'passport_pk', application.id, application.employee_id
    from public.pakistani_passport_applications application
    where application.status = 'Collected' and not application.is_refunded
    union all
    select 'passport_gb', application.id, application.employee_id
    from public.british_passport_applications application
    where application.status = 'Completed'
    union all
    select 'visa', application.id, application.employee_id
    from public.visa_applications application
    where application.status = 'Completed'
  ), application_gaps as (
    select
      count(*) filter (
        where not exists (
          select 1 from public.employees employee
          where employee.id = application.employee_id and employee.is_active
        )
      ) as missing_owner,
      count(*) filter (
        where not exists (
          select 1 from public.commission_source_events source_event
          where source_event.source_module = 'applications'
            and source_event.source_fact_key = 'application:'
              || application.application_kind || ':' || application.id::text
        )
      ) as missing_event
    from completed_applications application
  )
  select jsonb_agg(jsonb_build_object(
    'sourceModule', module.source_module,
    'label', module.label,
    'pendingEvents', coalesce(event_count.pending_events, 0),
    'processedEvents', coalesce(event_count.processed_events, 0),
    'heldEvents', coalesce(event_count.held_events, 0),
    'activeEntries', coalesce(active_entry.active_entries, 0),
    'totalGbp', round(coalesce(active_entry.total_gbp, 0), 2),
    'closedRecordsMissingEvent', case
      when module.source_module = 'packages' then package_gap.missing_event
      when module.source_module = 'applications' then application_gap.missing_event
      else 0 end,
    'closedRecordsMissingOwner', case
      when module.source_module = 'packages' then package_gap.missing_owner
      when module.source_module = 'applications' then application_gap.missing_owner
      else 0 end
  ) order by module.source_module)
  into result_value
  from modules module
  left join event_counts event_count on event_count.source_module = module.source_module
  left join active_entries active_entry on active_entry.source_module = module.source_module
  cross join package_gaps package_gap
  cross join application_gaps application_gap;

  return coalesce(result_value, '[]'::jsonb);
end
$function$;

-- Backfill terminal records. Where a status history exists, its first terminal
-- transition is the earning date; otherwise retain the recorded application date.
do $backfill_application_sources$
declare application_record record;
begin
  for application_record in
    select application.*, coalesce((
      select min(history.changed_at)::date
      from public.nadra_status_history history
      where history.nadra_service_id = application.id
        and history.new_status = 'Completed'
    ), application.application_date::date) as commission_effective_on
    from public.nadra_services application
    where application.status = 'Completed' and not application.is_refunded
  loop
    perform public.commission_emit_application_event_2026083005(
      'nadra', to_jsonb(application_record) - 'commission_effective_on', false,
      application_record.commission_effective_on
    );
  end loop;

  for application_record in
    select application.*, coalesce((
      select min(history.changed_at)::date
      from public.pakistani_passport_status_history history
      where history.passport_application_id = application.id
        and history.new_status = 'Collected'
    ), application.application_date::date) as commission_effective_on
    from public.pakistani_passport_applications application
    where application.status = 'Collected' and not application.is_refunded
  loop
    perform public.commission_emit_application_event_2026083005(
      'passport_pk', to_jsonb(application_record) - 'commission_effective_on', false,
      application_record.commission_effective_on
    );
  end loop;

  for application_record in
    select application.*, coalesce((
      select min(history.changed_at)::date
      from public.british_passport_status_history history
      where history.passport_id = application.id
        and history.new_status = 'Completed'
    ), application.application_date::date) as commission_effective_on
    from public.british_passport_applications application
    where application.status = 'Completed'
  loop
    perform public.commission_emit_application_event_2026083005(
      'passport_gb', to_jsonb(application_record) - 'commission_effective_on', false,
      application_record.commission_effective_on
    );
  end loop;

  for application_record in
    select application.*, coalesce((
      select min(history.changed_at)::date
      from public.visa_status_history history
      where history.visa_application_id = application.id
        and history.new_status = 'Completed'
    ), application.application_date::date) as commission_effective_on
    from public.visa_applications application
    where application.status = 'Completed'
  loop
    perform public.commission_emit_application_event_2026083005(
      'visa', to_jsonb(application_record) - 'commission_effective_on', false,
      application_record.commission_effective_on
    );
  end loop;
end
$backfill_application_sources$;

revoke all on function
  public.commission_emit_application_event_2026083005(text,jsonb,boolean,date),
  public.commission_capture_application_source_2026083005(),
  public.commission_process_application_shadow_event_2026083005(uuid,uuid),
  public.commission_requeue_application_assignment_events_2026083005(),
  public.commission_source_module_overview_2026083005(uuid)
  from public, anon, authenticated;
grant execute on function public.commission_source_module_overview_2026083005(uuid)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083005,
  clock_timestamp(),
  coalesce((
    select details from public.portal_schema_versions where component = 'commission'
  ), '{}'::jsonb) || jsonb_build_object(
    'migration', '20260830_commission_application_shadow_integration.sql',
    'mode', 'shadow',
    'capabilities', coalesce((
      select details -> 'capabilities'
      from public.portal_schema_versions
      where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array(
      'application-completion-source-events',
      'application-correction-and-reversal-lineage',
      'application-profile-rates',
      'application-source-module-overview'
    )
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (
     public.portal_schema_versions.version = excluded.version
     and not coalesce(
       public.portal_schema_versions.details -> 'capabilities'
         ? 'application-completion-source-events',
       false
     )
   );

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
    'applicationIntegrationReady', coalesce(version >= 2026083005, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026083005,
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
    where not exists (
      select 1 from public.portal_schema_versions where component = 'commission'
    )
    limit 1
  ) status
$function$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
