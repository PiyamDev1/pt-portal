begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:campaign-workspace:v2', 0));

alter table public.customer_loyalty_bonus_campaigns
  add column if not exists audience_tiers text[] not null default array['Bronze','Silver','Gold','Diamond']::text[],
  add column if not exists max_awards_per_customer integer not null default 1,
  add column if not exists minimum_spend_pence integer not null default 0,
  add column if not exists priority integer not null default 100,
  add column if not exists linked_campaign_id uuid references public.customer_loyalty_bonus_campaigns(id) on delete set null;

alter table public.customer_loyalty_bonus_campaigns
  drop constraint if exists customer_loyalty_bonus_campaigns_audience_tiers_check,
  drop constraint if exists customer_loyalty_bonus_campaigns_max_awards_check,
  drop constraint if exists customer_loyalty_bonus_campaigns_minimum_spend_check,
  drop constraint if exists customer_loyalty_bonus_campaigns_priority_check,
  drop constraint if exists customer_loyalty_bonus_campaigns_not_self_linked;
alter table public.customer_loyalty_bonus_campaigns
  add constraint customer_loyalty_bonus_campaigns_audience_tiers_check check (
    cardinality(audience_tiers) between 1 and 4
    and audience_tiers <@ array['Bronze','Silver','Gold','Diamond']::text[]
  ),
  add constraint customer_loyalty_bonus_campaigns_max_awards_check check (
    max_awards_per_customer between 1 and 1000
  ),
  add constraint customer_loyalty_bonus_campaigns_minimum_spend_check check (
    minimum_spend_pence between 0 and 100000000
  ),
  add constraint customer_loyalty_bonus_campaigns_priority_check check (
    priority between 1 and 1000
  ),
  add constraint customer_loyalty_bonus_campaigns_not_self_linked check (
    linked_campaign_id is null or linked_campaign_id <> id
  );

create index if not exists customer_loyalty_bonus_campaigns_link_idx
  on public.customer_loyalty_bonus_campaigns(linked_campaign_id)
  where linked_campaign_id is not null;
create index if not exists customer_loyalty_bonus_campaigns_active_priority_idx
  on public.customer_loyalty_bonus_campaigns(priority desc, starts_at, ends_at)
  where status in ('scheduled','active');

create or replace view public.customer_loyalty_campaign_performance
with (security_invoker = true)
as
select
  campaign.id as campaign_id,
  count(award.id)::integer as award_count,
  count(distinct award.mobile_user_id)::integer as customer_count,
  coalesce(sum(award.points), 0)::bigint as awarded_points,
  max(award.created_at) as last_awarded_at
from public.customer_loyalty_bonus_campaigns campaign
left join public.customer_loyalty_campaign_awards award on award.campaign_id = campaign.id
group by campaign.id;

revoke all on table public.customer_loyalty_campaign_performance
  from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_campaign_performance to service_role;

create or replace function public.customer_loyalty_run_scheduled_bonus_v1(
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  campaign_row public.customer_loyalty_bonus_campaigns%rowtype;
  member_row public.mobile_users%rowtype;
  award_row public.customer_loyalty_awards%rowtype;
  award_kind_value text;
  awarded_count integer := 0;
  spent integer;
  member_awards integer;
  member_points integer;
begin
  update public.customer_loyalty_vouchers
  set status = 'expired'
  where status = 'issued' and expires_at <= p_as_of;

  for campaign_row in
    select * from public.customer_loyalty_bonus_campaigns
    where event_type in ('birthday_gift','eid_gift')
      and status in ('scheduled','active')
      and starts_at <= p_as_of and ends_at > p_as_of
    order by priority desc, starts_at
    for update skip locked
  loop
    award_kind_value := case when campaign_row.event_type = 'birthday_gift'
      then 'birthday' else 'eid' end;
    select coalesce(sum(points), 0)::integer into spent
    from public.customer_loyalty_campaign_awards
    where campaign_id = campaign_row.id;

    for member_row in
      select member.* from public.mobile_users member
      cross join lateral (
        select coalesce(sum(award.points), 0)::integer as available_points
        from public.customer_loyalty_awards award
        where award.mobile_user_id = member.id and award.state = 'available'
      ) balance
      where member.customer_lifecycle_status = 'active'
        and member.external_customer_subject is not null
        and (
          campaign_row.event_type = 'eid_gift'
          or (
            member.birthday_reward_month = extract(month from p_as_of)::integer
            and member.birthday_reward_day = extract(day from p_as_of)::integer
          )
        )
        and (
          case
            when balance.available_points >= 10001 then 'Diamond'
            when balance.available_points >= 5001 then 'Gold'
            when balance.available_points >= 1001 then 'Silver'
            else 'Bronze'
          end
        ) = any(campaign_row.audience_tiers)
      order by member.id
    loop
      exit when spent + campaign_row.bonus_points > campaign_row.total_points_budget;
      select count(*)::integer, coalesce(sum(points), 0)::integer
      into member_awards, member_points
      from public.customer_loyalty_campaign_awards
      where campaign_id = campaign_row.id and mobile_user_id = member_row.id;
      if member_awards >= campaign_row.max_awards_per_customer
        or member_points + campaign_row.bonus_points > campaign_row.per_customer_cap then
        continue;
      end if;
      if exists (
        select 1 from public.customer_loyalty_campaign_awards
        where campaign_id = campaign_row.id and mobile_user_id = member_row.id
          and award_kind = award_kind_value
      ) then continue; end if;

      insert into public.customer_loyalty_awards (
        mobile_user_id, source_type, source_reference, description, points,
        state, activation_milestone, activated_at
      ) values (
        member_row.id, 'adjustment',
        'campaign.' || award_kind_value || '.v1:' || campaign_row.id::text || ':' || member_row.id::text,
        campaign_row.name, campaign_row.bonus_points, 'available',
        campaign_row.event_type, p_as_of
      ) on conflict (source_reference) do update set source_reference = excluded.source_reference
      returning * into award_row;

      insert into public.customer_loyalty_campaign_awards (
        campaign_id, mobile_user_id, award_id, award_kind, points
      ) values (
        campaign_row.id, member_row.id, award_row.id, award_kind_value,
        campaign_row.bonus_points
      ) on conflict (campaign_id, mobile_user_id, award_kind) do nothing;
      if found then
        awarded_count := awarded_count + 1;
        spent := spent + campaign_row.bonus_points;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('awarded', awarded_count, 'processedAt', p_as_of);
end;
$$;

create or replace function public.customer_loyalty_manage_program_v2(
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
  linked_campaign_value uuid;
  awarded_points_value bigint := 0;
  highest_customer_points integer := 0;
  highest_customer_awards integer := 0;
  old_status_value text;
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

  if action_value in ('UPDATE_EARNING_RULE','UPSERT_VOUCHER_REWARD') then
    return public.customer_loyalty_manage_program_v1(p_actor_employee_id, action_value, p_request);
  elsif action_value <> 'UPSERT_BONUS_CAMPAIGN' then
    raise exception 'unsupported loyalty program action';
  end if;

  campaign_id_value := coalesce(nullif(p_request ->> 'id', '')::uuid, gen_random_uuid());
  entity_id_value := campaign_id_value::text;
  event_type_value := p_request ->> 'eventType';
  multiplier_value := nullif(p_request ->> 'multiplier', '')::numeric;
  bonus_points_value := nullif(p_request ->> 'bonusPoints', '')::integer;
  referred_points_value := nullif(p_request ->> 'referredCustomerPoints', '')::integer;
  linked_campaign_value := nullif(p_request ->> 'linkedCampaignId', '')::uuid;

  if event_type_value = 'referral_bonus' and not (
    coalesce(array(select jsonb_array_elements_text(p_request -> 'audienceTiers')), '{}')
      @> array['Bronze','Silver','Gold','Diamond']::text[]
  ) then
    raise exception 'referral campaigns must remain available to all ranks';
  end if;

  select to_jsonb(campaign), campaign.status into before_value, old_status_value
  from public.customer_loyalty_bonus_campaigns campaign
  where campaign.id = campaign_id_value for update;

  if linked_campaign_value = campaign_id_value then
    raise exception 'a campaign cannot link to itself';
  end if;
  if linked_campaign_value is not null and not exists (
    select 1 from public.customer_loyalty_bonus_campaigns where id = linked_campaign_value
  ) then
    raise exception 'linked campaign not found';
  end if;
  if linked_campaign_value is not null and exists (
    with recursive linked_chain as (
      select campaign.id, campaign.linked_campaign_id
      from public.customer_loyalty_bonus_campaigns campaign
      where campaign.id = linked_campaign_value
      union
      select campaign.id, campaign.linked_campaign_id
      from public.customer_loyalty_bonus_campaigns campaign
      join linked_chain parent on parent.linked_campaign_id = campaign.id
    )
    select 1 from linked_chain where id = campaign_id_value
  ) then
    raise exception 'campaign links cannot form a cycle';
  end if;
  if event_type_value in ('double_points','fixed_bonus','welcome_bonus','off_peak_bonus')
    and coalesce(p_request ->> 'status', 'draft') in ('scheduled','active') then
    raise exception 'sale-based campaigns must remain draft until automatic awards are connected';
  end if;
  if old_status_value in ('ended','cancelled')
    and coalesce(p_request ->> 'status', 'draft') <> old_status_value then
    raise exception 'ended or cancelled campaigns cannot be reactivated';
  end if;

  select coalesce(sum(points), 0)::bigint into awarded_points_value
  from public.customer_loyalty_campaign_awards where campaign_id = campaign_id_value;
  select coalesce(max(member_points), 0)::integer, coalesce(max(member_awards), 0)::integer
  into highest_customer_points, highest_customer_awards
  from (
    select sum(points)::integer as member_points, count(*)::integer as member_awards
    from public.customer_loyalty_campaign_awards
    where campaign_id = campaign_id_value
    group by mobile_user_id
  ) usage;
  if (p_request ->> 'totalPointsBudget')::bigint < awarded_points_value
    or (p_request ->> 'perCustomerCap')::integer < highest_customer_points
    or (p_request ->> 'maxAwardsPerCustomer')::integer < highest_customer_awards then
    raise exception 'campaign limits cannot be reduced below points or awards already issued';
  end if;

  insert into public.customer_loyalty_bonus_campaigns (
    id, name, event_type, multiplier, bonus_points, referred_customer_points,
    starts_at, ends_at, eligible_service_keys, eligible_branch_ids,
    audience_tiers, max_awards_per_customer, minimum_spend_pence, priority,
    linked_campaign_id, per_customer_cap, total_points_budget, allow_stacking,
    status, terms, created_by, updated_by
  ) values (
    campaign_id_value, btrim(p_request ->> 'name'), event_type_value,
    multiplier_value, bonus_points_value, referred_points_value,
    (p_request ->> 'startsAt')::timestamptz, (p_request ->> 'endsAt')::timestamptz,
    coalesce(array(select jsonb_array_elements_text(p_request -> 'eligibleServiceKeys')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_request -> 'eligibleBranchIds'))::uuid[], '{}'),
    coalesce(array(select jsonb_array_elements_text(p_request -> 'audienceTiers')), array['Bronze','Silver','Gold','Diamond']::text[]),
    coalesce((p_request ->> 'maxAwardsPerCustomer')::integer, 1),
    coalesce((p_request ->> 'minimumSpendPence')::integer, 0),
    coalesce((p_request ->> 'priority')::integer, 100),
    linked_campaign_value,
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
    audience_tiers = excluded.audience_tiers,
    max_awards_per_customer = excluded.max_awards_per_customer,
    minimum_spend_pence = excluded.minimum_spend_pence,
    priority = excluded.priority,
    linked_campaign_id = excluded.linked_campaign_id,
    per_customer_cap = excluded.per_customer_cap,
    total_points_budget = excluded.total_points_budget,
    allow_stacking = excluded.allow_stacking,
    status = excluded.status,
    terms = excluded.terms,
    updated_by = p_actor_employee_id,
    updated_at = clock_timestamp()
  returning to_jsonb(customer_loyalty_bonus_campaigns.*) into after_value;

  insert into public.customer_loyalty_program_audit_events (
    actor_employee_id, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_employee_id, 'bonus_campaign', entity_id_value,
    action_value, before_value, after_value
  );
  return after_value;
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    raise exception 'invalid loyalty campaign configuration';
end;
$$;

revoke all on function public.customer_loyalty_manage_program_v1(uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.customer_loyalty_manage_program_v2(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_run_scheduled_bonus_v1(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_manage_program_v1(uuid,text,jsonb) to service_role;
grant execute on function public.customer_loyalty_manage_program_v2(uuid,text,jsonb) to service_role;
grant execute on function public.customer_loyalty_run_scheduled_bonus_v1(timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
