-- Per-agent assistance rates, local-pay conversion, and archive-safe marginal tiers.

begin;

select pg_advisory_xact_lock(hashtextextended('pt-portal:commission-schema-migration', 0));

do $migration_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission';

  if installed_version is null or installed_version < 2026082905 then
    raise exception 'Commission capability 2026082905 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083001 then
    raise exception 'Refusing to replay Commission capability 2026083001 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

create table if not exists public.commission_monthly_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null,
  period_start date not null,
  units_per_gbp numeric(18,6) not null,
  set_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_monthly_exchange_rates_currency_check
    check (currency in ('PKR')),
  constraint commission_monthly_exchange_rates_period_check
    check (period_start = date_trunc('month', period_start)::date),
  constraint commission_monthly_exchange_rates_value_check
    check (units_per_gbp > 0 and units_per_gbp <= 1000000000),
  constraint commission_monthly_exchange_rates_currency_period_unique
    unique (currency, period_start)
);

alter table public.commission_monthly_exchange_rates enable row level security;
drop policy if exists "Service role reads Commission monthly exchange rates"
  on public.commission_monthly_exchange_rates;
create policy "Service role reads Commission monthly exchange rates"
  on public.commission_monthly_exchange_rates
  for select to service_role using (true);
revoke all on table public.commission_monthly_exchange_rates
  from public, anon, authenticated, service_role;
grant select on table public.commission_monthly_exchange_rates to service_role;

alter table public.commission_entries
  add column if not exists amount_pay_currency numeric(18,2),
  add column if not exists pay_currency text,
  add column if not exists exchange_rate_units_per_gbp numeric(18,6);

-- Existing shadow rows are immutable business history. This one migration-only
-- backfill derives additive GBP presentation columns while holding an exclusive
-- table lock; the immutable trigger is restored before the transaction commits.
alter table public.commission_entries
  disable trigger commission_entries_immutable_2901;
update public.commission_entries
set amount_pay_currency = amount_gbp,
    pay_currency = 'GBP',
    exchange_rate_units_per_gbp = 1
where amount_pay_currency is null
   or pay_currency is null
   or exchange_rate_units_per_gbp is null;
alter table public.commission_entries
  enable trigger commission_entries_immutable_2901;

alter table public.commission_entries
  alter column amount_pay_currency set not null,
  alter column pay_currency set not null,
  alter column exchange_rate_units_per_gbp set not null;

do $entry_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_entries_pay_currency_check'
      and conrelid = 'public.commission_entries'::regclass
  ) then
    alter table public.commission_entries
      add constraint commission_entries_pay_currency_check
      check (pay_currency in ('GBP', 'PKR'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_entries_exchange_rate_check'
      and conrelid = 'public.commission_entries'::regclass
  ) then
    alter table public.commission_entries
      add constraint commission_entries_exchange_rate_check
      check (exchange_rate_units_per_gbp > 0);
  end if;
end
$entry_constraints$;

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
  if currency_value <> 'PKR'
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

create or replace function public.commission_component_values_2026083001(
  p_component_id uuid,
  p_variables jsonb,
  p_units integer,
  p_prior_units integer default 0,
  p_period_start date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  component public.commission_policy_components%rowtype;
  basis_value numeric;
  raw_value numeric;
  pay_value numeric;
  gbp_value numeric;
  rate_value numeric;
  exchange_rate_value numeric;
  pay_currency_value text;
  assistance_scope jsonb;
  assistance_scope_mode text;
  primary_employee_id text;
begin
  select * into component
  from public.commission_policy_components
  where id = p_component_id;
  if not found or component.component_type = 'sales_profit_bonus' then
    raise exception 'Unsupported Commission component' using errcode = '22023';
  end if;

  pay_currency_value := upper(btrim(coalesce(component.config ->> 'payCurrency', 'GBP')));
  exchange_rate_value := public.commission_exchange_rate_2026083001(
    pay_currency_value,
    coalesce(
      p_period_start,
      nullif(p_variables ->> '_commission_period_start', '')::date,
      date_trunc('month', current_date)::date
    )
  );
  rate_value := component.rate_value;

  if component.recipient_role = 'assistant' then
    assistance_scope := component.config -> 'assistanceScope';
    assistance_scope_mode := coalesce(assistance_scope ->> 'mode', 'all');

    if assistance_scope is not null
      and jsonb_typeof(assistance_scope) is distinct from 'object'
    then
      raise exception 'Ticket Assistance scope must be an object' using errcode = '22023';
    end if;
    if assistance_scope_mode not in ('all', 'specific_agents') then
      raise exception 'Unsupported Ticket Assistance scope mode: %', assistance_scope_mode
        using errcode = '22023';
    end if;

    if assistance_scope_mode = 'specific_agents' then
      if jsonb_typeof(assistance_scope -> 'employeeIds') is distinct from 'array'
        or jsonb_array_length(assistance_scope -> 'employeeIds') = 0
      then
        raise exception 'Specific-agent Ticket Assistance requires at least one primary agent'
          using errcode = '22023';
      end if;

      primary_employee_id := nullif(btrim(p_variables ->> 'primary_responsible_employee_id'), '');
      if primary_employee_id is null then
        raise exception 'Ticket Assistance source is missing its primary responsible employee'
          using errcode = '22023';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements_text(assistance_scope -> 'employeeIds') allowed(employee_id)
        where lower(allowed.employee_id) = lower(primary_employee_id)
      ) then
        return jsonb_build_object(
          'amountGbp', 0,
          'amountPayCurrency', 0,
          'payCurrency', pay_currency_value,
          'exchangeRateUnitsPerGbp', exchange_rate_value
        );
      end if;

      if jsonb_typeof(assistance_scope -> 'agentRates') = 'array' then
        select nullif(agent_rate ->> 'value', '')::numeric into rate_value
        from jsonb_array_elements(assistance_scope -> 'agentRates') agent_rate
        where lower(agent_rate ->> 'employeeId') = lower(primary_employee_id)
        limit 1;
        rate_value := coalesce(rate_value, component.rate_value);
      end if;
    end if;
  end if;

  if component.component_type = 'marginal_ticket_tier' then
    if p_units is null or p_units < 0 or coalesce(p_prior_units, 0) < 0 then
      raise exception 'Valid marginal units are required' using errcode = '22023';
    end if;
    select coalesce(round(sum(unit_rate), 2), 0) into raw_value
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
    if p_units > 0 and raw_value is null then
      raise exception 'Marginal Commission tiers do not cover the supplied units'
        using errcode = '22023';
    end if;
  else
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

    raw_value := public.commission_calculate_component_2026082901(
      component.component_type,
      rate_value,
      basis_value,
      p_units,
      component.minimum_amount_gbp,
      component.maximum_amount_gbp
    );
  end if;

  if component.component_type in (
    'percentage_of_variable', 'signed_percentage', 'percentage_of_package_profit'
  ) then
    gbp_value := round(coalesce(raw_value, 0), 2);
    pay_value := round(gbp_value * exchange_rate_value, 2);
  else
    pay_value := round(coalesce(raw_value, 0), 2);
    gbp_value := round(pay_value / exchange_rate_value, 2);
  end if;

  return jsonb_build_object(
    'amountGbp', gbp_value,
    'amountPayCurrency', pay_value,
    'payCurrency', pay_currency_value,
    'exchangeRateUnitsPerGbp', exchange_rate_value
  );
end
$function$;

create or replace function public.commission_component_amount_2026082902(
  p_component_id uuid,
  p_variables jsonb,
  p_units integer,
  p_prior_units integer default 0
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
  select (
    public.commission_component_values_2026083001(
      p_component_id,
      p_variables,
      p_units,
      p_prior_units,
      nullif(p_variables ->> '_commission_period_start', '')::date
    ) ->> 'amountGbp'
  )::numeric
$function$;

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
begin
  if new.supersedes_entry_id is not null and new.amount_gbp = 0 then
    select * into prior_entry
    from public.commission_entries
    where id = new.supersedes_entry_id;
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
    currency_value := upper(btrim(coalesce(component.config ->> 'payCurrency', 'GBP')));
    exchange_rate_value := public.commission_exchange_rate_2026083001(
      currency_value,
      new.period_start
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

drop trigger if exists commission_entries_set_pay_values_3001
  on public.commission_entries;
create trigger commission_entries_set_pay_values_3001
  before insert on public.commission_entries
  for each row execute function public.commission_set_entry_pay_values_2026083001();

do $upgrade_processor$
declare
  signature constant regprocedure :=
    'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure;
  definition text;
  updated_definition text;
  old_fragment text;
  new_fragment text;
begin
  -- Older production functions were installed through a Windows SQL path and
  -- retained CRLF inside prosrc. Normalize only the rewrite buffer so guarded
  -- semantic fragments match identically across deployment paths.
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position('includeDateChangesInMarginalTiers' in definition) > 0
    and position('_commission_period_start' in definition) > 0
    and position('missing_exchange_rate' in definition) > 0
    and position('later_state.processing_status' in definition) > 0
    and position('newer.supersedes_event_id = event.source_event_id' in definition) = 0
    and position('previous.source_event_id = event.supersedes_event_id' in definition) = 0
  then
    return;
  end if;
  updated_definition := definition;

  old_fragment := $old$newer.supersedes_event_id = event.source_event_id$old$;
  new_fragment := $new$newer.supersedes_event_id = event.id$new$;
  updated_definition := replace(updated_definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor source-lineage upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$previous.source_event_id = event.supersedes_event_id$old$;
  new_fragment := $new$previous.id = event.supersedes_event_id$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor previous-event lineage upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$component.id, event.variables,
                coalesce((event.variables ->> 'passenger_ticket_count')::integer, 0),$old$;
  new_fragment := $new$component.id,
                event.variables || jsonb_build_object(
                  '_commission_period_start', period_start_value
                ),
                coalesce((event.variables ->> 'passenger_ticket_count')::integer, 0),$new$;
  updated_definition := replace(updated_definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor currency call upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$select coalesce(sum((entry.basis_snapshot ->> 'units')::integer), 0)
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
                  );$old$;
  new_fragment := $new$select coalesce(sum(
                  coalesce(nullif(prior_event.variables ->> 'passenger_ticket_count', '')::integer, 0)
                ), 0)
                into prior_units
                from public.commission_source_events prior_event
                where prior_event.source_module = 'ticketing'
                  and (
                    prior_event.event_type = 'ticket_issued'
                    or (
                      coalesce(
                        (component.config ->> 'includeDateChangesInMarginalTiers')::boolean,
                        false
                      )
                      and prior_event.event_type = 'ticket_date_changed'
                    )
                  )
                  and coalesce(prior_event.owner_employee_id, prior_event.employee_id) =
                    (spec ->> 'employeeId')::uuid
                  and date_trunc('month', prior_event.effective_on)::date = period_start_value
                  and (
                    prior_event.effective_on < event.effective_on
                    or (
                      prior_event.effective_on = event.effective_on
                      and prior_event.occurred_at < event.occurred_at
                    )
                    or (
                      prior_event.effective_on = event.effective_on
                      and prior_event.occurred_at = event.occurred_at
                      and prior_event.id < event.id
                    )
                  )
                  and not exists (
                    select 1 from public.commission_source_events newer
                    where newer.supersedes_event_id = prior_event.id
                  );$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor marginal-volume upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$'ordinary:' || event.id::text || ':' || (spec ->> 'employeeId')
                  || ':' || component.id::text$old$;
  new_fragment := $new$'ordinary:' || event.id::text || ':' || (spec ->> 'employeeId')
                  || ':' || component.id::text
                  || ':prior:' || prior_units::text
                  || ':amount:' || amount_value::text$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor recalculation identity upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$when sqlstate = '22023'
          and sqlerrm like 'Required Commission source variable is missing:%'
          then 'missing_required_variable'
        else 'calculation_failed'$old$;
  new_fragment := $new$when sqlstate = '22023'
          and sqlerrm like 'Required Commission source variable is missing:%'
          then 'missing_required_variable'
        when sqlstate = '22023'
          and sqlerrm like 'Monthly exchange rate is required for %'
          then 'missing_exchange_rate'
        else 'calculation_failed'$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor exchange-rate exception upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$        end loop;
      elsif event.event_type in ('ticket_paid') then$old$;
  new_fragment := $new$        end loop;
        update public.commission_source_event_states later_state
        set processing_status = 'pending', next_attempt_at = null, last_error = null,
            updated_at = clock_timestamp()
        from public.commission_source_events later_event,
          public.commission_source_events archived_event
        where later_state.event_id = later_event.id
          and archived_event.id = event.supersedes_event_id
          and later_state.processing_status = 'processed'
          and later_event.source_module = 'ticketing'
          and later_event.event_type = 'ticket_issued'
          and coalesce(later_event.owner_employee_id, later_event.employee_id) =
            coalesce(event.owner_employee_id, event.employee_id)
          and date_trunc('month', later_event.effective_on) =
            date_trunc('month', event.effective_on)
          and (
            later_event.effective_on > archived_event.effective_on
            or (
              later_event.effective_on = archived_event.effective_on
              and later_event.occurred_at > archived_event.occurred_at
            )
            or (
              later_event.effective_on = archived_event.effective_on
              and later_event.occurred_at = archived_event.occurred_at
              and later_event.id > archived_event.id
            )
          )
          and not exists (
            select 1 from public.commission_source_events newer
            where newer.supersedes_event_id = later_event.id
          );
      elsif event.event_type in ('ticket_paid') then$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission processor archive-recalculation upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;

  execute updated_definition;
end
$upgrade_processor$;

do $upgrade_bonus_fixed_currency$
declare
  signature constant regprocedure :=
    'public.commission_recompute_bonus_2026082902(uuid,uuid,uuid,date)'::regprocedure;
  definition text;
  updated_definition text;
  old_fragment text := $old$    bonus_component.reward_value,
    qualifying_value,$old$;
  new_fragment text := $new$    case
      when bonus_component.reward_kind = 'fixed_gbp'
        and upper(coalesce(bonus_component.config ->> 'payCurrency', 'GBP')) <> 'GBP'
      then bonus_component.reward_value / public.commission_exchange_rate_2026083001(
        bonus_component.config ->> 'payCurrency', p_period_start
      )
      else bonus_component.reward_value
    end,
    qualifying_value,$new$;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position('commission_exchange_rate_2026083001' in definition) > 0
    and position('newer.supersedes_event_id = event.source_event_id' in definition) = 0
  then
    return;
  end if;
  updated_definition := replace(
    definition,
    'newer.supersedes_event_id = event.source_event_id',
    'newer.supersedes_event_id = event.id'
  );
  if updated_definition = definition then
    raise exception 'Commission bonus source-lineage upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission bonus pay-currency upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$upgrade_bonus_fixed_currency$;

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
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if currency_value <> 'PKR'
    or p_period_start is null
    or p_period_start <> date_trunc('month', p_period_start)::date
    or p_units_per_gbp is null
    or p_units_per_gbp <= 0
    or p_units_per_gbp > 1000000000
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 120
  then
    raise exception 'Invalid monthly Commission exchange rate'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-exchange-rate:' || currency_value || ':' || p_period_start::text,
    0
  ));
  select after_state into result_json
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'exchange_rate.set'
    and request_key = p_request_key;
  if result_json is not null then
    return result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into existing_rate
  from public.commission_monthly_exchange_rates
  where currency = currency_value and period_start = p_period_start
  for update;
  if found and existing_rate.units_per_gbp <> p_units_per_gbp and exists (
    select 1
    from public.commission_entries entry
    where entry.pay_currency = currency_value
      and entry.period_start = p_period_start
  ) then
    raise exception 'The monthly exchange rate is locked because calculations already use it'
      using errcode = '55000', hint = 'COMMISSION_EXCHANGE_RATE_LOCKED';
  end if;

  insert into public.commission_monthly_exchange_rates (
    currency, period_start, units_per_gbp, set_by
  ) values (
    currency_value, p_period_start, round(p_units_per_gbp, 6), p_actor_employee_id
  )
  on conflict (currency, period_start) do update
  set units_per_gbp = excluded.units_per_gbp,
      set_by = excluded.set_by,
      created_at = clock_timestamp()
  returning id into rate_id_value;

  update public.commission_source_event_states state
  set processing_status = 'pending',
      next_attempt_at = null,
      last_error = null,
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
    'unitsPerGbp', round(p_units_per_gbp, 6),
    'queuedEvents', queued_count,
    'idempotentReplay', false
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, reason,
    before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'exchange_rate.set', 'commission_monthly_exchange_rate',
    rate_id_value, 'Monthly local-pay conversion rate recorded',
    case when existing_rate.id is null then null else jsonb_build_object(
      'unitsPerGbp', existing_rate.units_per_gbp
    ) end,
    result_json,
    p_request_key
  );
  return result_json;
end
$function$;

revoke all on function public.commission_exchange_rate_2026083001(text,date),
  public.commission_component_values_2026083001(uuid,jsonb,integer,integer,date),
  public.commission_component_amount_2026082902(uuid,jsonb,integer,integer),
  public.commission_set_entry_pay_values_2026083001(),
  public.commission_set_monthly_exchange_rate_2026083001(uuid,text,date,numeric,text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.commission_set_monthly_exchange_rate_2026083001(uuid,text,date,numeric,text)
  to service_role;
grant execute on function
  public.commission_component_amount_2026082902(uuid,jsonb,integer,integer)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083001,
  clock_timestamp(),
  jsonb_build_object(
    'migration', '20260830_commission_compensation_and_tiers.sql',
    'mode', 'shadow',
    'capabilities', jsonb_build_array(
      'employee-owned-profile-snapshots',
      'one-time-profile-copy',
      'effective-dated-profile-replacement',
      'scheduled-profile-cancellation',
      'assistant-primary-agent-specific-rates',
      'full-supplier-fare-increase-adjustment',
      'fixed-low-fare-per-ticket',
      'optional-date-change-marginal-volume',
      'monthly-pkr-gbp-book-conversion',
      'archive-safe-marginal-recalculation'
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
    'profileReady', coalesce(version >= 2026083001, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026083001,
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
