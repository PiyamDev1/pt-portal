-- Commission capability 2026082902.
-- Adds the correction-safe, serialised shadow processor and monthly own-sale
-- profit bonus aggregation. Results remain non-payable.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;
  if installed_version is null or installed_version < 2026082901 then
    raise exception 'Commission shadow foundation 2026082901 is required'
      using errcode = '55000', hint = 'COMMISSION_FOUNDATION_NOT_READY';
  end if;
  if installed_version > 2026082902 then
    raise exception 'Commission processor capability % cannot run after installed capability %',
      2026082902, installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$guard$;

create index if not exists commission_entries_active_source_idx
  on public.commission_entries (entry_mode, source_case_key, recipient_employee_id, created_at desc);
create index if not exists commission_period_results_active_period_idx
  on public.commission_period_results (
    result_mode, employee_id, location_id, period_start, created_at desc
  );

create or replace function public.commission_validate_aggregate_assignment_dates_2026082902()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if exists (
    select 1 from public.commission_policy_components component
    where component.policy_version_id = new.policy_version_id
      and component.component_type in ('marginal_ticket_tier', 'sales_profit_bonus')
  ) and (
    extract(day from new.start_date) <> 1
    or (new.effective_to is not null
      and new.effective_to <> (date_trunc('month', new.effective_to)::date
        + interval '1 month - 1 day')::date)
  ) then
    raise exception 'Aggregate Commission assignments must cover whole calendar months'
      using errcode = '23514', hint = 'COMMISSION_AGGREGATE_MONTH_BOUNDARY';
  end if;
  return new;
end
$$;

drop trigger if exists employee_commission_assignments_aggregate_dates_2902
  on public.employee_commission_assignments;
create trigger employee_commission_assignments_aggregate_dates_2902
before insert or update on public.employee_commission_assignments
for each row execute function public.commission_validate_aggregate_assignment_dates_2026082902();

create or replace function public.commission_requeue_assignment_events_2026082902()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  update public.commission_source_event_states state
  set processing_status = 'pending', next_attempt_at = null, last_error = null,
      updated_at = clock_timestamp()
  from public.commission_source_events event
  where state.event_id = event.id
    and state.processing_status = 'held'
    and state.last_error = 'needs_policy'
    and event.source_module = new.source_module
    and event.effective_on >= new.start_date
    and (new.effective_to is null or event.effective_on <= new.effective_to)
    and (new.location_id is null or event.location_id = new.location_id)
    and case
      when new.service_code = 'tk_primary' and new.recipient_role = 'primary'
        then event.event_type in ('ticket_issued', 'ticket_sale_completed')
          and coalesce(event.owner_employee_id, event.employee_id) = new.employee_id
      when new.service_code = 'tk_assistance' and new.recipient_role = 'assistant'
        then event.event_type = 'ticket_issued'
          and event.variables -> 'assistant_employee_ids' ? new.employee_id::text
      when new.service_code = 'dc' and new.recipient_role = 'primary'
        then event.event_type = 'ticket_date_changed'
          and coalesce(event.owner_employee_id, event.employee_id) = new.employee_id
      when new.service_code = 'r_er' and new.recipient_role = 'primary'
        then event.event_type = 'ticket_reissued'
          and coalesce(event.owner_employee_id, event.employee_id) = new.employee_id
      when new.service_code = 'low_fare' and new.recipient_role = 'low_fare_actor'
        then event.event_type = 'ticket_low_fare_adjusted'
          and event.employee_id = new.employee_id
      when new.service_code = 'higher_fare' and new.recipient_role = 'low_fare_actor'
        then event.event_type = 'ticket_higher_fare_adjusted'
          and event.employee_id = new.employee_id
      else false
    end;
  return new;
end
$$;

drop trigger if exists employee_commission_assignments_requeue_2902
  on public.employee_commission_assignments;
create trigger employee_commission_assignments_requeue_2902
after insert or update on public.employee_commission_assignments
for each row execute function public.commission_requeue_assignment_events_2026082902();

create or replace function public.commission_component_amount_2026082902(
  p_component_id uuid,
  p_variables jsonb,
  p_units integer,
  p_prior_units integer default 0
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare component public.commission_policy_components%rowtype;
declare basis_value numeric;
declare result_value numeric;
begin
  select * into component
  from public.commission_policy_components where id = p_component_id;
  if not found or component.component_type = 'sales_profit_bonus' then
    raise exception 'Unsupported Commission component' using errcode = '22023';
  end if;

  if component.component_type = 'marginal_ticket_tier' then
    if p_units is null or p_units < 0 or coalesce(p_prior_units, 0) < 0 then
      raise exception 'Valid marginal units are required' using errcode = '22023';
    end if;
    select coalesce(round(sum(unit_rate), 2), 0) into result_value
    from (
      select (
        select tier.rate_gbp
        from public.commission_policy_tiers tier
        where tier.component_id = component.id and tier.min_unit <= unit_number
        order by tier.min_unit desc limit 1
      ) unit_rate
      from generate_series(
        coalesce(p_prior_units, 0) + 1,
        coalesce(p_prior_units, 0) + p_units
      ) unit_number
    ) rates;
    if p_units > 0 and result_value is null then
      raise exception 'Marginal Commission tiers do not cover the supplied units'
        using errcode = '22023';
    end if;
    return coalesce(result_value, 0);
  end if;

  if component.source_variable is not null then
    if not (p_variables ? component.source_variable)
      or jsonb_typeof(p_variables -> component.source_variable) not in ('number', 'string')
    then
      raise exception 'Required Commission source variable is missing: %',
        component.source_variable using errcode = '22023';
    end if;
    begin
      basis_value := (p_variables ->> component.source_variable)::numeric;
    exception when invalid_text_representation then
      raise exception 'Commission source variable is not numeric: %',
        component.source_variable using errcode = '22023';
    end;
  end if;

  return public.commission_calculate_component_2026082901(
    component.component_type,
    component.rate_value,
    basis_value,
    p_units,
    component.minimum_amount_gbp,
    component.maximum_amount_gbp
  );
end
$$;

create or replace function public.commission_record_exception_2026082902(
  p_run_id uuid,
  p_source_event_id uuid,
  p_employee_id uuid,
  p_exception_code text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  insert into public.commission_exceptions (
    run_id, source_event_id, employee_id, exception_code, details
  ) values (
    p_run_id, p_source_event_id, p_employee_id, p_exception_code,
    coalesce(p_details, '{}'::jsonb)
  )
  on conflict (source_event_id, exception_code)
    where status = 'open' and source_event_id is not null
  do update set
    run_id = excluded.run_id,
    employee_id = excluded.employee_id,
    details = excluded.details;
end
$$;

create or replace function public.commission_recompute_bonus_2026082902(
  p_run_id uuid,
  p_employee_id uuid,
  p_location_id uuid,
  p_period_start date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare period_end_value date := (p_period_start + interval '1 month - 1 day')::date;
declare policy_version_id_value uuid;
declare bonus_component public.commission_policy_components%rowtype;
declare gross_sales numeric := 0;
declare fare_movements numeric := 0;
declare ordinary_cost numeric := 0;
declare qualifying_value numeric := 0;
declare incomplete_count integer := 0;
declare sale_count integer := 0;
declare bonus_result jsonb;
declare prior_result public.commission_period_results%rowtype;
declare result_id uuid;
declare result_revision integer := 1;
declare prior_entry public.commission_entries%rowtype;
declare entry_revision integer := 1;
begin
  policy_version_id_value := public.commission_resolve_assignment_2026082901(
    p_employee_id, 'ticketing', 'sales_bonus', 'sales_bonus',
    p_location_id, p_period_start
  );
  if policy_version_id_value is null then return 0; end if;

  select * into bonus_component
  from public.commission_policy_components component
  where component.policy_version_id = policy_version_id_value
    and component.component_type = 'sales_profit_bonus'
    and component.recipient_role = 'sales_bonus'
  order by component.sequence limit 1;
  if not found then return 0; end if;

  with current_events as (
    select event.*
    from public.commission_source_events event
    join public.commission_source_event_states state on state.event_id = event.id
    where event.source_module = 'ticketing'
      and state.processing_status = 'processed'
      and coalesce(event.owner_employee_id, event.employee_id) = p_employee_id
      and event.location_id is not distinct from p_location_id
      and event.effective_on between p_period_start and period_end_value
      and event.event_type in (
        'ticket_issued', 'ticket_sale_completed', 'ticket_date_changed', 'ticket_reissued'
      )
      and bonus_component.eligible_services ? case event.event_type
        when 'ticket_date_changed' then 'dc'
        when 'ticket_reissued' then 'r_er'
        else 'tk_primary'
      end
      and event.variables ->> 'commission_scope' = 'ticket'
      and not exists (
        select 1 from public.commission_source_events newer
        where newer.supersedes_event_id = event.source_event_id
      )
  ), sale_rows as (
    select distinct on (event.source_record_id) event.*
    from current_events event
    order by event.source_record_id,
      case when event.event_type = 'ticket_sale_completed' then 0 else 1 end,
      event.event_version desc, event.created_at desc
  )
  select
    coalesce(sum(
      case when sale.variables ? 'sale_price_gbp' and sale.variables ? 'supplier_cost_gbp'
        and sale.variables ->> 'sale_price_gbp' is not null
        and sale.variables ->> 'supplier_cost_gbp' is not null
      then (sale.variables ->> 'sale_price_gbp')::numeric
        - (sale.variables ->> 'supplier_cost_gbp')::numeric
      else 0 end
    ), 0),
    count(*) filter (where not (
      sale.variables ? 'sale_price_gbp' and sale.variables ? 'supplier_cost_gbp'
      and sale.variables ->> 'sale_price_gbp' is not null
      and sale.variables ->> 'supplier_cost_gbp' is not null
    )),
    count(*)
  into gross_sales, incomplete_count, sale_count
  from sale_rows sale;

  if sale_count = 0 and not exists (
    select 1 from public.commission_period_results result
    where result.result_mode = 'shadow'
      and result.employee_id = p_employee_id
      and result.location_id is not distinct from p_location_id
      and result.bonus_component_id = bonus_component.id
      and result.period_start = p_period_start
      and not exists (
        select 1 from public.commission_period_results newer
        where newer.result_mode = result.result_mode
          and newer.supersedes_result_id = result.id
      )
  ) then return 0; end if;

  select coalesce(sum((event.variables ->> 'difference_gbp')::numeric), 0)
  into fare_movements
  from public.commission_source_events event
  join public.commission_source_event_states state on state.event_id = event.id
  where event.source_module = 'ticketing'
    and state.processing_status = 'processed'
    and event.owner_employee_id = p_employee_id
    and event.effective_on between p_period_start and period_end_value
    and event.event_type in ('ticket_low_fare_adjusted', 'ticket_higher_fare_adjusted')
    and bonus_component.eligible_services ? 'tk_primary'
    and event.variables ->> 'commission_scope' = 'ticket'
    and coalesce(nullif(event.variables ->> 'booking_location_id', '')::uuid, event.location_id)
      is not distinct from p_location_id
    and not exists (
      select 1 from public.commission_source_events newer
      where newer.supersedes_event_id = event.source_event_id
    );

  select coalesce(sum(entry.amount_gbp), 0) into ordinary_cost
  from public.commission_entries entry
  where entry.entry_mode = 'shadow'
    and entry.entry_kind = 'ordinary'
    and entry.profit_owner_employee_id = p_employee_id
    and entry.location_id is not distinct from p_location_id
    and entry.earning_on between p_period_start and period_end_value
    and (
      bonus_component.eligible_services ? (entry.explanation ->> 'serviceCode')
      or (
        bonus_component.eligible_services ? 'tk_primary'
        and entry.explanation ->> 'serviceCode' in (
          'tk_assistance', 'low_fare', 'higher_fare'
        )
      )
    )
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );

  qualifying_value := round(gross_sales + fare_movements - ordinary_cost, 2);
  bonus_result := public.commission_calculate_sales_bonus_2026082901(
    bonus_component.threshold_gbp,
    bonus_component.reward_kind,
    bonus_component.reward_value,
    qualifying_value,
    incomplete_count
  );

  select result.* into prior_result
  from public.commission_period_results result
  where result.result_mode = 'shadow'
    and result.employee_id = p_employee_id
    and result.location_id is not distinct from p_location_id
    and result.bonus_component_id = bonus_component.id
    and result.period_start = p_period_start
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.result_mode = result.result_mode and newer.supersedes_result_id = result.id
    )
  order by result.revision desc limit 1;
  if found then result_revision := prior_result.revision + 1; end if;

  insert into public.commission_period_results (
    run_id, result_mode, employee_id, location_id, bonus_component_id,
    period_start, period_end, gross_contributed_profit_gbp,
    ordinary_commission_cost_gbp, qualifying_profit_gbp, threshold_gbp,
    achieved, reward_gbp, incomplete_input_count, calculation_snapshot,
    revision, supersedes_result_id
  ) values (
    p_run_id, 'shadow', p_employee_id, p_location_id, bonus_component.id,
    p_period_start, period_end_value, round(gross_sales + fare_movements, 2),
    round(ordinary_cost, 2), qualifying_value, bonus_component.threshold_gbp,
    (bonus_result ->> 'achieved')::boolean,
    (bonus_result ->> 'rewardGbp')::numeric,
    incomplete_count,
    jsonb_build_object(
      'grossTicketProfitGbp', round(gross_sales, 2),
      'signedFareMovementsGbp', round(fare_movements, 2),
      'ordinaryCommissionCostGbp', round(ordinary_cost, 2),
      'sourceSaleCount', sale_count,
      'policyVersionId', policy_version_id_value
    ),
    result_revision, prior_result.id
  ) returning id into result_id;

  select entry.* into prior_entry
  from public.commission_entries entry
  where entry.entry_mode = 'shadow'
    and entry.entry_kind = 'sales_bonus'
    and entry.recipient_employee_id = p_employee_id
    and entry.component_id = bonus_component.id
    and entry.period_start = p_period_start
    and entry.location_id is not distinct from p_location_id
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    )
  order by entry.revision desc limit 1;
  if found then entry_revision := prior_entry.revision + 1; end if;

  insert into public.commission_entries (
    run_id, entry_mode, entry_kind, source_case_key,
    recipient_employee_id, profit_owner_employee_id, location_id,
    policy_version_id, component_id, earning_on, period_start, period_end,
    amount_gbp, basis_snapshot, explanation, revision, supersedes_entry_id,
    idempotency_key
  ) values (
    p_run_id, 'shadow', 'sales_bonus',
    'sales-bonus:' || p_employee_id::text || ':' || coalesce(p_location_id::text, 'all')
      || ':' || p_period_start::text,
    p_employee_id, p_employee_id, p_location_id,
    policy_version_id_value, bonus_component.id, period_end_value,
    p_period_start, period_end_value,
    (bonus_result ->> 'rewardGbp')::numeric,
    jsonb_build_object('periodResultId', result_id, 'qualifyingProfitGbp', qualifying_value),
    jsonb_build_object(
      'componentType', 'sales_profit_bonus',
      'achieved', (bonus_result ->> 'achieved')::boolean,
      'thresholdGbp', bonus_component.threshold_gbp,
      'incompleteInputCount', incomplete_count
    ),
    entry_revision, prior_entry.id,
    'bonus:' || result_id::text
  );
  return 1;
end
$$;

create or replace function public.commission_process_shadow_2026082902(
  p_actor_employee_id uuid,
  p_limit integer default 50,
  p_request_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare run_id_value uuid;
declare event public.commission_source_events%rowtype;
declare component public.commission_policy_components%rowtype;
declare spec jsonb;
declare specs jsonb;
declare assistant jsonb;
declare policy_version_id_value uuid;
declare amount_value numeric;
declare period_start_value date;
declare period_end_value date;
declare prior_units integer;
declare prior_entry public.commission_entries%rowtype;
declare revision_value integer;
declare entry_count_value integer := 0;
declare processed_count integer := 0;
declare held_count integer := 0;
declare bonus_count integer := 0;
declare case_key_value text;
declare include_component boolean;
declare location_value uuid;
declare failure_code text;
declare failure_details jsonb;
declare result_json jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_limit not between 1 and 200
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then raise exception 'Invalid Commission processing request' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-process:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into result_json from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id and action = 'shadow.processed'
    and request_key = p_request_key;
  if result_json is not null then
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('commission:shadow-worker', 0)) then
    return jsonb_build_object('busy', true, 'processedEvents', 0, 'heldEvents', 0);
  end if;

  insert into public.commission_calculation_runs (run_mode, run_type, status, triggered_by)
  values ('shadow', 'worker', 'running', p_actor_employee_id)
  returning id into run_id_value;

  create temporary table if not exists pg_temp.commission_affected_bonus_periods (
    employee_id uuid not null,
    location_id uuid,
    period_start date not null
  ) on commit drop;
  truncate pg_temp.commission_affected_bonus_periods;

  for event in
    with claimed as (
      select state.event_id
      from public.commission_source_event_states state
      join public.commission_source_events source on source.id = state.event_id
      where state.processing_status = 'pending'
        or (
          state.processing_status = 'held'
          and state.next_attempt_at is not null
          and state.next_attempt_at <= clock_timestamp()
        )
      order by source.effective_on, source.occurred_at, source.id
      for update of state skip locked
      limit p_limit
    ), updated as (
      update public.commission_source_event_states state
      set processing_status = 'processing', attempt_count = attempt_count + 1,
          updated_at = clock_timestamp(), last_error = null
      from claimed where state.event_id = claimed.event_id
      returning state.event_id
    )
    select source.* from public.commission_source_events source
    join updated on updated.event_id = source.id
    order by source.effective_on, source.occurred_at, source.id
  loop
    failure_code := null;
    failure_details := '{}'::jsonb;
    begin
      if event.contract_version <> 1 then
        failure_code := 'unsupported_contract_version';
        failure_details := jsonb_build_object('contractVersion', event.contract_version);
      elsif exists (
        select 1 from public.commission_source_events newer
        where newer.supersedes_event_id = event.source_event_id
      ) then
        update public.commission_source_event_states set processing_status = 'processed',
          updated_at = clock_timestamp() where event_id = event.id;
        update public.commission_exceptions
        set status = 'resolved', resolved_by = p_actor_employee_id,
            resolved_at = clock_timestamp(),
            resolution_note = 'Source event was superseded before retry processing.'
        where source_event_id = event.id and status = 'open';
        processed_count := processed_count + 1;
        continue;
      elsif event.source_module <> 'ticketing' then
        failure_code := 'package_source_not_authoritative';
        failure_details := jsonb_build_object('sourceModule', event.source_module);
      elsif event.variables ->> 'commission_scope' = 'unresolved' then
        failure_code := 'unresolved_package_scope';
      elsif event.variables ->> 'commission_scope' = 'package' then
        failure_code := 'package_source_not_authoritative';
      elsif event.event_type = 'ticket_entry_archived' then
        case_key_value := event.source_module || ':' || event.source_fact_key;
        for prior_entry in
          select entry.* from public.commission_entries entry
          where entry.entry_mode = 'shadow' and entry.source_case_key = case_key_value
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
            run_id_value, 'shadow', prior_entry.entry_kind, event.id, case_key_value,
            prior_entry.recipient_employee_id, prior_entry.profit_owner_employee_id,
            prior_entry.location_id, prior_entry.policy_version_id, prior_entry.component_id,
            event.effective_on, prior_entry.period_start, prior_entry.period_end,
            0, jsonb_build_object('archivedSourceEventId', event.id),
            jsonb_build_object('reason', 'source_archived', 'supersededAmountGbp', prior_entry.amount_gbp),
            revision_value, prior_entry.id,
            'archive:' || event.id::text || ':' || prior_entry.id::text
          );
          entry_count_value := entry_count_value + 1;
          insert into pg_temp.commission_affected_bonus_periods (
            employee_id, location_id, period_start
          ) values (
            prior_entry.profit_owner_employee_id, prior_entry.location_id,
            prior_entry.period_start
          );
        end loop;
      elsif event.event_type in ('ticket_paid') then
        null;
      elsif event.event_type not in (
        'ticket_issued', 'ticket_sale_completed',
        'ticket_date_changed', 'ticket_reissued',
        'ticket_low_fare_adjusted', 'ticket_higher_fare_adjusted'
      ) then
        failure_code := 'calculation_failed';
        failure_details := jsonb_build_object('reason', 'unsupported_event_type',
          'eventType', event.event_type);
      else
        specs := '[]'::jsonb;
        if event.event_type in ('ticket_issued', 'ticket_sale_completed') then
          specs := specs || jsonb_build_array(jsonb_build_object(
            'employeeId', coalesce(event.owner_employee_id, event.employee_id),
            'serviceCode', 'tk_primary',
            'recipientRole', 'primary'
          ));
          if event.event_type = 'ticket_issued'
            and jsonb_typeof(event.variables -> 'assistant_employee_ids') = 'array'
          then
            for assistant in select value from jsonb_array_elements(
              event.variables -> 'assistant_employee_ids'
            ) loop
              specs := specs || jsonb_build_array(jsonb_build_object(
                'employeeId', assistant #>> '{}', 'serviceCode', 'tk_assistance',
                'recipientRole', 'assistant'
              ));
            end loop;
          end if;
        elsif event.event_type in ('ticket_date_changed', 'ticket_reissued') then
          specs := jsonb_build_array(jsonb_build_object(
            'employeeId', coalesce(event.owner_employee_id, event.employee_id),
            'serviceCode', case when event.event_type = 'ticket_date_changed'
              then 'dc' else 'r_er' end,
            'recipientRole', 'primary'
          ));
        else
          specs := jsonb_build_array(jsonb_build_object(
            'employeeId', event.employee_id,
            'serviceCode', case when event.event_type = 'ticket_low_fare_adjusted'
              then 'low_fare' else 'higher_fare' end,
            'recipientRole', 'low_fare_actor'
          ));
        end if;

        for spec in select value from jsonb_array_elements(specs) loop
          perform 1 from public.employees employee
          where employee.id = (spec ->> 'employeeId')::uuid and employee.is_active;
          if not found then
            failure_code := 'inactive_recipient';
            failure_details := jsonb_build_object('recipientEmployeeId', spec ->> 'employeeId');
            exit;
          end if;
          policy_version_id_value := public.commission_resolve_assignment_2026082901(
            (spec ->> 'employeeId')::uuid, 'ticketing', spec ->> 'serviceCode',
            spec ->> 'recipientRole', event.location_id, event.effective_on
          );
          if policy_version_id_value is null then
            failure_code := 'needs_policy';
            failure_details := jsonb_build_object(
              'recipientEmployeeId', spec ->> 'employeeId',
              'serviceCode', spec ->> 'serviceCode',
              'recipientRole', spec ->> 'recipientRole'
            );
            exit;
          end if;
          if not exists (
            select 1 from public.commission_policy_components policy_component
            where policy_component.policy_version_id = policy_version_id_value
              and policy_component.recipient_role = spec ->> 'recipientRole'
              and policy_component.component_type <> 'sales_profit_bonus'
          ) then
            failure_code := 'needs_policy';
            failure_details := jsonb_build_object('reason', 'no_matching_component',
              'policyVersionId', policy_version_id_value,
              'recipientRole', spec ->> 'recipientRole');
            exit;
          end if;
        end loop;

        if failure_code is null then
          period_start_value := date_trunc('month', event.effective_on)::date;
          period_end_value := (period_start_value + interval '1 month - 1 day')::date;
          case_key_value := event.source_module || ':' || event.source_fact_key;
          if event.supersedes_event_id is not null then
            for prior_entry in
              select entry.* from public.commission_entries entry
              where entry.entry_mode = 'shadow'
                and entry.entry_kind = 'ordinary'
                and entry.source_case_key = case_key_value
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
                run_id_value, 'shadow', prior_entry.entry_kind, event.id, case_key_value,
                prior_entry.recipient_employee_id, prior_entry.profit_owner_employee_id,
                prior_entry.location_id, prior_entry.policy_version_id, prior_entry.component_id,
                prior_entry.earning_on, prior_entry.period_start, prior_entry.period_end,
                0,
                prior_entry.basis_snapshot || jsonb_build_object(
                  'correctedBySourceEventId', event.id
                ),
                prior_entry.explanation || jsonb_build_object(
                  'reason', 'source_corrected',
                  'supersededAmountGbp', prior_entry.amount_gbp
                ),
                revision_value, prior_entry.id,
                'correction-clear:' || event.id::text || ':' || prior_entry.id::text
              );
              entry_count_value := entry_count_value + 1;
              insert into pg_temp.commission_affected_bonus_periods (
                employee_id, location_id, period_start
              ) values (
                prior_entry.profit_owner_employee_id, prior_entry.location_id,
                prior_entry.period_start
              );
            end loop;
          end if;
          for spec in select value from jsonb_array_elements(specs) loop
            policy_version_id_value := public.commission_resolve_assignment_2026082901(
              (spec ->> 'employeeId')::uuid, 'ticketing', spec ->> 'serviceCode',
              spec ->> 'recipientRole', event.location_id, event.effective_on
            );
            for component in
              select policy_component.*
              from public.commission_policy_components policy_component
              where policy_component.policy_version_id = policy_version_id_value
                and policy_component.recipient_role = spec ->> 'recipientRole'
                and policy_component.component_type <> 'sales_profit_bonus'
              order by policy_component.sequence
            loop
              include_component := case
                when event.event_type = 'ticket_sale_completed' then
                  component.component_type in (
                    'percentage_of_variable', 'signed_percentage'
                  )
                when event.event_type = 'ticket_issued' and spec ->> 'recipientRole' = 'assistant'
                  then component.component_type in (
                    'fixed_per_unit', 'fixed_per_event', 'explicit_zero'
                  )
                when event.event_type = 'ticket_issued' then
                  component.component_type in (
                    'fixed_per_unit', 'fixed_per_event', 'explicit_zero',
                    'marginal_ticket_tier'
                  )
                when event.event_type in ('ticket_date_changed', 'ticket_reissued') then
                  component.component_type in (
                    'fixed_per_unit', 'fixed_per_event', 'percentage_of_variable',
                    'signed_percentage', 'explicit_zero'
                  )
                else component.component_type in (
                  'fixed_per_unit', 'fixed_per_event', 'percentage_of_variable',
                  'signed_percentage', 'explicit_zero'
                )
              end;
              if not include_component then continue; end if;

              prior_units := 0;
              if component.component_type = 'marginal_ticket_tier' then
                select coalesce(sum((entry.basis_snapshot ->> 'units')::integer), 0)
                into prior_units
                from public.commission_entries entry
                where entry.entry_mode = 'shadow'
                  and entry.component_id = component.id
                  and entry.recipient_employee_id = (spec ->> 'employeeId')::uuid
                  and entry.period_start = period_start_value
                  and not exists (
                    select 1 from public.commission_entries newer
                    where newer.entry_mode = entry.entry_mode
                      and newer.supersedes_entry_id = entry.id
                  );
              end if;
              amount_value := public.commission_component_amount_2026082902(
                component.id, event.variables,
                coalesce((event.variables ->> 'passenger_ticket_count')::integer, 0),
                prior_units
              );

              select entry.* into prior_entry
              from public.commission_entries entry
              where entry.entry_mode = 'shadow'
                and entry.source_case_key = case_key_value
                and entry.recipient_employee_id = (spec ->> 'employeeId')::uuid
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
                run_id_value, 'shadow', 'ordinary', event.id, case_key_value,
                (spec ->> 'employeeId')::uuid,
                coalesce(event.owner_employee_id, event.employee_id), event.location_id,
                policy_version_id_value, component.id, event.effective_on,
                period_start_value, period_end_value, amount_value,
                jsonb_build_object(
                  'sourceVariable', component.source_variable,
                  'basisValue', case when component.source_variable is null then null
                    else event.variables -> component.source_variable end,
                  'units', coalesce((event.variables ->> 'passenger_ticket_count')::integer, 0),
                  'priorMarginalUnits', prior_units
                ),
                jsonb_build_object(
                  'componentType', component.component_type,
                  'serviceCode', spec ->> 'serviceCode',
                  'recipientRole', spec ->> 'recipientRole',
                  'nonPayable', true
                ),
                revision_value, prior_entry.id,
                'ordinary:' || event.id::text || ':' || (spec ->> 'employeeId')
                  || ':' || component.id::text
              ) on conflict (entry_mode, idempotency_key) do nothing;
              if found then entry_count_value := entry_count_value + 1; end if;
            end loop;
          end loop;
        end if;
      end if;

      if failure_code is not null then
        perform public.commission_record_exception_2026082902(
          run_id_value, event.id, event.employee_id, failure_code, failure_details
        );
        update public.commission_source_event_states
        set processing_status = 'held', last_error = failure_code,
            updated_at = clock_timestamp()
        where event_id = event.id;
        held_count := held_count + 1;
      else
        update public.commission_source_event_states
        set processing_status = 'processed', last_error = null,
            updated_at = clock_timestamp()
        where event_id = event.id;
        update public.commission_exceptions
        set status = 'resolved', resolved_by = p_actor_employee_id,
            resolved_at = clock_timestamp(),
            resolution_note = 'Source event processed successfully after retry.'
        where source_event_id = event.id and status = 'open';
        processed_count := processed_count + 1;
        if event.supersedes_event_id is not null then
          insert into pg_temp.commission_affected_bonus_periods (
            employee_id, location_id, period_start
          )
          select coalesce(previous.owner_employee_id, previous.employee_id),
            case
              when previous.variables ->> 'booking_location_id' ~* '^[0-9a-f-]{36}$'
                then (previous.variables ->> 'booking_location_id')::uuid
              else previous.location_id
            end,
            date_trunc('month', previous.effective_on)::date
          from public.commission_source_events previous
          where previous.source_event_id = event.supersedes_event_id;
        end if;
        location_value := case
          when event.variables ->> 'booking_location_id' ~* '^[0-9a-f-]{36}$'
            then (event.variables ->> 'booking_location_id')::uuid
          else event.location_id
        end;
        insert into pg_temp.commission_affected_bonus_periods (
          employee_id, location_id, period_start
        ) values (
          coalesce(event.owner_employee_id, event.employee_id), location_value,
          date_trunc('month', event.effective_on)::date
        );
      end if;
    exception when others then
      failure_code := case
        when sqlstate = '22023'
          and sqlerrm like 'Required Commission source variable is missing:%'
          then 'missing_required_variable'
        else 'calculation_failed'
      end;
      perform public.commission_record_exception_2026082902(
        run_id_value, event.id, event.employee_id, failure_code,
        jsonb_build_object('sqlstate', sqlstate, 'message', left(sqlerrm, 500))
      );
      update public.commission_source_event_states
      set processing_status = 'held', last_error = failure_code,
          updated_at = clock_timestamp()
      where event_id = event.id;
      held_count := held_count + 1;
    end;
  end loop;

  for spec in
    select jsonb_build_object(
      'employeeId', affected.employee_id,
      'locationId', affected.location_id,
      'periodStart', affected.period_start
    )
    from pg_temp.commission_affected_bonus_periods affected
    group by affected.employee_id, affected.location_id, affected.period_start
  loop
    bonus_count := bonus_count + public.commission_recompute_bonus_2026082902(
      run_id_value,
      (spec ->> 'employeeId')::uuid,
      nullif(spec ->> 'locationId', '')::uuid,
      (spec ->> 'periodStart')::date
    );
  end loop;

  update public.commission_calculation_runs
  set status = 'completed', source_event_count = processed_count + held_count,
      entry_count = entry_count_value + bonus_count,
      exception_count = held_count, completed_at = clock_timestamp()
  where id = run_id_value;
  result_json := jsonb_build_object(
    'runId', run_id_value, 'busy', false,
    'processedEvents', processed_count, 'heldEvents', held_count,
    'ordinaryEntries', entry_count_value, 'bonusPeriods', bonus_count,
    'nonPayable', true, 'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, after_state, request_key
  ) values (
    p_actor_employee_id, 'shadow.processed', 'commission_calculation_run', run_id_value,
    result_json, p_request_key
  );
  return result_json;
end
$$;

create or replace function public.commission_retry_exception_2026082902(
  p_actor_employee_id uuid,
  p_exception_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare exception_row public.commission_exceptions%rowtype;
declare result_json jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required' using errcode = '42501';
  end if;
  if p_exception_id is null
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then raise exception 'Invalid Commission exception retry' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-retry:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into result_json from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id and action = 'exception.retried'
    and request_key = p_request_key;
  if result_json is not null then return result_json; end if;

  select * into exception_row from public.commission_exceptions
  where id = p_exception_id and status = 'open' for update;
  if not found then raise exception 'Open Commission exception was not found' using errcode = 'P0002'; end if;
  if exception_row.source_event_id is null then
    raise exception 'Commission exception has no retryable source event' using errcode = '55000';
  end if;

  update public.commission_exceptions
  set retry_count = retry_count + 1, last_retried_at = clock_timestamp()
  where id = p_exception_id;
  update public.commission_source_event_states
  set processing_status = 'pending', next_attempt_at = null, last_error = null,
      updated_at = clock_timestamp()
  where event_id = exception_row.source_event_id;
  result_json := jsonb_build_object(
    'id', p_exception_id, 'sourceEventId', exception_row.source_event_id,
    'queued', true
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, after_state, request_key
  ) values (
    p_actor_employee_id, 'exception.retried', 'commission_exception', p_exception_id,
    result_json, p_request_key
  );
  return result_json;
end
$$;

revoke all on function
  public.commission_validate_aggregate_assignment_dates_2026082902(),
  public.commission_requeue_assignment_events_2026082902(),
  public.commission_component_amount_2026082902(uuid,jsonb,integer,integer),
  public.commission_record_exception_2026082902(uuid,uuid,uuid,text,jsonb),
  public.commission_recompute_bonus_2026082902(uuid,uuid,uuid,date),
  public.commission_process_shadow_2026082902(uuid,integer,text),
  public.commission_retry_exception_2026082902(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.commission_process_shadow_2026082902(uuid,integer,text),
  public.commission_retry_exception_2026082902(uuid,uuid,text)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission', 2026082902, now(),
  jsonb_build_object(
    'migration', '20260829_commission_shadow_processor.sql',
    'mode', 'shadow',
    'capabilities', jsonb_build_array(
      'bounded-shadow-processing', 'correction-supersession',
      'monthly-own-profit-bonus', 'assistance-and-low-fare-cost-attribution',
      'dc-and-rer-service-policies', 'typed-held-exceptions',
      'assignment-requeue', 'authorised-retry'
    )
  )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.commission_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready', coalesce(schema_version.version >= 2026082902, false)
      and to_regprocedure(
        'public.commission_process_shadow_2026082902(uuid,integer,text)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', 2026082902,
    'mode', 'shadow',
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version where component = 'commission'
$$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
