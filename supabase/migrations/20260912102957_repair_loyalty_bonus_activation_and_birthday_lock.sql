begin;

select pg_advisory_xact_lock(
  hashtextextended('loyalty:bonus-activation-birthday-lock:v1', 0)
);

alter table public.mobile_users
  add column if not exists birthday_reward_locked_at timestamptz;

update public.mobile_users
set birthday_reward_locked_at = coalesce(birthday_reward_locked_at, clock_timestamp())
where external_customer_subject is not null;

create or replace function public.customer_loyalty_lock_birthday_reward_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.birthday_reward_locked_at is not null
    and (
      new.birthday_reward_month is distinct from old.birthday_reward_month
      or new.birthday_reward_day is distinct from old.birthday_reward_day
    ) then
    raise exception 'birthday reward date is locked after customer onboarding'
      using errcode = '23514', hint = 'CUSTOMER_BIRTHDAY_REWARD_IMMUTABLE';
  end if;

  if new.external_customer_subject is not null
    and new.birthday_reward_locked_at is null then
    new.birthday_reward_locked_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists customer_loyalty_lock_birthday_reward_v1
  on public.mobile_users;
create trigger customer_loyalty_lock_birthday_reward_v1
before update of birthday_reward_month, birthday_reward_day, external_customer_subject
on public.mobile_users
for each row execute function public.customer_loyalty_lock_birthday_reward_v1();

revoke all on function public.customer_loyalty_lock_birthday_reward_v1()
  from public, anon, authenticated, service_role;

create or replace function public.customer_loyalty_award_welcome_on_activation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  campaign_row public.customer_loyalty_bonus_campaigns%rowtype;
  bonus_award public.customer_loyalty_awards%rowtype;
  member_rank text;
  member_awards integer;
  member_points integer;
  campaign_points bigint;
begin
  if old.state = 'available' or new.state <> 'available' or new.points <= 0
    or new.source_type not in ('ticket', 'service', 'package') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('loyalty:member:' || new.mobile_user_id::text, 0)
  );

  if exists (
    select 1
    from public.customer_loyalty_source_links other_link
    join public.customer_loyalty_awards other_award
      on other_award.source_reference = other_link.source_reference
    where other_link.mobile_user_id = new.mobile_user_id
      and other_link.source_reference <> new.source_reference
      and other_award.state = 'available'
  ) then
    return new;
  end if;

  select rank.name into member_rank
  from public.customer_loyalty_rank_for_points_v1(
    (
      select coalesce(sum(award.points), 0)::integer
      from public.customer_loyalty_awards award
      where award.mobile_user_id = new.mobile_user_id
        and award.state = 'available'
        and award.activation_milestone is distinct from 'voucher_redemption'
    )
  ) rank;

  select campaign.* into campaign_row
  from public.customer_loyalty_bonus_campaigns campaign
  where campaign.event_type = 'welcome_bonus'
    and campaign.status in ('scheduled', 'active')
    and campaign.starts_at <= coalesce(new.activated_at, clock_timestamp())
    and campaign.ends_at > coalesce(new.activated_at, clock_timestamp())
    and member_rank = any(campaign.audience_tiers)
    and campaign.minimum_spend_pence = 0
    and cardinality(campaign.eligible_service_keys) = 0
    and cardinality(campaign.eligible_branch_ids) = 0
    and campaign.bonus_points > 0
  order by campaign.priority desc, campaign.starts_at, campaign.id
  limit 1
  for update;

  if not found then return new; end if;

  select count(*)::integer, coalesce(sum(points), 0)::integer
    into member_awards, member_points
  from public.customer_loyalty_sale_campaign_awards
  where campaign_id = campaign_row.id and mobile_user_id = new.mobile_user_id;

  select coalesce(sum(tracked.points), 0)::bigint into campaign_points
  from public.customer_loyalty_sale_campaign_awards tracked
  join public.customer_loyalty_awards ledger on ledger.id = tracked.award_id
  where tracked.campaign_id = campaign_row.id and ledger.state <> 'reversed';

  if member_awards >= campaign_row.max_awards_per_customer
    or member_points + campaign_row.bonus_points > campaign_row.per_customer_cap
    or campaign_points + campaign_row.bonus_points > campaign_row.total_points_budget then
    return new;
  end if;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    new.mobile_user_id, 'adjustment',
    'campaign.sale.v1:' || campaign_row.id::text || ':' || new.source_reference,
    campaign_row.name, campaign_row.bonus_points, 'available',
    campaign_row.event_type, coalesce(new.activated_at, clock_timestamp())
  ) on conflict (source_reference) do update
    set source_reference = excluded.source_reference
  returning * into bonus_award;

  insert into public.customer_loyalty_sale_campaign_awards (
    campaign_id, mobile_user_id, award_id, points, qualifying_source_reference
  ) values (
    campaign_row.id, new.mobile_user_id, bonus_award.id,
    campaign_row.bonus_points, new.source_reference
  ) on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists customer_loyalty_award_welcome_on_activation_v1
  on public.customer_loyalty_awards;
create trigger customer_loyalty_award_welcome_on_activation_v1
after update of state on public.customer_loyalty_awards
for each row
when (old.state is distinct from new.state and new.state = 'available')
execute function public.customer_loyalty_award_welcome_on_activation_v1();

revoke all on function public.customer_loyalty_award_welcome_on_activation_v1()
  from public, anon, authenticated, service_role;

-- Repair referrals that authenticated while the referral campaign or portal
-- integration was temporarily unavailable. The function is idempotent.
do $$
declare
  pending_referral record;
begin
  for pending_referral in
    select referral.referral_code, referral.referred_mobile_user_id
    from public.customer_loyalty_referrals referral
    where referral.status = 'authenticated'
    order by referral.created_at, referral.id
  loop
    perform public.customer_loyalty_accept_referral_v1(
      pending_referral.referral_code,
      pending_referral.referred_mobile_user_id
    );
  end loop;
end;
$$;

-- Run the normal idempotent scheduler once at deployment so customers whose
-- birthday is today do not need to wait for the next cron invocation.
select public.customer_loyalty_run_scheduled_bonus_v1(clock_timestamp());

notify pgrst, 'reload schema';
commit;
