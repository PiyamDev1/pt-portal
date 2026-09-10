begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:referrals-vouchers-automation', 0));

alter table public.mobile_users
  add column if not exists birthday_reward_month smallint,
  add column if not exists birthday_reward_day smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mobile_users_birthday_reward_check'
      and conrelid = 'public.mobile_users'::regclass
  ) then
    alter table public.mobile_users add constraint mobile_users_birthday_reward_check check (
      (birthday_reward_month is null and birthday_reward_day is null)
      or (
        birthday_reward_month between 1 and 12
        and birthday_reward_day between 1 and 31
      )
    );
  end if;
end $$;

alter table public.customer_loyalty_bonus_campaigns
  drop constraint if exists customer_loyalty_bonus_campaigns_event_type_check;
alter table public.customer_loyalty_bonus_campaigns
  add constraint customer_loyalty_bonus_campaigns_event_type_check check (
    event_type in (
      'double_points','fixed_bonus','welcome_bonus','referral_bonus',
      'off_peak_bonus','birthday_gift','eid_gift'
    )
  );
alter table public.customer_loyalty_bonus_campaigns
  drop constraint if exists customer_loyalty_bonus_campaign_award;
alter table public.customer_loyalty_bonus_campaigns
  add constraint customer_loyalty_bonus_campaign_award check (
    (event_type = 'double_points' and multiplier is not null and bonus_points is null)
    or (
      event_type = 'referral_bonus' and multiplier is null
      and bonus_points is not null and referred_customer_points is not null
    )
    or (
      event_type in (
        'fixed_bonus','welcome_bonus','off_peak_bonus','birthday_gift','eid_gift'
      )
      and multiplier is null and bonus_points is not null
      and referred_customer_points is null
    )
  );

alter table public.customer_loyalty_awards
  drop constraint if exists customer_loyalty_awards_activation_milestone_check;
alter table public.customer_loyalty_awards
  add constraint customer_loyalty_awards_activation_milestone_check check (
    activation_milestone is null or activation_milestone in (
      'issued_and_paid','completed_and_paid','fully_paid','staff_adjustment',
      'referral_bonus','birthday_gift','eid_gift','voucher_redemption'
    )
  );

create table public.customer_loyalty_campaign_awards (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.customer_loyalty_bonus_campaigns(id) on delete restrict,
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  award_id uuid not null references public.customer_loyalty_awards(id) on delete restrict,
  award_kind text not null check (
    award_kind in ('referrer','referred_customer','birthday','eid')
  ),
  points integer not null check (points > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique(campaign_id, mobile_user_id, award_kind),
  unique(award_id)
);
create index customer_loyalty_campaign_awards_member_idx
  on public.customer_loyalty_campaign_awards(mobile_user_id, created_at desc);
create index customer_loyalty_campaign_awards_campaign_idx
  on public.customer_loyalty_campaign_awards(campaign_id, created_at desc);

create table public.customer_loyalty_referral_codes (
  mobile_user_id uuid primary key references public.mobile_users(id) on delete restrict,
  referral_code text not null unique check (referral_code ~ '^PREF-[A-F0-9]{16}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.customer_loyalty_referrals (
  id bigint generated always as identity primary key,
  referral_code text not null references public.customer_loyalty_referral_codes(referral_code) on delete restrict,
  referrer_mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  referred_mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  status text not null check (status in ('authenticated','rewarded','ineligible')),
  campaign_id uuid references public.customer_loyalty_bonus_campaigns(id) on delete restrict,
  authenticated_at timestamptz not null default clock_timestamp(),
  rewarded_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(referred_mobile_user_id),
  check (referrer_mobile_user_id <> referred_mobile_user_id)
);
create index customer_loyalty_referrals_referrer_idx
  on public.customer_loyalty_referrals(referrer_mobile_user_id, created_at desc);
create index customer_loyalty_referrals_campaign_idx
  on public.customer_loyalty_referrals(campaign_id)
  where campaign_id is not null;

create table public.customer_loyalty_vouchers (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  reward_id uuid not null references public.customer_loyalty_voucher_rewards(id) on delete restrict,
  voucher_code text not null unique check (voucher_code ~ '^PYV-[A-F0-9]{20}$'),
  points_cost integer not null check (points_cost > 0),
  value_pence integer not null check (value_pence > 0),
  status text not null default 'issued' check (
    status in ('issued','redeemed','expired','cancelled')
  ),
  idempotency_key uuid not null unique,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_transaction_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > issued_at),
  check (
    (status = 'redeemed' and redeemed_at is not null)
    or (status <> 'redeemed' and redeemed_at is null)
  )
);
create index customer_loyalty_vouchers_member_idx
  on public.customer_loyalty_vouchers(mobile_user_id, issued_at desc);
create index customer_loyalty_vouchers_status_expiry_idx
  on public.customer_loyalty_vouchers(status, expires_at);

create or replace function public.customer_loyalty_ensure_referral_code_v1(
  p_mobile_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  code_value text;
  attempt integer := 0;
begin
  if not exists (
    select 1 from public.mobile_users
    where id = p_mobile_user_id and customer_lifecycle_status = 'active'
  ) then
    raise exception 'active loyalty customer not found';
  end if;

  select referral_code into code_value
  from public.customer_loyalty_referral_codes
  where mobile_user_id = p_mobile_user_id and is_active = true;
  if found then return code_value; end if;

  loop
    attempt := attempt + 1;
    code_value := 'PREF-' || upper(encode(gen_random_bytes(8), 'hex'));
    begin
      insert into public.customer_loyalty_referral_codes (
        mobile_user_id, referral_code, is_active
      ) values (p_mobile_user_id, code_value, true)
      on conflict (mobile_user_id) do update set
        is_active = true,
        updated_at = clock_timestamp()
      returning referral_code into code_value;
      return code_value;
    exception when unique_violation then
      if attempt >= 8 then raise exception 'unable to allocate referral code'; end if;
    end;
  end loop;
end;
$$;

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
  spent integer;
begin
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

  insert into public.customer_loyalty_referrals (
    referral_code, referrer_mobile_user_id, referred_mobile_user_id, status
  ) values (
    code_row.referral_code, code_row.mobile_user_id, p_referred_mobile_user_id, 'authenticated'
  ) on conflict (referred_mobile_user_id) do nothing;

  select * into referral_row
  from public.customer_loyalty_referrals
  where referred_mobile_user_id = p_referred_mobile_user_id
  for update;
  if referral_row.referrer_mobile_user_id <> code_row.mobile_user_id then
    raise exception 'this customer already has a different referrer';
  end if;
  if referral_row.status = 'rewarded' then
    return jsonb_build_object('status', 'rewarded', 'bonusAwarded', true);
  end if;

  select * into campaign_row
  from public.customer_loyalty_bonus_campaigns
  where event_type = 'referral_bonus'
    and status in ('scheduled','active')
    and starts_at <= clock_timestamp() and ends_at > clock_timestamp()
  order by starts_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('status', 'authenticated', 'bonusAwarded', false);
  end if;

  if campaign_row.bonus_points > campaign_row.per_customer_cap
    or campaign_row.referred_customer_points > campaign_row.per_customer_cap then
    update public.customer_loyalty_referrals
    set status = 'ineligible', campaign_id = campaign_row.id
    where id = referral_row.id;
    return jsonb_build_object('status', 'ineligible', 'bonusAwarded', false);
  end if;

  select coalesce(sum(points), 0)::integer into spent
  from public.customer_loyalty_campaign_awards
  where campaign_id = campaign_row.id;
  if spent + campaign_row.bonus_points + campaign_row.referred_customer_points
      > campaign_row.total_points_budget then
    update public.customer_loyalty_referrals
    set status = 'ineligible', campaign_id = campaign_row.id
    where id = referral_row.id;
    return jsonb_build_object('status', 'ineligible', 'bonusAwarded', false);
  end if;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    code_row.mobile_user_id, 'adjustment',
    'campaign.referrer.v1:' || campaign_row.id::text || ':' || referral_row.id::text,
    campaign_row.name || ' - referral reward', campaign_row.bonus_points,
    'available', 'referral_bonus', clock_timestamp()
  ) on conflict (source_reference) do update set source_reference = excluded.source_reference
  returning * into referrer_award;

  insert into public.customer_loyalty_campaign_awards (
    campaign_id, mobile_user_id, award_id, award_kind, points
  ) values (
    campaign_row.id, code_row.mobile_user_id, referrer_award.id,
    'referrer', campaign_row.bonus_points
  ) on conflict (campaign_id, mobile_user_id, award_kind) do nothing;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    p_referred_mobile_user_id, 'adjustment',
    'campaign.referred.v1:' || campaign_row.id::text || ':' || referral_row.id::text,
    campaign_row.name || ' - welcome referral reward', campaign_row.referred_customer_points,
    'available', 'referral_bonus', clock_timestamp()
  ) on conflict (source_reference) do update set source_reference = excluded.source_reference
  returning * into referred_award;

  insert into public.customer_loyalty_campaign_awards (
    campaign_id, mobile_user_id, award_id, award_kind, points
  ) values (
    campaign_row.id, p_referred_mobile_user_id, referred_award.id,
    'referred_customer', campaign_row.referred_customer_points
  ) on conflict (campaign_id, mobile_user_id, award_kind) do nothing;

  update public.customer_loyalty_referrals
  set status = 'rewarded', campaign_id = campaign_row.id, rewarded_at = clock_timestamp()
  where id = referral_row.id;
  return jsonb_build_object('status', 'rewarded', 'bonusAwarded', true);
end;
$$;

create or replace function public.customer_loyalty_issue_voucher_v1(
  p_mobile_user_id uuid,
  p_points_cost integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  reward_row public.customer_loyalty_voucher_rewards%rowtype;
  voucher_row public.customer_loyalty_vouchers%rowtype;
  balance_value integer;
  code_value text;
begin
  perform pg_advisory_xact_lock(hashtextextended('loyalty:voucher:' || p_mobile_user_id::text, 0));
  select * into voucher_row from public.customer_loyalty_vouchers
  where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(voucher_row); end if;

  if not exists (
    select 1 from public.mobile_users
    where id = p_mobile_user_id and customer_lifecycle_status = 'active'
  ) then raise exception 'active loyalty customer not found'; end if;

  select * into reward_row from public.customer_loyalty_voucher_rewards
  where points_cost = p_points_cost and is_active = true;
  if not found then raise exception 'voucher reward is unavailable'; end if;

  select coalesce(sum(points), 0)::integer into balance_value
  from public.customer_loyalty_awards
  where mobile_user_id = p_mobile_user_id and state = 'available';
  if balance_value < reward_row.points_cost then raise exception 'insufficient loyalty points'; end if;

  loop
    code_value := 'PYV-' || upper(encode(gen_random_bytes(10), 'hex'));
    exit when not exists (
      select 1 from public.customer_loyalty_vouchers where voucher_code = code_value
    );
  end loop;

  insert into public.customer_loyalty_vouchers (
    mobile_user_id, reward_id, voucher_code, points_cost, value_pence,
    idempotency_key, expires_at
  ) values (
    p_mobile_user_id, reward_row.id, code_value, reward_row.points_cost,
    reward_row.value_pence, p_idempotency_key,
    clock_timestamp() + make_interval(months => reward_row.validity_months)
  ) returning * into voucher_row;

  insert into public.customer_loyalty_awards (
    mobile_user_id, source_type, source_reference, description, points,
    state, activation_milestone, activated_at
  ) values (
    p_mobile_user_id, 'adjustment', 'voucher.issue.v1:' || voucher_row.id::text,
    'Loyalty voucher ' || voucher_row.voucher_code,
    -reward_row.points_cost, 'available', 'voucher_redemption', clock_timestamp()
  );
  return to_jsonb(voucher_row);
end;
$$;

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
begin
  update public.customer_loyalty_vouchers
  set status = 'expired'
  where status = 'issued' and expires_at <= p_as_of;

  for campaign_row in
    select * from public.customer_loyalty_bonus_campaigns
    where event_type in ('birthday_gift','eid_gift')
      and status in ('scheduled','active')
      and starts_at <= p_as_of and ends_at > p_as_of
    order by starts_at
    for update skip locked
  loop
    award_kind_value := case when campaign_row.event_type = 'birthday_gift'
      then 'birthday' else 'eid' end;
    select coalesce(sum(points), 0)::integer into spent
    from public.customer_loyalty_campaign_awards
    where campaign_id = campaign_row.id;

    for member_row in
      select * from public.mobile_users member
      where member.customer_lifecycle_status = 'active'
        and member.external_customer_subject is not null
        and (
          campaign_row.event_type = 'eid_gift'
          or (
            member.birthday_reward_month = extract(month from p_as_of)::integer
            and member.birthday_reward_day = extract(day from p_as_of)::integer
          )
        )
      order by member.id
    loop
      exit when spent + campaign_row.bonus_points > campaign_row.total_points_budget;
      if campaign_row.bonus_points > campaign_row.per_customer_cap then continue; end if;
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

alter table public.customer_loyalty_campaign_awards enable row level security;
alter table public.customer_loyalty_campaign_awards force row level security;
alter table public.customer_loyalty_referral_codes enable row level security;
alter table public.customer_loyalty_referral_codes force row level security;
alter table public.customer_loyalty_referrals enable row level security;
alter table public.customer_loyalty_referrals force row level security;
alter table public.customer_loyalty_vouchers enable row level security;
alter table public.customer_loyalty_vouchers force row level security;

revoke all on table public.customer_loyalty_campaign_awards,
  public.customer_loyalty_referral_codes,
  public.customer_loyalty_referrals,
  public.customer_loyalty_vouchers from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_campaign_awards,
  public.customer_loyalty_referral_codes,
  public.customer_loyalty_referrals,
  public.customer_loyalty_vouchers to service_role;

revoke all on function public.customer_loyalty_ensure_referral_code_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_accept_referral_v1(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_issue_voucher_v1(uuid,integer,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_run_scheduled_bonus_v1(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_ensure_referral_code_v1(uuid) to service_role;
grant execute on function public.customer_loyalty_accept_referral_v1(text,uuid) to service_role;
grant execute on function public.customer_loyalty_issue_voucher_v1(uuid,integer,uuid) to service_role;
grant execute on function public.customer_loyalty_run_scheduled_bonus_v1(timestamptz) to service_role;

commit;
