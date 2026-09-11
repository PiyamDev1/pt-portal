begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:connect-campaign-hooks:v1', 0));

create table public.customer_loyalty_sale_campaign_awards (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.customer_loyalty_bonus_campaigns(id) on delete restrict,
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  award_id uuid not null unique references public.customer_loyalty_awards(id) on delete restrict,
  qualifying_source_reference text not null,
  points integer not null check (points > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique(campaign_id, qualifying_source_reference)
);
create index customer_loyalty_sale_campaign_awards_member_idx
  on public.customer_loyalty_sale_campaign_awards(mobile_user_id, created_at desc);
create index customer_loyalty_sale_campaign_awards_campaign_idx
  on public.customer_loyalty_sale_campaign_awards(campaign_id, created_at desc);
alter table public.customer_loyalty_sale_campaign_awards enable row level security;
alter table public.customer_loyalty_sale_campaign_awards force row level security;
revoke all on table public.customer_loyalty_sale_campaign_awards
  from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_sale_campaign_awards to service_role;

alter table public.customer_loyalty_awards
  drop constraint if exists customer_loyalty_awards_activation_milestone_check;
alter table public.customer_loyalty_awards
  add constraint customer_loyalty_awards_activation_milestone_check check (
    activation_milestone is null or activation_milestone in (
      'issued_and_paid','completed_and_paid','fully_paid','staff_adjustment',
      'referral_bonus','birthday_gift','eid_gift','voucher_redemption',
      'double_points','fixed_bonus','welcome_bonus','off_peak_bonus'
    )
  );

create or replace view public.customer_loyalty_campaign_performance
with (security_invoker = true)
as
select
  campaign.id as campaign_id,
  count(award.award_id)::integer as award_count,
  count(distinct award.mobile_user_id)::integer as customer_count,
  coalesce(sum(case when ledger.state <> 'reversed' then award.points else 0 end), 0)::bigint
    as awarded_points,
  max(award.created_at) as last_awarded_at
from public.customer_loyalty_bonus_campaigns campaign
left join (
  select campaign_id, mobile_user_id, award_id, points, created_at
  from public.customer_loyalty_campaign_awards
  union all
  select campaign_id, mobile_user_id, award_id, points, created_at
  from public.customer_loyalty_sale_campaign_awards
) award on award.campaign_id = campaign.id
left join public.customer_loyalty_awards ledger on ledger.id = award.award_id
group by campaign.id;
revoke all on table public.customer_loyalty_campaign_performance
  from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_campaign_performance to service_role;

create or replace function public.customer_loyalty_apply_sale_campaigns_v1(
  p_source_reference text,
  p_service_key text,
  p_rule_key text,
  p_branch_id uuid,
  p_spend_pence bigint,
  p_occurred_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  link_row public.customer_loyalty_source_links%rowtype;
  base_award public.customer_loyalty_awards%rowtype;
  campaign_row public.customer_loyalty_bonus_campaigns%rowtype;
  bonus_award public.customer_loyalty_awards%rowtype;
  member_balance bigint;
  member_tier text;
  member_awards integer;
  member_points integer;
  campaign_points bigint;
  bonus_points_value integer;
  awarded_points integer := 0;
  awarded_campaigns integer := 0;
  previous_allows_stacking boolean := false;
  source_value text := btrim(coalesce(p_source_reference, ''));
begin
  if source_value = '' then raise exception 'loyalty source reference required'; end if;
  select * into link_row from public.customer_loyalty_source_links
  where source_reference = source_value;
  if not found then return jsonb_build_object('awardedPoints', 0, 'campaignCount', 0); end if;
  select * into base_award from public.customer_loyalty_awards
  where source_reference = source_value;
  if not found or base_award.state <> 'available' or base_award.points <= 0 then
    return jsonb_build_object('awardedPoints', 0, 'campaignCount', 0);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('loyalty:member:' || link_row.mobile_user_id::text, 0));
  if not exists (
    select 1 from public.mobile_users
    where id = link_row.mobile_user_id and customer_lifecycle_status = 'active'
  ) then return jsonb_build_object('awardedPoints', 0, 'campaignCount', 0); end if;

  select coalesce(sum(points), 0) into member_balance
  from public.customer_loyalty_awards
  where mobile_user_id = link_row.mobile_user_id and state = 'available';
  member_tier := case
    when member_balance >= 10001 then 'Diamond'
    when member_balance >= 5001 then 'Gold'
    when member_balance >= 1001 then 'Silver'
    else 'Bronze'
  end;

  for campaign_row in
    select campaign.*
    from public.customer_loyalty_bonus_campaigns campaign
    where campaign.event_type in ('double_points','fixed_bonus','welcome_bonus','off_peak_bonus')
      and campaign.status in ('scheduled','active')
      and campaign.starts_at <= p_occurred_at and campaign.ends_at > p_occurred_at
      and member_tier = any(campaign.audience_tiers)
      and (
        cardinality(campaign.eligible_service_keys) = 0
        or nullif(btrim(coalesce(p_service_key, '')), '') = any(campaign.eligible_service_keys)
        or nullif(btrim(coalesce(p_rule_key, '')), '') = any(campaign.eligible_service_keys)
      )
      and (
        cardinality(campaign.eligible_branch_ids) = 0
        or p_branch_id = any(campaign.eligible_branch_ids)
      )
      and campaign.minimum_spend_pence <= coalesce(p_spend_pence, 0)
      and not exists (
        select 1 from public.customer_loyalty_sale_campaign_awards existing
        where existing.campaign_id = campaign.id
          and existing.qualifying_source_reference = source_value
      )
    order by campaign.priority desc, campaign.starts_at, campaign.id
  loop
    if awarded_campaigns > 0 and not (previous_allows_stacking and campaign_row.allow_stacking) then
      exit;
    end if;
    perform 1 from public.customer_loyalty_bonus_campaigns where id = campaign_row.id for update;
    if campaign_row.event_type = 'welcome_bonus' and exists (
      select 1 from public.customer_loyalty_source_links other_link
      join public.customer_loyalty_awards other_award
        on other_award.source_reference = other_link.source_reference
      where other_link.mobile_user_id = link_row.mobile_user_id
        and other_link.source_reference <> source_value
        and other_award.state = 'available'
    ) then continue; end if;

    bonus_points_value := case
      when campaign_row.event_type = 'double_points'
        then greatest(1, round(base_award.points * (campaign_row.multiplier - 1))::integer)
      else campaign_row.bonus_points
    end;
    select count(*)::integer, coalesce(sum(points), 0)::integer
      into member_awards, member_points
    from public.customer_loyalty_sale_campaign_awards
    where campaign_id = campaign_row.id and mobile_user_id = link_row.mobile_user_id;
    select coalesce(sum(tracked.points), 0)::bigint into campaign_points
    from public.customer_loyalty_sale_campaign_awards tracked
    join public.customer_loyalty_awards ledger on ledger.id = tracked.award_id
    where tracked.campaign_id = campaign_row.id and ledger.state <> 'reversed';
    if member_awards >= campaign_row.max_awards_per_customer
      or member_points + bonus_points_value > campaign_row.per_customer_cap
      or campaign_points + bonus_points_value > campaign_row.total_points_budget then
      continue;
    end if;

    insert into public.customer_loyalty_awards (
      mobile_user_id, source_type, source_reference, description, points,
      state, activation_milestone, activated_at
    ) values (
      link_row.mobile_user_id, 'adjustment',
      'campaign.sale.v1:' || campaign_row.id::text || ':' || source_value,
      campaign_row.name, bonus_points_value, 'available', campaign_row.event_type, p_occurred_at
    ) on conflict (source_reference) do update set source_reference = excluded.source_reference
    returning * into bonus_award;
    insert into public.customer_loyalty_sale_campaign_awards (
      campaign_id, mobile_user_id, award_id, points, qualifying_source_reference
    ) values (
      campaign_row.id, link_row.mobile_user_id, bonus_award.id,
      bonus_points_value, source_value
    ) on conflict do nothing;
    if found then
      awarded_points := awarded_points + bonus_points_value;
      awarded_campaigns := awarded_campaigns + 1;
      previous_allows_stacking := campaign_row.allow_stacking;
    end if;
  end loop;
  return jsonb_build_object('awardedPoints', awarded_points, 'campaignCount', awarded_campaigns);
end;
$$;

create or replace function public.customer_loyalty_reverse_sale_campaigns_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  campaign_award record;
begin
  if old.state <> 'reversed' and new.state = 'reversed' and new.reversal_of is null then
    for campaign_award in
      select ledger.source_reference
      from public.customer_loyalty_sale_campaign_awards tracked
      join public.customer_loyalty_awards ledger on ledger.id = tracked.award_id
      where tracked.qualifying_source_reference = new.source_reference
        and ledger.state <> 'reversed'
    loop
      perform public.customer_loyalty_award_reverse(
        campaign_award.source_reference,
        campaign_award.source_reference || ':reversal.v1',
        'Bonus reversed because the qualifying transaction was reversed.'
      );
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists customer_loyalty_reverse_sale_campaigns on public.customer_loyalty_awards;
create trigger customer_loyalty_reverse_sale_campaigns
after update of state on public.customer_loyalty_awards
for each row execute function public.customer_loyalty_reverse_sale_campaigns_v1();

create or replace function public.customer_loyalty_manage_program_v3(
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
  requested_status text := coalesce(p_request ->> 'status', 'draft');
  event_type_value text := p_request ->> 'eventType';
  campaign_value jsonb;
  campaign_id_value uuid;
begin
  if upper(btrim(coalesce(p_action, ''))) = 'UPSERT_BONUS_CAMPAIGN'
    and event_type_value in ('double_points','fixed_bonus','welcome_bonus','off_peak_bonus')
    and requested_status in ('scheduled','active') then
    campaign_value := public.customer_loyalty_manage_program_v2(
      p_actor_employee_id, p_action, p_request || jsonb_build_object('status', 'draft')
    );
    campaign_id_value := (campaign_value ->> 'id')::uuid;
    update public.customer_loyalty_bonus_campaigns
    set status = requested_status, updated_at = clock_timestamp(), updated_by = p_actor_employee_id
    where id = campaign_id_value
    returning to_jsonb(customer_loyalty_bonus_campaigns.*) into campaign_value;
    insert into public.customer_loyalty_program_audit_events (
      actor_employee_id, entity_type, entity_id, action, after_value
    ) values (
      p_actor_employee_id, 'bonus_campaign', campaign_id_value::text,
      'ENABLE_AUTOMATIC_SALE_CAMPAIGN', campaign_value
    );
    return campaign_value;
  end if;
  return public.customer_loyalty_manage_program_v2(p_actor_employee_id, p_action, p_request);
end;
$$;

create or replace function public.pos_post_transaction_v6(
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  response_value jsonb;
  transaction_row public.pos_transactions%rowtype;
  item_row public.pos_catalogue_items%rowtype;
  category_row public.pos_categories%rowtype;
  rule_row public.customer_loyalty_program_earning_rules%rowtype;
  campaign_value jsonb;
  bonus_points_value integer := 0;
  transaction_id_value uuid;
begin
  response_value := public.pos_post_transaction_v5(p_actor_employee_id, p_idempotency_key, p_request);
  transaction_id_value := nullif(response_value ->> 'transactionId', '')::uuid;
  select * into transaction_row from public.pos_transactions where id = transaction_id_value;
  if found and transaction_row.loyalty_source_reference is not null then
    select * into item_row from public.pos_catalogue_items where id = transaction_row.catalogue_item_id;
    select * into category_row from public.pos_categories where id = transaction_row.category_id;
    select * into rule_row
    from public.customer_loyalty_program_earning_rules rule
    where rule.is_active and rule.activation_mode = 'POS_FLAT'
      and ((rule.match_item_key is not null and rule.match_item_key = item_row.item_key)
        or (rule.match_category_key is not null and rule.match_category_key = category_row.category_key))
    order by (rule.match_item_key is not null) desc, rule.display_order limit 1;
    campaign_value := public.customer_loyalty_apply_sale_campaigns_v1(
      transaction_row.loyalty_source_reference, item_row.item_key, rule_row.rule_key,
      transaction_row.location_id, round(transaction_row.total_amount * 100)::bigint,
      transaction_row.occurred_at
    );
    bonus_points_value := coalesce((campaign_value ->> 'awardedPoints')::integer, 0);
    update public.pos_transactions
    set loyalty_points_awarded = coalesce((response_value ->> 'loyaltyPointsAwarded')::integer, 0)
      + bonus_points_value
    where id = transaction_id_value;
    response_value := response_value || jsonb_build_object(
      'loyaltyBasePointsAwarded', coalesce((response_value ->> 'loyaltyPointsAwarded')::integer, 0),
      'loyaltyBonusPointsAwarded', bonus_points_value,
      'loyaltyPointsAwarded', coalesce((response_value ->> 'loyaltyPointsAwarded')::integer, 0)
        + bonus_points_value
    );
  end if;
  return response_value;
end;
$$;

revoke all on function public.customer_loyalty_apply_sale_campaigns_v1(text,text,text,uuid,bigint,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_reverse_sale_campaigns_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_manage_program_v3(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_apply_sale_campaigns_v1(text,text,text,uuid,bigint,timestamptz)
  to service_role;
grant execute on function public.customer_loyalty_manage_program_v3(uuid,text,jsonb) to service_role;
revoke all on function public.pos_post_transaction_v5(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.pos_post_transaction_v6(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.pos_post_transaction_v6(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions(component, version, applied_at)
values ('pos', 2026091006, clock_timestamp())
on conflict(component) do update set version = excluded.version, applied_at = excluded.applied_at;

notify pgrst, 'reload schema';
commit;
