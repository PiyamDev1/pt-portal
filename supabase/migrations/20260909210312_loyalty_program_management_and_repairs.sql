begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:program-management-migration', 0));

-- The staff adjustment rollout introduced this milestone but the earlier
-- lifecycle constraint did not include it, causing every adjustment to fail.
alter table public.customer_loyalty_awards
  drop constraint if exists customer_loyalty_awards_activation_milestone_check;
alter table public.customer_loyalty_awards
  add constraint customer_loyalty_awards_activation_milestone_check check (
    activation_milestone is null or activation_milestone in (
      'issued_and_paid','completed_and_paid','fully_paid','staff_adjustment'
    )
  );

-- Reconcile installations where the earning table was created manually before
-- the original transaction/version marker completed. No customer rows are
-- removed and repeated execution converges on the same policy state.
create table if not exists public.customer_loyalty_program_earning_rules (
  rule_key text primary key check (rule_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  label text not null check (length(btrim(label)) between 1 and 100),
  points integer not null check (points between 1 and 100000),
  unit_label text not null check (length(btrim(unit_label)) between 1 and 100),
  match_category_key text,
  match_item_key text,
  activation_mode text not null check (activation_mode in ('POS_FLAT', 'SOURCE_RECORD')),
  display_order integer not null check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint customer_loyalty_program_rule_match_check check (
    (match_category_key is null) <> (match_item_key is null)
  )
);
create unique index if not exists customer_loyalty_program_rule_category_uq
  on public.customer_loyalty_program_earning_rules(match_category_key)
  where match_category_key is not null;
create unique index if not exists customer_loyalty_program_rule_item_uq
  on public.customer_loyalty_program_earning_rules(match_item_key)
  where match_item_key is not null;
create index if not exists customer_loyalty_program_rule_active_order_idx
  on public.customer_loyalty_program_earning_rules(display_order)
  where is_active;

insert into public.customer_loyalty_program_earning_rules (
  rule_key, label, points, unit_label, match_category_key, match_item_key,
  activation_mode, display_order
) values
  ('remittance', 'Remittance transaction', 25, 'completed paid transaction', 'remittance', null, 'POS_FLAT', 10),
  ('ticket', 'Flight ticket', 80, 'issued and paid passenger ticket', null, 'ticketing', 'SOURCE_RECORD', 20),
  ('package', 'Travel package', 120, 'fully paid traveller', null, 'package', 'SOURCE_RECORD', 30),
  ('cargo', 'Cargo or delivery', 25, 'completed paid transaction', 'cargo', null, 'POS_FLAT', 40),
  ('application', 'Application service', 25, 'completed paid application', 'applications', null, 'SOURCE_RECORD', 50),
  ('document_assistance', 'Document assistance', 10, 'completed paid transaction', 'document-assistance', null, 'POS_FLAT', 60)
on conflict (rule_key) do nothing;

create table public.customer_loyalty_voucher_rewards (
  id uuid primary key default gen_random_uuid(),
  points_cost integer not null check (points_cost between 1 and 1000000),
  value_pence integer not null check (value_pence between 1 and 1000000),
  validity_months integer not null default 6 check (validity_months between 1 and 36),
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(points_cost)
);
create index customer_loyalty_voucher_rewards_active_order_idx
  on public.customer_loyalty_voucher_rewards(display_order, points_cost)
  where is_active;

insert into public.customer_loyalty_voucher_rewards (
  points_cost, value_pence, validity_months, display_order
) values
  (250, 250, 6, 10),
  (500, 500, 6, 20),
  (1000, 1000, 6, 30),
  (2000, 2000, 6, 40),
  (5000, 5000, 6, 50),
  (10000, 12000, 6, 60)
on conflict(points_cost) do nothing;

create table public.customer_loyalty_bonus_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 100),
  event_type text not null check (
    event_type in ('double_points','fixed_bonus','welcome_bonus','referral_bonus','off_peak_bonus')
  ),
  multiplier numeric(6,2) check (multiplier is null or multiplier between 1.01 and 20),
  bonus_points integer check (bonus_points is null or bonus_points between 1 and 100000),
  referred_customer_points integer check (
    referred_customer_points is null or referred_customer_points between 1 and 100000
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  eligible_service_keys text[] not null default '{}',
  eligible_branch_ids uuid[] not null default '{}',
  per_customer_cap integer not null check (per_customer_cap between 1 and 1000000),
  total_points_budget integer not null check (total_points_budget between 1 and 100000000),
  allow_stacking boolean not null default false,
  status text not null default 'draft' check (
    status in ('draft','scheduled','active','ended','cancelled')
  ),
  terms text check (terms is null or length(terms) <= 1000),
  created_by uuid not null references public.employees(id) on delete restrict,
  updated_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint customer_loyalty_bonus_campaign_dates check (ends_at > starts_at),
  constraint customer_loyalty_bonus_campaign_award check (
    (event_type = 'double_points' and multiplier is not null and bonus_points is null)
    or (event_type = 'referral_bonus' and multiplier is null and bonus_points is not null and referred_customer_points is not null)
    or (event_type in ('fixed_bonus','welcome_bonus','off_peak_bonus') and multiplier is null and bonus_points is not null and referred_customer_points is null)
  )
);
create index customer_loyalty_bonus_campaigns_status_dates_idx
  on public.customer_loyalty_bonus_campaigns(status, starts_at, ends_at);

create table public.customer_loyalty_program_audit_events (
  id bigint generated always as identity primary key,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  entity_type text not null check (entity_type in ('earning_rule','voucher_reward','bonus_campaign')),
  entity_id text not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index customer_loyalty_program_audit_events_entity_idx
  on public.customer_loyalty_program_audit_events(entity_type, entity_id, created_at desc);

create or replace function public.prevent_customer_loyalty_program_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'loyalty program audit events are immutable';
end;
$$;
create trigger customer_loyalty_program_audit_events_immutable
before update or delete on public.customer_loyalty_program_audit_events
for each row execute function public.prevent_customer_loyalty_program_audit_mutation();

create or replace function public.customer_loyalty_manage_program_v1(
  p_actor_employee_id uuid,
  p_action text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  action_value text := upper(btrim(coalesce(p_action, '')));
  before_value jsonb;
  after_value jsonb;
  entity_id_value text;
  campaign_id_value uuid;
  event_type_value text;
  multiplier_value numeric(6,2);
  bonus_points_value integer;
  referred_points_value integer;
begin
  if not exists (
    select 1 from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = p_actor_employee_id
      and employee.is_active = true
      and lower(btrim(role.name)) in ('admin','master admin','super admin')
  ) then
    raise exception 'loyalty program changes require an active portal administrator';
  end if;
  if jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object' then
    raise exception 'valid loyalty program request required';
  end if;

  if action_value = 'UPDATE_EARNING_RULE' then
    entity_id_value := btrim(p_request ->> 'ruleKey');
    select to_jsonb(rule) into before_value
    from public.customer_loyalty_program_earning_rules rule
    where rule.rule_key = entity_id_value for update;
    if not found then raise exception 'loyalty earning rule not found'; end if;
    update public.customer_loyalty_program_earning_rules
    set points = (p_request ->> 'points')::integer,
        is_active = coalesce((p_request ->> 'isActive')::boolean, is_active),
        updated_at = clock_timestamp()
    where rule_key = entity_id_value
    returning to_jsonb(customer_loyalty_program_earning_rules.*) into after_value;
  elsif action_value = 'UPSERT_VOUCHER_REWARD' then
    entity_id_value := (p_request ->> 'pointsCost')::integer::text;
    select to_jsonb(reward) into before_value
    from public.customer_loyalty_voucher_rewards reward
    where reward.points_cost = entity_id_value::integer for update;
    insert into public.customer_loyalty_voucher_rewards (
      points_cost, value_pence, validity_months, display_order, is_active
    ) values (
      entity_id_value::integer,
      (p_request ->> 'valuePence')::integer,
      coalesce((p_request ->> 'validityMonths')::integer, 6),
      coalesce((p_request ->> 'displayOrder')::integer, entity_id_value::integer),
      coalesce((p_request ->> 'isActive')::boolean, true)
    ) on conflict(points_cost) do update set
      value_pence = excluded.value_pence,
      validity_months = excluded.validity_months,
      display_order = excluded.display_order,
      is_active = excluded.is_active,
      updated_at = clock_timestamp()
    returning to_jsonb(customer_loyalty_voucher_rewards.*) into after_value;
  elsif action_value = 'UPSERT_BONUS_CAMPAIGN' then
    campaign_id_value := coalesce(nullif(p_request ->> 'id', '')::uuid, gen_random_uuid());
    entity_id_value := campaign_id_value::text;
    event_type_value := p_request ->> 'eventType';
    multiplier_value := nullif(p_request ->> 'multiplier', '')::numeric;
    bonus_points_value := nullif(p_request ->> 'bonusPoints', '')::integer;
    referred_points_value := nullif(p_request ->> 'referredCustomerPoints', '')::integer;
    select to_jsonb(campaign) into before_value
    from public.customer_loyalty_bonus_campaigns campaign
    where campaign.id = campaign_id_value for update;
    insert into public.customer_loyalty_bonus_campaigns (
      id, name, event_type, multiplier, bonus_points, referred_customer_points,
      starts_at, ends_at, eligible_service_keys, eligible_branch_ids,
      per_customer_cap, total_points_budget, allow_stacking, status, terms,
      created_by, updated_by
    ) values (
      campaign_id_value, btrim(p_request ->> 'name'), event_type_value,
      multiplier_value, bonus_points_value, referred_points_value,
      (p_request ->> 'startsAt')::timestamptz, (p_request ->> 'endsAt')::timestamptz,
      coalesce(array(select jsonb_array_elements_text(p_request -> 'eligibleServiceKeys')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_request -> 'eligibleBranchIds'))::uuid[], '{}'),
      (p_request ->> 'perCustomerCap')::integer,
      (p_request ->> 'totalPointsBudget')::integer,
      coalesce((p_request ->> 'allowStacking')::boolean, false),
      coalesce(p_request ->> 'status', 'draft'), nullif(btrim(p_request ->> 'terms'), ''),
      p_actor_employee_id, p_actor_employee_id
    ) on conflict(id) do update set
      name = excluded.name,
      event_type = excluded.event_type,
      multiplier = excluded.multiplier,
      bonus_points = excluded.bonus_points,
      referred_customer_points = excluded.referred_customer_points,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      eligible_service_keys = excluded.eligible_service_keys,
      eligible_branch_ids = excluded.eligible_branch_ids,
      per_customer_cap = excluded.per_customer_cap,
      total_points_budget = excluded.total_points_budget,
      allow_stacking = excluded.allow_stacking,
      status = excluded.status,
      terms = excluded.terms,
      updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    returning to_jsonb(customer_loyalty_bonus_campaigns.*) into after_value;
  else
    raise exception 'unsupported loyalty program action';
  end if;

  insert into public.customer_loyalty_program_audit_events (
    actor_employee_id, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_employee_id,
    case action_value
      when 'UPDATE_EARNING_RULE' then 'earning_rule'
      when 'UPSERT_VOUCHER_REWARD' then 'voucher_reward'
      else 'bonus_campaign'
    end,
    entity_id_value, action_value, before_value, after_value
  );
  return after_value;
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    raise exception 'invalid loyalty program configuration';
end;
$$;

alter table public.customer_loyalty_program_earning_rules enable row level security;
alter table public.customer_loyalty_program_earning_rules force row level security;
alter table public.customer_loyalty_voucher_rewards enable row level security;
alter table public.customer_loyalty_voucher_rewards force row level security;
alter table public.customer_loyalty_bonus_campaigns enable row level security;
alter table public.customer_loyalty_bonus_campaigns force row level security;
alter table public.customer_loyalty_program_audit_events enable row level security;
alter table public.customer_loyalty_program_audit_events force row level security;

revoke all on table public.customer_loyalty_program_earning_rules,
  public.customer_loyalty_voucher_rewards,
  public.customer_loyalty_bonus_campaigns,
  public.customer_loyalty_program_audit_events from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_program_earning_rules,
  public.customer_loyalty_voucher_rewards,
  public.customer_loyalty_bonus_campaigns,
  public.customer_loyalty_program_audit_events to service_role;
revoke all on function public.prevent_customer_loyalty_program_audit_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_manage_program_v1(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_manage_program_v1(uuid,text,jsonb) to service_role;
commit;
