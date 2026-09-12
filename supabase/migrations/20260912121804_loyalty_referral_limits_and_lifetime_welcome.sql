begin;

select pg_advisory_xact_lock(
  hashtextextended('loyalty:referral-limits-lifetime-welcome:v1', 0)
);

alter table public.customer_loyalty_campaign_awards
  add column if not exists referral_id bigint
  references public.customer_loyalty_referrals(id) on delete restrict;

alter table public.customer_loyalty_campaign_awards
  drop constraint if exists customer_loyalty_campaign_awards_campaign_id_mobile_user_id_award_kind_key;
alter table public.customer_loyalty_campaign_awards
  drop constraint if exists customer_loyalty_campaign_awards_award_kind_check;
alter table public.customer_loyalty_campaign_awards
  add constraint customer_loyalty_campaign_awards_award_kind_check check (
    award_kind in ('referrer','referred_customer','birthday','eid','welcome')
  ) not valid;
alter table public.customer_loyalty_campaign_awards
  validate constraint customer_loyalty_campaign_awards_award_kind_check;

update public.customer_loyalty_campaign_awards tracked
set referral_id = referral.id
from public.customer_loyalty_awards ledger,
     public.customer_loyalty_referrals referral
where tracked.award_id = ledger.id
  and tracked.referral_id is null
  and tracked.campaign_id = referral.campaign_id
  and (
    (
      tracked.award_kind = 'referrer'
      and tracked.mobile_user_id = referral.referrer_mobile_user_id
      and ledger.source_reference =
        'campaign.referrer.v1:' || tracked.campaign_id::text || ':' || referral.id::text
    )
    or (
      tracked.award_kind = 'referred_customer'
      and tracked.mobile_user_id = referral.referred_mobile_user_id
      and ledger.source_reference =
        'campaign.referred.v1:' || tracked.campaign_id::text || ':' || referral.id::text
    )
  );

insert into public.customer_loyalty_campaign_awards (
  campaign_id, mobile_user_id, award_id, award_kind, points, referral_id
)
select
  referral.campaign_id,
  referral.referrer_mobile_user_id,
  ledger.id,
  'referrer',
  ledger.points,
  referral.id
from public.customer_loyalty_referrals referral
join public.customer_loyalty_awards ledger
  on ledger.source_reference =
    'campaign.referrer.v1:' || referral.campaign_id::text || ':' || referral.id::text
where referral.campaign_id is not null
  and ledger.points > 0
on conflict (award_id) do nothing;

insert into public.customer_loyalty_campaign_awards (
  campaign_id, mobile_user_id, award_id, award_kind, points, referral_id
)
select
  referral.campaign_id,
  referral.referred_mobile_user_id,
  ledger.id,
  'referred_customer',
  ledger.points,
  referral.id
from public.customer_loyalty_referrals referral
join public.customer_loyalty_awards ledger
  on ledger.source_reference =
    'campaign.referred.v1:' || referral.campaign_id::text || ':' || referral.id::text
where referral.campaign_id is not null
  and ledger.points > 0
on conflict (award_id) do nothing;

create unique index if not exists customer_loyalty_campaign_awards_referral_kind_uidx
  on public.customer_loyalty_campaign_awards(
    campaign_id, mobile_user_id, award_kind, referral_id
  )
  where award_kind in ('referrer','referred_customer');
create unique index if not exists customer_loyalty_campaign_awards_single_kind_uidx
  on public.customer_loyalty_campaign_awards(campaign_id, mobile_user_id, award_kind)
  where award_kind in ('birthday','eid','welcome');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_loyalty_campaign_awards_referral_required_check'
      and conrelid = 'public.customer_loyalty_campaign_awards'::regclass
  ) then
    alter table public.customer_loyalty_campaign_awards
      add constraint customer_loyalty_campaign_awards_referral_required_check check (
        (award_kind in ('referrer','referred_customer') and referral_id is not null)
        or (award_kind not in ('referrer','referred_customer') and referral_id is null)
      ) not valid;
  end if;
end;
$$;
alter table public.customer_loyalty_campaign_awards
  validate constraint customer_loyalty_campaign_awards_referral_required_check;

update public.customer_loyalty_bonus_campaigns
set
  bonus_points = 100,
  referred_customer_points = 50,
  max_awards_per_customer = 10,
  per_customer_cap = 1050,
  total_points_budget = greatest(total_points_budget, 1050),
  terms = 'The referrer receives 100 points and the new member receives 50 points after verified account setup. A member may accept one referral and may refer up to 10 new members. No member may receive more than 1,050 lifetime referral points.',
  status = 'active',
  updated_at = clock_timestamp()
where event_type = 'referral_bonus'
  and is_archived = false
  and status not in ('ended','cancelled');

update public.customer_loyalty_campaign_events
set
  description = 'Verified account referrals: 100 points for the referrer and 50 points for the new member, limited to 10 outgoing referrals.',
  updated_at = clock_timestamp()
where is_archived = false
  and exists (
    select 1
    from public.customer_loyalty_bonus_campaigns campaign
    where campaign.event_id = customer_loyalty_campaign_events.id
      and campaign.event_type = 'referral_bonus'
      and campaign.is_archived = false
  );

create or replace function public.customer_loyalty_accept_referral_v1(
  p_referral_code text,
  p_referred_mobile_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  code_row public.customer_loyalty_referral_codes%rowtype;
  referral_row public.customer_loyalty_referrals%rowtype;
  campaign_row public.customer_loyalty_bonus_campaigns%rowtype;
  referrer_award public.customer_loyalty_awards%rowtype;
  referred_award public.customer_loyalty_awards%rowtype;
  outgoing_referrals integer;
  campaign_spent bigint;
  referrer_lifetime_points bigint;
  referred_lifetime_points bigint;
  referrer_source text;
  referred_source text;
begin
  if p_referred_mobile_user_id is null then
    raise exception 'referred customer is required';
  end if;

  select * into code_row
  from public.customer_loyalty_referral_codes
  where referral_code = upper(btrim(p_referral_code)) and is_active = true;
  if not found then raise exception 'referral code not found'; end if;
  if code_row.mobile_user_id = p_referred_mobile_user_id then
    raise exception 'a customer cannot refer themselves';
  end if;
  if not exists (
    select 1 from public.mobile_users
    where id = p_referred_mobile_user_id
      and customer_lifecycle_status = 'active'
      and external_customer_subject is not null
  ) then
    raise exception 'referred customer must be authenticated';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('loyalty:referral:referred:' || p_referred_mobile_user_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('loyalty:referral:referrer:' || code_row.mobile_user_id::text, 0)
  );

  select * into referral_row
  from public.customer_loyalty_referrals
  where referred_mobile_user_id = p_referred_mobile_user_id
  for update;
  if found and referral_row.referrer_mobile_user_id <> code_row.mobile_user_id then
    raise exception 'this customer already has a different referrer';
  end if;
  if found and referral_row.status = 'rewarded' then
    return jsonb_build_object('status', 'rewarded', 'bonusAwarded', true);
  end if;

  if not found then
    select count(*)::integer into outgoing_referrals
    from public.customer_loyalty_referrals
    where referrer_mobile_user_id = code_row.mobile_user_id
      and status in ('authenticated','rewarded');
    if outgoing_referrals >= 10 then
      return jsonb_build_object(
        'status', 'limit_reached', 'bonusAwarded', false,
        'referralLimit', 10, 'remainingReferrals', 0
      );
    end if;

    insert into public.customer_loyalty_referrals (
      referral_code, referrer_mobile_user_id, referred_mobile_user_id, status
    ) values (
      code_row.referral_code, code_row.mobile_user_id,
      p_referred_mobile_user_id, 'authenticated'
    ) returning * into referral_row;
  end if;

  select * into campaign_row
  from public.customer_loyalty_bonus_campaigns
  where event_type = 'referral_bonus'
    and status in ('scheduled','active')
    and starts_at <= clock_timestamp() and ends_at > clock_timestamp()
    and is_archived = false
  order by priority desc, starts_at desc, id
  limit 1
  for update;
  if not found then
    return jsonb_build_object('status', 'authenticated', 'bonusAwarded', false);
  end if;

  referrer_source :=
    'campaign.referrer.v1:' || campaign_row.id::text || ':' || referral_row.id::text;
  referred_source :=
    'campaign.referred.v1:' || campaign_row.id::text || ':' || referral_row.id::text;

  select coalesce(sum(points), 0)::bigint into referrer_lifetime_points
  from public.customer_loyalty_awards
  where mobile_user_id = code_row.mobile_user_id
    and activation_milestone = 'referral_bonus'
    and points > 0
    and source_reference <> referrer_source;
  select coalesce(sum(points), 0)::bigint into referred_lifetime_points
  from public.customer_loyalty_awards
  where mobile_user_id = p_referred_mobile_user_id
    and activation_milestone = 'referral_bonus'
    and points > 0
    and source_reference <> referred_source;

  if referrer_lifetime_points + campaign_row.bonus_points > 1050
    or referred_lifetime_points + campaign_row.referred_customer_points > 1050 then
    update public.customer_loyalty_referrals
    set status = 'ineligible', campaign_id = campaign_row.id
    where id = referral_row.id;
    return jsonb_build_object(
      'status', 'ineligible', 'bonusAwarded', false,
      'lifetimePointsLimit', 1050
    );
  end if;

  select coalesce(sum(points), 0)::bigint into campaign_spent
  from public.customer_loyalty_campaign_awards
  where campaign_id = campaign_row.id;
  if campaign_spent + campaign_row.bonus_points + campaign_row.referred_customer_points
      > campaign_row.total_points_budget then
    return jsonb_build_object('status', 'authenticated', 'bonusAwarded', false);
  end if;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    code_row.mobile_user_id, 'adjustment', referrer_source,
    campaign_row.name || ' - referral reward', campaign_row.bonus_points,
    'available', 'referral_bonus', clock_timestamp()
  ) on conflict (source_reference) do update
    set source_reference = excluded.source_reference
  returning * into referrer_award;

  insert into public.customer_loyalty_campaign_awards (
    campaign_id, mobile_user_id, award_id, award_kind, points, referral_id
  ) values (
    campaign_row.id, code_row.mobile_user_id, referrer_award.id,
    'referrer', campaign_row.bonus_points, referral_row.id
  ) on conflict do nothing;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    p_referred_mobile_user_id, 'adjustment', referred_source,
    campaign_row.name || ' - new member referral reward',
    campaign_row.referred_customer_points, 'available',
    'referral_bonus', clock_timestamp()
  ) on conflict (source_reference) do update
    set source_reference = excluded.source_reference
  returning * into referred_award;

  insert into public.customer_loyalty_campaign_awards (
    campaign_id, mobile_user_id, award_id, award_kind, points, referral_id
  ) values (
    campaign_row.id, p_referred_mobile_user_id, referred_award.id,
    'referred_customer', campaign_row.referred_customer_points, referral_row.id
  ) on conflict do nothing;

  update public.customer_loyalty_referrals
  set status = 'rewarded', campaign_id = campaign_row.id,
    rewarded_at = coalesce(rewarded_at, clock_timestamp())
  where id = referral_row.id;

  select count(*)::integer into outgoing_referrals
  from public.customer_loyalty_referrals
  where referrer_mobile_user_id = code_row.mobile_user_id
    and status = 'rewarded';
  return jsonb_build_object(
    'status', 'rewarded', 'bonusAwarded', true,
    'referralLimit', 10,
    'remainingReferrals', greatest(0, 10 - outgoing_referrals),
    'lifetimePointsLimit', 1050
  );
end;
$$;

revoke all on function public.customer_loyalty_accept_referral_v1(text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_accept_referral_v1(text,uuid)
  to service_role;

drop trigger if exists customer_loyalty_award_welcome_on_activation_v1
  on public.customer_loyalty_awards;
drop function if exists public.customer_loyalty_award_welcome_on_activation_v1();

update public.customer_loyalty_bonus_campaigns
set
  bonus_points = 50,
  max_awards_per_customer = 1,
  per_customer_cap = 50,
  total_points_budget = greatest(
    total_points_budget,
    (
      select count(*)::bigint * 50
      from public.mobile_users member
      where member.customer_lifecycle_status = 'active'
        and member.external_customer_subject is not null
    ) + coalesce(
      (
        select sum(tracked.points)::bigint
        from public.customer_loyalty_campaign_awards tracked
        where tracked.campaign_id = customer_loyalty_bonus_campaigns.id
      ),
      0
    )
  ),
  terms = '50 Welcome points are awarded once in a customer lifetime after verified account setup.',
  status = 'active',
  updated_at = clock_timestamp()
where event_type = 'welcome_bonus'
  and is_archived = false
  and status not in ('ended','cancelled');

update public.customer_loyalty_campaign_events
set
  description = 'A one-time 50-point thank-you award after verified customer account setup.',
  updated_at = clock_timestamp()
where is_archived = false
  and exists (
    select 1
    from public.customer_loyalty_bonus_campaigns campaign
    where campaign.event_id = customer_loyalty_campaign_events.id
      and campaign.event_type = 'welcome_bonus'
      and campaign.is_archived = false
  );

create or replace function public.customer_loyalty_award_welcome_v1(
  p_mobile_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  campaign_row public.customer_loyalty_bonus_campaigns%rowtype;
  welcome_award public.customer_loyalty_awards%rowtype;
  campaign_spent bigint;
  welcome_source text := 'campaign.welcome.lifetime.v1:' || p_mobile_user_id::text;
begin
  if not exists (
    select 1 from public.mobile_users
    where id = p_mobile_user_id
      and customer_lifecycle_status = 'active'
      and external_customer_subject is not null
  ) then
    raise exception 'active authenticated loyalty customer not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('loyalty:welcome:' || p_mobile_user_id::text, 0)
  );

  select * into welcome_award
  from public.customer_loyalty_awards
  where mobile_user_id = p_mobile_user_id
    and activation_milestone = 'welcome_bonus'
    and points > 0
  order by created_at, id
  limit 1;
  if found then
    return jsonb_build_object(
      'awarded', false, 'alreadyAwarded', true,
      'points', welcome_award.points
    );
  end if;

  select * into campaign_row
  from public.customer_loyalty_bonus_campaigns
  where event_type = 'welcome_bonus'
    and status in ('scheduled','active')
    and starts_at <= clock_timestamp() and ends_at > clock_timestamp()
    and is_archived = false
  order by priority desc, starts_at desc, id
  limit 1
  for update;
  if not found then
    return jsonb_build_object('awarded', false, 'alreadyAwarded', false);
  end if;

  select coalesce(sum(points), 0)::bigint into campaign_spent
  from public.customer_loyalty_campaign_awards
  where campaign_id = campaign_row.id;
  if campaign_spent + campaign_row.bonus_points > campaign_row.total_points_budget then
    return jsonb_build_object('awarded', false, 'alreadyAwarded', false);
  end if;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    p_mobile_user_id, 'adjustment', welcome_source, campaign_row.name,
    campaign_row.bonus_points, 'available', 'welcome_bonus', clock_timestamp()
  ) on conflict (source_reference) do update
    set source_reference = excluded.source_reference
  returning * into welcome_award;

  insert into public.customer_loyalty_campaign_awards (
    campaign_id, mobile_user_id, award_id, award_kind, points, referral_id
  ) values (
    campaign_row.id, p_mobile_user_id, welcome_award.id,
    'welcome', campaign_row.bonus_points, null
  ) on conflict do nothing;

  return jsonb_build_object(
    'awarded', true, 'alreadyAwarded', false,
    'points', campaign_row.bonus_points
  );
end;
$$;

revoke all on function public.customer_loyalty_award_welcome_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_award_welcome_v1(uuid)
  to service_role;

do $$
declare
  member record;
begin
  for member in
    select id
    from public.mobile_users
    where customer_lifecycle_status = 'active'
      and external_customer_subject is not null
    order by id
  loop
    perform public.customer_loyalty_award_welcome_v1(member.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
