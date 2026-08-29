-- Commission capability 2026082901.
-- Adds versioned typed policies, effective assignments, narrow HR access,
-- immutable shadow results, exception tracking, and deterministic numeric
-- calculation primitives without making any result payable.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $guard$
declare
  installed_version bigint;
begin
  if to_regclass('public.portal_schema_versions') is null
    or to_regclass('public.commission_source_events') is null
    or to_regclass('public.commission_source_event_states') is null
  then
    raise exception 'Ticketing Commission source foundation is required'
      using errcode = '55000', hint = 'COMMISSION_SOURCE_SCHEMA_NOT_READY';
  end if;

  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version > 2026082901 then
    raise exception 'Commission migration capability % cannot run after installed capability %',
      2026082901, installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$guard$;

-- The linked project was verified with these legacy tables empty. Fail closed
-- rather than guessing how an unexpected production row should be translated.
do $legacy_rows$
begin
  if not exists (
    select 1 from public.portal_schema_versions
    where component = 'commission' and version >= 2026082901
  ) and (
    exists (select 1 from public.commission_rules)
    or exists (select 1 from public.commission_rate_components)
    or exists (select 1 from public.commission_tiers)
    or exists (select 1 from public.employee_commission_assignments)
  ) then
    raise exception 'Legacy Commission rows require a reviewed v1 backfill before this migration'
      using errcode = '55000', hint = 'COMMISSION_LEGACY_BACKFILL_REQUIRED';
  end if;
end
$legacy_rows$;

alter table public.commission_rules
  add column if not exists description text,
  add column if not exists created_by uuid references public.employees(id) on delete restrict,
  add column if not exists updated_at timestamptz not null default clock_timestamp();

do $relax_legacy_rule_columns$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commission_rules'
      and column_name = 'product_type'
  ) then
    alter table public.commission_rules alter column product_type drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commission_rules'
      and column_name = 'calculation_basis'
  ) then
    alter table public.commission_rules alter column calculation_basis drop not null;
  end if;
end
$relax_legacy_rule_columns$;

create unique index if not exists commission_rules_name_unique_idx
  on public.commission_rules (lower(btrim(rule_name)));

create table if not exists public.commission_policy_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commission_rules(id) on delete restrict,
  version_number integer not null,
  status text not null default 'draft',
  content_hash text,
  created_by uuid not null references public.employees(id) on delete restrict,
  activated_by uuid references public.employees(id) on delete restrict,
  activated_at timestamptz,
  retired_by uuid references public.employees(id) on delete restrict,
  retired_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_policy_versions_number_check check (version_number > 0),
  constraint commission_policy_versions_status_check
    check (status in ('draft', 'active', 'retired')),
  constraint commission_policy_versions_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint commission_policy_versions_activation_check check (
    (status = 'draft' and activated_by is null and activated_at is null
      and retired_by is null and retired_at is null)
    or (status = 'active' and activated_by is not null and activated_at is not null
      and retired_by is null and retired_at is null and content_hash is not null)
    or (status = 'retired' and activated_by is not null and activated_at is not null
      and retired_by is not null and retired_at is not null and content_hash is not null)
  ),
  constraint commission_policy_versions_rule_version_unique unique (rule_id, version_number)
);

create unique index if not exists commission_policy_versions_active_rule_unique_idx
  on public.commission_policy_versions (rule_id)
  where status = 'active';

create table if not exists public.commission_policy_components (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null
    references public.commission_policy_versions(id) on delete restrict,
  sequence integer not null,
  component_type text not null,
  source_variable text,
  recipient_role text not null,
  rate_value numeric(18,6),
  minimum_amount_gbp numeric(18,2),
  maximum_amount_gbp numeric(18,2),
  threshold_gbp numeric(18,2),
  reward_kind text,
  reward_value numeric(18,6),
  eligible_services jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_policy_components_sequence_check check (sequence > 0),
  constraint commission_policy_components_type_check check (component_type in (
    'fixed_per_unit', 'fixed_per_event', 'percentage_of_variable',
    'signed_percentage', 'explicit_zero', 'marginal_ticket_tier',
    'fixed_package', 'fixed_package_per_passenger',
    'percentage_of_package_profit', 'sales_profit_bonus'
  )),
  constraint commission_policy_components_recipient_check check (recipient_role in (
    'primary', 'assistant', 'low_fare_actor', 'package_sales', 'sales_bonus'
  )),
  constraint commission_policy_components_rate_check check (
    (component_type = 'explicit_zero' and coalesce(rate_value, 0) = 0)
    or (component_type in ('marginal_ticket_tier', 'sales_profit_bonus'))
    or (component_type not in ('explicit_zero', 'marginal_ticket_tier', 'sales_profit_bonus')
      and rate_value is not null and rate_value >= 0)
  ),
  constraint commission_policy_components_variable_check check (
    component_type in (
      'fixed_per_event', 'explicit_zero', 'marginal_ticket_tier',
      'fixed_package', 'sales_profit_bonus'
    ) or length(btrim(source_variable)) between 1 and 100
  ),
  constraint commission_policy_components_bounds_check check (
    (minimum_amount_gbp is null or minimum_amount_gbp >= 0)
    and (maximum_amount_gbp is null or maximum_amount_gbp >= 0)
    and (minimum_amount_gbp is null or maximum_amount_gbp is null
      or minimum_amount_gbp <= maximum_amount_gbp)
  ),
  constraint commission_policy_components_bonus_check check (
    (component_type <> 'sales_profit_bonus'
      and threshold_gbp is null and reward_kind is null and reward_value is null)
    or (component_type = 'sales_profit_bonus'
      and threshold_gbp is not null and threshold_gbp >= 0
      and reward_kind in ('fixed_gbp', 'percentage_of_qualifying_profit')
      and reward_value is not null and reward_value >= 0
      and jsonb_typeof(eligible_services) = 'array'
      and jsonb_array_length(eligible_services) > 0)
  ),
  constraint commission_policy_components_config_check check (jsonb_typeof(config) = 'object'),
  constraint commission_policy_components_services_check
    check (jsonb_typeof(eligible_services) = 'array'),
  constraint commission_policy_components_version_sequence_unique
    unique (policy_version_id, sequence)
);

create table if not exists public.commission_policy_tiers (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null
    references public.commission_policy_components(id) on delete restrict,
  min_unit integer not null,
  rate_gbp numeric(18,2) not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_policy_tiers_min_check check (min_unit > 0),
  constraint commission_policy_tiers_rate_check check (rate_gbp >= 0),
  constraint commission_policy_tiers_component_min_unique unique (component_id, min_unit)
);

alter table public.employee_commission_assignments
  add column if not exists policy_version_id uuid
    references public.commission_policy_versions(id) on delete restrict,
  add column if not exists source_module text,
  add column if not exists service_code text,
  add column if not exists recipient_role text,
  add column if not exists location_id uuid references public.locations(id) on delete restrict,
  add column if not exists effective_to date,
  add column if not exists created_by uuid references public.employees(id) on delete restrict,
  add column if not exists updated_at timestamptz not null default clock_timestamp();

alter table public.employee_commission_assignments
  alter column policy_version_id set not null,
  alter column source_module set not null,
  alter column service_code set not null,
  alter column recipient_role set not null,
  alter column created_by set not null;

alter table public.employee_commission_assignments
  drop constraint if exists unique_employee_rule;
alter table public.employee_commission_assignments
  drop constraint if exists employee_commission_assignments_scope_check;
alter table public.employee_commission_assignments
  add constraint employee_commission_assignments_scope_check check (
    source_module in ('ticketing', 'packages')
    and service_code in (
      'tk_primary', 'tk_assistance', 'dc', 'r_er', 'low_fare',
      'higher_fare', 'package_sale', 'sales_bonus'
    )
    and recipient_role in (
      'primary', 'assistant', 'low_fare_actor', 'package_sales', 'sales_bonus'
    )
  );
alter table public.employee_commission_assignments
  drop constraint if exists employee_commission_assignments_dates_check;
alter table public.employee_commission_assignments
  add constraint employee_commission_assignments_dates_check
    check (effective_to is null or effective_to >= start_date);

create index if not exists employee_commission_assignments_lookup_idx
  on public.employee_commission_assignments (
    employee_id, source_module, service_code, recipient_role, start_date, effective_to
  );

create table if not exists public.commission_access_grants (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  capability text not null,
  granted_by uuid not null references public.employees(id) on delete restrict,
  granted_at timestamptz not null default clock_timestamp(),
  revoked_by uuid references public.employees(id) on delete restrict,
  revoked_at timestamptz,
  constraint commission_access_grants_capability_check
    check (capability = 'manage_commission_policies'),
  constraint commission_access_grants_revoke_check check (
    (revoked_by is null and revoked_at is null)
    or (revoked_by is not null and revoked_at is not null)
  )
);

create unique index if not exists commission_access_grants_active_unique_idx
  on public.commission_access_grants (employee_id, capability)
  where revoked_at is null;

create table if not exists public.commission_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  run_mode text not null default 'shadow',
  run_type text not null,
  status text not null default 'running',
  triggered_by uuid references public.employees(id) on delete restrict,
  source_event_count integer not null default 0,
  entry_count integer not null default 0,
  exception_count integer not null default 0,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  error_summary text,
  constraint commission_calculation_runs_mode_check check (run_mode in ('shadow', 'live')),
  constraint commission_calculation_runs_type_check
    check (run_type in ('worker', 'reprocess')),
  constraint commission_calculation_runs_status_check
    check (status in ('running', 'completed', 'failed')),
  constraint commission_calculation_runs_count_check check (
    source_event_count >= 0 and entry_count >= 0 and exception_count >= 0
  )
);

create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.commission_calculation_runs(id) on delete restrict,
  entry_mode text not null default 'shadow',
  entry_kind text not null default 'ordinary',
  source_event_id uuid references public.commission_source_events(id) on delete restrict,
  source_case_key text not null,
  recipient_employee_id uuid not null references public.employees(id) on delete restrict,
  profit_owner_employee_id uuid not null references public.employees(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  policy_version_id uuid not null
    references public.commission_policy_versions(id) on delete restrict,
  component_id uuid not null
    references public.commission_policy_components(id) on delete restrict,
  earning_on date not null,
  period_start date not null,
  period_end date not null,
  amount_gbp numeric(18,2) not null,
  basis_snapshot jsonb not null,
  explanation jsonb not null,
  revision integer not null default 1,
  supersedes_entry_id uuid references public.commission_entries(id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_entries_mode_check check (entry_mode in ('shadow', 'live')),
  constraint commission_entries_kind_check
    check (entry_kind in ('ordinary', 'sales_bonus', 'manual_adjustment')),
  constraint commission_entries_case_check
    check (length(btrim(source_case_key)) between 1 and 250),
  constraint commission_entries_period_check check (period_end >= period_start),
  constraint commission_entries_revision_check check (revision > 0),
  constraint commission_entries_snapshot_check
    check (jsonb_typeof(basis_snapshot) = 'object' and jsonb_typeof(explanation) = 'object'),
  constraint commission_entries_idempotency_check
    check (length(btrim(idempotency_key)) between 1 and 250),
  constraint commission_entries_supersedes_check
    check (supersedes_entry_id is null or supersedes_entry_id <> id),
  constraint commission_entries_idempotency_unique unique (entry_mode, idempotency_key),
  constraint commission_entries_revision_unique unique (
    entry_mode, source_case_key, recipient_employee_id, component_id, revision
  )
);

create index if not exists commission_entries_recipient_period_idx
  on public.commission_entries (recipient_employee_id, period_start desc, created_at desc);
create index if not exists commission_entries_profit_owner_case_idx
  on public.commission_entries (profit_owner_employee_id, source_case_key, created_at desc);

create table if not exists public.commission_period_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.commission_calculation_runs(id) on delete restrict,
  result_mode text not null default 'shadow',
  employee_id uuid not null references public.employees(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  bonus_component_id uuid not null
    references public.commission_policy_components(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_contributed_profit_gbp numeric(18,2) not null,
  ordinary_commission_cost_gbp numeric(18,2) not null,
  qualifying_profit_gbp numeric(18,2) not null,
  threshold_gbp numeric(18,2) not null,
  achieved boolean not null,
  reward_gbp numeric(18,2) not null,
  incomplete_input_count integer not null default 0,
  calculation_snapshot jsonb not null,
  revision integer not null default 1,
  supersedes_result_id uuid references public.commission_period_results(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_period_results_mode_check check (result_mode in ('shadow', 'live')),
  constraint commission_period_results_period_check check (period_end >= period_start),
  constraint commission_period_results_money_check check (
    threshold_gbp >= 0 and reward_gbp >= 0 and incomplete_input_count >= 0
  ),
  constraint commission_period_results_achievement_check check (
    achieved = (incomplete_input_count = 0 and qualifying_profit_gbp >= threshold_gbp)
  ),
  constraint commission_period_results_snapshot_check
    check (jsonb_typeof(calculation_snapshot) = 'object'),
  constraint commission_period_results_revision_unique unique (
    result_mode, employee_id, bonus_component_id, period_start, revision
  )
);

create table if not exists public.commission_exceptions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.commission_calculation_runs(id) on delete restrict,
  source_event_id uuid references public.commission_source_events(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  exception_code text not null,
  status text not null default 'open',
  details jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0,
  last_retried_at timestamptz,
  resolved_by uuid references public.employees(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_exceptions_code_check check (exception_code in (
    'needs_policy', 'ambiguous_assignment', 'unsupported_contract_version',
    'missing_required_variable', 'inactive_recipient', 'invalid_source_lineage',
    'unresolved_package_scope', 'package_source_not_authoritative',
    'bonus_period_incomplete', 'calculation_failed'
  )),
  constraint commission_exceptions_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint commission_exceptions_details_check check (jsonb_typeof(details) = 'object'),
  constraint commission_exceptions_retry_check check (retry_count >= 0),
  constraint commission_exceptions_resolution_check check (
    (status = 'open' and resolved_by is null and resolved_at is null)
    or (status <> 'open' and resolved_by is not null and resolved_at is not null)
  )
);

create unique index if not exists commission_exceptions_open_source_code_idx
  on public.commission_exceptions (source_event_id, exception_code)
  where status = 'open' and source_event_id is not null;

create table if not exists public.commission_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  request_key text,
  created_at timestamptz not null default clock_timestamp(),
  constraint commission_audit_events_action_check
    check (length(btrim(action)) between 1 and 100),
  constraint commission_audit_events_entity_check
    check (length(btrim(entity_type)) between 1 and 100),
  constraint commission_audit_events_state_check check (
    (before_state is null or jsonb_typeof(before_state) = 'object')
    and (after_state is null or jsonb_typeof(after_state) = 'object')
  ),
  constraint commission_audit_events_request_key_check check (
    request_key is null or length(btrim(request_key)) between 8 and 200
  )
);

alter table public.commission_audit_events
  add column if not exists request_key text;

alter table public.commission_audit_events
  drop constraint if exists commission_audit_events_request_key_check;
alter table public.commission_audit_events
  add constraint commission_audit_events_request_key_check check (
    request_key is null or length(btrim(request_key)) between 8 and 200
  );

create unique index if not exists commission_audit_events_request_unique_idx
  on public.commission_audit_events (actor_employee_id, action, request_key)
  where request_key is not null;

create or replace function public.commission_reject_immutable_mutation_2026082901()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'Commission calculation and audit history is immutable'
    using errcode = '55000';
end
$$;

do $immutable_triggers$
declare table_name text;
begin
  foreach table_name in array array[
    'commission_entries', 'commission_period_results', 'commission_audit_events'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I',
      table_name || '_immutable_2901', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I '
        || 'for each row execute function public.commission_reject_immutable_mutation_2026082901()',
      table_name || '_immutable_2901', table_name
    );
  end loop;
end
$immutable_triggers$;

create or replace function public.commission_guard_policy_version_2026082901()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Commission policy versions cannot be deleted' using errcode = '55000';
  end if;

  if old.status = 'active' then
    if new.status <> 'retired'
      or row(new.rule_id, new.version_number, new.content_hash, new.created_by,
        new.activated_by, new.activated_at, new.created_at)
        is distinct from
        row(old.rule_id, old.version_number, old.content_hash, old.created_by,
          old.activated_by, old.activated_at, old.created_at)
    then
      raise exception 'Active Commission policy versions are immutable; clone a draft'
        using errcode = '55000';
    end if;
  elsif old.status = 'retired' then
    raise exception 'Retired Commission policy versions are immutable'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists commission_policy_versions_guard_2901
  on public.commission_policy_versions;
create trigger commission_policy_versions_guard_2901
  before update or delete on public.commission_policy_versions
  for each row execute function public.commission_guard_policy_version_2026082901();

create or replace function public.commission_guard_draft_child_2026082901()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare version_status text;
begin
  select status into version_status
  from public.commission_policy_versions
  where id = coalesce(new.policy_version_id, old.policy_version_id);
  if version_status is distinct from 'draft' then
    raise exception 'Only draft Commission policy components may change'
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists commission_policy_components_draft_guard_2901
  on public.commission_policy_components;
create trigger commission_policy_components_draft_guard_2901
  before insert or update or delete on public.commission_policy_components
  for each row execute function public.commission_guard_draft_child_2026082901();

create or replace function public.commission_guard_tier_draft_2026082901()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare version_status text;
begin
  select version_row.status into version_status
  from public.commission_policy_versions version_row
  join public.commission_policy_components component
    on component.policy_version_id = version_row.id
  where component.id = coalesce(new.component_id, old.component_id);
  if version_status is distinct from 'draft' then
    raise exception 'Only draft Commission policy tiers may change'
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists commission_policy_tiers_draft_guard_2901
  on public.commission_policy_tiers;
create trigger commission_policy_tiers_draft_guard_2901
  before insert or update or delete on public.commission_policy_tiers
  for each row execute function public.commission_guard_tier_draft_2026082901();

create or replace function public.commission_validate_assignment_overlap_2026082901()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-assignment:' || new.employee_id::text || ':' || new.source_module || ':'
      || new.service_code || ':' || new.recipient_role || ':'
      || coalesce(new.location_id::text, 'all'), 0
  ));

  if exists (
    select 1
    from public.employee_commission_assignments assignment
    where assignment.id <> new.id
      and assignment.employee_id = new.employee_id
      and assignment.source_module = new.source_module
      and assignment.service_code = new.service_code
      and assignment.recipient_role = new.recipient_role
      and assignment.location_id is not distinct from new.location_id
      and daterange(assignment.start_date, assignment.effective_to, '[]')
        && daterange(new.start_date, new.effective_to, '[]')
  ) then
    raise exception 'Commission policy assignment overlaps an assignment at the same specificity'
      using errcode = '23P01', hint = 'COMMISSION_ASSIGNMENT_OVERLAP';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

drop trigger if exists employee_commission_assignments_overlap_2901
  on public.employee_commission_assignments;
create trigger employee_commission_assignments_overlap_2901
  before insert or update on public.employee_commission_assignments
  for each row execute function public.commission_validate_assignment_overlap_2026082901();

create or replace function public.commission_resolve_assignment_2026082901(
  p_employee_id uuid,
  p_source_module text,
  p_service_code text,
  p_recipient_role text,
  p_location_id uuid,
  p_effective_on date
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare resolved_version_id uuid;
begin
  select assignment.policy_version_id
  into resolved_version_id
  from public.employee_commission_assignments assignment
  join public.commission_policy_versions version_row
    on version_row.id = assignment.policy_version_id
      and version_row.status in ('active', 'retired')
  where assignment.employee_id = p_employee_id
    and assignment.source_module = lower(btrim(p_source_module))
    and assignment.service_code = lower(btrim(p_service_code))
    and assignment.recipient_role = lower(btrim(p_recipient_role))
    and assignment.start_date <= p_effective_on
    and (assignment.effective_to is null or assignment.effective_to >= p_effective_on)
    and (assignment.location_id = p_location_id or assignment.location_id is null)
  order by (assignment.location_id is not null) desc, assignment.start_date desc, assignment.id
  limit 1;
  return resolved_version_id;
end
$$;

create or replace function public.commission_calculate_component_2026082901(
  p_component_type text,
  p_rate_value numeric,
  p_basis_value numeric,
  p_units integer,
  p_minimum_gbp numeric default null,
  p_maximum_gbp numeric default null
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare result_value numeric;
begin
  if p_component_type = 'explicit_zero' then
    result_value := 0;
  elsif p_component_type = 'fixed_per_event' then
    result_value := p_rate_value;
  elsif p_component_type in ('fixed_per_unit', 'fixed_package_per_passenger') then
    if p_units is null or p_units < 0 then
      raise exception 'A non-negative unit count is required' using errcode = '22023';
    end if;
    result_value := p_rate_value * p_units;
  elsif p_component_type in (
    'percentage_of_variable', 'signed_percentage', 'percentage_of_package_profit'
  ) then
    if p_basis_value is null then
      raise exception 'A GBP basis value is required' using errcode = '22023';
    end if;
    result_value := p_basis_value * p_rate_value / 100;
  elsif p_component_type = 'fixed_package' then
    result_value := p_rate_value;
  else
    raise exception 'Component type requires its specialised calculator: %', p_component_type
      using errcode = '22023';
  end if;

  result_value := round(result_value, 2);
  if p_minimum_gbp is not null then result_value := greatest(result_value, p_minimum_gbp); end if;
  if p_maximum_gbp is not null then result_value := least(result_value, p_maximum_gbp); end if;
  return round(result_value, 2);
end
$$;

create or replace function public.commission_calculate_sales_bonus_2026082901(
  p_threshold_gbp numeric,
  p_reward_kind text,
  p_reward_value numeric,
  p_qualifying_profit_gbp numeric,
  p_incomplete_input_count integer default 0
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare achieved_value boolean;
declare reward_gbp_value numeric(18,2);
begin
  if p_threshold_gbp is null or p_threshold_gbp < 0
    or p_reward_value is null or p_reward_value < 0
    or p_qualifying_profit_gbp is null
    or coalesce(p_incomplete_input_count, 0) < 0
    or p_reward_kind not in ('fixed_gbp', 'percentage_of_qualifying_profit')
  then
    raise exception 'Invalid sales-bonus calculation input' using errcode = '22023';
  end if;

  achieved_value := p_incomplete_input_count = 0
    and p_qualifying_profit_gbp >= p_threshold_gbp;
  reward_gbp_value := case
    when not achieved_value then 0
    when p_reward_kind = 'fixed_gbp' then round(p_reward_value, 2)
    else round(p_qualifying_profit_gbp * p_reward_value / 100, 2)
  end;

  return jsonb_build_object(
    'achieved', achieved_value,
    'qualifyingProfitGbp', round(p_qualifying_profit_gbp, 2),
    'thresholdGbp', round(p_threshold_gbp, 2),
    'rewardGbp', reward_gbp_value,
    'incompleteInputCount', p_incomplete_input_count
  );
end
$$;

create or replace function public.commission_actor_is_admin_2026082901(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select coalesce(role_row.name in ('Admin', 'Master Admin', 'Super Admin'), false)
  from public.employees employee
  join public.roles role_row on role_row.id = employee.role_id
  where employee.id = p_employee_id and employee.is_active
$$;

create or replace function public.commission_actor_can_manage_2026082901(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select public.commission_actor_is_admin_2026082901(p_employee_id)
    or exists (
      select 1 from public.commission_access_grants grant_row
      join public.employees employee on employee.id = grant_row.employee_id and employee.is_active
      where grant_row.employee_id = p_employee_id
        and grant_row.capability = 'manage_commission_policies'
        and grant_row.revoked_at is null
    )
$$;

create or replace function public.commission_actor_can_manage_grants_2026082901(
  p_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select coalesce(role_row.name in ('Master Admin', 'Super Admin'), false)
  from public.employees employee
  join public.roles role_row on role_row.id = employee.role_id
  where employee.id = p_employee_id and employee.is_active
$$;

create or replace function public.commission_sha256_2026082901(p_value text)
returns text
language plpgsql
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare digest_schema text;
declare digest_value bytea;
begin
  select namespace_row.nspname into digest_schema
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
  where procedure_row.proname = 'digest'
    and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) = 'bytea, text'
  order by case when namespace_row.nspname = 'extensions' then 0 else 1 end,
    namespace_row.nspname
  limit 1;
  if digest_schema is null then
    raise exception 'pgcrypto digest(bytea, text) is required'
      using errcode = '55000', hint = 'COMMISSION_PGCRYPTO_NOT_READY';
  end if;
  execute pg_catalog.format(
    'select %I.digest(pg_catalog.convert_to($1, ''UTF8''), ''sha256'')',
    digest_schema
  ) into digest_value using p_value;
  return pg_catalog.encode(digest_value, 'hex');
end
$$;

create or replace function public.commission_create_policy_2026082901(
  p_actor_employee_id uuid,
  p_rule_name text,
  p_description text,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare existing_result jsonb;
declare created_rule public.commission_rules%rowtype;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_rule_name, ''))) not between 2 and 100
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
    or length(coalesce(p_description, '')) > 500
  then
    raise exception 'Invalid Commission policy request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-policy-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'policy.created'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;

  insert into public.commission_rules (rule_name, description, created_by)
  values (btrim(p_rule_name), nullif(btrim(coalesce(p_description, '')), ''), p_actor_employee_id)
  returning * into created_rule;

  existing_result := jsonb_build_object(
    'id', created_rule.id,
    'name', created_rule.rule_name,
    'description', created_rule.description,
    'createdAt', created_rule.updated_at
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, after_state, request_key
  ) values (
    p_actor_employee_id, 'policy.created', 'commission_policy', created_rule.id,
    existing_result, p_request_key
  );
  return existing_result;
end
$$;

create or replace function public.commission_create_policy_version_2026082901(
  p_actor_employee_id uuid,
  p_rule_id uuid,
  p_components jsonb,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare existing_result jsonb;
declare next_version integer;
declare created_version_id uuid;
declare component jsonb;
declare tier jsonb;
declare component_id uuid;
declare sequence_number integer := 0;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_rule_id is null
    or jsonb_typeof(p_components) is distinct from 'array'
    or jsonb_array_length(p_components) < 1
    or jsonb_array_length(p_components) > 50
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then
    raise exception 'Invalid Commission policy-version request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-version-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'policy_version.created'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;

  perform 1 from public.commission_rules where id = p_rule_id for update;
  if not found then
    raise exception 'Commission policy was not found' using errcode = 'P0002';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.commission_policy_versions where rule_id = p_rule_id;

  insert into public.commission_policy_versions (
    rule_id, version_number, status, created_by
  ) values (p_rule_id, next_version, 'draft', p_actor_employee_id)
  returning id into created_version_id;

  for component in select value from jsonb_array_elements(p_components)
  loop
    sequence_number := sequence_number + 1;
    insert into public.commission_policy_components (
      policy_version_id, sequence, component_type, source_variable, recipient_role,
      rate_value, minimum_amount_gbp, maximum_amount_gbp, threshold_gbp,
      reward_kind, reward_value, eligible_services, config
    ) values (
      created_version_id,
      sequence_number,
      component ->> 'componentType',
      nullif(btrim(coalesce(component ->> 'sourceVariable', '')), ''),
      component ->> 'recipientRole',
      nullif(component ->> 'rateValue', '')::numeric,
      nullif(component ->> 'minimumAmountGbp', '')::numeric,
      nullif(component ->> 'maximumAmountGbp', '')::numeric,
      nullif(component ->> 'thresholdGbp', '')::numeric,
      nullif(component ->> 'rewardKind', ''),
      nullif(component ->> 'rewardValue', '')::numeric,
      coalesce(component -> 'eligibleServices', '[]'::jsonb),
      coalesce(component -> 'config', '{}'::jsonb)
    ) returning id into component_id;

    if component ? 'tiers' then
      if jsonb_typeof(component -> 'tiers') is distinct from 'array' then
        raise exception 'Commission tiers must be an array' using errcode = '22023';
      end if;
      for tier in select value from jsonb_array_elements(component -> 'tiers')
      loop
        insert into public.commission_policy_tiers (component_id, min_unit, rate_gbp)
        values (
          component_id,
          (tier ->> 'minUnit')::integer,
          (tier ->> 'rateGbp')::numeric
        );
      end loop;
    end if;
  end loop;

  existing_result := jsonb_build_object(
    'id', created_version_id,
    'policyId', p_rule_id,
    'versionNumber', next_version,
    'status', 'draft',
    'componentCount', sequence_number
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, after_state, request_key
  ) values (
    p_actor_employee_id, 'policy_version.created', 'commission_policy_version',
    created_version_id, existing_result, p_request_key
  );
  return existing_result;
end
$$;

create or replace function public.commission_activate_policy_version_2026082901(
  p_actor_employee_id uuid,
  p_rule_id uuid,
  p_version_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare version_row public.commission_policy_versions%rowtype;
declare existing_result jsonb;
declare calculated_hash text;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_rule_id is null or p_version_id is null
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then
    raise exception 'Invalid Commission policy-activation request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-activate-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'policy_version.activated'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;

  select * into version_row
  from public.commission_policy_versions
  where id = p_version_id and rule_id = p_rule_id
  for update;
  if not found then
    raise exception 'Commission policy version was not found' using errcode = 'P0002';
  end if;
  if version_row.status <> 'draft' then
    raise exception 'Only a draft Commission policy version can be activated'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.commission_policy_components
    where policy_version_id = p_version_id
  ) then
    raise exception 'A Commission policy version needs at least one component'
      using errcode = '23514';
  end if;

  select public.commission_sha256_2026082901(jsonb_build_object(
    'policyId', p_rule_id,
    'versionNumber', version_row.version_number,
    'components', (
      select jsonb_agg(jsonb_build_object(
        'sequence', component.sequence,
        'componentType', component.component_type,
        'sourceVariable', component.source_variable,
        'recipientRole', component.recipient_role,
        'rateValue', component.rate_value,
        'minimumAmountGbp', component.minimum_amount_gbp,
        'maximumAmountGbp', component.maximum_amount_gbp,
        'thresholdGbp', component.threshold_gbp,
        'rewardKind', component.reward_kind,
        'rewardValue', component.reward_value,
        'eligibleServices', component.eligible_services,
        'config', component.config,
        'tiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'minUnit', tier.min_unit, 'rateGbp', tier.rate_gbp
          ) order by tier.min_unit)
          from public.commission_policy_tiers tier where tier.component_id = component.id
        ), '[]'::jsonb)
      ) order by component.sequence)
      from public.commission_policy_components component
      where component.policy_version_id = p_version_id
    )
  )::text) into calculated_hash;

  update public.commission_policy_versions
  set status = 'retired', retired_by = p_actor_employee_id, retired_at = clock_timestamp()
  where rule_id = p_rule_id and status = 'active' and id <> p_version_id;

  update public.commission_policy_versions
  set status = 'active', content_hash = calculated_hash,
      activated_by = p_actor_employee_id, activated_at = clock_timestamp()
  where id = p_version_id;

  existing_result := jsonb_build_object(
    'id', p_version_id,
    'policyId', p_rule_id,
    'versionNumber', version_row.version_number,
    'status', 'active',
    'contentHash', calculated_hash
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'policy_version.activated', 'commission_policy_version', p_version_id,
    jsonb_build_object('status', 'draft'), existing_result, p_request_key
  );
  return existing_result;
end
$$;

create or replace function public.commission_create_assignment_2026082901(
  p_actor_employee_id uuid,
  p_employee_id uuid,
  p_policy_version_id uuid,
  p_source_module text,
  p_service_code text,
  p_recipient_role text,
  p_location_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare policy_rule_id uuid;
declare assignment_id uuid;
declare existing_result jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if p_employee_id is null or p_policy_version_id is null or p_effective_from is null
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then
    raise exception 'Invalid Commission assignment request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-assignment-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'assignment.created'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;

  perform 1 from public.employees where id = p_employee_id and is_active;
  if not found then raise exception 'Active employee was not found' using errcode = 'P0002'; end if;
  select rule_id into policy_rule_id
  from public.commission_policy_versions
  where id = p_policy_version_id and status = 'active';
  if policy_rule_id is null then
    raise exception 'An active Commission policy version is required' using errcode = 'P0002';
  end if;

  insert into public.employee_commission_assignments (
    employee_id, rule_id, start_date, effective_to, policy_version_id,
    source_module, service_code, recipient_role, location_id, created_by
  ) values (
    p_employee_id, policy_rule_id, p_effective_from, p_effective_to, p_policy_version_id,
    lower(btrim(p_source_module)), lower(btrim(p_service_code)),
    lower(btrim(p_recipient_role)), p_location_id, p_actor_employee_id
  ) returning id into assignment_id;

  existing_result := jsonb_build_object(
    'id', assignment_id,
    'employeeId', p_employee_id,
    'policyVersionId', p_policy_version_id,
    'sourceModule', lower(btrim(p_source_module)),
    'serviceCode', lower(btrim(p_service_code)),
    'recipientRole', lower(btrim(p_recipient_role)),
    'locationId', p_location_id,
    'effectiveFrom', p_effective_from,
    'effectiveTo', p_effective_to
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, after_state, request_key
  ) values (
    p_actor_employee_id, 'assignment.created', 'commission_assignment', assignment_id,
    existing_result, p_request_key
  );
  return existing_result;
end
$$;

create or replace function public.commission_grant_access_2026082901(
  p_actor_employee_id uuid,
  p_employee_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare grant_id uuid;
declare existing_result jsonb;
begin
  if not public.commission_actor_can_manage_grants_2026082901(p_actor_employee_id) then
    raise exception 'Master or Super Admin access is required'
      using errcode = '42501', hint = 'COMMISSION_GRANT_FORBIDDEN';
  end if;
  if p_employee_id is null
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then raise exception 'Invalid Commission access-grant request' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-grant-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'access.granted'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;
  perform 1 from public.employees where id = p_employee_id and is_active;
  if not found then raise exception 'Active employee was not found' using errcode = 'P0002'; end if;

  insert into public.commission_access_grants (employee_id, capability, granted_by)
  values (p_employee_id, 'manage_commission_policies', p_actor_employee_id)
  returning id into grant_id;
  existing_result := jsonb_build_object(
    'id', grant_id, 'employeeId', p_employee_id,
    'capability', 'manage_commission_policies'
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, after_state, request_key
  ) values (
    p_actor_employee_id, 'access.granted', 'commission_access_grant', grant_id,
    existing_result, p_request_key
  );
  return existing_result;
end
$$;

create or replace function public.commission_revoke_access_2026082901(
  p_actor_employee_id uuid,
  p_grant_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare grant_row public.commission_access_grants%rowtype;
declare existing_result jsonb;
begin
  if not public.commission_actor_can_manage_grants_2026082901(p_actor_employee_id) then
    raise exception 'Master or Super Admin access is required'
      using errcode = '42501', hint = 'COMMISSION_GRANT_FORBIDDEN';
  end if;
  if p_grant_id is null
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then raise exception 'Invalid Commission access-revoke request' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-revoke-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'access.revoked'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;

  select * into grant_row from public.commission_access_grants
  where id = p_grant_id and revoked_at is null for update;
  if not found then raise exception 'Active Commission access grant was not found'
    using errcode = 'P0002'; end if;
  update public.commission_access_grants
  set revoked_by = p_actor_employee_id, revoked_at = clock_timestamp()
  where id = p_grant_id;
  existing_result := jsonb_build_object(
    'id', p_grant_id, 'employeeId', grant_row.employee_id,
    'capability', grant_row.capability, 'revoked', true
  );
  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, entity_id, before_state, after_state, request_key
  ) values (
    p_actor_employee_id, 'access.revoked', 'commission_access_grant', p_grant_id,
    jsonb_build_object('revoked', false), existing_result, p_request_key
  );
  return existing_result;
end
$$;

create or replace function public.commission_preview_component_2026082901(
  p_actor_employee_id uuid,
  p_component jsonb,
  p_variables jsonb,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare component_type text;
declare result_value numeric(18,2);
declare bonus_result jsonb;
declare result_json jsonb;
declare existing_result jsonb;
declare units_value integer;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  if jsonb_typeof(p_component) is distinct from 'object'
    or jsonb_typeof(p_variables) is distinct from 'object'
    or length(btrim(coalesce(p_request_key, ''))) not between 8 and 200
  then raise exception 'Invalid Commission preview request' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commission-preview-request:' || p_actor_employee_id::text || ':' || p_request_key, 0
  ));
  select after_state -> 'result' into existing_result
  from public.commission_audit_events
  where actor_employee_id = p_actor_employee_id
    and action = 'preview.calculated'
    and request_key = p_request_key;
  if existing_result is not null then return existing_result; end if;

  component_type := p_component ->> 'componentType';
  if component_type = 'sales_profit_bonus' then
    bonus_result := public.commission_calculate_sales_bonus_2026082901(
      (p_component ->> 'thresholdGbp')::numeric,
      p_component ->> 'rewardKind',
      (p_component ->> 'rewardValue')::numeric,
      (p_variables ->> 'qualifyingProfitGbp')::numeric,
      coalesce((p_variables ->> 'incompleteInputCount')::integer, 0)
    );
    result_json := jsonb_build_object(
      'previewMode', 'synthetic_non_authoritative',
      'componentType', component_type,
      'recipientRole', p_component ->> 'recipientRole',
      'result', bonus_result
    );
  elsif component_type = 'marginal_ticket_tier' then
    units_value := (p_variables ->> 'units')::integer;
    if units_value is null or units_value < 0 or units_value > 100000
      or jsonb_typeof(p_component -> 'tiers') is distinct from 'array'
      or jsonb_array_length(p_component -> 'tiers') = 0
    then raise exception 'Invalid marginal-tier preview input' using errcode = '22023'; end if;
    select coalesce(round(sum(tier_rate), 2), 0) into result_value
    from (
      select (
        select (tier ->> 'rateGbp')::numeric
        from jsonb_array_elements(p_component -> 'tiers') tier
        where (tier ->> 'minUnit')::integer <= unit_number
        order by (tier ->> 'minUnit')::integer desc
        limit 1
      ) as tier_rate
      from generate_series(1, units_value) unit_number
    ) rates;
    if result_value is null then
      raise exception 'Every marginal unit needs a matching tier' using errcode = '22023';
    end if;
    result_json := jsonb_build_object(
      'previewMode', 'synthetic_non_authoritative',
      'componentType', component_type,
      'recipientRole', p_component ->> 'recipientRole',
      'result', jsonb_build_object('amountGbp', result_value, 'units', units_value)
    );
  else
    result_value := public.commission_calculate_component_2026082901(
      component_type,
      nullif(p_component ->> 'rateValue', '')::numeric,
      nullif(p_variables ->> 'basisValueGbp', '')::numeric,
      nullif(p_variables ->> 'units', '')::integer,
      nullif(p_component ->> 'minimumAmountGbp', '')::numeric,
      nullif(p_component ->> 'maximumAmountGbp', '')::numeric
    );
    result_json := jsonb_build_object(
      'previewMode', 'synthetic_non_authoritative',
      'componentType', component_type,
      'recipientRole', p_component ->> 'recipientRole',
      'result', jsonb_build_object('amountGbp', result_value)
    );
  end if;

  insert into public.commission_audit_events (
    actor_employee_id, action, entity_type, after_state, request_key
  ) values (
    p_actor_employee_id, 'preview.calculated', 'commission_preview',
    jsonb_build_object('result', result_json), p_request_key
  );
  return result_json;
end
$$;

create or replace function public.commission_shadow_overview_2026082901(
  p_actor_employee_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare result_json jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;
  select jsonb_build_object(
    'pendingEvents', (
      select count(*) from public.commission_source_event_states where processing_status = 'pending'
    ),
    'processedEvents', (
      select count(*) from public.commission_source_event_states where processing_status = 'processed'
    ),
    'heldEvents', (
      select count(*) from public.commission_source_event_states where processing_status = 'held'
    ),
    'openExceptions', (
      select count(*) from public.commission_exceptions where status = 'open'
    ),
    'activeShadowEntries', (
      select count(*) from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
        )
    ),
    'shadowTotalGbp', (
      select coalesce(round(sum(entry.amount_gbp), 2), 0)
      from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
        )
    ),
    'incompleteBonusPeriods', (
      select count(*) from public.commission_period_results period
      where period.result_mode = 'shadow' and period.incomplete_input_count > 0
        and not exists (
          select 1 from public.commission_period_results newer
          where newer.result_mode = period.result_mode
            and newer.supersedes_result_id = period.id
        )
    )
  ) into result_json;
  return result_json;
end
$$;

-- All Commission tables are server-route-only. Authenticated browser roles
-- receive no direct financial or policy access.
do $commission_access$
declare table_name text;
declare policy_row record;
begin
  foreach table_name in array array[
    'commission_rules', 'commission_rate_components', 'commission_tiers',
    'employee_commission_assignments', 'commission_policy_versions',
    'commission_policy_components', 'commission_policy_tiers',
    'commission_access_grants', 'commission_calculation_runs', 'commission_entries',
    'commission_period_results', 'commission_exceptions', 'commission_audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy_row in select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
    end loop;
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role',
      table_name);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      'Service role manages ' || table_name, table_name
    );
  end loop;
end
$commission_access$;

revoke all on function public.commission_reject_immutable_mutation_2026082901(),
  public.commission_guard_policy_version_2026082901(),
  public.commission_guard_draft_child_2026082901(),
  public.commission_guard_tier_draft_2026082901(),
  public.commission_validate_assignment_overlap_2026082901(),
  public.commission_resolve_assignment_2026082901(uuid,text,text,text,uuid,date),
  public.commission_calculate_component_2026082901(text,numeric,numeric,integer,numeric,numeric),
  public.commission_calculate_sales_bonus_2026082901(numeric,text,numeric,numeric,integer),
  public.commission_actor_is_admin_2026082901(uuid),
  public.commission_actor_can_manage_2026082901(uuid),
  public.commission_actor_can_manage_grants_2026082901(uuid),
  public.commission_sha256_2026082901(text),
  public.commission_create_policy_2026082901(uuid,text,text,text),
  public.commission_create_policy_version_2026082901(uuid,uuid,jsonb,text),
  public.commission_activate_policy_version_2026082901(uuid,uuid,uuid,text),
  public.commission_create_assignment_2026082901(
    uuid,uuid,uuid,text,text,text,uuid,date,date,text
  ),
  public.commission_grant_access_2026082901(uuid,uuid,text),
  public.commission_revoke_access_2026082901(uuid,uuid,text),
  public.commission_preview_component_2026082901(uuid,jsonb,jsonb,text),
  public.commission_shadow_overview_2026082901(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.commission_resolve_assignment_2026082901(uuid,text,text,text,uuid,date),
  public.commission_calculate_component_2026082901(text,numeric,numeric,integer,numeric,numeric),
  public.commission_calculate_sales_bonus_2026082901(numeric,text,numeric,numeric,integer),
  public.commission_actor_can_manage_2026082901(uuid),
  public.commission_actor_can_manage_grants_2026082901(uuid),
  public.commission_create_policy_2026082901(uuid,text,text,text),
  public.commission_create_policy_version_2026082901(uuid,uuid,jsonb,text),
  public.commission_activate_policy_version_2026082901(uuid,uuid,uuid,text),
  public.commission_create_assignment_2026082901(
    uuid,uuid,uuid,text,text,text,uuid,date,date,text
  ),
  public.commission_grant_access_2026082901(uuid,uuid,text),
  public.commission_revoke_access_2026082901(uuid,uuid,text),
  public.commission_preview_component_2026082901(uuid,jsonb,jsonb,text),
  public.commission_shadow_overview_2026082901(uuid)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission', 2026082901, now(),
  jsonb_build_object(
    'migration', '20260829_commission_shadow_foundation.sql',
    'mode', 'shadow',
    'capabilities', jsonb_build_array(
      'versioned-typed-policies', 'per-service-effective-assignments',
      'narrow-hr-policy-access', 'recipient-profit-owner-entries',
      'monthly-sales-profit-bonus', 'shadow-exceptions-and-audit'
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
as $$
  select jsonb_build_object(
    'ready', coalesce(schema_version.version >= 2026082901, false)
      and to_regclass('public.commission_policy_versions') is not null
      and to_regclass('public.commission_entries') is not null
      and to_regprocedure(
        'public.commission_calculate_sales_bonus_2026082901(numeric,text,numeric,numeric,integer)'
      ) is not null
      and to_regprocedure(
        'public.commission_activate_policy_version_2026082901(uuid,uuid,uuid,text)'
      ) is not null
      and to_regprocedure(
        'public.commission_preview_component_2026082901(uuid,jsonb,jsonb,text)'
      ) is not null
      and to_regprocedure('public.commission_sha256_2026082901(text)') is not null,
    'version', schema_version.version,
    'requiredVersion', 2026082901,
    'mode', 'shadow',
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'commission'
$$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
