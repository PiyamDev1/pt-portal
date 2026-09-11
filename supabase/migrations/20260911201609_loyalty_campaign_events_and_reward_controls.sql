begin;

select pg_advisory_xact_lock(hashtextextended('loyalty:campaign-events:v1', 0));

create table public.customer_loyalty_campaign_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 100),
  description text check (description is null or length(btrim(description)) <= 500),
  is_archived boolean not null default false,
  created_by uuid references public.employees(id) on delete restrict,
  updated_by uuid references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index customer_loyalty_campaign_events_active_name_uq
  on public.customer_loyalty_campaign_events(lower(btrim(name)))
  where is_archived = false;
create index customer_loyalty_campaign_events_active_updated_idx
  on public.customer_loyalty_campaign_events(updated_at desc)
  where is_archived = false;

alter table public.customer_loyalty_bonus_campaigns
  add column event_id uuid references public.customer_loyalty_campaign_events(id) on delete restrict,
  add column rule_name text,
  add column is_archived boolean not null default false;

with source_events as (
  select distinct on (lower(btrim(campaign.name)))
    lower(btrim(campaign.name)) as normalized_name,
    btrim(campaign.name) as name,
    campaign.created_by,
    campaign.updated_by,
    campaign.created_at,
    campaign.updated_at
  from public.customer_loyalty_bonus_campaigns campaign
  order by lower(btrim(campaign.name)), campaign.created_at, campaign.id
), inserted_events as (
  insert into public.customer_loyalty_campaign_events (
    name, description, created_by, updated_by, created_at, updated_at
  )
  select name, 'Imported from the existing loyalty campaign workspace.',
    created_by, updated_by, created_at, updated_at
  from source_events
  returning id, lower(btrim(name)) as normalized_name
)
update public.customer_loyalty_bonus_campaigns campaign
set event_id = event.id
from inserted_events event
where lower(btrim(campaign.name)) = event.normalized_name;

with labelled as (
  select
    campaign.id,
    case campaign.event_type
      when 'double_points' then 'Points multiplier'
      when 'fixed_bonus' then 'Fixed transaction bonus'
      when 'welcome_bonus' then 'Welcome bonus'
      when 'referral_bonus' then 'Verified referral'
      when 'off_peak_bonus' then 'Off-peak or targeted bonus'
      when 'birthday_gift' then 'Birthday gift'
      when 'eid_gift' then 'Eid gift'
      else 'Reward rule'
    end as base_name,
    row_number() over (
      partition by campaign.event_id, campaign.event_type
      order by campaign.created_at, campaign.id
    ) as duplicate_number
  from public.customer_loyalty_bonus_campaigns campaign
)
update public.customer_loyalty_bonus_campaigns campaign
set rule_name = labelled.base_name ||
  case when labelled.duplicate_number > 1 then ' ' || labelled.duplicate_number::text else '' end
from labelled
where labelled.id = campaign.id;

alter table public.customer_loyalty_bonus_campaigns
  add constraint customer_loyalty_bonus_campaigns_rule_name_check
    check (rule_name is null or length(btrim(rule_name)) between 2 and 100);

create unique index customer_loyalty_bonus_campaigns_active_event_rule_uq
  on public.customer_loyalty_bonus_campaigns(event_id, lower(btrim(rule_name)))
  where is_archived = false;
create index customer_loyalty_bonus_campaigns_event_idx
  on public.customer_loyalty_bonus_campaigns(event_id, is_archived, starts_at desc);

alter table public.customer_loyalty_program_audit_events
  drop constraint if exists customer_loyalty_program_audit_events_entity_type_check;
alter table public.customer_loyalty_program_audit_events
  add constraint customer_loyalty_program_audit_events_entity_type_check check (
    entity_type in (
      'earning_rule','voucher_reward','bonus_campaign','campaign_event',
      'rank','achievement','walkin'
    )
  );

update public.customer_loyalty_program_earning_rules
set points = 60, updated_at = clock_timestamp()
where rule_key = 'ticket';

do $$
declare
  seed_actor uuid;
  event_id_value uuid;
begin
  select employee.id into seed_actor
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.is_active = true
    and lower(btrim(role.name)) in ('admin','master admin','super admin')
  order by employee.id
  limit 1;

  if seed_actor is null then
    return;
  end if;

  insert into public.customer_loyalty_campaign_events(name, description, created_by, updated_by)
  select 'Verified Referral',
    'Always-on rewards for a verified referral after the new customer completes a qualifying purchase.',
    seed_actor, seed_actor
  where not exists (
    select 1 from public.customer_loyalty_campaign_events
    where is_archived = false and lower(btrim(name)) = 'verified referral'
  );
  select id into event_id_value from public.customer_loyalty_campaign_events
  where is_archived = false and lower(btrim(name)) = 'verified referral';
  if not exists (
    select 1 from public.customer_loyalty_bonus_campaigns
    where event_id = event_id_value and is_archived = false and event_type = 'referral_bonus'
  ) then
    insert into public.customer_loyalty_bonus_campaigns(
      name, event_id, rule_name, event_type, multiplier, bonus_points,
      referred_customer_points, starts_at, ends_at, eligible_service_keys,
      eligible_branch_ids, audience_tiers, max_awards_per_customer,
      minimum_spend_pence, priority, linked_campaign_id, per_customer_cap,
      total_points_budget, allow_stacking, status, terms, created_by, updated_by
    ) values (
      'Verified Referral', event_id_value, 'Referral reward', 'referral_bonus', null, 100,
      50, '2026-01-01 00:00:00+00', '2099-12-31 23:59:59+00', '{}', '{}',
      array['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite'],
      1, 0, 300, null, 100, 1000000, false, 'active',
      '100 points for the referrer and 50 points for the new member after a verified qualifying purchase.',
      seed_actor, seed_actor
    );
  end if;
  update public.customer_loyalty_bonus_campaigns
  set bonus_points = 100, referred_customer_points = 50,
    per_customer_cap = greatest(per_customer_cap, 100),
    total_points_budget = greatest(total_points_budget, 150),
    starts_at = least(starts_at, '2026-01-01 00:00:00+00'),
    ends_at = greatest(ends_at, '2099-12-31 23:59:59+00'),
    status = 'active',
    updated_at = clock_timestamp()
  where event_id = event_id_value and is_archived = false and event_type = 'referral_bonus';

  insert into public.customer_loyalty_campaign_events(name, description, created_by, updated_by)
  select 'Birthday Reward', 'An automatic birthday reward for eligible active members.',
    seed_actor, seed_actor
  where not exists (
    select 1 from public.customer_loyalty_campaign_events
    where is_archived = false and lower(btrim(name)) = 'birthday reward'
  );
  select id into event_id_value from public.customer_loyalty_campaign_events
  where is_archived = false and lower(btrim(name)) = 'birthday reward';
  if not exists (
    select 1 from public.customer_loyalty_bonus_campaigns
    where event_id = event_id_value and is_archived = false and event_type = 'birthday_gift'
  ) then
    insert into public.customer_loyalty_bonus_campaigns(
      name, event_id, rule_name, event_type, multiplier, bonus_points,
      referred_customer_points, starts_at, ends_at, eligible_service_keys,
      eligible_branch_ids, audience_tiers, max_awards_per_customer,
      minimum_spend_pence, priority, linked_campaign_id, per_customer_cap,
      total_points_budget, allow_stacking, status, terms, created_by, updated_by
    ) values (
      'Birthday Reward', event_id_value, 'Birthday gift', 'birthday_gift', null, 50,
      null, '2026-01-01 00:00:00+00', '2099-12-31 23:59:59+00', '{}', '{}',
      array['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite'],
      1, 0, 200, null, 50, 1000000, false, 'active',
      '50 birthday points for an eligible active member.', seed_actor, seed_actor
    );
  end if;
  update public.customer_loyalty_bonus_campaigns
  set bonus_points = 50, per_customer_cap = greatest(per_customer_cap, 50),
    total_points_budget = greatest(total_points_budget, 50),
    starts_at = least(starts_at, '2026-01-01 00:00:00+00'),
    ends_at = greatest(ends_at, '2099-12-31 23:59:59+00'),
    status = 'active',
    updated_at = clock_timestamp()
  where event_id = event_id_value and is_archived = false and event_type = 'birthday_gift';

  insert into public.customer_loyalty_campaign_events(name, description, created_by, updated_by)
  select 'Welcome Bonus', 'An automatic reward after a new member completes a first qualifying paid service.',
    seed_actor, seed_actor
  where not exists (
    select 1 from public.customer_loyalty_campaign_events
    where is_archived = false and lower(btrim(name)) = 'welcome bonus'
  );
  select id into event_id_value from public.customer_loyalty_campaign_events
  where is_archived = false and lower(btrim(name)) = 'welcome bonus';
  if not exists (
    select 1 from public.customer_loyalty_bonus_campaigns
    where event_id = event_id_value and is_archived = false and event_type = 'welcome_bonus'
  ) then
    insert into public.customer_loyalty_bonus_campaigns(
      name, event_id, rule_name, event_type, multiplier, bonus_points,
      referred_customer_points, starts_at, ends_at, eligible_service_keys,
      eligible_branch_ids, audience_tiers, max_awards_per_customer,
      minimum_spend_pence, priority, linked_campaign_id, per_customer_cap,
      total_points_budget, allow_stacking, status, terms, created_by, updated_by
    ) values (
      'Welcome Bonus', event_id_value, 'First purchase reward', 'welcome_bonus', null, 50,
      null, '2026-01-01 00:00:00+00', '2099-12-31 23:59:59+00', '{}', '{}',
      array['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite'],
      1, 0, 250, null, 50, 1000000, false, 'active',
      '50 points after the member completes a first qualifying paid service.', seed_actor, seed_actor
    );
  end if;
  update public.customer_loyalty_bonus_campaigns
  set bonus_points = 50, per_customer_cap = greatest(per_customer_cap, 50),
    total_points_budget = greatest(total_points_budget, 50),
    starts_at = least(starts_at, '2026-01-01 00:00:00+00'),
    ends_at = greatest(ends_at, '2099-12-31 23:59:59+00'),
    status = 'active',
    updated_at = clock_timestamp()
  where event_id = event_id_value and is_archived = false and event_type = 'welcome_bonus';
end;
$$;

create or replace function public.customer_loyalty_manage_program_v5(
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
  event_row public.customer_loyalty_campaign_events%rowtype;
  campaign_row public.customer_loyalty_bonus_campaigns%rowtype;
  reward_row public.customer_loyalty_voucher_rewards%rowtype;
  campaign_result jsonb;
  campaign_id_value uuid;
  delete_mode text;
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

  if action_value = 'CREATE_CAMPAIGN_EVENT' then
    if exists (
      select 1 from public.customer_loyalty_campaign_events
      where is_archived = false
        and lower(btrim(name)) = lower(btrim(p_request ->> 'name'))
    ) then
      raise exception 'an active campaign event already uses this name';
    end if;
    insert into public.customer_loyalty_campaign_events(
      name, description, created_by, updated_by
    ) values (
      btrim(p_request ->> 'name'), nullif(btrim(p_request ->> 'description'), ''),
      p_actor_employee_id, p_actor_employee_id
    ) returning to_jsonb(customer_loyalty_campaign_events.*) into after_value;

  elsif action_value = 'UPDATE_CAMPAIGN_EVENT' then
    select * into event_row from public.customer_loyalty_campaign_events
    where id = (p_request ->> 'id')::uuid and is_archived = false for update;
    if not found then raise exception 'campaign event not found'; end if;
    if exists (
      select 1 from public.customer_loyalty_campaign_events other
      where other.is_archived = false and other.id <> event_row.id
        and lower(btrim(other.name)) = lower(btrim(p_request ->> 'name'))
    ) then
      raise exception 'an active campaign event already uses this name';
    end if;
    before_value := to_jsonb(event_row);
    update public.customer_loyalty_campaign_events set
      name = btrim(p_request ->> 'name'),
      description = nullif(btrim(p_request ->> 'description'), ''),
      updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    where id = event_row.id
    returning to_jsonb(customer_loyalty_campaign_events.*) into after_value;
    update public.customer_loyalty_bonus_campaigns
    set name = btrim(p_request ->> 'name'), updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    where event_id = event_row.id and is_archived = false;

  elsif action_value = 'DELETE_CAMPAIGN_EVENT' then
    select * into event_row from public.customer_loyalty_campaign_events
    where id = (p_request ->> 'id')::uuid and is_archived = false for update;
    if not found then raise exception 'campaign event not found'; end if;
    before_value := to_jsonb(event_row);
    update public.customer_loyalty_bonus_campaigns
    set is_archived = true, status = 'cancelled', updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    where event_id = event_row.id and is_archived = false;
    update public.customer_loyalty_campaign_events
    set is_archived = true, updated_by = p_actor_employee_id, updated_at = clock_timestamp()
    where id = event_row.id
    returning to_jsonb(customer_loyalty_campaign_events.*) into after_value;

  elsif action_value = 'UPSERT_BONUS_CAMPAIGN' then
    select * into event_row from public.customer_loyalty_campaign_events
    where id = (p_request ->> 'eventId')::uuid and is_archived = false;
    if not found then raise exception 'campaign event not found'; end if;
    campaign_result := public.customer_loyalty_manage_program_v4(
      p_actor_employee_id,
      action_value,
      (p_request - 'eventId' - 'ruleName') || jsonb_build_object('name', event_row.name)
    );
    campaign_id_value := (campaign_result ->> 'id')::uuid;
    if exists (
      select 1 from public.customer_loyalty_bonus_campaigns other
      where other.event_id = event_row.id and other.id <> campaign_id_value
        and other.is_archived = false
        and lower(btrim(other.rule_name)) = lower(btrim(p_request ->> 'ruleName'))
    ) then
      raise exception 'this event already has a reward rule with that name';
    end if;
    update public.customer_loyalty_bonus_campaigns
    set event_id = event_row.id, rule_name = btrim(p_request ->> 'ruleName'),
      is_archived = false, updated_by = p_actor_employee_id, updated_at = clock_timestamp()
    where id = campaign_id_value
    returning to_jsonb(customer_loyalty_bonus_campaigns.*) into after_value;

  elsif action_value = 'DELETE_BONUS_CAMPAIGN' then
    select * into campaign_row from public.customer_loyalty_bonus_campaigns
    where id = (p_request ->> 'id')::uuid and is_archived = false for update;
    if not found then raise exception 'campaign reward rule not found'; end if;
    before_value := to_jsonb(campaign_row);
    update public.customer_loyalty_bonus_campaigns
    set is_archived = true, status = 'cancelled', updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    where id = campaign_row.id
    returning to_jsonb(customer_loyalty_bonus_campaigns.*) into after_value;

  elsif action_value = 'UPDATE_VOUCHER_POINTS' then
    select * into reward_row from public.customer_loyalty_voucher_rewards
    where points_cost = (p_request ->> 'currentPointsCost')::integer for update;
    if not found then raise exception 'voucher reward not found'; end if;
    before_value := to_jsonb(reward_row);
    update public.customer_loyalty_voucher_rewards
    set points_cost = (p_request ->> 'pointsCost')::integer,
      updated_at = clock_timestamp()
    where id = reward_row.id
    returning to_jsonb(customer_loyalty_voucher_rewards.*) into after_value;

  elsif action_value = 'DELETE_VOUCHER_REWARD' then
    select * into reward_row from public.customer_loyalty_voucher_rewards
    where points_cost = (p_request ->> 'pointsCost')::integer for update;
    if not found then raise exception 'voucher reward not found'; end if;
    before_value := to_jsonb(reward_row);
    if exists (
      select 1 from public.customer_loyalty_vouchers voucher
      where voucher.reward_id = reward_row.id
    ) then
      update public.customer_loyalty_voucher_rewards
      set is_active = false, updated_at = clock_timestamp()
      where id = reward_row.id
      returning to_jsonb(customer_loyalty_voucher_rewards.*) into after_value;
      delete_mode := 'archived';
    else
      delete from public.customer_loyalty_voucher_rewards where id = reward_row.id;
      after_value := null;
      delete_mode := 'deleted';
    end if;
    after_value := jsonb_build_object('mode', delete_mode, 'reward', after_value);

  else
    return public.customer_loyalty_manage_program_v4(
      p_actor_employee_id, action_value, p_request
    );
  end if;

  insert into public.customer_loyalty_program_audit_events(
    actor_employee_id, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_employee_id,
    case
      when action_value like '%CAMPAIGN_EVENT' then 'campaign_event'
      when action_value like '%BONUS_CAMPAIGN' then 'bonus_campaign'
      else 'voucher_reward'
    end,
    coalesce(
      p_request ->> 'id', p_request ->> 'currentPointsCost',
      p_request ->> 'pointsCost', after_value ->> 'id', 'new'
    ),
    action_value, before_value, after_value
  );
  return after_value;
exception
  when unique_violation then
    raise exception 'that event name or reward rule is already in use';
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    raise exception 'invalid loyalty program configuration';
end;
$$;

alter table public.customer_loyalty_campaign_events enable row level security;
alter table public.customer_loyalty_campaign_events force row level security;
revoke all on table public.customer_loyalty_campaign_events
  from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_campaign_events to service_role;

revoke all on function public.customer_loyalty_manage_program_v4(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_manage_program_v5(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_manage_program_v5(uuid,text,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
