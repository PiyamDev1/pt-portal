-- Commission capability 2026090201.
-- Adds ISO pay currencies, incremental/recurring contributed-profit bonuses,
-- append-only adjustments, confirmed-refund treatment, current-only reporting,
-- and an immutable Commission-to-Accounting review boundary.
--
-- Approved review batches are fixed accounting reports. This migration does not
-- create payroll payments or make unapproved shadow calculations payable.

begin;

select pg_advisory_xact_lock(hashtextextended('pt-portal:commission-schema-migration', 0));

do $commission_2026090201_guard$
declare
  installed_version bigint;
  ticketing_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  select version into ticketing_version
  from public.portal_schema_versions
  where component = 'ticketing';

  if installed_version is null or installed_version < 2026083101 then
    raise exception 'Commission capability 2026083101 is required before capability 2026090201'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_NOT_READY';
  end if;
  if ticketing_version is null or ticketing_version < 2026090204 then
    raise exception 'Ticketing refund correction capability 2026090204 is required first'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026090201 then
    raise exception 'Commission migration capability % cannot run after installed capability %',
      2026090201, installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$commission_2026090201_guard$;

-- A pay currency is any normalized ISO 4217-style three-letter code. GBP is
-- the book currency and therefore never needs a monthly rate row.
alter table public.commission_monthly_exchange_rates
  drop constraint if exists commission_monthly_exchange_rates_currency_check;
alter table public.commission_monthly_exchange_rates
  add constraint commission_monthly_exchange_rates_currency_check check (
    currency ~ '^[A-Z]{3}$' and currency <> 'GBP'
  );

alter table public.commission_entries
  drop constraint if exists commission_entries_pay_currency_check;
alter table public.commission_entries
  add constraint commission_entries_pay_currency_check check (
    pay_currency ~ '^[A-Z]{3}$'
  );

create or replace function public.commission_exchange_rate_2026083001(
  p_currency text,
  p_period_start date
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  currency_value text := upper(btrim(coalesce(p_currency, 'GBP')));
  rate_value numeric;
begin
  if currency_value = 'GBP' then return 1; end if;
  if currency_value !~ '^[A-Z]{3}$'
    or p_period_start is null
    or p_period_start <> date_trunc('month', p_period_start)::date
  then
    raise exception 'Unsupported Commission pay currency or period'
      using errcode = '22023';
  end if;

  select rate.units_per_gbp into rate_value
  from public.commission_monthly_exchange_rates rate
  where rate.currency = currency_value
    and rate.period_start = p_period_start;
  if rate_value is null then
    raise exception 'Monthly exchange rate is required for % %',
      currency_value, p_period_start
      using errcode = '22023', hint = 'COMMISSION_MONTHLY_EXCHANGE_RATE_REQUIRED';
  end if;
  return rate_value;
end
$function$;

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
as $function$
declare
  period_end_value date := (p_period_start + interval '1 month - 1 day')::date;
  policy_version_id_value uuid;
  bonus_component public.commission_policy_components%rowtype;
  gross_sales numeric := 0;
  fare_movements numeric := 0;
  refund_movements numeric := 0;
  ordinary_cost numeric := 0;
  qualifying_value numeric := 0;
  incomplete_count integer := 0;
  sale_count integer := 0;
  bonus_steps jsonb;
  recurring_config jsonb;
  bonus_result jsonb;
  prior_result public.commission_period_results%rowtype;
  result_id uuid;
  result_revision integer := 1;
  prior_entry public.commission_entries%rowtype;
  entry_revision integer := 1;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || p_period_start::text, 0
  ));
  if exists (
    select 1
    from public.commission_review_batches batch
    where batch.period_start = p_period_start
      and batch.status = 'approved_locked'
  ) then
    return 0;
  end if;

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
        where newer.supersedes_event_id = event.id
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
      where newer.supersedes_event_id = event.id
    );

  select coalesce(sum((event.variables ->> 'refund_profit_adjustment_gbp')::numeric), 0)
  into refund_movements
  from public.commission_source_events event
  join public.commission_source_event_states state on state.event_id = event.id
  where event.source_module = 'ticketing'
    and state.processing_status = 'processed'
    and coalesce(event.owner_employee_id, event.employee_id) = p_employee_id
    and event.location_id is not distinct from p_location_id
    and event.effective_on between p_period_start and period_end_value
    and event.event_type in (
      'ticket_refund_confirmed', 'ticket_refund_confirmation_withdrawn'
    )
    and event.variables ->> 'commission_scope' = 'ticket'
    and event.variables ->> 'refund_profit_adjustment_gbp'
      ~ '^-?[0-9]+([.][0-9]+)?$'
    and not exists (
      select 1 from public.commission_source_events newer
      where newer.supersedes_event_id = event.id
    );

  select coalesce(sum(entry.amount_gbp), 0) into ordinary_cost
  from public.commission_entries entry
  where entry.entry_mode = 'shadow'
    and entry.entry_kind in ('ordinary', 'refund_reversal')
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

  if sale_count = 0 and fare_movements = 0 and refund_movements = 0
    and ordinary_cost = 0
    and not exists (
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
    )
  then
    return 0;
  end if;

  qualifying_value := round(
    gross_sales + fare_movements + refund_movements - ordinary_cost,
    2
  );
  bonus_steps := case
    when jsonb_typeof(bonus_component.config -> 'steps') = 'array'
      and jsonb_array_length(bonus_component.config -> 'steps') > 0
    then bonus_component.config -> 'steps'
    else jsonb_build_array(jsonb_build_object(
      'thresholdGbp', bonus_component.threshold_gbp,
      'rewardKind', bonus_component.reward_kind,
      'rewardValue', bonus_component.reward_value
    ))
  end;
  recurring_config := case
    when jsonb_typeof(bonus_component.config -> 'recurring') = 'object'
    then bonus_component.config -> 'recurring'
    else jsonb_build_object('enabled', false)
  end;
  bonus_result := public.commission_calculate_bonus_schedule_2026090201(
    bonus_steps,
    recurring_config,
    coalesce(bonus_component.config ->> 'payCurrency', 'GBP'),
    qualifying_value,
    incomplete_count,
    p_period_start
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
    p_period_start, period_end_value,
    round(gross_sales + fare_movements + refund_movements, 2),
    round(ordinary_cost, 2), qualifying_value,
    (bonus_result ->> 'firstThresholdGbp')::numeric,
    (bonus_result ->> 'achieved')::boolean,
    (bonus_result ->> 'rewardGbp')::numeric,
    incomplete_count,
    jsonb_build_object(
      'basis', 'employee_contributed_profit',
      'grossTicketProfitGbp', round(gross_sales, 2),
      'signedFareMovementsGbp', round(fare_movements, 2),
      'confirmedRefundMovementGbp', round(refund_movements, 2),
      'ordinaryCommissionCostGbp', round(ordinary_cost, 2),
      'sourceSaleCount', sale_count,
      'policyVersionId', policy_version_id_value,
      'bonusSchedule', bonus_steps,
      'recurring', recurring_config,
      'achievedSteps', bonus_result -> 'achievedSteps',
      'recurringOccurrences', (bonus_result ->> 'recurringOccurrences')::integer,
      'rewardPayCurrency', (bonus_result ->> 'rewardPayCurrency')::numeric,
      'payCurrency', bonus_result ->> 'payCurrency',
      'exchangeRateUnitsPerGbp',
        (bonus_result ->> 'exchangeRateUnitsPerGbp')::numeric
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
    jsonb_build_object(
      'periodResultId', result_id,
      'qualifyingProfitGbp', qualifying_value,
      'rewardGbp', (bonus_result ->> 'rewardGbp')::numeric,
      'rewardPayCurrency', (bonus_result ->> 'rewardPayCurrency')::numeric,
      'payCurrency', bonus_result ->> 'payCurrency',
      'exchangeRateUnitsPerGbp',
        (bonus_result ->> 'exchangeRateUnitsPerGbp')::numeric
    ),
    jsonb_build_object(
      'componentType', 'sales_profit_bonus',
      'basis', 'employee_contributed_profit',
      'achieved', (bonus_result ->> 'achieved')::boolean,
      'thresholdGbp', (bonus_result ->> 'firstThresholdGbp')::numeric,
      'achievedSteps', bonus_result -> 'achievedSteps',
      'recurringOccurrences', (bonus_result ->> 'recurringOccurrences')::integer,
      'incompleteInputCount', incomplete_count,
      'serviceCode', 'sales_bonus'
    ),
    entry_revision, prior_entry.id,
    'bonus:' || result_id::text
  );
  return 1;
end
$function$;


-- Refund reversals are linked separately from calculation revisions. A
-- superseding row replaces a calculation; a reversal is an additional debit.
alter table public.commission_entries
  add column if not exists reverses_entry_id uuid
    references public.commission_entries(id) on delete restrict;
alter table public.commission_entries
  drop constraint if exists commission_entries_kind_check;
alter table public.commission_entries
  add constraint commission_entries_kind_check check (
    entry_kind in ('ordinary', 'sales_bonus', 'manual_adjustment', 'refund_reversal')
  );
alter table public.commission_entries
  drop constraint if exists commission_entries_reversal_check;
alter table public.commission_entries
  add constraint commission_entries_reversal_check check (
    (entry_kind = 'refund_reversal' and reverses_entry_id is not null)
    or (entry_kind <> 'refund_reversal' and reverses_entry_id is null)
  );
drop index if exists public.commission_entries_one_refund_reversal_idx;
drop index if exists public.commission_entries_refund_event_reversal_unique_idx;

-- Split a two-decimal total deterministically without losing a penny. The
-- first N stable passenger positions receive the remainder pennies, so the
-- complete set of allocations always adds back to the immutable source total.
create or replace function public.commission_apportion_money_2026090201(
  p_total numeric,
  p_unit_count integer,
  p_unit_position integer
)
returns numeric
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  total_pennies bigint;
  absolute_pennies bigint;
  base_pennies bigint;
  remainder_pennies bigint;
  allocated_pennies bigint;
begin
  if p_total is null or p_unit_count is null or p_unit_position is null
    or p_unit_count < 1 or p_unit_count > 100000
    or p_unit_position < 1 or p_unit_position > p_unit_count
    or p_total <> round(p_total, 2)
    or abs(p_total) > 99999999999999.99
  then
    raise exception 'Invalid Commission passenger apportionment'
      using errcode = '22023';
  end if;

  total_pennies := round(p_total * 100)::bigint;
  absolute_pennies := abs(total_pennies);
  base_pennies := absolute_pennies / p_unit_count;
  remainder_pennies := mod(absolute_pennies, p_unit_count);
  allocated_pennies := base_pennies
    + case when p_unit_position <= remainder_pennies then 1 else 0 end;

  return (case when total_pennies < 0 then -allocated_pennies else allocated_pennies end)
    / 100.0;
end
$function$;

create or replace function public.commission_calculate_bonus_schedule_2026090201(
  p_steps jsonb,
  p_recurring jsonb,
  p_pay_currency text,
  p_qualifying_profit_gbp numeric,
  p_incomplete_input_count integer,
  p_period_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  currency_value text := upper(btrim(coalesce(p_pay_currency, 'GBP')));
  rate_value numeric;
  step_row jsonb;
  step_threshold numeric;
  step_kind text;
  step_reward numeric;
  step_gbp numeric;
  reward_gbp numeric := 0;
  reward_pay numeric := 0;
  achieved_steps jsonb := '[]'::jsonb;
  recurring_enabled boolean := false;
  recurring_start numeric;
  recurring_interval numeric;
  recurring_kind text;
  recurring_reward numeric;
  recurring_limit integer;
  occurrence_count integer := 0;
  first_threshold numeric;
  highest_threshold numeric;
  unexpected_key text;
begin
  if jsonb_typeof(p_steps) is distinct from 'array'
    or jsonb_array_length(p_steps) not between 1 and 24
    or jsonb_typeof(p_recurring) is distinct from 'object'
    or currency_value !~ '^[A-Z]{3}$'
    or p_qualifying_profit_gbp is null
    or p_qualifying_profit_gbp::text in ('NaN', 'Infinity', '-Infinity')
    or abs(p_qualifying_profit_gbp) > 1000000000000
    or p_incomplete_input_count is null
    or p_incomplete_input_count not between 0 and 1000000
    or p_period_start is null
    or p_period_start <> date_trunc('month', p_period_start)::date
  then
    raise exception 'Invalid Commission bonus schedule' using errcode = '22023';
  end if;

  -- Validate the complete JSON shape before performing any cast. These
  -- functions are security-definer boundaries and cannot rely on the browser
  -- schema having been the caller.
  for step_row in select value from jsonb_array_elements(p_steps)
  loop
    if jsonb_typeof(step_row) is distinct from 'object'
      or not step_row ?& array['thresholdGbp', 'rewardKind', 'rewardValue']
      or jsonb_typeof(step_row -> 'thresholdGbp') is distinct from 'number'
      or jsonb_typeof(step_row -> 'rewardKind') is distinct from 'string'
      or jsonb_typeof(step_row -> 'rewardValue') is distinct from 'number'
    then
      raise exception 'Commission bonus schedule contains an invalid step shape'
        using errcode = '22023';
    end if;
    select key into unexpected_key
    from jsonb_object_keys(step_row) supplied(key)
    where supplied.key <> all(array['thresholdGbp', 'rewardKind', 'rewardValue'])
    limit 1;
    if found then
      raise exception 'Commission bonus schedule contains an unknown step field: %',
        unexpected_key using errcode = '22023';
    end if;
  end loop;

  select key into unexpected_key
  from jsonb_object_keys(p_recurring) supplied(key)
  where supplied.key <> all(array[
    'enabled', 'startsAtGbp', 'intervalGbp', 'rewardKind',
    'rewardValue', 'maxOccurrences'
  ])
  limit 1;
  if found then
    raise exception 'Commission recurring bonus contains an unknown field: %',
      unexpected_key using errcode = '22023';
  end if;
  if not p_recurring ? 'enabled'
    or jsonb_typeof(p_recurring -> 'enabled') is distinct from 'boolean'
  then
    raise exception 'Commission recurring bonus must contain a boolean enabled field'
      using errcode = '22023';
  end if;
  if (p_recurring ? 'startsAtGbp'
      and jsonb_typeof(p_recurring -> 'startsAtGbp') is distinct from 'number')
    or (p_recurring ? 'intervalGbp'
      and jsonb_typeof(p_recurring -> 'intervalGbp') is distinct from 'number')
    or (p_recurring ? 'rewardKind'
      and jsonb_typeof(p_recurring -> 'rewardKind') is distinct from 'string')
    or (p_recurring ? 'rewardValue'
      and jsonb_typeof(p_recurring -> 'rewardValue') is distinct from 'number')
    or (p_recurring ? 'maxOccurrences'
      and jsonb_typeof(p_recurring -> 'maxOccurrences') not in ('number', 'null'))
    or (
      jsonb_typeof(p_recurring -> 'maxOccurrences') = 'number'
      and (p_recurring ->> 'maxOccurrences') !~ '^[0-9]+$'
    )
  then
    raise exception 'Commission recurring bonus contains an invalid optional field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) step(value)
    group by nullif(step.value ->> 'thresholdGbp', '')::numeric
    having count(*) > 1
  ) then
    raise exception 'Commission bonus thresholds must be unique' using errcode = '22023';
  end if;

  rate_value := public.commission_exchange_rate_2026083001(currency_value, p_period_start);
  select
    min((step.value ->> 'thresholdGbp')::numeric),
    max((step.value ->> 'thresholdGbp')::numeric)
  into first_threshold, highest_threshold
  from jsonb_array_elements(p_steps) step(value);

  for step_row in
    select value from jsonb_array_elements(p_steps)
    order by (value ->> 'thresholdGbp')::numeric
  loop
    begin
      step_threshold := (step_row ->> 'thresholdGbp')::numeric;
      step_kind := step_row ->> 'rewardKind';
      step_reward := (step_row ->> 'rewardValue')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Commission bonus schedule contains an invalid number'
        using errcode = '22023';
    end;
    if step_threshold < 0 or step_threshold > 100000000
      or step_reward < 0 or step_reward > 1000000
      or step_kind not in ('fixed_gbp', 'percentage_of_qualifying_profit')
      or (step_kind = 'percentage_of_qualifying_profit' and step_reward > 100)
    then
      raise exception 'Commission bonus schedule contains an invalid step'
        using errcode = '22023';
    end if;

    if coalesce(p_incomplete_input_count, 0) = 0
      and p_qualifying_profit_gbp >= step_threshold
    then
      if step_kind = 'fixed_gbp' then
        step_gbp := round(step_reward / rate_value, 2);
        reward_pay := reward_pay + round(step_reward, 2);
      else
        step_gbp := round(p_qualifying_profit_gbp * step_reward / 100, 2);
        reward_pay := reward_pay + round(step_gbp * rate_value, 2);
      end if;
      reward_gbp := reward_gbp + step_gbp;
      achieved_steps := achieved_steps || jsonb_build_array(jsonb_build_object(
        'thresholdGbp', step_threshold,
        'rewardKind', step_kind,
        'rewardValue', step_reward,
        'rewardGbp', step_gbp
      ));
    end if;
  end loop;

  recurring_enabled := (p_recurring ->> 'enabled')::boolean;
  if recurring_enabled then
    if not p_recurring ?& array[
        'startsAtGbp', 'intervalGbp', 'rewardKind', 'rewardValue', 'maxOccurrences'
      ]
    then
      raise exception 'Commission recurring bonus contains an invalid shape'
        using errcode = '22023';
    end if;
    begin
      recurring_start := (p_recurring ->> 'startsAtGbp')::numeric;
      recurring_interval := (p_recurring ->> 'intervalGbp')::numeric;
      recurring_kind := p_recurring ->> 'rewardKind';
      recurring_reward := (p_recurring ->> 'rewardValue')::numeric;
      recurring_limit := nullif(p_recurring ->> 'maxOccurrences', '')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Commission recurring bonus contains an invalid number'
        using errcode = '22023';
    end;
    if recurring_start <= highest_threshold or recurring_start > 100000000
      or recurring_interval <= 0 or recurring_interval > 100000000
      or recurring_reward < 0 or recurring_reward > 1000000
      or recurring_kind not in ('fixed_gbp', 'percentage_of_qualifying_profit')
      or (recurring_kind = 'percentage_of_qualifying_profit' and recurring_reward > 100)
      or (recurring_limit is not null and recurring_limit not between 1 and 10000)
    then
      raise exception 'Invalid recurring Commission bonus' using errcode = '22023';
    end if;
    if coalesce(p_incomplete_input_count, 0) = 0
      and p_qualifying_profit_gbp >= recurring_start
    then
      occurrence_count := floor(
        (p_qualifying_profit_gbp - recurring_start) / recurring_interval
      )::integer + 1;
      if recurring_limit is not null then
        occurrence_count := least(occurrence_count, recurring_limit);
      end if;
      if recurring_kind = 'fixed_gbp' then
        step_gbp := round(recurring_reward * occurrence_count / rate_value, 2);
        reward_pay := reward_pay + round(recurring_reward * occurrence_count, 2);
      else
        step_gbp := round(
          p_qualifying_profit_gbp * recurring_reward * occurrence_count / 100,
          2
        );
        reward_pay := reward_pay + round(step_gbp * rate_value, 2);
      end if;
      reward_gbp := reward_gbp + step_gbp;
    end if;
  end if;

  return jsonb_build_object(
    'achieved', coalesce(p_incomplete_input_count, 0) = 0
      and p_qualifying_profit_gbp >= first_threshold,
    'firstThresholdGbp', first_threshold,
    'rewardGbp', round(reward_gbp, 2),
    'rewardPayCurrency', round(reward_pay, 2),
    'payCurrency', currency_value,
    'exchangeRateUnitsPerGbp', rate_value,
    'achievedSteps', achieved_steps,
    'recurringOccurrences', occurrence_count
  );
end
$function$;

-- Preserve supplied immutable amounts for bonus schedules and refund reversals;
-- ordinary entry amounts remain calculated from the snapshotted component.
create or replace function public.commission_set_entry_pay_values_2026083001()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  component public.commission_policy_components%rowtype;
  source_variables jsonb := '{}'::jsonb;
  values_result jsonb;
  currency_value text;
  exchange_rate_value numeric;
  prior_entry public.commission_entries%rowtype;
  superseded_reversal public.commission_entries%rowtype;
  allocated_gbp numeric;
  allocated_pay numeric;
begin
  if new.entry_kind = 'refund_reversal'
    and new.basis_snapshot ->> 'reversalState' = 'neutralized'
  then
    select * into superseded_reversal
    from public.commission_entries
    where id = new.supersedes_entry_id;
    if not found or superseded_reversal.entry_mode <> new.entry_mode
      or superseded_reversal.entry_kind <> 'refund_reversal'
      or superseded_reversal.reverses_entry_id is distinct from new.reverses_entry_id
      or superseded_reversal.basis_snapshot ->> 'reversalState' <> 'active'
    then
      raise exception 'Refund withdrawal must supersede its active reversal lineage'
        using errcode = '22023';
    end if;
    new.amount_gbp := 0;
    new.amount_pay_currency := 0;
    new.pay_currency := superseded_reversal.pay_currency;
    new.exchange_rate_units_per_gbp := superseded_reversal.exchange_rate_units_per_gbp;
    new.basis_snapshot := new.basis_snapshot || jsonb_build_object(
      'reversesEntryId', new.reverses_entry_id,
      'withdrawnReversalEntryId', superseded_reversal.id,
      'amountPayCurrency', 0,
      'payCurrency', new.pay_currency,
      'exchangeRateUnitsPerGbp', new.exchange_rate_units_per_gbp
    );
    return new;
  end if;

  if new.entry_kind = 'refund_reversal' then
    select * into prior_entry
    from public.commission_entries
    where id = new.reverses_entry_id;
    if not found or prior_entry.entry_mode <> new.entry_mode
      or prior_entry.entry_kind <> 'ordinary'
    then
      raise exception 'Refund reversal must identify an ordinary entry in the same mode'
        using errcode = '22023';
    end if;
    if new.supersedes_entry_id is not null then
      select * into superseded_reversal
      from public.commission_entries where id = new.supersedes_entry_id;
      if not found or superseded_reversal.entry_mode <> new.entry_mode
        or superseded_reversal.entry_kind <> 'refund_reversal'
        or superseded_reversal.reverses_entry_id is distinct from prior_entry.id
      then
        raise exception 'Refund reversal must continue its existing reversal lineage'
          using errcode = '22023';
      end if;
    end if;

    begin
      allocated_gbp := coalesce(
        nullif(new.basis_snapshot ->> 'allocatedOriginalAmountGbp', '')::numeric,
        prior_entry.amount_gbp
      );
      allocated_pay := coalesce(
        nullif(new.basis_snapshot ->> 'allocatedOriginalAmountPayCurrency', '')::numeric,
        prior_entry.amount_pay_currency
      );
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Refund reversal contains invalid allocated amounts'
        using errcode = '22023';
    end;
    if allocated_gbp <> round(allocated_gbp, 2)
      or allocated_pay <> round(allocated_pay, 2)
      or abs(allocated_gbp) > abs(prior_entry.amount_gbp)
      or abs(allocated_pay) > abs(prior_entry.amount_pay_currency)
      or (allocated_gbp <> 0 and sign(allocated_gbp) <> sign(prior_entry.amount_gbp))
      or (allocated_pay <> 0
        and sign(allocated_pay) <> sign(prior_entry.amount_pay_currency))
    then
      raise exception 'Refund reversal allocation exceeds the original entry'
        using errcode = '22023';
    end if;
    new.amount_gbp := -allocated_gbp;
    new.amount_pay_currency := -allocated_pay;
    new.pay_currency := prior_entry.pay_currency;
    new.exchange_rate_units_per_gbp := prior_entry.exchange_rate_units_per_gbp;
    new.basis_snapshot := new.basis_snapshot || jsonb_build_object(
      'reversesEntryId', prior_entry.id,
      'reversalState', 'active',
      'allocatedOriginalAmountGbp', allocated_gbp,
      'allocatedOriginalAmountPayCurrency', allocated_pay,
      'amountPayCurrency', new.amount_pay_currency,
      'payCurrency', new.pay_currency,
      'exchangeRateUnitsPerGbp', new.exchange_rate_units_per_gbp
    );
    return new;
  end if;

  if new.supersedes_entry_id is not null and new.amount_gbp = 0 then
    select * into prior_entry from public.commission_entries where id = new.supersedes_entry_id;
    if found then
      new.amount_pay_currency := 0;
      new.pay_currency := prior_entry.pay_currency;
      new.exchange_rate_units_per_gbp := prior_entry.exchange_rate_units_per_gbp;
      return new;
    end if;
  end if;

  select * into component
  from public.commission_policy_components
  where id = new.component_id;
  if not found then
    new.amount_pay_currency := new.amount_gbp;
    new.pay_currency := 'GBP';
    new.exchange_rate_units_per_gbp := 1;
    return new;
  end if;

  if component.component_type = 'sales_profit_bonus' then
    if coalesce((component.config ->> 'bonusScheduleVersion')::integer, 0) >= 1 then
      currency_value := upper(btrim(coalesce(
        new.basis_snapshot ->> 'payCurrency', component.config ->> 'payCurrency', 'GBP'
      )));
      exchange_rate_value := coalesce(
        nullif(new.basis_snapshot ->> 'exchangeRateUnitsPerGbp', '')::numeric,
        public.commission_exchange_rate_2026083001(currency_value, new.period_start)
      );
      new.amount_gbp := round(coalesce(
        nullif(new.basis_snapshot ->> 'rewardGbp', '')::numeric, new.amount_gbp
      ), 2);
      new.amount_pay_currency := round(coalesce(
        nullif(new.basis_snapshot ->> 'rewardPayCurrency', '')::numeric,
        new.amount_gbp * exchange_rate_value
      ), 2);
      new.pay_currency := currency_value;
      new.exchange_rate_units_per_gbp := exchange_rate_value;
      return new;
    end if;

    currency_value := upper(btrim(coalesce(component.config ->> 'payCurrency', 'GBP')));
    exchange_rate_value := public.commission_exchange_rate_2026083001(
      currency_value, new.period_start
    );
    if component.reward_kind = 'fixed_gbp'
      and coalesce((new.explanation ->> 'achieved')::boolean, false)
    then
      new.amount_pay_currency := round(component.reward_value, 2);
      new.amount_gbp := round(new.amount_pay_currency / exchange_rate_value, 2);
    else
      new.amount_pay_currency := round(new.amount_gbp * exchange_rate_value, 2);
    end if;
    new.pay_currency := currency_value;
    new.exchange_rate_units_per_gbp := exchange_rate_value;
    return new;
  end if;

  if new.source_event_id is not null then
    select event.variables into source_variables
    from public.commission_source_events event
    where event.id = new.source_event_id;
  end if;
  values_result := public.commission_component_values_2026083001(
    component.id,
    coalesce(source_variables, '{}'::jsonb),
    coalesce((new.basis_snapshot ->> 'units')::integer, 0),
    coalesce((new.basis_snapshot ->> 'priorMarginalUnits')::integer, 0),
    new.period_start
  );
  new.amount_gbp := (values_result ->> 'amountGbp')::numeric;
  new.amount_pay_currency := (values_result ->> 'amountPayCurrency')::numeric;
  new.pay_currency := values_result ->> 'payCurrency';
  new.exchange_rate_units_per_gbp :=
    (values_result ->> 'exchangeRateUnitsPerGbp')::numeric;
  new.basis_snapshot := new.basis_snapshot || jsonb_build_object(
    'amountPayCurrency', new.amount_pay_currency,
    'payCurrency', new.pay_currency,
    'exchangeRateUnitsPerGbp', new.exchange_rate_units_per_gbp
  );
  return new;
end
$function$;

-- Authorization is part of the mutation transaction, not a stale preflight.
-- Lock every existing row whose change can remove the actor's current access so
-- demotion, deactivation, role rename, or department removal serializes with
-- the privileged operation.
create or replace function public.commission_lock_actor_authorization_2026090201(
  p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
begin
  perform 1
  from public.employees employee
  where employee.id = p_employee_id
  for share;

  perform 1
  from public.roles role_row
  where role_row.id = (
    select employee.role_id from public.employees employee
    where employee.id = p_employee_id
  )
  for share;

  perform 1
  from public.employee_departments membership
  where membership.employee_id = p_employee_id
  for share;

  perform 1
  from public.departments department
  where department.id in (
    select membership.department_id
    from public.employee_departments membership
    where membership.employee_id = p_employee_id
  )
  for share;
end
$function$;


create or replace function public.commission_set_monthly_exchange_rate_2026083001(
  p_actor_employee_id uuid,
  p_currency text,
  p_period_start date,
  p_units_per_gbp numeric,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  currency_value text := upper(btrim(coalesce(p_currency, '')));
  existing_rate public.commission_monthly_exchange_rates%rowtype;
  rate_id_value uuid;
  result_json jsonb;
  queued_count integer := 0;
  existing_rate_found boolean := false;
  normalized_rate numeric;
  request_key_value text := btrim(coalesce(p_request_key, ''));
begin
  perform public.commission_lock_actor_authorization_2026090201(
    p_actor_employee_id
  );
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if currency_value !~ '^[A-Z]{3}$' or currency_value = 'GBP'
    or p_period_start is null
    or p_period_start <> date_trunc('month', p_period_start)::date
    or p_units_per_gbp is null
    or p_units_per_gbp::text in ('NaN', 'Infinity', '-Infinity')
    or p_units_per_gbp <= 0 or p_units_per_gbp > 1000000000
    or length(request_key_value) not between 8 and 120
  then
    raise exception 'Invalid monthly Commission exchange rate' using errcode = '22023';
  end if;
  normalized_rate := round(p_units_per_gbp, 6);

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-exchange-rate:' || currency_value || ':' || p_period_start::text, 0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'exchange_rate.set'
    and request_key = request_key_value;
  if result_json is not null then
    if result_json ->> 'currency' <> currency_value
      or (result_json ->> 'periodStart')::date <> p_period_start
      or (result_json ->> 'unitsPerGbp')::numeric <> normalized_rate
    then
      raise exception 'Commission exchange-rate request key was reused with a different payload'
        using errcode = '22023', hint = 'COMMISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into existing_rate
  from public.commission_monthly_exchange_rates
  where currency = currency_value and period_start = p_period_start
  for update;
  existing_rate_found := found;
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || p_period_start::text, 0
  ));
  if (not existing_rate_found or existing_rate.units_per_gbp <> normalized_rate) and exists (
    select 1
    from public.commission_review_batches batch
    where batch.period_start = p_period_start
      and batch.status in ('draft', 'submitted_to_accounting', 'approved_locked')
  ) then
    raise exception 'The monthly exchange rate is locked by Commission review'
      using errcode = '55000', hint = 'COMMISSION_REVIEW_PERIOD_LOCKED';
  end if;
  if existing_rate_found and existing_rate.units_per_gbp <> normalized_rate and exists (
    select 1 from public.commission_entries entry
    where entry.pay_currency = currency_value and entry.period_start = p_period_start
    union all
    select 1 from public.commission_adjustments adjustment
    where adjustment.pay_currency = currency_value
      and adjustment.period_start = p_period_start
  ) then
    raise exception 'The monthly exchange rate is locked because calculations already use it'
      using errcode = '55000', hint = 'COMMISSION_EXCHANGE_RATE_LOCKED';
  end if;

  insert into public.commission_monthly_exchange_rates (
    currency, period_start, units_per_gbp, set_by
  ) values (
    currency_value, p_period_start, normalized_rate, p_actor_employee_id
  )
  on conflict (currency, period_start) do update
  set units_per_gbp = excluded.units_per_gbp,
      set_by = excluded.set_by,
      created_at = clock_timestamp()
  returning id into rate_id_value;

  update public.commission_source_event_states state
  set processing_status = 'pending', next_attempt_at = null, last_error = null,
      updated_at = clock_timestamp()
  from public.commission_source_events event
  where state.event_id = event.id
    and state.processing_status = 'held'
    and state.last_error = 'missing_exchange_rate'
    and date_trunc('month', event.effective_on)::date = p_period_start;
  get diagnostics queued_count = row_count;

  result_json := jsonb_build_object(
    'id', rate_id_value,
    'currency', currency_value,
    'periodStart', p_period_start,
    'unitsPerGbp', normalized_rate,
    'queuedEvents', queued_count,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason,
    before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'exchange_rate.set', 'commission_monthly_exchange_rate',
    rate_id_value, 'Monthly ISO pay-currency conversion rate recorded',
    case when existing_rate.id is null then null else jsonb_build_object(
      'unitsPerGbp', existing_rate.units_per_gbp
    ) end,
    result_json,
    request_key_value
  );
  return result_json;
end
$function$;

-- Append-only penalties and their append-only reversals. Amounts are always
-- positive; direction determines their signed effect on the employee report.
create table if not exists public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  category text not null,
  direction text not null default 'debit',
  amount_pay_currency numeric(18,2) not null,
  pay_currency text not null,
  exchange_rate_units_per_gbp numeric(18,6) not null,
  amount_gbp numeric(18,2) not null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  affects_qualifying_profit boolean not null default false,
  reverses_adjustment_id uuid references public.commission_adjustments(id) on delete restrict,
  created_by uuid not null references public.employees(id) on delete restrict,
  request_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_adjustments_period_check check (
    period_start = date_trunc('month', period_start)::date
    and period_end = (period_start + interval '1 month - 1 day')::date
  ),
  constraint commission_adjustments_category_check check (category in ('adm', 'loss', 'other')),
  constraint commission_adjustments_direction_check check (direction in ('debit', 'credit')),
  constraint commission_adjustments_amount_check check (
    amount_pay_currency > 0 and amount_gbp > 0 and exchange_rate_units_per_gbp > 0
  ),
  constraint commission_adjustments_currency_check check (pay_currency ~ '^[A-Z]{3}$'),
  constraint commission_adjustments_reason_check check (length(btrim(reason)) between 3 and 500),
  constraint commission_adjustments_evidence_check check (jsonb_typeof(evidence) = 'object'),
  constraint commission_adjustments_target_basis_check check (not affects_qualifying_profit),
  constraint commission_adjustments_reversal_check check (
    (direction = 'debit' and reverses_adjustment_id is null)
    or (direction = 'credit' and reverses_adjustment_id is not null)
  ),
  constraint commission_adjustments_request_check check (
    length(btrim(request_key)) between 8 and 200
  ),
  constraint commission_adjustments_actor_request_unique unique (created_by, request_key),
  constraint commission_adjustments_one_reversal_unique unique (reverses_adjustment_id)
);

create index if not exists commission_adjustments_employee_period_idx
  on public.commission_adjustments (employee_id, period_start desc, created_at desc);

alter table public.commission_adjustments enable row level security;
revoke all on table public.commission_adjustments from public, anon, authenticated, service_role;
grant select on table public.commission_adjustments to service_role;

drop trigger if exists commission_adjustments_immutable_2026090201
  on public.commission_adjustments;
create trigger commission_adjustments_immutable_2026090201
  before update or delete on public.commission_adjustments
  for each row execute function public.commission_reject_immutable_mutation_2026082901();

create or replace function public.commission_append_adjustment_2026090201(
  p_actor_employee_id uuid,
  p_employee_id uuid,
  p_category text,
  p_direction text,
  p_amount_pay_currency numeric,
  p_pay_currency text,
  p_period_start date,
  p_reason text,
  p_evidence jsonb,
  p_reverses_adjustment_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  category_value text := lower(btrim(coalesce(p_category, '')));
  direction_value text := lower(btrim(coalesce(p_direction, '')));
  currency_value text := upper(btrim(coalesce(p_pay_currency, '')));
  rate_value numeric;
  amount_value numeric;
  original public.commission_adjustments%rowtype;
  created public.commission_adjustments%rowtype;
  result_json jsonb;
  request_key_value text := btrim(coalesce(p_request_key, ''));
  normalized_pay_amount numeric;
begin
  perform public.commission_lock_actor_authorization_2026090201(
    p_actor_employee_id
  );
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_employee_id is null or category_value not in ('adm', 'loss', 'other')
    or direction_value not in ('debit', 'credit')
    or currency_value !~ '^[A-Z]{3}$'
    or p_amount_pay_currency is null
    or p_amount_pay_currency::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount_pay_currency <= 0 or p_amount_pay_currency > 9999999999999999.99
    or p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date
    or length(btrim(coalesce(p_reason, ''))) not between 3 and 500
    or jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) is distinct from 'object'
    or length(request_key_value) not between 8 and 200
  then
    raise exception 'Invalid Commission adjustment request' using errcode = '22023';
  end if;
  normalized_pay_amount := round(p_amount_pay_currency, 2);
  if (direction_value = 'debit' and p_reverses_adjustment_id is not null)
    or (direction_value = 'credit' and p_reverses_adjustment_id is null)
  then
    raise exception 'Only a credit may reverse an existing penalty' using errcode = '22023';
  end if;
  perform 1 from public.employees where id = p_employee_id and is_active;
  if not found then raise exception 'Active employee was not found' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-adjustment:' || p_actor_employee_id::text || ':' || request_key_value, 0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'adjustment.created'
    and request_key = request_key_value;
  if result_json is not null then
    select * into original
    from public.commission_adjustments
    where id = (result_json ->> 'id')::uuid;
    if result_json ->> 'employeeId' <> p_employee_id::text
      or result_json ->> 'category' <> category_value
      or result_json ->> 'direction' <> direction_value
      or (result_json ->> 'amountPayCurrency')::numeric
        <> normalized_pay_amount
      or result_json ->> 'payCurrency' <> currency_value
      or (result_json ->> 'periodStart')::date <> p_period_start
      or nullif(result_json ->> 'reversesAdjustmentId', '')::uuid
        is distinct from p_reverses_adjustment_id
      or not found
      or original.reason <> btrim(p_reason)
      or original.evidence <> coalesce(p_evidence, '{}'::jsonb)
    then
      raise exception 'Commission adjustment request key was reused with a different payload'
        using errcode = '22023', hint = 'COMMISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  -- Preparing a review batch freezes the period boundary. Use the same
  -- advisory lock as preparation so a penalty cannot race the snapshot.
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || p_period_start::text, 0
  ));
  if exists (
    select 1
    from public.commission_review_batches batch
    where batch.period_start = p_period_start
      and batch.status in ('draft', 'submitted_to_accounting', 'approved_locked')
  ) then
    raise exception 'That Commission month is locked for review; return it before adding a penalty'
      using errcode = '55000', hint = 'COMMISSION_REVIEW_PERIOD_LOCKED';
  end if;

  if p_reverses_adjustment_id is not null then
    select * into original from public.commission_adjustments
    where id = p_reverses_adjustment_id for update;
    if not found then raise exception 'Adjustment to reverse was not found' using errcode = 'P0002'; end if;
    if original.direction <> 'debit'
      or original.employee_id <> p_employee_id
      or original.category <> category_value
      or original.period_start <> p_period_start
      or original.pay_currency <> currency_value
      or original.amount_pay_currency <> normalized_pay_amount
      or exists (
        select 1 from public.commission_adjustments reversal
        where reversal.reverses_adjustment_id = original.id
      )
    then
      raise exception 'Adjustment reversal must exactly offset one unreversed penalty'
        using errcode = '22023';
    end if;
  end if;

  if p_reverses_adjustment_id is not null then
    rate_value := original.exchange_rate_units_per_gbp;
    amount_value := original.amount_gbp;
  else
    rate_value := public.commission_exchange_rate_2026083001(currency_value, p_period_start);
    amount_value := round(normalized_pay_amount / rate_value, 2);
  end if;
  insert into public.commission_adjustments (
    employee_id, period_start, period_end, category, direction,
    amount_pay_currency, pay_currency, exchange_rate_units_per_gbp, amount_gbp,
    reason, evidence, affects_qualifying_profit, reverses_adjustment_id,
    created_by, request_key
  ) values (
    p_employee_id, p_period_start, (p_period_start + interval '1 month - 1 day')::date,
    category_value, direction_value, normalized_pay_amount, currency_value,
    rate_value, amount_value, btrim(p_reason), coalesce(p_evidence, '{}'::jsonb), false,
    p_reverses_adjustment_id, p_actor_employee_id, request_key_value
  ) returning * into created;

  result_json := jsonb_build_object(
    'id', created.id,
    'employeeId', created.employee_id,
    'periodStart', created.period_start,
    'category', created.category,
    'direction', created.direction,
    'amountPayCurrency', created.amount_pay_currency,
    'payCurrency', created.pay_currency,
    'exchangeRateUnitsPerGbp', created.exchange_rate_units_per_gbp,
    'amountGbp', created.amount_gbp,
    'reversesAdjustmentId', created.reverses_adjustment_id,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason, after_state, request_key
  ) values (
    p_actor_employee_id, 'adjustment.created', 'commission_adjustment', created.id,
    btrim(p_reason), result_json, request_key_value
  );
  return result_json;
end
$function$;

-- Once Accounting has locked a month, no later Commission calculation may
-- alter that month's financial truth. Operational modules still append source
-- facts normally; the worker records and holds those facts for explicit audit
-- instead of allowing a trigger failure to escape into Ticketing or Packages.
alter table public.commission_exceptions
  drop constraint if exists commission_exceptions_code_check;
alter table public.commission_exceptions
  add constraint commission_exceptions_code_check check (exception_code in (
    'needs_policy', 'ambiguous_assignment', 'unsupported_contract_version',
    'missing_required_variable', 'missing_exchange_rate', 'inactive_recipient',
    'invalid_source_lineage',
    'unresolved_package_scope', 'package_source_not_authoritative',
    'bonus_period_incomplete', 'calculation_failed', 'review_period_locked',
    'refund_dependency_pending', 'refund_lineage_pending',
    'refund_apportionment_invalid'
  ));

create or replace function public.commission_guard_approved_entry_2026090201()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || new.period_start::text, 0
  ));
  if exists (
    select 1
    from public.commission_review_batches batch
    where batch.period_start = new.period_start
      and batch.status = 'approved_locked'
  ) then
    raise exception 'Approved Commission period is financially locked'
      using errcode = '55000', hint = 'COMMISSION_REVIEW_PERIOD_LOCKED';
  end if;
  return new;
end
$function$;

drop trigger if exists commission_entries_approved_period_guard_2026090201
  on public.commission_entries;
create trigger commission_entries_approved_period_guard_2026090201
  before insert on public.commission_entries
  for each row execute function public.commission_guard_approved_entry_2026090201();

create table if not exists public.commission_refund_decisions (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null
    references public.commission_source_events(id) on delete restrict,
  refund_id uuid not null references public.ticket_refunds(id) on delete restrict,
  original_entry_id uuid not null references public.commission_entries(id) on delete restrict,
  recipient_employee_id uuid not null references public.employees(id) on delete restrict,
  treatment text not null,
  reversal_entry_id uuid references public.commission_entries(id) on delete restrict,
  policy_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_refund_decisions_treatment_check
    check (treatment in ('retain', 'reverse_original')),
  constraint commission_refund_decisions_reversal_check check (
    (treatment = 'retain' and reversal_entry_id is null)
    or (treatment = 'reverse_original' and reversal_entry_id is not null)
  ),
  constraint commission_refund_decisions_snapshot_check
    check (jsonb_typeof(policy_snapshot) = 'object'),
  constraint commission_refund_decisions_source_entry_unique
    unique (source_event_id, original_entry_id)
);

create index if not exists commission_refund_decisions_refund_idx
  on public.commission_refund_decisions (refund_id, created_at desc);

alter table public.commission_refund_decisions enable row level security;
revoke all on table public.commission_refund_decisions
  from public, anon, authenticated, service_role;
grant select on table public.commission_refund_decisions to service_role;

drop trigger if exists commission_refund_decisions_immutable_2026090201
  on public.commission_refund_decisions;
create trigger commission_refund_decisions_immutable_2026090201
  before update or delete on public.commission_refund_decisions
  for each row execute function public.commission_reject_immutable_mutation_2026082901();

create or replace function public.commission_capture_confirmed_ticket_refund_2026090201()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  refund_row public.ticket_refunds%rowtype;
  booking_row public.ticket_bookings%rowtype;
  prior_event public.commission_source_events%rowtype;
  source_fact_key_value text;
  source_event_type_value text;
begin
  select * into refund_row from public.ticket_refunds where id = new.refund_id;
  if not found then return new; end if;

  select * into booking_row from public.ticket_bookings where id = refund_row.booking_id;
  if not found then
    raise exception 'Confirmed refund booking was not found' using errcode = 'P0002';
  end if;

  source_fact_key_value := 'refund:' || refund_row.id::text || ':confirmed';
  select event.* into prior_event
  from public.commission_source_events event
  where event.source_module = 'ticketing'
    and event.source_fact_key = source_fact_key_value
  order by event.event_version desc
  limit 1;

  if new.event_type = 'confirmed_correct'
    and refund_row.confirmed_correct_at is not null
    and refund_row.commission_scope = 'ticket'
  then
    source_event_type_value := 'ticket_refund_confirmed';
  elsif prior_event.id is not null
    and prior_event.event_type = 'ticket_refund_confirmed'
    and (refund_row.confirmed_correct_at is null or new.event_type = 'voided')
  then
    source_event_type_value := 'ticket_refund_confirmation_withdrawn';
  else
    return new;
  end if;

  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', gen_random_uuid(),
    'source_fact_key', source_fact_key_value,
    'source_record_id', refund_row.id,
    'event_type', source_event_type_value,
    'contract_version', 1,
    'event_version', coalesce(prior_event.event_version, 0) + 1,
    'supersedes_event_id', prior_event.source_event_id,
    'employee_id', refund_row.owner_employee_id,
    'owner_employee_id', refund_row.owner_employee_id,
    'location_id', booking_row.location_id,
    'occurred_at', new.created_at,
    'effective_on', new.event_date,
    'source_path', '/dashboard/ticketing/refund-calculator',
    'variables', jsonb_build_object(
      'refund_id', refund_row.id,
      'booking_id', refund_row.booking_id,
      'transaction_id', refund_row.transaction_id,
      'transaction_passenger_id', refund_row.transaction_passenger_id,
      'commission_scope', refund_row.commission_scope,
      'refund_lifecycle_event_id', new.id,
      'refund_lifecycle_event_type', new.event_type,
      'confirmed_correct_at', refund_row.confirmed_correct_at,
      'settlement_mode', refund_row.settlement_mode,
      'confirmed_company_result_gbp', case
        when source_event_type_value = 'ticket_refund_confirmed'
          then refund_row.actual_company_result_gbp
        else null
      end,
      'refund_profit_adjustment_gbp', case
        when source_event_type_value = 'ticket_refund_confirmed'
          then round(
            refund_row.airline_recovered_gbp
              - refund_row.customer_settled_gbp
              - refund_row.other_actual_costs_gbp,
            2
          )
        else 0
      end,
      'previous_confirmed_company_result_gbp',
        new.event_data -> 'previousConfirmedCompanyResultGbp'
    ),
    'idempotency_key', 'ticket-refund-lifecycle:' || new.id::text
  ));
  return new;
end
$function$;

drop trigger if exists ticket_refund_events_commission_confirmed_2026090201
  on public.ticket_refund_events;
create trigger ticket_refund_events_commission_confirmed_2026090201
  after insert on public.ticket_refund_events
  for each row execute function public.commission_capture_confirmed_ticket_refund_2026090201();

-- Ticketing can be deployed shortly before Commission. Capture any ticket
-- refunds confirmed in that interval so deployment order cannot lose a source
-- fact. Refunds that have already returned to provisional (or were voided) are
-- intentionally excluded.
do $commission_confirmed_refund_backfill$
declare
  source_row record;
begin
  for source_row in
    select distinct on (refund.id)
      refund.id as refund_id,
      refund.booking_id,
      refund.transaction_id,
      refund.transaction_passenger_id,
      refund.owner_employee_id,
      refund.commission_scope,
      refund.confirmed_correct_at,
      refund.settlement_mode,
      refund.actual_company_result_gbp,
      round(
        refund.airline_recovered_gbp - refund.customer_settled_gbp
          - refund.other_actual_costs_gbp,
        2
      ) as refund_profit_adjustment_gbp,
      booking.location_id,
      lifecycle.id as lifecycle_event_id,
      lifecycle.event_type as lifecycle_event_type,
      lifecycle.created_at as lifecycle_created_at,
      lifecycle.event_date as lifecycle_event_date
    from public.ticket_refunds refund
    join public.ticket_bookings booking on booking.id = refund.booking_id
    join public.ticket_refund_events lifecycle
      on lifecycle.refund_id = refund.id
      and lifecycle.event_type = 'confirmed_correct'
    where refund.commission_scope = 'ticket'
      and refund.confirmed_correct_at is not null
      and refund.status <> 'voided'
      and not exists (
        select 1
        from public.commission_source_events source_event
        where source_event.source_module = 'ticketing'
          and source_event.source_fact_key = 'refund:' || refund.id::text || ':confirmed'
      )
    order by refund.id, lifecycle.created_at desc, lifecycle.id desc
  loop
    perform public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', gen_random_uuid(),
      'source_fact_key', 'refund:' || source_row.refund_id::text || ':confirmed',
      'source_record_id', source_row.refund_id,
      'event_type', 'ticket_refund_confirmed',
      'contract_version', 1,
      'event_version', 1,
      'supersedes_event_id', null,
      'employee_id', source_row.owner_employee_id,
      'owner_employee_id', source_row.owner_employee_id,
      'location_id', source_row.location_id,
      'occurred_at', source_row.lifecycle_created_at,
      'effective_on', source_row.lifecycle_event_date,
      'source_path', '/dashboard/ticketing/refund-calculator',
      'variables', jsonb_build_object(
        'refund_id', source_row.refund_id,
        'booking_id', source_row.booking_id,
        'transaction_id', source_row.transaction_id,
        'transaction_passenger_id', source_row.transaction_passenger_id,
        'commission_scope', source_row.commission_scope,
        'refund_lifecycle_event_id', source_row.lifecycle_event_id,
        'refund_lifecycle_event_type', source_row.lifecycle_event_type,
        'confirmed_correct_at', source_row.confirmed_correct_at,
        'settlement_mode', source_row.settlement_mode,
        'confirmed_company_result_gbp', source_row.actual_company_result_gbp,
        'refund_profit_adjustment_gbp', source_row.refund_profit_adjustment_gbp,
        'previous_confirmed_company_result_gbp', null
      ),
      'idempotency_key', 'ticket-refund-lifecycle:' || source_row.lifecycle_event_id::text
    ));
  end loop;
end
$commission_confirmed_refund_backfill$;

create or replace function public.commission_process_refunds_2026090201(
  p_actor_employee_id uuid,
  p_limit integer default 50,
  p_request_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  run_id_value uuid;
  event public.commission_source_events%rowtype;
  refund_row public.ticket_refunds%rowtype;
  original_entry public.commission_entries%rowtype;
  decision_row public.commission_refund_decisions%rowtype;
  existing_decision public.commission_refund_decisions%rowtype;
  active_reversal public.commission_entries%rowtype;
  reversal_id uuid;
  treatment_value text;
  profile_id_value uuid;
  booking_location_value uuid;
  passenger_count_value integer;
  passenger_position_value integer;
  basis_units_value integer;
  allocated_gbp_value numeric;
  allocated_pay_value numeric;
  period_start_value date;
  period_end_value date;
  exception_hint text;
  failure_code text;
  failure_details jsonb;
  affected record;
  result_json jsonb;
  processed_count integer := 0;
  reversal_count integer := 0;
  neutralized_count integer := 0;
  retained_count integer := 0;
  failure_count integer := 0;
  request_key_value text := coalesce(nullif(btrim(p_request_key), ''), gen_random_uuid()::text);
begin
  if p_actor_employee_id is not null then
    perform public.commission_lock_actor_authorization_2026090201(
      p_actor_employee_id
    );
  end if;
  if p_actor_employee_id is not null
    and not public.commission_actor_can_manage_2026082901(p_actor_employee_id)
  then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_limit is null or p_limit not between 1 and 200
    or length(request_key_value) not between 8 and 200
  then
    raise exception 'Invalid Commission refund-processing request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-refund-process:'
      || coalesce(p_actor_employee_id::text, 'system') || ':' || request_key_value,
    0
  ));
  select audit.after_state into result_json
  from public.commission_audit_events audit
  where audit.actor_employee_id is not distinct from p_actor_employee_id
    and audit.action = 'refunds.processed'
    and audit.request_key = request_key_value;
  if found then
    if (result_json ->> 'requestedLimit')::integer <> p_limit then
      raise exception 'Commission refund-processing request key was reused with a different payload'
        using errcode = '22023', hint = 'COMMISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('commission:shadow-worker', 0)) then
    return jsonb_build_object(
      'busy', true, 'processedEvents', 0, 'reversedEntries', 0,
      'neutralizedEntries', 0, 'retainedEntries', 0, 'failures', 0,
      'requestedLimit', p_limit, 'nonPayable', true, 'idempotentReplay', false
    );
  end if;

  insert into public.commission_calculation_runs (
    run_mode, run_type, status, triggered_by
  ) values ('shadow', 'worker', 'running', p_actor_employee_id)
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
      join public.commission_source_events source_event
        on source_event.id = state.event_id
      where source_event.source_module = 'ticketing'
        and source_event.event_type in (
          'ticket_refund_confirmed', 'ticket_refund_confirmation_withdrawn'
        )
        and (
          state.processing_status = 'pending'
          or (
            state.processing_status = 'held'
            and state.next_attempt_at is not null
            and state.next_attempt_at <= clock_timestamp()
          )
        )
      order by source_event.effective_on, source_event.occurred_at,
        source_event.source_fact_key, source_event.event_version, source_event.id
      for update of state skip locked
      limit p_limit
    ), updated as (
      update public.commission_source_event_states state
      set processing_status = 'processing', attempt_count = attempt_count + 1,
          next_attempt_at = null, last_error = null, updated_at = clock_timestamp()
      from claimed
      where state.event_id = claimed.event_id
      returning state.event_id
    )
    select source_event.*
    from public.commission_source_events source_event
    join updated on updated.event_id = source_event.id
    order by source_event.effective_on, source_event.occurred_at,
      source_event.source_fact_key, source_event.event_version, source_event.id
  loop
    failure_code := null;
    failure_details := '{}'::jsonb;
    begin
      period_start_value := date_trunc('month', event.effective_on)::date;
      period_end_value := (period_start_value + interval '1 month - 1 day')::date;
      perform pg_advisory_xact_lock(hashtextextended(
        'commission-review-period:' || period_start_value::text, 0
      ));
      if exists (
        select 1 from public.commission_review_batches batch
        where batch.period_start = period_start_value
          and batch.status = 'approved_locked'
      ) then
        failure_code := 'review_period_locked';
        failure_details := jsonb_build_object(
          'periodStart', period_start_value,
          'reason', 'approved_accounting_report_is_fixed'
        );
      elsif event.supersedes_event_id is not null
        and not exists (
          select 1
          from public.commission_source_event_states predecessor_state
          where predecessor_state.event_id = event.supersedes_event_id
            and predecessor_state.processing_status = 'processed'
        )
      then
        failure_code := 'refund_lineage_pending';
        failure_details := jsonb_build_object(
          'predecessorSourceEventId', event.supersedes_event_id,
          'reason', 'predecessor_not_processed'
        );
      end if;

      if failure_code is not null then
        perform public.commission_record_exception_2026082902(
          run_id_value, event.id, coalesce(event.owner_employee_id, event.employee_id),
          failure_code, failure_details
        );
        update public.commission_source_event_states
        set processing_status = 'held',
            next_attempt_at = case
              when failure_code = 'refund_lineage_pending'
                then clock_timestamp() + interval '1 minute'
              else null
            end,
            last_error = failure_code, updated_at = clock_timestamp()
        where event_id = event.id;
        failure_count := failure_count + 1;
        continue;
      end if;

      select refund.* into refund_row
      from public.ticket_refunds refund
      where refund.id = event.source_record_id;
      if not found then
        raise exception 'Ticket refund source row was not found'
          using errcode = 'P0002', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
      end if;
      select booking.location_id into booking_location_value
      from public.ticket_bookings booking
      where booking.id = refund_row.booking_id;
      if not found then
        raise exception 'Ticket refund booking was not found'
          using errcode = 'P0002', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
      end if;

      if event.event_type = 'ticket_refund_confirmed'
        and refund_row.commission_scope <> 'ticket'
      then
        update public.commission_source_event_states
        set processing_status = 'processed', next_attempt_at = null,
            last_error = null, updated_at = clock_timestamp()
        where event_id = event.id;
        update public.commission_exceptions
        set status = 'resolved', resolved_by = p_actor_employee_id,
            resolved_at = clock_timestamp(),
            resolution_note = 'Package-scoped refund made no ticket Commission entry.'
        where source_event_id = event.id and status = 'open';
        processed_count := processed_count + 1;
        continue;
      end if;

      if event.event_type = 'ticket_refund_confirmed' and exists (
        select 1
        from public.commission_source_events original_source
        join public.commission_source_event_states original_state
          on original_state.event_id = original_source.id
        where original_source.source_module = 'ticketing'
          and original_source.event_type in (
            'ticket_issued', 'ticket_sale_completed', 'ticket_date_changed',
            'ticket_reissued', 'ticket_low_fare_adjusted',
            'ticket_higher_fare_adjusted'
          )
          and (
            original_source.source_record_id = refund_row.transaction_id
            or original_source.variables ->> 'transaction_id' = refund_row.transaction_id::text
            or original_source.variables ->> 'root_transaction_id' = refund_row.transaction_id::text
          )
          and not exists (
            select 1 from public.commission_source_events newer_source
            where newer_source.supersedes_event_id = original_source.id
          )
          and original_state.processing_status in ('pending', 'processing', 'held')
      ) then
        failure_code := 'refund_dependency_pending';
        failure_details := jsonb_build_object(
          'transactionId', refund_row.transaction_id,
          'reason', 'current_original_ticket_earning_not_processed'
        );
        perform public.commission_record_exception_2026082902(
          run_id_value, event.id, coalesce(event.owner_employee_id, event.employee_id),
          failure_code, failure_details
        );
        update public.commission_source_event_states
        set processing_status = 'held',
            next_attempt_at = clock_timestamp() + interval '1 minute',
            last_error = failure_code, updated_at = clock_timestamp()
        where event_id = event.id;
        failure_count := failure_count + 1;
        continue;
      end if;

      if event.event_type = 'ticket_refund_confirmed' and not exists (
        select 1
        from public.commission_entries entry
        join public.commission_source_events original_source
          on original_source.id = entry.source_event_id
        where entry.entry_mode = 'shadow'
          and entry.entry_kind = 'ordinary'
          and original_source.source_module = 'ticketing'
          and original_source.event_type in (
            'ticket_issued', 'ticket_sale_completed', 'ticket_date_changed',
            'ticket_reissued', 'ticket_low_fare_adjusted',
            'ticket_higher_fare_adjusted'
          )
          and (
            original_source.source_record_id = refund_row.transaction_id
            or original_source.variables ->> 'transaction_id' = refund_row.transaction_id::text
            or original_source.variables ->> 'root_transaction_id' = refund_row.transaction_id::text
          )
          and not exists (
            select 1 from public.commission_entries newer_entry
            where newer_entry.entry_mode = entry.entry_mode
              and newer_entry.supersedes_entry_id = entry.id
          )
          and not exists (
            select 1 from public.commission_source_events newer_source
            where newer_source.supersedes_event_id = original_source.id
          )
      ) then
        failure_code := 'refund_dependency_pending';
        failure_details := jsonb_build_object(
          'transactionId', refund_row.transaction_id,
          'reason', 'current_original_ticket_earning_missing'
        );
        perform public.commission_record_exception_2026082902(
          run_id_value, event.id, coalesce(event.owner_employee_id, event.employee_id),
          failure_code, failure_details
        );
        update public.commission_source_event_states
        set processing_status = 'held',
            next_attempt_at = clock_timestamp() + interval '1 minute',
            last_error = failure_code, updated_at = clock_timestamp()
        where event_id = event.id;
        failure_count := failure_count + 1;
        continue;
      end if;

      if event.event_type = 'ticket_refund_confirmation_withdrawn' then
        for decision_row in
          select decision.*
          from public.commission_refund_decisions decision
          where decision.source_event_id = event.supersedes_event_id
          order by decision.created_at, decision.id
        loop
          select entry.* into original_entry
          from public.commission_entries entry
          where entry.id = decision_row.original_entry_id;
          if not found then
            raise exception 'Refund decision original entry was not found'
              using errcode = 'P0002', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
          end if;

          treatment_value := decision_row.treatment;
          reversal_id := null;
          if treatment_value = 'reverse_original' then
            active_reversal := null;
            select reversal.* into active_reversal
            from public.commission_entries reversal
            where reversal.entry_mode = 'shadow'
              and reversal.entry_kind = 'refund_reversal'
              and reversal.source_case_key =
                'ticket-refund:' || event.source_record_id::text
                  || ':' || original_entry.id::text
              and not exists (
                select 1 from public.commission_entries newer
                where newer.entry_mode = reversal.entry_mode
                  and newer.supersedes_entry_id = reversal.id
              )
            order by reversal.revision desc, reversal.created_at desc, reversal.id desc
            limit 1;
            if active_reversal.id is null then
              raise exception 'Refund reversal lineage was not found for withdrawal'
                using errcode = 'P0002', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
            elsif active_reversal.basis_snapshot ->> 'reversalState' = 'active' then
              insert into public.commission_entries (
                run_id, entry_mode, entry_kind, source_event_id, source_case_key,
                recipient_employee_id, profit_owner_employee_id, location_id,
                policy_version_id, component_id, earning_on, period_start, period_end,
                amount_gbp, basis_snapshot, explanation, revision,
                supersedes_entry_id, reverses_entry_id, idempotency_key
              ) values (
                run_id_value, 'shadow', 'refund_reversal', event.id,
                active_reversal.source_case_key,
                original_entry.recipient_employee_id,
                original_entry.profit_owner_employee_id, original_entry.location_id,
                original_entry.policy_version_id, original_entry.component_id,
                event.effective_on, period_start_value, period_end_value, 0,
                jsonb_build_object(
                  'refundId', event.source_record_id,
                  'originalEntryId', original_entry.id,
                  'reversalState', 'neutralized'
                ),
                jsonb_build_object(
                  'serviceCode', original_entry.explanation ->> 'serviceCode',
                  'reason', 'refund_confirmation_withdrawn',
                  'refundTreatment', treatment_value,
                  'profileId', decision_row.policy_snapshot -> 'profileId'
                ),
                active_reversal.revision + 1, active_reversal.id, original_entry.id,
                'refund-withdrawal:' || event.id::text || ':' || original_entry.id::text
              ) returning id into reversal_id;
              neutralized_count := neutralized_count + 1;
              insert into pg_temp.commission_affected_bonus_periods
                (employee_id, location_id, period_start)
              values (
                original_entry.profit_owner_employee_id, original_entry.location_id,
                active_reversal.period_start
              );
            elsif active_reversal.basis_snapshot ->> 'reversalState' = 'neutralized' then
              reversal_id := active_reversal.id;
            else
              raise exception 'Refund reversal has an invalid lifecycle state'
                using errcode = '22023', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
            end if;
          else
            retained_count := retained_count + 1;
          end if;

          insert into public.commission_refund_decisions (
            source_event_id, refund_id, original_entry_id, recipient_employee_id,
            treatment, reversal_entry_id, policy_snapshot
          ) values (
            event.id, refund_row.id, original_entry.id,
            original_entry.recipient_employee_id, treatment_value, reversal_id,
            decision_row.policy_snapshot || jsonb_build_object(
              'withdrawsSourceEventId', event.supersedes_event_id
            )
          ) on conflict (source_event_id, original_entry_id) do nothing;
          insert into pg_temp.commission_affected_bonus_periods
            (employee_id, location_id, period_start)
          values (
            original_entry.profit_owner_employee_id, original_entry.location_id,
            period_start_value
          );
        end loop;
      else
        select ranked.passenger_count, ranked.passenger_position
        into passenger_count_value, passenger_position_value
        from (
          select allocation.id,
            count(*) over ()::integer as passenger_count,
            row_number() over (
              order by case passenger.passenger_type
                when 'ADT' then 1 when 'YTH' then 2
                when 'CHD' then 3 when 'INF' then 4 else 5 end,
                allocation.fare_line_id nulls last, allocation.position, allocation.id
            )::integer as passenger_position
          from public.ticket_transaction_passengers allocation
          join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
          where allocation.transaction_id = refund_row.transaction_id
            and allocation.booking_id = refund_row.booking_id
        ) ranked
        where ranked.id = refund_row.transaction_passenger_id;
        if passenger_count_value is null or passenger_position_value is null then
          raise exception 'Refund passenger allocation was not found in its transaction'
            using errcode = 'P0002', hint = 'COMMISSION_REFUND_APPORTIONMENT_INVALID';
        end if;

        for decision_row in
          select decision.*
          from public.commission_refund_decisions decision
          where decision.source_event_id = event.id
            and not exists (
              select 1
              from public.commission_entries current_entry
              join public.commission_source_events original_source
                on original_source.id = current_entry.source_event_id
              where current_entry.id = decision.original_entry_id
                and current_entry.entry_mode = 'shadow'
                and current_entry.entry_kind = 'ordinary'
                and not exists (
                  select 1 from public.commission_entries newer_entry
                  where newer_entry.entry_mode = current_entry.entry_mode
                    and newer_entry.supersedes_entry_id = current_entry.id
                )
                and not exists (
                  select 1 from public.commission_source_events newer_source
                  where newer_source.supersedes_event_id = original_source.id
                )
                and (
                  original_source.source_record_id = refund_row.transaction_id
                  or original_source.variables ->> 'transaction_id' =
                    refund_row.transaction_id::text
                  or original_source.variables ->> 'root_transaction_id' =
                    refund_row.transaction_id::text
                )
            )
          order by decision.created_at, decision.id
        loop
          if decision_row.treatment <> 'reverse_original' then
            continue;
          end if;
          select entry.* into original_entry
          from public.commission_entries entry
          where entry.id = decision_row.original_entry_id;
          active_reversal := null;
          select reversal.* into active_reversal
          from public.commission_entries reversal
          where reversal.entry_mode = 'shadow'
            and reversal.entry_kind = 'refund_reversal'
            and reversal.source_case_key =
              'ticket-refund:' || event.source_record_id::text
                || ':' || original_entry.id::text
            and not exists (
              select 1 from public.commission_entries newer
              where newer.entry_mode = reversal.entry_mode
                and newer.supersedes_entry_id = reversal.id
            )
          order by reversal.revision desc, reversal.created_at desc, reversal.id desc
          limit 1;
          if active_reversal.id is not null
            and active_reversal.basis_snapshot ->> 'reversalState' = 'active'
          then
            insert into public.commission_entries (
              run_id, entry_mode, entry_kind, source_event_id, source_case_key,
              recipient_employee_id, profit_owner_employee_id, location_id,
              policy_version_id, component_id, earning_on, period_start, period_end,
              amount_gbp, basis_snapshot, explanation, revision,
              supersedes_entry_id, reverses_entry_id, idempotency_key
            ) values (
              run_id_value, 'shadow', 'refund_reversal', event.id,
              active_reversal.source_case_key, original_entry.recipient_employee_id,
              original_entry.profit_owner_employee_id, original_entry.location_id,
              original_entry.policy_version_id, original_entry.component_id,
              event.effective_on, period_start_value, period_end_value, 0,
              jsonb_build_object(
                'refundId', event.source_record_id,
                'originalEntryId', original_entry.id,
                'reversalState', 'neutralized'
              ),
              jsonb_build_object(
                'serviceCode', original_entry.explanation ->> 'serviceCode',
                'reason', 'original_entry_reconciled',
                'refundTreatment', decision_row.treatment,
                'profileId', decision_row.policy_snapshot -> 'profileId'
              ),
              active_reversal.revision + 1, active_reversal.id, original_entry.id,
              'refund-reconcile:' || event.id::text || ':' || active_reversal.id::text
            );
            neutralized_count := neutralized_count + 1;
            insert into pg_temp.commission_affected_bonus_periods
              (employee_id, location_id, period_start)
            values (
              original_entry.profit_owner_employee_id, original_entry.location_id,
              active_reversal.period_start
            );
          end if;
        end loop;

        for original_entry in
          select entry.*
          from public.commission_entries entry
          join public.commission_source_events original_source
            on original_source.id = entry.source_event_id
          where entry.entry_mode = 'shadow'
            and entry.entry_kind = 'ordinary'
            and original_source.source_module = 'ticketing'
            and original_source.event_type in (
              'ticket_issued', 'ticket_sale_completed', 'ticket_date_changed',
              'ticket_reissued', 'ticket_low_fare_adjusted',
              'ticket_higher_fare_adjusted'
            )
            and (
              original_source.source_record_id = refund_row.transaction_id
              or original_source.variables ->> 'transaction_id' =
                refund_row.transaction_id::text
              or original_source.variables ->> 'root_transaction_id' =
                refund_row.transaction_id::text
            )
            and not exists (
              select 1 from public.commission_entries newer_entry
              where newer_entry.entry_mode = entry.entry_mode
                and newer_entry.supersedes_entry_id = entry.id
            )
            and not exists (
              select 1 from public.commission_source_events newer_source
              where newer_source.supersedes_event_id = original_source.id
            )
          order by entry.created_at, entry.id
        loop
          if coalesce(original_entry.basis_snapshot ->> 'units', '') !~ '^[0-9]+$' then
            raise exception 'Refund Commission entry has no valid passenger basis'
              using errcode = '22023', hint = 'COMMISSION_REFUND_APPORTIONMENT_INVALID';
          end if;
          basis_units_value := (original_entry.basis_snapshot ->> 'units')::integer;
          if basis_units_value <> passenger_count_value then
            raise exception 'Refund Commission passenger basis does not match Ticketing allocations'
              using errcode = '22023', hint = 'COMMISSION_REFUND_APPORTIONMENT_INVALID';
          end if;
          allocated_gbp_value := public.commission_apportion_money_2026090201(
            original_entry.amount_gbp, passenger_count_value, passenger_position_value
          );
          allocated_pay_value := public.commission_apportion_money_2026090201(
            original_entry.amount_pay_currency, passenger_count_value,
            passenger_position_value
          );

          select rule.profile_id,
            coalesce(
              component.config ->> 'ticketRefundTreatment',
              profile.configuration #>> '{draft,ticketRefundCommission,treatment}',
              'retain'
            )
          into profile_id_value, treatment_value
          from public.commission_policy_versions version
          join public.commission_rules rule on rule.id = version.rule_id
          join public.commission_policy_components component
            on component.id = original_entry.component_id
          left join public.employee_commission_profiles profile on profile.id = rule.profile_id
          where version.id = original_entry.policy_version_id;
          if not found then
            raise exception 'Refund Commission policy snapshot was not found'
              using errcode = 'P0002', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
          end if;
          treatment_value := coalesce(treatment_value, 'retain');
          if treatment_value not in ('retain', 'reverse_original') then
            raise exception 'Unsupported ticket refund Commission treatment'
              using errcode = '22023';
          end if;

          existing_decision := null;
          select decision.* into existing_decision
          from public.commission_refund_decisions decision
          where decision.source_event_id = event.id
            and decision.original_entry_id = original_entry.id;
          if found then
            if existing_decision.treatment <> treatment_value
              or (existing_decision.policy_snapshot ->> 'allocationCount')::integer
                <> passenger_count_value
              or (existing_decision.policy_snapshot ->> 'allocationPosition')::integer
                <> passenger_position_value
              or (existing_decision.policy_snapshot ->> 'allocatedOriginalAmountGbp')::numeric
                <> allocated_gbp_value
              or (existing_decision.policy_snapshot
                    ->> 'allocatedOriginalAmountPayCurrency')::numeric
                <> allocated_pay_value
            then
              raise exception 'Refund allocation changed after its decision was recorded'
                using errcode = '22023', hint = 'COMMISSION_REFUND_APPORTIONMENT_INVALID';
            end if;
            continue;
          end if;

          reversal_id := null;
          if treatment_value = 'reverse_original' then
            active_reversal := null;
            select reversal.* into active_reversal
            from public.commission_entries reversal
            where reversal.entry_mode = 'shadow'
              and reversal.entry_kind = 'refund_reversal'
              and reversal.source_case_key =
                'ticket-refund:' || event.source_record_id::text
                  || ':' || original_entry.id::text
              and not exists (
                select 1 from public.commission_entries newer
                where newer.entry_mode = reversal.entry_mode
                  and newer.supersedes_entry_id = reversal.id
              )
            order by reversal.revision desc, reversal.created_at desc, reversal.id desc
            limit 1;
            if active_reversal.id is null
              or active_reversal.basis_snapshot ->> 'reversalState' = 'neutralized'
            then
              insert into public.commission_entries (
                run_id, entry_mode, entry_kind, source_event_id, source_case_key,
                recipient_employee_id, profit_owner_employee_id, location_id,
                policy_version_id, component_id, earning_on, period_start, period_end,
                amount_gbp, basis_snapshot, explanation, revision,
                supersedes_entry_id, reverses_entry_id, idempotency_key
              ) values (
                run_id_value, 'shadow', 'refund_reversal', event.id,
                'ticket-refund:' || event.source_record_id::text
                  || ':' || original_entry.id::text,
                original_entry.recipient_employee_id,
                original_entry.profit_owner_employee_id, original_entry.location_id,
                original_entry.policy_version_id, original_entry.component_id,
                event.effective_on, period_start_value, period_end_value,
                -allocated_gbp_value,
                jsonb_build_object(
                  'refundId', event.source_record_id,
                  'originalEntryId', original_entry.id,
                  'originalEarningOn', original_entry.earning_on,
                  'allocationCount', passenger_count_value,
                  'allocationPosition', passenger_position_value,
                  'allocatedOriginalAmountGbp', allocated_gbp_value,
                  'allocatedOriginalAmountPayCurrency', allocated_pay_value,
                  'reversalState', 'active'
                ),
                jsonb_build_object(
                  'serviceCode', original_entry.explanation ->> 'serviceCode',
                  'reason', 'confirmed_ticket_refund',
                  'refundTreatment', treatment_value,
                  'profileId', profile_id_value
                ),
                coalesce(active_reversal.revision, 0) + 1,
                active_reversal.id, original_entry.id,
                'refund-reversal:' || event.id::text || ':' || original_entry.id::text
              ) returning id into reversal_id;
              reversal_count := reversal_count + 1;
            elsif active_reversal.basis_snapshot ->> 'reversalState' = 'active' then
              reversal_id := active_reversal.id;
            else
              raise exception 'Refund reversal has an invalid lifecycle state'
                using errcode = '22023', hint = 'COMMISSION_REFUND_LINEAGE_INVALID';
            end if;
          else
            retained_count := retained_count + 1;
          end if;

          insert into public.commission_refund_decisions (
            source_event_id, refund_id, original_entry_id, recipient_employee_id,
            treatment, reversal_entry_id, policy_snapshot
          ) values (
            event.id, refund_row.id, original_entry.id,
            original_entry.recipient_employee_id, treatment_value, reversal_id,
            jsonb_build_object(
              'profileId', profile_id_value,
              'policyVersionId', original_entry.policy_version_id,
              'componentId', original_entry.component_id,
              'originalAmountGbp', original_entry.amount_gbp,
              'originalAmountPayCurrency', original_entry.amount_pay_currency,
              'allocatedOriginalAmountGbp', allocated_gbp_value,
              'allocatedOriginalAmountPayCurrency', allocated_pay_value,
              'allocationCount', passenger_count_value,
              'allocationPosition', passenger_position_value,
              'transactionPassengerId', refund_row.transaction_passenger_id,
              'payCurrency', original_entry.pay_currency,
              'exchangeRateUnitsPerGbp', original_entry.exchange_rate_units_per_gbp
            )
          );
          insert into pg_temp.commission_affected_bonus_periods
            (employee_id, location_id, period_start)
          values (
            original_entry.profit_owner_employee_id, original_entry.location_id,
            period_start_value
          );
        end loop;
      end if;

      update public.commission_source_event_states
      set processing_status = 'processed', next_attempt_at = null, last_error = null,
          updated_at = clock_timestamp()
      where event_id = event.id;
      update public.commission_exceptions
      set status = 'resolved', resolved_by = p_actor_employee_id,
          resolved_at = clock_timestamp(),
          resolution_note = 'Refund source event processed successfully after retry.'
      where source_event_id = event.id and status = 'open';
      update public.commission_source_event_states successor_state
      set processing_status = 'pending', next_attempt_at = null, last_error = null,
          updated_at = clock_timestamp()
      from public.commission_source_events successor_event
      where successor_state.event_id = successor_event.id
        and successor_event.supersedes_event_id = event.id
        and successor_state.processing_status = 'held'
        and successor_state.last_error = 'refund_lineage_pending';

      insert into pg_temp.commission_affected_bonus_periods
        (employee_id, location_id, period_start)
      values (
        coalesce(event.owner_employee_id, event.employee_id),
        booking_location_value, period_start_value
      );
      if event.supersedes_event_id is not null then
        insert into pg_temp.commission_affected_bonus_periods
          (employee_id, location_id, period_start)
        select coalesce(previous.owner_employee_id, previous.employee_id),
          coalesce(previous.location_id, booking_location_value),
          date_trunc('month', previous.effective_on)::date
        from public.commission_source_events previous
        where previous.id = event.supersedes_event_id;
      end if;
      processed_count := processed_count + 1;
    exception when others then
      get stacked diagnostics exception_hint = PG_EXCEPTION_HINT;
      failure_code := case
        when exception_hint = 'COMMISSION_REVIEW_PERIOD_LOCKED'
          then 'review_period_locked'
        when exception_hint = 'COMMISSION_REFUND_APPORTIONMENT_INVALID'
          then 'refund_apportionment_invalid'
        when exception_hint = 'COMMISSION_REFUND_LINEAGE_INVALID'
          then 'refund_lineage_pending'
        else 'calculation_failed'
      end;
      failure_count := failure_count + 1;
      update public.commission_source_event_states
      set processing_status = 'held',
          next_attempt_at = case
            when failure_code = 'review_period_locked' then null
            else clock_timestamp() + interval '15 minutes'
          end,
          last_error = failure_code, updated_at = clock_timestamp()
      where event_id = event.id;
      perform public.commission_record_exception_2026082902(
        run_id_value, event.id, coalesce(event.owner_employee_id, event.employee_id),
        failure_code,
        jsonb_build_object(
          'reason', 'refund_processing_failed', 'sqlstate', sqlstate,
          'message', left(sqlerrm, 500), 'hint', exception_hint
        )
      );
    end;
  end loop;

  for affected in
    select employee_id, location_id, period_start
    from pg_temp.commission_affected_bonus_periods
    group by employee_id, location_id, period_start
  loop
    perform public.commission_recompute_bonus_2026082902(
      run_id_value, affected.employee_id, affected.location_id, affected.period_start
    );
  end loop;

  update public.commission_calculation_runs
  set status = 'completed', source_event_count = processed_count + failure_count,
      entry_count = reversal_count + neutralized_count, exception_count = failure_count,
      completed_at = clock_timestamp()
  where id = run_id_value;

  result_json := jsonb_build_object(
    'runId', run_id_value, 'busy', false,
    'processedEvents', processed_count,
    'reversedEntries', reversal_count,
    'neutralizedEntries', neutralized_count,
    'retainedEntries', retained_count,
    'failures', failure_count,
    'requestedLimit', p_limit,
    'nonPayable', true,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason, after_state, request_key
  ) values (
    p_actor_employee_id, 'refunds.processed', 'commission_calculation_run', run_id_value,
    'Confirmed ticket refunds processed under snapshotted employee policy',
    result_json, request_key_value
  );
  return result_json;
end
$function$;

-- An original ticket earning can arrive after a bounded refund pass, or be
-- replaced by a later correction. Requeue only the latest confirmed refund so
-- the processor can create or reconcile its immutable reversal lineage.
create or replace function public.commission_requeue_refund_for_entry_2026090201()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  original_source public.commission_source_events%rowtype;
begin
  if new.entry_mode <> 'shadow' or new.entry_kind <> 'ordinary'
    or new.source_event_id is null
  then
    return new;
  end if;
  select source_event.* into original_source
  from public.commission_source_events source_event
  where source_event.id = new.source_event_id;
  if not found or original_source.source_module <> 'ticketing'
    or original_source.event_type not in (
      'ticket_issued', 'ticket_sale_completed', 'ticket_date_changed',
      'ticket_reissued', 'ticket_low_fare_adjusted', 'ticket_higher_fare_adjusted',
      'ticket_entry_archived'
    )
  then
    return new;
  end if;

  update public.commission_source_event_states state
  set processing_status = 'pending', next_attempt_at = null, last_error = null,
      updated_at = clock_timestamp()
  from public.commission_source_events refund_event
  join public.ticket_refunds refund on refund.id = refund_event.source_record_id
  where state.event_id = refund_event.id
    and refund_event.source_module = 'ticketing'
    and refund_event.event_type = 'ticket_refund_confirmed'
    and not exists (
      select 1 from public.commission_source_events newer_refund_event
      where newer_refund_event.supersedes_event_id = refund_event.id
    )
    and (
      state.processing_status = 'processed'
      or (
        state.processing_status = 'held'
        and state.last_error in (
          'refund_dependency_pending', 'refund_apportionment_invalid'
        )
      )
    )
    and (
      original_source.source_record_id = refund.transaction_id
      or original_source.variables ->> 'transaction_id' = refund.transaction_id::text
      or original_source.variables ->> 'root_transaction_id' = refund.transaction_id::text
    );
  return new;
end
$function$;

drop trigger if exists commission_entries_requeue_refund_2026090201
  on public.commission_entries;
create trigger commission_entries_requeue_refund_2026090201
  after insert on public.commission_entries
  for each row execute function public.commission_requeue_refund_for_entry_2026090201();

-- Keep the established processor contract while dispatching the new refund
-- event type before the legacy core sees it as unsupported.
do $preserve_commission_core$
declare
  existing_definition text;
  core_definition text;
begin
  if to_regprocedure(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'
  ) is null then
    select pg_get_functiondef(
      'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure
    ) into existing_definition;
    -- append_commission_source_event accepts the public source_event_id but
    -- stores supersedes_event_id as the predecessor row's internal id. Refuse
    -- to preserve a legacy processor that still compares across those domains.
    if position('newer.supersedes_event_id = event.source_event_id' in existing_definition) > 0
      or position('previous.source_event_id = event.supersedes_event_id' in existing_definition) > 0
    then
      raise exception 'Commission shadow processor has unsafe mixed source lineage identifiers'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    core_definition := regexp_replace(
      existing_definition,
      'FUNCTION public[.]commission_process_shadow_2026082902[(]',
      'FUNCTION public.commission_process_shadow_core_2026090201(',
      'i'
    );
    if core_definition = existing_definition then
      raise exception 'Commission shadow processor definition could not be preserved'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute core_definition;
  end if;
end
$preserve_commission_core$;

do $assert_commission_core_lineage_domains$
declare core_definition text;
begin
  select pg_get_functiondef(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
  ) into core_definition;
  if position('newer.supersedes_event_id = event.source_event_id' in core_definition) > 0
    or position('previous.source_event_id = event.supersedes_event_id' in core_definition) > 0
  then
    raise exception 'Commission shadow core has unsafe mixed source lineage identifiers'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
end
$assert_commission_core_lineage_domains$;

-- The legacy core must not claim refund lifecycle events. Run it first so a
-- ticket earning and its refund, both queued together, are processed in causal
-- order during one wrapper invocation.
do $exclude_refunds_from_commission_core$
declare
  core_definition text;
  old_claim text := $old_claim$
      where state.processing_status = 'pending'
        or (
          state.processing_status = 'held'
          and state.next_attempt_at is not null
          and state.next_attempt_at <= clock_timestamp()
        )
$old_claim$;
  new_claim text := $new_claim$
      where source.event_type not in (
          'ticket_refund_confirmed', 'ticket_refund_confirmation_withdrawn'
        )
        and (
          state.processing_status = 'pending'
          or (
            state.processing_status = 'held'
            and state.next_attempt_at is not null
            and state.next_attempt_at <= clock_timestamp()
          )
        )
$new_claim$;
begin
  select pg_get_functiondef(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
  ) into core_definition;
  if position('source.event_type not in (' in core_definition) = 0 then
    core_definition := replace(core_definition, old_claim, new_claim);
    if position('source.event_type not in (' in core_definition) = 0 then
      raise exception 'Commission core refund exclusion could not be installed'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute core_definition;
  end if;
end
$exclude_refunds_from_commission_core$;

-- Serialize every financial pass with Accounting approval. A late source fact
-- remains immutable and accepted by its owning module, while the worker holds
-- it with an auditable exception if Accounting already fixed that month.
do $lock_commission_core_review_periods$
declare
  core_definition text;
  updated_definition text;
  old_fragment text;
  new_fragment text;
begin
  select replace(pg_get_functiondef(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
  ), E'\r\n', E'\n') into core_definition;

  if position('approved_accounting_report_is_fixed' in core_definition) = 0 then
    old_fragment := $old$    begin
      if event.contract_version <> 1 then$old$;
    new_fragment := $new$    begin
      perform pg_advisory_xact_lock(hashtextextended(
        'commission-review-period:'
          || date_trunc('month', event.effective_on)::date::text,
        0
      ));
      if exists (
        select 1
        from public.commission_review_batches review_batch
        where review_batch.period_start =
          date_trunc('month', event.effective_on)::date
          and review_batch.status = 'approved_locked'
      ) then
        failure_code := 'review_period_locked';
        failure_details := jsonb_build_object(
          'periodStart', date_trunc('month', event.effective_on)::date,
          'reason', 'approved_accounting_report_is_fixed'
        );
      elsif event.contract_version <> 1 then$new$;
    updated_definition := replace(core_definition, old_fragment, new_fragment);
    if updated_definition = core_definition then
      raise exception 'Commission core review-period gate could not be installed'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    core_definition := updated_definition;
  end if;

  if position($needle$then 'review_period_locked'$needle$ in core_definition) = 0 then
    old_fragment := $old$        else 'calculation_failed'
      end;$old$;
    new_fragment := $new$        when sqlstate = '55000'
          and sqlerrm = 'Approved Commission period is financially locked'
          then 'review_period_locked'
        else 'calculation_failed'
      end;$new$;
    updated_definition := replace(core_definition, old_fragment, new_fragment);
    if updated_definition = core_definition then
      raise exception 'Commission core locked-period exception mapping could not be installed'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    core_definition := updated_definition;
  end if;

  -- A locked event is deliberately dormant until an explicit forward
  -- accounting correction exists; it must not be reclaimed on every cron run.
  old_fragment := $old$set processing_status = 'held', last_error = failure_code,
            updated_at = clock_timestamp()$old$;
  new_fragment := $new$set processing_status = 'held', last_error = failure_code,
            next_attempt_at = case
              when failure_code = 'review_period_locked' then null
              else next_attempt_at
            end,
            updated_at = clock_timestamp()$new$;
  core_definition := replace(core_definition, old_fragment, new_fragment);

  execute core_definition;
end
$lock_commission_core_review_periods$;

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
as $function$
declare
  request_key_value text := btrim(coalesce(p_request_key, ''));
  derived_key text;
  refund_result jsonb;
  core_result jsonb;
  result_json jsonb;
begin
  if p_actor_employee_id is not null then
    perform public.commission_lock_actor_authorization_2026090201(
      p_actor_employee_id
    );
  end if;
  if p_actor_employee_id is not null
    and not public.commission_actor_can_manage_2026082901(p_actor_employee_id)
  then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_limit is null or p_limit not between 1 and 200
    or length(request_key_value) not between 8 and 200
  then
    raise exception 'Invalid Commission processing request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-shadow-workflow:'
      || coalesce(p_actor_employee_id::text, 'system') || ':' || request_key_value,
    0
  ));
  select audit.after_state into result_json
  from public.commission_audit_events audit
  where audit.actor_employee_id is not distinct from p_actor_employee_id
    and audit.action = 'shadow.workflow.processed'
    and audit.request_key = request_key_value;
  if found then
    if (result_json ->> 'requestedLimit')::integer <> p_limit then
      raise exception 'Commission worker request key was reused with a different payload'
        using errcode = '22023', hint = 'COMMISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  -- Do not audit a busy result: the same canonical request remains safely
  -- retryable once the in-flight worker releases the global lock.
  if not pg_try_advisory_xact_lock(hashtextextended('commission:shadow-worker', 0)) then
    return jsonb_build_object(
      'busy', true, 'processedEvents', 0, 'heldEvents', 0,
      'requestedLimit', p_limit, 'nonPayable', true, 'idempotentReplay', false
    );
  end if;

  derived_key := encode(digest(request_key_value, 'sha256'), 'hex');
  core_result := public.commission_process_shadow_core_2026090201(
    p_actor_employee_id, p_limit, 'workflow-core:' || derived_key
  );
  refund_result := public.commission_process_refunds_2026090201(
    p_actor_employee_id, p_limit, 'workflow-refund:' || derived_key
  );
  result_json := core_result || jsonb_build_object(
    'refundProcessing', refund_result,
    'requestedLimit', p_limit,
    'nonPayable', true,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason, after_state, request_key
  ) values (
    p_actor_employee_id, 'shadow.workflow.processed', 'commission_calculation_workflow',
    null, 'Commission non-payable shadow workflow processed', result_json,
    request_key_value
  );
  return result_json;
end
$function$;

create or replace function public.commission_shadow_staff_report_2026090201(
  p_actor_employee_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  result_json jsonb;
  review_batch_json jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start
    or p_period_end - p_period_start > 366
  then
    raise exception 'Invalid Commission report period' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', batch.id,
    'revision', batch.revision,
    'state', batch.status,
    'contentHash', batch.content_hash,
    'entryCount', (
      select count(*)
      from public.commission_review_batch_entries batch_entry
      where batch_entry.batch_id = batch.id
    ),
    'isStale', batch.content_hash <> public.commission_period_source_hash_2026090201(
      batch.period_start, batch.period_end
    )
  )
  into review_batch_json
  from public.commission_review_batches batch
  where batch.period_start = p_period_start
    and batch.period_end = p_period_end
    and batch.status <> 'superseded'
  order by batch.revision desc, batch.created_at desc, batch.id desc
  limit 1;

  with current_entry_rows as (
    select
      entry.id::text as source_id,
      entry.recipient_employee_id as employee_id,
      coalesce(source_event.source_module,
        case when entry.entry_kind = 'sales_bonus' then 'bonus' else 'commission' end
      ) as source_module,
      coalesce(entry.explanation ->> 'serviceCode', entry.entry_kind) as service_code,
      entry.entry_kind,
      entry.pay_currency,
      entry.amount_pay_currency,
      entry.amount_gbp,
      entry.earning_on,
      entry.explanation
    from public.commission_entries entry
    left join public.commission_source_events source_event on source_event.id = entry.source_event_id
    where entry.entry_mode = 'shadow'
      and entry.earning_on between p_period_start and p_period_end
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode
          and newer.supersedes_entry_id = entry.id
      )
  ), adjustment_rows as (
    select
      adjustment.id::text as source_id,
      adjustment.employee_id,
      'adjustments'::text as source_module,
      adjustment.category as service_code,
      'manual_adjustment'::text as entry_kind,
      adjustment.pay_currency,
      case adjustment.direction when 'debit' then -adjustment.amount_pay_currency
        else adjustment.amount_pay_currency end as amount_pay_currency,
      case adjustment.direction when 'debit' then -adjustment.amount_gbp
        else adjustment.amount_gbp end as amount_gbp,
      adjustment.period_end as earning_on,
      jsonb_build_object(
        'reason', adjustment.reason,
        'direction', adjustment.direction,
        'category', adjustment.category,
        'reversesAdjustmentId', adjustment.reverses_adjustment_id
      ) as explanation
    from public.commission_adjustments adjustment
    where adjustment.period_start between date_trunc('month', p_period_start)::date
      and date_trunc('month', p_period_end)::date
  ), salary_rows as (
    select
      profile.id::text || ':' || month_row.period_start::text as source_id,
      profile.employee_id,
      'compensation'::text as source_module,
      'salary'::text as service_code,
      'salary'::text as entry_kind,
      salary.currency as pay_currency,
      (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric
        as amount_pay_currency,
      round(
        (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric /
        public.commission_exchange_rate_2026083001(salary.currency, month_row.period_start),
        2
      ) as amount_gbp,
      (month_row.period_start + interval '1 month - 1 day')::date as earning_on,
      jsonb_build_object('profileId', profile.id, 'profileLabel', profile.label) as explanation
    from generate_series(
      date_trunc('month', p_period_start)::date,
      date_trunc('month', p_period_end)::date,
      interval '1 month'
    ) generated_month
    cross join lateral (select generated_month::date as period_start) month_row
    join public.employee_commission_profiles profile
      on profile.cancelled_at is null
      and profile.effective_from <= month_row.period_start
      and (profile.effective_to is null or profile.effective_to >= month_row.period_start)
    cross join lateral (
      select upper(coalesce(
        nullif(profile.configuration #>> '{draft,compensation,salaryCurrency}', ''),
        nullif(profile.configuration #>> '{draft,compensation,currency}', ''),
        'GBP'
      )) as currency
    ) salary
    where coalesce(
      nullif(profile.configuration #>> '{draft,compensation,monthlySalary}', '')::numeric,
      0
    ) > 0
  ), report_rows as (
    select * from current_entry_rows
    union all
    select * from adjustment_rows
    union all
    select * from salary_rows
  ), grouped as (
    select row.employee_id, employee.full_name as employee_name,
      row.source_module, row.service_code, row.entry_kind, row.pay_currency,
      count(*)::integer as entry_count,
      round(sum(row.amount_pay_currency), 2) as amount_pay_currency,
      round(sum(row.amount_gbp), 2) as amount_gbp
    from report_rows row
    join public.employees employee on employee.id = row.employee_id
    group by row.employee_id, employee.full_name, row.source_module,
      row.service_code, row.entry_kind, row.pay_currency
  ), currency_totals as (
    select row.employee_id, employee.full_name as employee_name, row.pay_currency,
      round(sum(row.amount_pay_currency), 2) as amount_pay_currency,
      round(sum(row.amount_gbp), 2) as amount_gbp
    from report_rows row
    join public.employees employee on employee.id = row.employee_id
    group by row.employee_id, employee.full_name, row.pay_currency
  ), employee_totals as (
    select row.employee_id, employee.full_name as employee_name,
      round(sum(row.amount_gbp), 2) as amount_gbp
    from report_rows row
    join public.employees employee on employee.id = row.employee_id
    group by row.employee_id, employee.full_name
  )
  select jsonb_build_object(
    'periodStart', p_period_start,
    'periodEnd', p_period_end,
    'bookCurrency', 'GBP',
    'reviewBatch', review_batch_json,
    'companyTotalGbp', coalesce((select round(sum(amount_gbp), 2) from report_rows), 0),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employeeId', total.employee_id,
        'employeeName', total.employee_name,
        'totalGbp', total.amount_gbp
      ) order by total.employee_name, total.employee_id)
      from employee_totals total
    ), '[]'::jsonb),
    'currencyTotals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employeeId', total.employee_id,
        'employeeName', total.employee_name,
        'payCurrency', total.pay_currency,
        'amountPayCurrency', total.amount_pay_currency,
        'amountGbp', total.amount_gbp
      ) order by total.employee_name, total.pay_currency)
      from currency_totals total
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employeeId', item.employee_id,
        'employeeName', item.employee_name,
        'sourceModule', item.source_module,
        'serviceCode', item.service_code,
        'entryKind', item.entry_kind,
        'payCurrency', item.pay_currency,
        'entryCount', item.entry_count,
        'amountPayCurrency', item.amount_pay_currency,
        'amountGbp', item.amount_gbp
      ) order by item.employee_name, item.source_module, item.service_code, item.pay_currency)
      from grouped item
    ), '[]'::jsonb),
    'readiness', jsonb_build_object(
      'pendingEvents', (
        select count(*) from public.commission_source_events event
        join public.commission_source_event_states state on state.event_id = event.id
        where event.effective_on between p_period_start and p_period_end
          and state.processing_status in ('pending', 'processing', 'held')
      ),
      'openExceptions', (
        select count(*) from public.commission_exceptions exception_row
        left join public.commission_source_events event on event.id = exception_row.source_event_id
        where exception_row.status = 'open'
          and (
            event.effective_on between p_period_start and p_period_end
            or exception_row.details ->> 'periodStart' = p_period_start::text
          )
      ),
      'incompleteBonusPeriods', (
        select count(*) from public.commission_period_results result
        where result.result_mode = 'shadow'
          and result.period_start between date_trunc('month', p_period_start)::date
            and date_trunc('month', p_period_end)::date
          and result.incomplete_input_count > 0
          and not exists (
            select 1 from public.commission_period_results newer
            where newer.result_mode = result.result_mode
              and newer.supersedes_result_id = result.id
          )
      )
    )
  ) into result_json;
  return result_json;
end
$function$;

create table if not exists public.commission_review_batches (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  revision integer not null default 1,
  status text not null default 'draft',
  content_hash text not null,
  prepared_by uuid not null references public.employees(id) on delete restrict,
  prepared_at timestamptz not null default clock_timestamp(),
  submitted_by uuid references public.employees(id) on delete restrict,
  submitted_at timestamptz,
  returned_by uuid references public.employees(id) on delete restrict,
  returned_at timestamptz,
  returned_reason text,
  approved_by uuid references public.employees(id) on delete restrict,
  approved_at timestamptz,
  source_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_review_batches_period_check check (
    period_start = date_trunc('month', period_start)::date
    and period_end = (period_start + interval '1 month - 1 day')::date
  ),
  constraint commission_review_batches_revision_check check (revision > 0),
  constraint commission_review_batches_status_check check (
    status in ('draft', 'submitted_to_accounting', 'returned', 'approved_locked', 'superseded')
  ),
  constraint commission_review_batches_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint commission_review_batches_snapshot_check check (jsonb_typeof(source_snapshot) = 'object'),
  constraint commission_review_batches_state_check check (
    (status = 'draft' and submitted_by is null and submitted_at is null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is null and approved_at is null)
    or (status = 'submitted_to_accounting' and submitted_by is not null and submitted_at is not null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is null and approved_at is null)
    or (status = 'returned' and submitted_by is not null and submitted_at is not null
      and returned_by is not null and returned_at is not null
      and length(btrim(returned_reason)) between 3 and 500
      and approved_by is null and approved_at is null)
    or (status = 'approved_locked' and submitted_by is not null and submitted_at is not null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is not null and approved_at is not null)
    or (status = 'superseded' and submitted_by is null and submitted_at is null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is null and approved_at is null)
  )
);

-- Keep replays safe if this capability was partially installed before the
-- stale-draft transition was added.
alter table public.commission_review_batches
  drop constraint if exists commission_review_batches_status_check;
alter table public.commission_review_batches
  add constraint commission_review_batches_status_check check (
    status in ('draft', 'submitted_to_accounting', 'returned', 'approved_locked', 'superseded')
  );
alter table public.commission_review_batches
  drop constraint if exists commission_review_batches_state_check;
alter table public.commission_review_batches
  add constraint commission_review_batches_state_check check (
    (status = 'draft' and submitted_by is null and submitted_at is null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is null and approved_at is null)
    or (status = 'submitted_to_accounting' and submitted_by is not null and submitted_at is not null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is null and approved_at is null)
    or (status = 'returned' and submitted_by is not null and submitted_at is not null
      and returned_by is not null and returned_at is not null
      and length(btrim(returned_reason)) between 3 and 500
      and approved_by is null and approved_at is null)
    or (status = 'approved_locked' and submitted_by is not null and submitted_at is not null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is not null and approved_at is not null)
    or (status = 'superseded' and submitted_by is null and submitted_at is null
      and returned_by is null and returned_at is null and returned_reason is null
      and approved_by is null and approved_at is null)
  );

create unique index if not exists commission_review_batches_one_open_period_idx
  on public.commission_review_batches (period_start)
  where status in ('draft', 'submitted_to_accounting');
create unique index if not exists commission_review_batches_one_approved_period_idx
  on public.commission_review_batches (period_start)
  where status = 'approved_locked';

create table if not exists public.commission_review_batch_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.commission_review_batches(id) on delete restrict,
  source_entry_id uuid references public.commission_entries(id) on delete restrict,
  adjustment_id uuid references public.commission_adjustments(id) on delete restrict,
  profile_id uuid references public.employee_commission_profiles(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  source_module text not null,
  service_code text not null,
  entry_kind text not null,
  earning_on date not null,
  amount_pay_currency numeric(18,2) not null,
  pay_currency text not null,
  exchange_rate_units_per_gbp numeric(18,6) not null,
  amount_gbp numeric(18,2) not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_review_batch_entries_source_check check (
    num_nonnulls(source_entry_id, adjustment_id, profile_id) = 1
  ),
  constraint commission_review_batch_entries_labels_check check (
    length(btrim(source_module)) between 1 and 50
    and length(btrim(service_code)) between 1 and 100
    and length(btrim(entry_kind)) between 1 and 100
  ),
  constraint commission_review_batch_entries_currency_check check (pay_currency ~ '^[A-Z]{3}$'),
  constraint commission_review_batch_entries_rate_check check (exchange_rate_units_per_gbp > 0),
  constraint commission_review_batch_entries_snapshot_check check (jsonb_typeof(snapshot) = 'object')
);

create unique index if not exists commission_review_batch_entries_source_unique_idx
  on public.commission_review_batch_entries (batch_id, source_entry_id)
  where source_entry_id is not null;
create unique index if not exists commission_review_batch_entries_adjustment_unique_idx
  on public.commission_review_batch_entries (batch_id, adjustment_id)
  where adjustment_id is not null;
create unique index if not exists commission_review_batch_entries_profile_unique_idx
  on public.commission_review_batch_entries (batch_id, profile_id)
  where profile_id is not null;
create index if not exists commission_review_batch_entries_employee_idx
  on public.commission_review_batch_entries (batch_id, employee_id, source_module, service_code);

create table if not exists public.commission_review_statements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.commission_review_batches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  native_currency_totals jsonb not null,
  total_gbp numeric(18,2) not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_review_statements_totals_check
    check (jsonb_typeof(native_currency_totals) = 'object'),
  constraint commission_review_statements_batch_employee_unique unique (batch_id, employee_id)
);

create table if not exists public.commission_review_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.commission_review_batches(id) on delete restrict,
  action text not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  reason text,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_review_events_action_check check (length(btrim(action)) between 1 and 100),
  constraint commission_review_events_reason_check
    check (reason is null or length(btrim(reason)) between 3 and 500),
  constraint commission_review_events_state_check check (
    (before_state is null or jsonb_typeof(before_state) = 'object')
    and jsonb_typeof(after_state) = 'object'
  )
);

do $commission_review_table_security$
declare table_name text;
begin
  foreach table_name in array array[
    'commission_review_batches', 'commission_review_batch_entries',
    'commission_review_statements', 'commission_review_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to service_role', table_name);
  end loop;
end
$commission_review_table_security$;

create or replace function public.commission_guard_review_batch_2026090201()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
declare context_id uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Commission review batches cannot be deleted' using errcode = '55000';
  end if;
  begin
    context_id := nullif(current_setting('pt_portal.commission_review_batch_id', true), '')::uuid;
  exception when invalid_text_representation then
    context_id := null;
  end;
  if context_id is distinct from old.id
    or new.id is distinct from old.id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.content_hash is distinct from old.content_hash
    or new.prepared_by is distinct from old.prepared_by
    or new.prepared_at is distinct from old.prepared_at
    or new.source_snapshot is distinct from old.source_snapshot
    or new.created_at is distinct from old.created_at
    or old.status in ('returned', 'approved_locked', 'superseded')
  then
    raise exception 'Commission review batch is immutable outside its audited transition'
      using errcode = '55000';
  end if;
  return new;
end
$function$;

drop trigger if exists commission_review_batches_guard_2026090201
  on public.commission_review_batches;
create trigger commission_review_batches_guard_2026090201
  before update or delete on public.commission_review_batches
  for each row execute function public.commission_guard_review_batch_2026090201();

do $commission_review_immutable_triggers$
declare table_name text;
begin
  foreach table_name in array array[
    'commission_review_batch_entries', 'commission_review_statements', 'commission_review_events'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I',
      table_name || '_immutable_2026090201', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row '
      || 'execute function public.commission_reject_immutable_mutation_2026082901()',
      table_name || '_immutable_2026090201', table_name
    );
  end loop;
end
$commission_review_immutable_triggers$;

create or replace function public.commission_actor_can_account_2026090201(
  p_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
  select exists (
    select 1
    from public.employees employee
    left join public.roles role_row on role_row.id = employee.role_id
    where employee.id = p_employee_id
      and employee.is_active
      and (
        regexp_replace(lower(btrim(coalesce(role_row.name, ''))), '[^a-z0-9]+', '', 'g')
          in ('admin', 'masteradmin', 'superadmin')
        or exists (
          select 1
          from public.employee_departments membership
          join public.departments department on department.id = membership.department_id
          where membership.employee_id = employee.id
            and regexp_replace(lower(btrim(department.name)), '[^a-z0-9]+', '', 'g')
              in ('accounting', 'accounts')
        )
      )
  )
$function$;

create or replace function public.commission_period_source_hash_2026090201(
  p_period_start date,
  p_period_end date
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
  with current_rows as (
    select
      'entry'::text as source_kind,
      entry.id,
      entry.recipient_employee_id as employee_id,
      entry.entry_kind,
      entry.amount_pay_currency,
      entry.pay_currency,
      entry.exchange_rate_units_per_gbp,
      entry.amount_gbp,
      entry.earning_on,
      entry.revision
    from public.commission_entries entry
    where entry.entry_mode = 'shadow'
      and entry.earning_on between p_period_start and p_period_end
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode
          and newer.supersedes_entry_id = entry.id
      )
    union all
    select
      'adjustment'::text,
      adjustment.id,
      adjustment.employee_id,
      'manual_adjustment:' || adjustment.category || ':' || adjustment.direction,
      case adjustment.direction when 'debit' then -adjustment.amount_pay_currency
        else adjustment.amount_pay_currency end,
      adjustment.pay_currency,
      adjustment.exchange_rate_units_per_gbp,
      case adjustment.direction when 'debit' then -adjustment.amount_gbp
        else adjustment.amount_gbp end,
      adjustment.period_end,
      1
    from public.commission_adjustments adjustment
    where adjustment.period_start between date_trunc('month', p_period_start)::date
      and date_trunc('month', p_period_end)::date
    union all
    select
      'salary'::text,
      profile.id,
      profile.employee_id,
      'salary'::text,
      (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric,
      upper(coalesce(
        nullif(profile.configuration #>> '{draft,compensation,salaryCurrency}', ''),
        nullif(profile.configuration #>> '{draft,compensation,currency}', ''),
        'GBP'
      )),
      public.commission_exchange_rate_2026083001(
        upper(coalesce(
          nullif(profile.configuration #>> '{draft,compensation,salaryCurrency}', ''),
          nullif(profile.configuration #>> '{draft,compensation,currency}', ''),
          'GBP'
        )),
        date_trunc('month', p_period_start)::date
      ),
      round(
        (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric /
        public.commission_exchange_rate_2026083001(
          upper(coalesce(
            nullif(profile.configuration #>> '{draft,compensation,salaryCurrency}', ''),
            nullif(profile.configuration #>> '{draft,compensation,currency}', ''),
            'GBP'
          )),
          date_trunc('month', p_period_start)::date
        ),
        2
      ),
      p_period_end,
      1
    from public.employee_commission_profiles profile
    where profile.cancelled_at is null
      and profile.effective_from <= p_period_start
      and (profile.effective_to is null or profile.effective_to >= p_period_start)
      and coalesce(
        nullif(profile.configuration #>> '{draft,compensation,monthlySalary}', '')::numeric,
        0
      ) > 0
  )
  select public.commission_sha256_2026082901(coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceKind', row.source_kind,
      'id', row.id,
      'employeeId', row.employee_id,
      'entryKind', row.entry_kind,
      'amountPayCurrency', row.amount_pay_currency,
      'payCurrency', row.pay_currency,
      'exchangeRateUnitsPerGbp', row.exchange_rate_units_per_gbp,
      'amountGbp', row.amount_gbp,
      'earningOn', row.earning_on,
      'revision', row.revision
    ) order by row.source_kind, row.id)::text
    from current_rows row
  ), '[]'))
$function$;

create or replace function public.commission_assert_review_ready_2026090201(
  p_period_start date,
  p_period_end date
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  pending_count integer;
  exception_count integer;
  incomplete_count integer;
begin
  select count(*) into pending_count
  from public.commission_source_events event
  join public.commission_source_event_states state on state.event_id = event.id
  where event.effective_on between p_period_start and p_period_end
    and state.processing_status in ('pending', 'processing', 'held');
  select count(*) into exception_count
  from public.commission_exceptions exception_row
  left join public.commission_source_events event on event.id = exception_row.source_event_id
  where exception_row.status = 'open'
    and (
      event.effective_on between p_period_start and p_period_end
      or exception_row.details ->> 'periodStart' = p_period_start::text
    );
  select count(*) into incomplete_count
  from public.commission_period_results result
  where result.result_mode = 'shadow'
    and result.period_start = p_period_start
    and result.incomplete_input_count > 0
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.result_mode = result.result_mode
        and newer.supersedes_result_id = result.id
    );
  if pending_count > 0 or exception_count > 0 or incomplete_count > 0 then
    raise exception 'Commission month is not ready: % pending events, % open exceptions, % incomplete bonus periods',
      pending_count, exception_count, incomplete_count
      using errcode = '55000', hint = 'COMMISSION_REVIEW_NOT_READY';
  end if;
end
$function$;

revoke all on function public.commission_assert_review_ready_2026090201(date,date)
  from public, anon, authenticated, service_role;

create or replace function public.commission_prepare_review_batch_2026090201(
  p_actor_employee_id uuid,
  p_period_start date,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  period_end_value date;
  batch_id_value uuid;
  batch_revision integer;
  source_hash_value text;
  pending_count integer;
  exception_count integer;
  incomplete_count integer;
  entry_count integer;
  result_json jsonb;
  existing_batch public.commission_review_batches%rowtype;
  existing_entry_count integer;
  request_key_value text := btrim(coalesce(p_request_key, ''));
begin
  perform public.commission_lock_actor_authorization_2026090201(
    p_actor_employee_id
  );
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date
    or p_period_start >= date_trunc(
      'month', (clock_timestamp() at time zone 'Europe/London')::date
    )::date
    or length(request_key_value) not between 8 and 200
  then
    raise exception 'Only a completed calendar month can be prepared for Accounting'
      using errcode = '22023';
  end if;
  period_end_value := (p_period_start + interval '1 month - 1 day')::date;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || p_period_start::text, 0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'review_batch.prepared'
    and request_key = request_key_value;
  if result_json is not null then
    if (result_json ->> 'periodStart')::date <> p_period_start then
      raise exception 'Commission review preparation request key was reused with a different period'
        using errcode = '22023', hint = 'COMMISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select count(*) into pending_count
  from public.commission_source_events event
  join public.commission_source_event_states state on state.event_id = event.id
  where event.effective_on between p_period_start and period_end_value
    and state.processing_status in ('pending', 'processing', 'held');

  select count(*) into exception_count
  from public.commission_exceptions exception_row
  left join public.commission_source_events event on event.id = exception_row.source_event_id
  where exception_row.status = 'open'
    and (
      event.effective_on between p_period_start and period_end_value
      or exception_row.details ->> 'periodStart' = p_period_start::text
    );

  select count(*) into incomplete_count
  from public.commission_period_results result
  where result.result_mode = 'shadow'
    and result.period_start = p_period_start
    and result.incomplete_input_count > 0
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.result_mode = result.result_mode
        and newer.supersedes_result_id = result.id
    );

  if pending_count > 0 or exception_count > 0 or incomplete_count > 0 then
    raise exception 'Commission month is not ready: % pending events, % open exceptions, % incomplete bonus periods',
      pending_count, exception_count, incomplete_count
      using errcode = '55000', hint = 'COMMISSION_REVIEW_NOT_READY';
  end if;

  source_hash_value := public.commission_period_source_hash_2026090201(
    p_period_start, period_end_value
  );

  select batch.* into existing_batch
  from public.commission_review_batches batch
  where batch.period_start = p_period_start
    and batch.status in ('draft', 'submitted_to_accounting', 'approved_locked')
  order by batch.revision desc, batch.created_at desc, batch.id desc
  limit 1
  for update;
  if found then
    if existing_batch.status <> 'draft' then
      raise exception 'That Commission month already has a submitted or approved review batch'
        using errcode = '55000', hint = 'COMMISSION_REVIEW_PERIOD_LOCKED';
    end if;

    if existing_batch.content_hash = source_hash_value then
      select count(*) into existing_entry_count
      from public.commission_review_batch_entries batch_entry
      where batch_entry.batch_id = existing_batch.id;
      result_json := jsonb_build_object(
        'id', existing_batch.id,
        'periodStart', existing_batch.period_start,
        'periodEnd', existing_batch.period_end,
        'revision', existing_batch.revision,
        'status', existing_batch.status,
        'contentHash', existing_batch.content_hash,
        'entryCount', existing_entry_count,
        'payable', false,
        'idempotentReplay', true
      );
      insert into public.commission_audit_events (
        actor_employee_id, action, entity_type, entity_id, reason, after_state, request_key
      ) values (
        p_actor_employee_id, 'review_batch.prepared', 'commission_review_batch',
        existing_batch.id, 'Existing unchanged Commission review batch reused',
        result_json, request_key_value
      );
      return result_json;
    end if;

    perform set_config(
      'pt_portal.commission_review_batch_id', existing_batch.id::text, true
    );
    update public.commission_review_batches
    set status = 'superseded'
    where id = existing_batch.id;
    perform set_config('pt_portal.commission_review_batch_id', '', true);

    insert into public.commission_review_events (
      batch_id, action, actor_employee_id, before_state, after_state
    ) values (
      existing_batch.id, 'superseded_stale_draft', p_actor_employee_id,
      jsonb_build_object(
        'status', 'draft',
        'revision', existing_batch.revision,
        'contentHash', existing_batch.content_hash
      ),
      jsonb_build_object(
        'status', 'superseded',
        'revision', existing_batch.revision,
        'replacementContentHash', source_hash_value
      )
    );
  end if;

  select coalesce(max(batch.revision), 0) + 1 into batch_revision
  from public.commission_review_batches batch
  where batch.period_start = p_period_start;

  insert into public.commission_review_batches (
    period_start, period_end, revision, status, content_hash,
    prepared_by, source_snapshot
  ) values (
    p_period_start, period_end_value, batch_revision, 'draft', source_hash_value,
    p_actor_employee_id, jsonb_build_object(
      'calculationMode', 'shadow',
      'payable', false,
      'pendingEvents', pending_count,
      'openExceptions', exception_count,
      'incompleteBonusPeriods', incomplete_count,
      'bookCurrency', 'GBP'
    )
  ) returning id into batch_id_value;

  insert into public.commission_review_batch_entries (
    batch_id, source_entry_id, employee_id, source_module, service_code,
    entry_kind, earning_on, amount_pay_currency, pay_currency,
    exchange_rate_units_per_gbp, amount_gbp, snapshot
  )
  select
    batch_id_value, entry.id, entry.recipient_employee_id,
    coalesce(source_event.source_module,
      case when entry.entry_kind = 'sales_bonus' then 'bonus' else 'commission' end
    ),
    coalesce(entry.explanation ->> 'serviceCode', entry.entry_kind),
    entry.entry_kind, entry.earning_on, entry.amount_pay_currency,
    entry.pay_currency, entry.exchange_rate_units_per_gbp, entry.amount_gbp,
    jsonb_build_object(
      'sourceEventId', entry.source_event_id,
      'sourceCaseKey', entry.source_case_key,
      'policyVersionId', entry.policy_version_id,
      'componentId', entry.component_id,
      'basis', entry.basis_snapshot,
      'explanation', entry.explanation,
      'entryRevision', entry.revision,
      'reversesEntryId', entry.reverses_entry_id
    )
  from public.commission_entries entry
  left join public.commission_source_events source_event on source_event.id = entry.source_event_id
  where entry.entry_mode = 'shadow'
    and entry.earning_on between p_period_start and period_end_value
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode
        and newer.supersedes_entry_id = entry.id
    );

  insert into public.commission_review_batch_entries (
    batch_id, adjustment_id, employee_id, source_module, service_code,
    entry_kind, earning_on, amount_pay_currency, pay_currency,
    exchange_rate_units_per_gbp, amount_gbp, snapshot
  )
  select
    batch_id_value, adjustment.id, adjustment.employee_id, 'adjustments',
    adjustment.category, 'manual_adjustment', adjustment.period_end,
    case adjustment.direction when 'debit' then -adjustment.amount_pay_currency
      else adjustment.amount_pay_currency end,
    adjustment.pay_currency, adjustment.exchange_rate_units_per_gbp,
    case adjustment.direction when 'debit' then -adjustment.amount_gbp
      else adjustment.amount_gbp end,
    jsonb_build_object(
      'category', adjustment.category,
      'direction', adjustment.direction,
      'reason', adjustment.reason,
      'evidence', adjustment.evidence,
      'reversesAdjustmentId', adjustment.reverses_adjustment_id
    )
  from public.commission_adjustments adjustment
  where adjustment.period_start = p_period_start;

  insert into public.commission_review_batch_entries (
    batch_id, profile_id, employee_id, source_module, service_code,
    entry_kind, earning_on, amount_pay_currency, pay_currency,
    exchange_rate_units_per_gbp, amount_gbp, snapshot
  )
  select
    batch_id_value, profile.id, profile.employee_id, 'compensation', 'salary',
    'salary', period_end_value,
    (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric,
    salary.currency,
    public.commission_exchange_rate_2026083001(salary.currency, p_period_start),
    round(
      (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric /
      public.commission_exchange_rate_2026083001(salary.currency, p_period_start),
      2
    ),
    jsonb_build_object(
      'profileId', profile.id,
      'profileLabel', profile.label,
      'effectiveFrom', profile.effective_from,
      'effectiveTo', profile.effective_to,
      'salaryCurrency', salary.currency,
      'monthlySalary',
        (profile.configuration #>> '{draft,compensation,monthlySalary}')::numeric
    )
  from public.employee_commission_profiles profile
  cross join lateral (
    select upper(coalesce(
      nullif(profile.configuration #>> '{draft,compensation,salaryCurrency}', ''),
      nullif(profile.configuration #>> '{draft,compensation,currency}', ''),
      'GBP'
    )) as currency
  ) salary
  where profile.cancelled_at is null
    and profile.effective_from <= p_period_start
    and (profile.effective_to is null or profile.effective_to >= p_period_start)
    and coalesce(
      nullif(profile.configuration #>> '{draft,compensation,monthlySalary}', '')::numeric,
      0
    ) > 0;

  get diagnostics entry_count = row_count;
  select count(*) into entry_count
  from public.commission_review_batch_entries entry where entry.batch_id = batch_id_value;
  if entry_count = 0 then
    raise exception 'There are no Commission results to submit for that month'
      using errcode = '22023';
  end if;

  with currency_sums as (
    select entry.employee_id, entry.pay_currency,
      round(sum(entry.amount_pay_currency), 2) as native_total
    from public.commission_review_batch_entries entry
    where entry.batch_id = batch_id_value
    group by entry.employee_id, entry.pay_currency
  ), native_totals as (
    select sum_row.employee_id,
      jsonb_object_agg(sum_row.pay_currency, sum_row.native_total order by sum_row.pay_currency)
        as totals
    from currency_sums sum_row
    group by sum_row.employee_id
  ), gbp_totals as (
    select entry.employee_id, round(sum(entry.amount_gbp), 2) as total_gbp
    from public.commission_review_batch_entries entry
    where entry.batch_id = batch_id_value
    group by entry.employee_id
  )
  insert into public.commission_review_statements (
    batch_id, employee_id, native_currency_totals, total_gbp
  )
  select batch_id_value, gbp.employee_id, native.totals, gbp.total_gbp
  from gbp_totals gbp
  join native_totals native on native.employee_id = gbp.employee_id;

  insert into public.commission_review_events (
    batch_id, action, actor_employee_id, after_state
  ) values (
    batch_id_value, 'prepared', p_actor_employee_id,
    jsonb_build_object(
      'status', 'draft', 'revision', batch_revision,
      'contentHash', source_hash_value, 'entryCount', entry_count, 'payable', false
    )
  );

  result_json := jsonb_build_object(
    'id', batch_id_value,
    'periodStart', p_period_start,
    'periodEnd', period_end_value,
    'revision', batch_revision,
    'status', 'draft',
    'contentHash', source_hash_value,
    'entryCount', entry_count,
    'payable', false,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason, after_state, request_key
  ) values (
    p_actor_employee_id, 'review_batch.prepared', 'commission_review_batch', batch_id_value,
    'Completed shadow month frozen for Commission review', result_json, request_key_value
  );
  return result_json;
end
$function$;

drop function if exists public.commission_submit_review_batch_2026090201(
  uuid, uuid, uuid, integer, text
);

create or replace function public.commission_submit_review_batch_2026090201(
  p_actor_employee_id uuid,
  p_batch_id uuid,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  batch public.commission_review_batches%rowtype;
  result_json jsonb;
  current_hash text;
  period_lock date;
  request_key_value text := btrim(coalesce(p_request_key, ''));
begin
  perform public.commission_lock_actor_authorization_2026090201(
    p_actor_employee_id
  );
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_batch_id is null or p_expected_revision is null or p_expected_revision < 1
    or length(request_key_value) not between 8 and 200
  then
    raise exception 'Invalid Commission review submission' using errcode = '22023';
  end if;
  select period_start into period_lock
  from public.commission_review_batches
  where id = p_batch_id;
  if not found then raise exception 'Commission review batch was not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || period_lock::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended('commission-review-batch:' || p_batch_id::text, 0));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'review_batch.submitted'
    and request_key = request_key_value;
  if result_json is not null then
    if result_json ->> 'id' <> p_batch_id::text
      or (result_json ->> 'revision')::integer <> p_expected_revision + 1
    then
      raise exception 'Commission review submission request key was reused with a different payload'
        using errcode = '22023', hint = 'COMMISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into batch from public.commission_review_batches where id = p_batch_id for update;
  if not found then raise exception 'Commission review batch was not found' using errcode = 'P0002'; end if;
  if batch.status <> 'draft' or batch.revision <> p_expected_revision then
    raise exception 'Commission review batch changed; reload before submitting'
      using errcode = '40001';
  end if;
  perform public.commission_assert_review_ready_2026090201(
    batch.period_start, batch.period_end
  );
  current_hash := public.commission_period_source_hash_2026090201(
    batch.period_start, batch.period_end
  );
  if current_hash <> batch.content_hash then
    raise exception 'Commission results changed after preparation; prepare a new batch'
      using errcode = '55000', hint = 'COMMISSION_REVIEW_STALE';
  end if;

  perform set_config('pt_portal.commission_review_batch_id', batch.id::text, true);
  update public.commission_review_batches
  set status = 'submitted_to_accounting', revision = revision + 1,
      submitted_by = p_actor_employee_id, submitted_at = clock_timestamp()
  where id = batch.id
  returning * into batch;
  perform set_config('pt_portal.commission_review_batch_id', '', true);

  result_json := jsonb_build_object(
    'id', batch.id, 'periodStart', batch.period_start, 'periodEnd', batch.period_end,
    'revision', batch.revision, 'status', batch.status,
    'contentHash', batch.content_hash, 'submittedAt', batch.submitted_at,
    'payable', false, 'idempotentReplay', false
  );
  insert into public.commission_review_events (
    batch_id, action, actor_employee_id, before_state, after_state
  ) values (
    batch.id, 'submitted_to_accounting', p_actor_employee_id,
    jsonb_build_object('status', 'draft', 'revision', p_expected_revision), result_json
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason, after_state, request_key
  ) values (
    p_actor_employee_id, 'review_batch.submitted', 'commission_review_batch', batch.id,
    'Commission report submitted to Accounting for independent review', result_json,
    request_key_value
  );
  return result_json;
end
$function$;

create or replace function public.commission_accounting_batches_2026090201(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  period_start date,
  period_end date,
  revision integer,
  status text,
  content_hash text,
  prepared_by uuid,
  prepared_at timestamptz,
  submitted_by uuid,
  submitted_at timestamptz,
  returned_by uuid,
  returned_at timestamptz,
  returned_reason text,
  approved_by uuid,
  approved_at timestamptz,
  employee_count bigint,
  entry_count bigint,
  total_gbp numeric,
  native_currency_totals jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $function$
begin
  if not public.commission_actor_can_account_2026090201(auth.uid()) then
    raise exception 'Accounting access is required'
      using errcode = '42501', hint = 'COMMISSION_ACCOUNTING_FORBIDDEN';
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset < 0 or p_offset > 100000
  then
    raise exception 'Invalid Accounting Commission pagination' using errcode = '22023';
  end if;

  return query
  select batch.id, batch.period_start, batch.period_end, batch.revision,
    batch.status, batch.content_hash, batch.prepared_by, batch.prepared_at,
    batch.submitted_by, batch.submitted_at, batch.returned_by, batch.returned_at,
    batch.returned_reason, batch.approved_by, batch.approved_at,
    (select count(*) from public.commission_review_statements statement
      where statement.batch_id = batch.id) as employee_count,
    (select count(*) from public.commission_review_batch_entries entry
      where entry.batch_id = batch.id) as entry_count,
    coalesce((select round(sum(statement.total_gbp), 2)
      from public.commission_review_statements statement
      where statement.batch_id = batch.id), 0) as total_gbp,
    coalesce((
      select jsonb_object_agg(currency_row.currency, currency_row.amount order by currency_row.currency)
      from (
        select entry.pay_currency as currency, round(sum(entry.amount_pay_currency), 2) as amount
        from public.commission_review_batch_entries entry
        where entry.batch_id = batch.id
        group by entry.pay_currency
      ) currency_row
    ), '{}'::jsonb) as native_currency_totals,
    count(*) over() as total_count
  from public.commission_review_batches batch
  where batch.status not in ('draft', 'superseded')
  order by batch.period_start desc, batch.created_at desc
  limit p_limit offset p_offset;
end
$function$;

create or replace function public.commission_review_batch_detail_2026090201(
  p_batch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $function$
declare result_json jsonb;
begin
  if not public.commission_actor_can_account_2026090201(auth.uid()) then
    raise exception 'Accounting access is required'
      using errcode = '42501', hint = 'COMMISSION_ACCOUNTING_FORBIDDEN';
  end if;
  if p_batch_id is null then
    raise exception 'Commission review batch ID is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.commission_review_batches
    where id = p_batch_id and status not in ('draft', 'superseded')
  ) then
    raise exception 'Commission review batch was not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'batch', jsonb_build_object(
      'id', batch.id,
      'periodStart', batch.period_start,
      'periodEnd', batch.period_end,
      'revision', batch.revision,
      'status', batch.status,
      'contentHash', batch.content_hash,
      'preparedBy', batch.prepared_by,
      'preparedByName', prepared.full_name,
      'preparedAt', batch.prepared_at,
      'submittedBy', batch.submitted_by,
      'submittedByName', submitted.full_name,
      'submittedAt', batch.submitted_at,
      'returnedBy', batch.returned_by,
      'returnedByName', returned.full_name,
      'returnedAt', batch.returned_at,
      'returnedReason', batch.returned_reason,
      'approvedBy', batch.approved_by,
      'approvedByName', approved.full_name,
      'approvedAt', batch.approved_at,
      'bookCurrency', 'GBP',
      'fixed', batch.status = 'approved_locked',
      'isStale', batch.content_hash <> public.commission_period_source_hash_2026090201(
        batch.period_start, batch.period_end
      ),
      'canApprove', batch.status = 'submitted_to_accounting'
        and batch.submitted_by is distinct from auth.uid()
        and batch.content_hash = public.commission_period_source_hash_2026090201(
          batch.period_start, batch.period_end
        ),
      'payrollPaymentCreated', false
    ),
    'statements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', statement.id,
        'employeeId', statement.employee_id,
        'employeeName', employee.full_name,
        'nativeCurrencyTotals', statement.native_currency_totals,
        'totalGbp', statement.total_gbp,
        'createdAt', statement.created_at
      ) order by employee.full_name, statement.employee_id)
      from public.commission_review_statements statement
      join public.employees employee on employee.id = statement.employee_id
      where statement.batch_id = batch.id
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'sourceEntryId', entry.source_entry_id,
        'adjustmentId', entry.adjustment_id,
        'profileId', entry.profile_id,
        'employeeId', entry.employee_id,
        'employeeName', employee.full_name,
        'sourceModule', entry.source_module,
        'serviceCode', entry.service_code,
        'entryKind', entry.entry_kind,
        'earningOn', entry.earning_on,
        'amountPayCurrency', entry.amount_pay_currency,
        'payCurrency', entry.pay_currency,
        'exchangeRateUnitsPerGbp', entry.exchange_rate_units_per_gbp,
        'amountGbp', entry.amount_gbp,
        'snapshot', entry.snapshot
      ) order by employee.full_name, entry.source_module, entry.service_code,
        entry.earning_on, entry.id)
      from public.commission_review_batch_entries entry
      join public.employees employee on employee.id = entry.employee_id
      where entry.batch_id = batch.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'action', event.action,
        'actorEmployeeId', event.actor_employee_id,
        'actorName', actor.full_name,
        'reason', event.reason,
        'beforeState', event.before_state,
        'afterState', event.after_state,
        'createdAt', event.created_at
      ) order by event.created_at, event.id)
      from public.commission_review_events event
      join public.employees actor on actor.id = event.actor_employee_id
      where event.batch_id = batch.id
    ), '[]'::jsonb)
  ) into result_json
  from public.commission_review_batches batch
  join public.employees prepared on prepared.id = batch.prepared_by
  left join public.employees submitted on submitted.id = batch.submitted_by
  left join public.employees returned on returned.id = batch.returned_by
  left join public.employees approved on approved.id = batch.approved_by
  where batch.id = p_batch_id;
  return result_json;
end
$function$;

create or replace function public.commission_return_review_batch_2026090201(
  p_batch_id uuid,
  p_expected_revision integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $function$
declare
  actor_id uuid := auth.uid();
  batch public.commission_review_batches%rowtype;
  result_json jsonb;
  period_lock date;
begin
  perform public.commission_lock_actor_authorization_2026090201(actor_id);
  if not public.commission_actor_can_account_2026090201(actor_id) then
    raise exception 'Accounting access is required'
      using errcode = '42501', hint = 'COMMISSION_ACCOUNTING_FORBIDDEN';
  end if;
  if p_batch_id is null or p_expected_revision is null or p_expected_revision < 1
    or length(btrim(coalesce(p_reason, ''))) not between 3 and 500
  then
    raise exception 'A return reason between 3 and 500 characters is required'
      using errcode = '22023';
  end if;

  select period_start into period_lock
  from public.commission_review_batches
  where id = p_batch_id;
  if not found then raise exception 'Commission review batch was not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || period_lock::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended('commission-review-batch:' || p_batch_id::text, 0));
  select * into batch from public.commission_review_batches where id = p_batch_id for update;
  if not found then raise exception 'Commission review batch was not found' using errcode = 'P0002'; end if;
  if batch.status <> 'submitted_to_accounting' or batch.revision <> p_expected_revision then
    raise exception 'Commission review batch changed; reload before returning it'
      using errcode = '40001';
  end if;

  perform set_config('pt_portal.commission_review_batch_id', batch.id::text, true);
  update public.commission_review_batches
  set status = 'returned', revision = revision + 1,
      returned_by = actor_id, returned_at = clock_timestamp(),
      returned_reason = btrim(p_reason)
  where id = batch.id
  returning * into batch;
  perform set_config('pt_portal.commission_review_batch_id', '', true);

  result_json := jsonb_build_object(
    'id', batch.id, 'status', batch.status, 'revision', batch.revision,
    'returnedBy', batch.returned_by, 'returnedAt', batch.returned_at,
    'returnedReason', batch.returned_reason, 'fixed', false
  );
  insert into public.commission_review_events (
    batch_id, action, actor_employee_id, reason, before_state, after_state
  ) values (
    batch.id, 'returned', actor_id, btrim(p_reason),
    jsonb_build_object('status', 'submitted_to_accounting', 'revision', p_expected_revision),
    result_json
  );
  return result_json;
end
$function$;

create or replace function public.commission_approve_review_batch_2026090201(
  p_batch_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set row_security = off
as $function$
declare
  actor_id uuid := auth.uid();
  batch public.commission_review_batches%rowtype;
  result_json jsonb;
  current_hash text;
  period_lock date;
begin
  perform public.commission_lock_actor_authorization_2026090201(actor_id);
  if not public.commission_actor_can_account_2026090201(actor_id) then
    raise exception 'Accounting access is required'
      using errcode = '42501', hint = 'COMMISSION_ACCOUNTING_FORBIDDEN';
  end if;
  if p_batch_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Invalid Commission approval request' using errcode = '22023';
  end if;

  select period_start into period_lock
  from public.commission_review_batches
  where id = p_batch_id;
  if not found then raise exception 'Commission review batch was not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-review-period:' || period_lock::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended('commission-review-batch:' || p_batch_id::text, 0));
  select * into batch from public.commission_review_batches where id = p_batch_id for update;
  if not found then raise exception 'Commission review batch was not found' using errcode = 'P0002'; end if;
  if batch.status <> 'submitted_to_accounting' or batch.revision <> p_expected_revision then
    raise exception 'Commission review batch changed; reload before approving it'
      using errcode = '40001';
  end if;
  if batch.submitted_by = actor_id then
    raise exception 'The employee who submitted Commission cannot give final Accounting approval'
      using errcode = '42501', hint = 'COMMISSION_REVIEW_SEPARATION_REQUIRED';
  end if;
  perform public.commission_assert_review_ready_2026090201(
    batch.period_start, batch.period_end
  );
  current_hash := public.commission_period_source_hash_2026090201(
    batch.period_start, batch.period_end
  );
  if current_hash <> batch.content_hash then
    raise exception 'Commission results changed after submission; return and prepare a new batch'
      using errcode = '55000', hint = 'COMMISSION_REVIEW_STALE';
  end if;

  perform set_config('pt_portal.commission_review_batch_id', batch.id::text, true);
  update public.commission_review_batches
  set status = 'approved_locked', revision = revision + 1,
      approved_by = actor_id, approved_at = clock_timestamp()
  where id = batch.id
  returning * into batch;
  perform set_config('pt_portal.commission_review_batch_id', '', true);

  result_json := jsonb_build_object(
    'id', batch.id, 'status', batch.status, 'revision', batch.revision,
    'approvedBy', batch.approved_by, 'approvedAt', batch.approved_at,
    'contentHash', batch.content_hash, 'fixed', true,
    'payrollPaymentCreated', false
  );
  insert into public.commission_review_events (
    batch_id, action, actor_employee_id, before_state, after_state
  ) values (
    batch.id, 'approved_locked', actor_id,
    jsonb_build_object('status', 'submitted_to_accounting', 'revision', p_expected_revision),
    result_json
  );
  return result_json;
end
$function$;

comment on table public.commission_adjustments is
  'Append-only ADM, loss, and other Commission penalties plus exact reversing credits.';
comment on table public.commission_refund_decisions is
  'Snapshotted retain/reverse decisions created only from confirmed Ticketing refunds.';
comment on table public.commission_review_batches is
  'Versioned Commission-to-Accounting report boundary; approved_locked membership is immutable.';
comment on table public.commission_review_batch_entries is
  'Immutable native-currency and GBP book-value membership frozen when a review batch is prepared.';

revoke all on function
  public.commission_exchange_rate_2026083001(text,date),
  public.commission_lock_actor_authorization_2026090201(uuid),
  public.commission_set_monthly_exchange_rate_2026083001(uuid,text,date,numeric,text),
  public.commission_apportion_money_2026090201(numeric,integer,integer),
  public.commission_calculate_bonus_schedule_2026090201(jsonb,jsonb,text,numeric,integer,date),
  public.commission_recompute_bonus_2026082902(uuid,uuid,uuid,date),
  public.commission_set_entry_pay_values_2026083001(),
  public.commission_append_adjustment_2026090201(
    uuid,uuid,text,text,numeric,text,date,text,jsonb,uuid,text
  ),
  public.commission_capture_confirmed_ticket_refund_2026090201(),
  public.commission_guard_approved_entry_2026090201(),
  public.commission_process_refunds_2026090201(uuid,integer,text),
  public.commission_requeue_refund_for_entry_2026090201(),
  public.commission_process_shadow_core_2026090201(uuid,integer,text),
  public.commission_process_shadow_2026082902(uuid,integer,text),
  public.commission_shadow_staff_report_2026090201(uuid,date,date),
  public.commission_guard_review_batch_2026090201(),
  public.commission_actor_can_account_2026090201(uuid),
  public.commission_period_source_hash_2026090201(date,date),
  public.commission_prepare_review_batch_2026090201(uuid,date,text),
  public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text),
  public.commission_accounting_batches_2026090201(integer,integer),
  public.commission_review_batch_detail_2026090201(uuid),
  public.commission_return_review_batch_2026090201(uuid,integer,text),
  public.commission_approve_review_batch_2026090201(uuid,integer)
  from public, anon, authenticated, service_role;

grant execute on function
  public.commission_set_monthly_exchange_rate_2026083001(uuid,text,date,numeric,text),
  public.commission_append_adjustment_2026090201(
    uuid,uuid,text,text,numeric,text,date,text,jsonb,uuid,text
  ),
  public.commission_process_shadow_2026082902(uuid,integer,text),
  public.commission_shadow_staff_report_2026090201(uuid,date,date),
  public.commission_prepare_review_batch_2026090201(uuid,date,text),
  public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)
  to service_role;

grant execute on function
  public.commission_accounting_batches_2026090201(integer,integer),
  public.commission_review_batch_detail_2026090201(uuid),
  public.commission_return_review_batch_2026090201(uuid,integer,text),
  public.commission_approve_review_batch_2026090201(uuid,integer)
  to authenticated;

do $commission_2026090201_signature_assertions$
begin
  if to_regprocedure(
    'public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)'
  ) is null then
    raise exception 'Commission review submission signature is missing'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  if to_regprocedure(
    'public.commission_submit_review_batch_2026090201(uuid,uuid,uuid,integer,text)'
  ) is not null then
    raise exception 'Obsolete Commission review submission overload remains installed'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  if not has_function_privilege(
      'service_role',
      'public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)',
      'EXECUTE'
    )
  then
    raise exception 'Commission review submission grants are incorrect'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  if has_function_privilege(
      'service_role',
      'public.commission_process_refunds_2026090201(uuid,integer,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.commission_apportion_money_2026090201(numeric,integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.commission_guard_approved_entry_2026090201()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.commission_process_shadow_2026082902(uuid,integer,text)',
      'EXECUTE'
    )
  then
    raise exception 'Commission worker or helper grants are incorrect'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
end
$commission_2026090201_signature_assertions$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026090201,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260902_commission_compensation_accounting_workflow.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'iso-mixed-compensation',
        'incremental-recurring-profit-bonus',
        'append-only-adjustments',
        'confirmed-refund-commission-policy',
        'current-staff-source-report',
        'accounting-review-lock'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (public.portal_schema_versions.version = excluded.version
       and not coalesce(public.portal_schema_versions.details -> 'capabilities'
         ? 'accounting-review-lock', false));

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
    'historicalProfileEditingReady', coalesce(version >= 2026083008, false),
    'ticketingBookingWaiversReady', coalesce(version >= 2026083101, false),
    'accountingReviewReady', coalesce(version >= 2026090201, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026090201,
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
