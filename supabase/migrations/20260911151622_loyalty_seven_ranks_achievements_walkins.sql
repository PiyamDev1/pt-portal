begin;

select pg_advisory_xact_lock(hashtextextended('loyalty:seven-ranks-achievements-walkins:v1', 0));

create table public.customer_loyalty_rank_rules (
  rank_key text primary key check (rank_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null unique check (length(btrim(name)) between 2 and 40),
  minimum_points integer not null check (minimum_points >= 0),
  maximum_points integer check (maximum_points is null or maximum_points >= minimum_points),
  maintenance_points integer not null check (maintenance_points >= 0),
  display_order integer not null unique check (display_order between 1 and 100),
  colour text not null check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  walk_in_allowance integer not null default 0 check (walk_in_allowance between 0 and 100),
  callback_priority integer not null default 0 check (callback_priority between 0 and 10),
  waitlist_priority integer not null default 0 check (waitlist_priority between 0 and 10),
  perks text[] not null default '{}'::text[] check (cardinality(perks) <= 12),
  is_active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.customer_loyalty_rank_rules (
  rank_key, name, minimum_points, maximum_points, maintenance_points,
  display_order, colour, walk_in_allowance, callback_priority, waitlist_priority, perks
) values
  ('bronze','Bronze',0,1499,0,10,'#A16207',0,0,0,array['Standard rewards','Bronze rank badge']),
  ('silver','Silver',1500,3999,500,20,'#64748B',0,0,0,array['Member-only campaigns','Early programme announcements','Silver rank badge']),
  ('gold','Gold',4000,7999,1334,30,'#CA8A04',0,1,0,array['Member-only campaigns','Early programme announcements','Priority callback routing','Gold rank badge']),
  ('platinum','Platinum',8000,14999,2667,40,'#475569',0,2,1,array['Priority callback routing','Priority appointment waitlist','Platinum rank badge']),
  ('ruby','Ruby',15000,24999,5000,50,'#9F1239',2,3,2,array['Priority callback routing','Priority appointment waitlist','2 NADRA or passport walk-ins per programme year','Ruby rank badge']),
  ('diamond','Diamond',25000,39999,8334,60,'#0369A1',4,4,3,array['Priority callback routing','Priority appointment waitlist','4 NADRA or passport walk-ins per programme year','Diamond rank badge']),
  ('elite','Elite',40000,null,13334,70,'#18181B',8,5,4,array['Highest callback priority','Highest appointment waitlist priority','8 NADRA or passport walk-ins per programme year','Elite rank badge']);

create table public.customer_loyalty_achievement_rules (
  achievement_key text primary key check (achievement_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null unique check (length(btrim(name)) between 2 and 80),
  description text not null check (length(btrim(description)) between 5 and 240),
  required_transactions integer not null unique check (required_transactions between 1 and 100000),
  bonus_points integer not null check (bonus_points between 1 and 100000),
  display_order integer not null unique check (display_order between 1 and 1000),
  is_active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.customer_loyalty_achievement_rules (
  achievement_key, name, description, required_transactions, bonus_points, display_order
) values
  ('first_ten','First Ten','Complete 10 paid and valid loyalty transactions.',10,50,10),
  ('piyam_regular','Piyam Regular','Complete 25 paid and valid loyalty transactions.',25,100,20),
  ('loyalty_champion','Loyalty Champion','Complete 50 paid and valid loyalty transactions.',50,200,30),
  ('century_member','Century Member','Complete 100 paid and valid loyalty transactions.',100,400,40);

create table public.customer_loyalty_achievements (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  achievement_key text not null references public.customer_loyalty_achievement_rules(achievement_key) on delete restrict,
  status text not null check (status in ('earned','suspended')),
  award_version integer not null default 1 check (award_version > 0),
  earned_at timestamptz not null default clock_timestamp(),
  suspended_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique(mobile_user_id, achievement_key)
);
create index customer_loyalty_achievements_member_idx
  on public.customer_loyalty_achievements(mobile_user_id, status, earned_at desc);

create table public.customer_loyalty_rank_badges (
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  rank_key text not null references public.customer_loyalty_rank_rules(rank_key) on delete restrict,
  first_reached_at timestamptz not null default clock_timestamp(),
  primary key (mobile_user_id, rank_key)
);

create table public.customer_loyalty_walkin_windows (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  service_type text not null check (service_type in ('nadra','passport')),
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null check (ends_at > starts_at),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(location_id, service_type, iso_weekday, starts_at, ends_at)
);
create index customer_loyalty_walkin_windows_lookup_idx
  on public.customer_loyalty_walkin_windows(location_id, service_type, iso_weekday)
  where is_active;

create table public.customer_loyalty_walkin_usages (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  service_type text not null check (service_type in ('nadra','passport')),
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  idempotency_key uuid not null unique,
  programme_year integer not null check (programme_year between 2020 and 2200),
  rank_key text not null references public.customer_loyalty_rank_rules(rank_key) on delete restrict,
  consumes_allowance boolean not null default true,
  is_override boolean not null default false,
  override_reason text check (
    (is_override = false and override_reason is null)
    or (is_override = true and length(btrim(override_reason)) between 5 and 300)
  ),
  used_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);
create index customer_loyalty_walkin_usages_member_year_idx
  on public.customer_loyalty_walkin_usages(mobile_user_id, programme_year, used_at desc)
  where consumes_allowance;

alter table public.customer_loyalty_rank_rules enable row level security;
alter table public.customer_loyalty_rank_rules force row level security;
alter table public.customer_loyalty_achievement_rules enable row level security;
alter table public.customer_loyalty_achievement_rules force row level security;
alter table public.customer_loyalty_achievements enable row level security;
alter table public.customer_loyalty_achievements force row level security;
alter table public.customer_loyalty_rank_badges enable row level security;
alter table public.customer_loyalty_rank_badges force row level security;
alter table public.customer_loyalty_walkin_windows enable row level security;
alter table public.customer_loyalty_walkin_windows force row level security;
alter table public.customer_loyalty_walkin_usages enable row level security;
alter table public.customer_loyalty_walkin_usages force row level security;

revoke all on table public.customer_loyalty_rank_rules,
  public.customer_loyalty_achievement_rules,
  public.customer_loyalty_achievements,
  public.customer_loyalty_rank_badges,
  public.customer_loyalty_walkin_windows,
  public.customer_loyalty_walkin_usages
from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_rank_rules,
  public.customer_loyalty_achievement_rules,
  public.customer_loyalty_achievements,
  public.customer_loyalty_rank_badges,
  public.customer_loyalty_walkin_windows,
  public.customer_loyalty_walkin_usages to service_role;

alter table public.customer_loyalty_awards
  drop constraint if exists customer_loyalty_awards_activation_milestone_check;
alter table public.customer_loyalty_awards
  add constraint customer_loyalty_awards_activation_milestone_check check (
    activation_milestone is null or activation_milestone in (
      'issued_and_paid','completed_and_paid','fully_paid','staff_adjustment',
      'referral_bonus','birthday_gift','eid_gift','voucher_redemption',
      'double_points','fixed_bonus','welcome_bonus','off_peak_bonus',
      'achievement_bonus','achievement_reversal','achievement_reinstatement'
    )
  );

alter table public.customer_loyalty_bonus_campaigns
  drop constraint if exists customer_loyalty_bonus_campaigns_audience_tiers_check;
alter table public.customer_loyalty_bonus_campaigns
  add constraint customer_loyalty_bonus_campaigns_audience_tiers_check check (
    cardinality(audience_tiers) between 1 and 7
    and audience_tiers <@ array['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite']::text[]
  );

update public.customer_loyalty_bonus_campaigns
set audience_tiers = array['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite']::text[],
    updated_at = clock_timestamp()
where audience_tiers @> array['Bronze','Silver','Gold','Diamond']::text[];

update public.customer_loyalty_voucher_rewards
set is_active = false, updated_at = clock_timestamp()
where is_active;

insert into public.customer_loyalty_voucher_rewards (
  points_cost, value_pence, validity_months, display_order, is_active
) values
  (500,250,3,10,true),
  (1000,500,3,20,true),
  (2000,1000,3,30,true),
  (5000,2500,3,40,true),
  (8000,4000,3,50,true),
  (12000,6000,3,60,true),
  (18000,9000,3,70,true),
  (24000,12000,3,80,true)
on conflict(points_cost) do update set
  value_pence = excluded.value_pence,
  validity_months = excluded.validity_months,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = clock_timestamp();

alter table public.customer_loyalty_voucher_rewards
  drop constraint if exists customer_loyalty_voucher_rewards_minimum_exchange_rate;
alter table public.customer_loyalty_voucher_rewards
  add constraint customer_loyalty_voucher_rewards_minimum_exchange_rate check (
    not is_active or points_cost >= value_pence * 2
  );

create or replace function public.customer_loyalty_rank_for_points_v1(p_points integer)
returns public.customer_loyalty_rank_rules
language sql
stable
security invoker
set search_path = ''
as $$
  select rank.*
  from public.customer_loyalty_rank_rules rank
  where rank.is_active and greatest(coalesce(p_points, 0), 0) >= rank.minimum_points
    and (rank.maximum_points is null or greatest(coalesce(p_points, 0), 0) <= rank.maximum_points)
  order by rank.display_order desc
  limit 1;
$$;

create or replace function public.customer_loyalty_reconcile_member_progress_v1(
  p_mobile_user_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  transaction_count_value integer;
  rank_points_value integer;
  rank_row public.customer_loyalty_rank_rules%rowtype;
  rule_row public.customer_loyalty_achievement_rules%rowtype;
  achievement_row public.customer_loyalty_achievements%rowtype;
  next_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('loyalty:progress:' || p_mobile_user_id::text, 0));

  select count(distinct award.source_reference)::integer into transaction_count_value
  from public.customer_loyalty_awards award
  where award.mobile_user_id = p_mobile_user_id
    and award.state = 'available'
    and award.points > 0
    and award.source_type in ('ticket','service','package')
    and award.activation_milestone in ('issued_and_paid','completed_and_paid','fully_paid');

  select coalesce(sum(award.points) filter (
    where award.state = 'available'
      and award.activation_milestone is distinct from 'voucher_redemption'
  ), 0)::integer into rank_points_value
  from public.customer_loyalty_awards award
  where award.mobile_user_id = p_mobile_user_id;

  select * into rank_row
  from public.customer_loyalty_rank_for_points_v1(rank_points_value);
  if found then
    insert into public.customer_loyalty_rank_badges(mobile_user_id, rank_key, first_reached_at)
    select p_mobile_user_id, rank.rank_key, p_as_of
    from public.customer_loyalty_rank_rules rank
    where rank.is_active and rank.minimum_points <= greatest(rank_points_value, 0)
    on conflict(mobile_user_id, rank_key) do nothing;
  end if;

  for rule_row in
    select * from public.customer_loyalty_achievement_rules where is_active order by display_order
  loop
    select * into achievement_row
    from public.customer_loyalty_achievements
    where mobile_user_id = p_mobile_user_id and achievement_key = rule_row.achievement_key
    for update;

    if transaction_count_value >= rule_row.required_transactions then
      if not found then
        insert into public.customer_loyalty_achievements(
          mobile_user_id, achievement_key, status, award_version, earned_at, updated_at
        ) values (p_mobile_user_id, rule_row.achievement_key, 'earned', 1, p_as_of, p_as_of)
        returning * into achievement_row;
        insert into public.customer_loyalty_awards(
          mobile_user_id, source_type, source_reference, description, points,
          state, activation_milestone, activated_at
        ) values (
          p_mobile_user_id, 'adjustment',
          'achievement:' || rule_row.achievement_key || ':1',
          rule_row.name || ' achievement', rule_row.bonus_points,
          'available', 'achievement_bonus', p_as_of
        );
      elsif achievement_row.status = 'suspended' then
        next_version := achievement_row.award_version + 1;
        update public.customer_loyalty_achievements
        set status = 'earned', award_version = next_version, suspended_at = null,
            updated_at = p_as_of
        where id = achievement_row.id;
        insert into public.customer_loyalty_awards(
          mobile_user_id, source_type, source_reference, description, points,
          state, activation_milestone, activated_at
        ) values (
          p_mobile_user_id, 'adjustment',
          'achievement:' || rule_row.achievement_key || ':' || next_version::text,
          rule_row.name || ' achievement reinstated', rule_row.bonus_points,
          'available', 'achievement_reinstatement', p_as_of
        );
      end if;
    elsif found and achievement_row.status = 'earned' then
      next_version := achievement_row.award_version + 1;
      update public.customer_loyalty_achievements
      set status = 'suspended', award_version = next_version,
          suspended_at = p_as_of, updated_at = p_as_of
      where id = achievement_row.id;
      insert into public.customer_loyalty_awards(
        mobile_user_id, source_type, source_reference, description, points,
        state, activation_milestone, activated_at
      ) values (
        p_mobile_user_id, 'adjustment',
        'achievement-reversal:' || rule_row.achievement_key || ':' || next_version::text,
        rule_row.name || ' achievement suspended', -rule_row.bonus_points,
        'available', 'achievement_reversal', p_as_of
      );
    end if;
  end loop;

  return jsonb_build_object(
    'transactionCount', transaction_count_value,
    'rankPoints', greatest(rank_points_value, 0),
    'rankKey', rank_row.rank_key
  );
end;
$$;

create or replace function public.customer_loyalty_progress_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(new.source_type, old.source_type) in ('ticket','service','package') then
    perform public.customer_loyalty_reconcile_member_progress_v1(
      coalesce(new.mobile_user_id, old.mobile_user_id), clock_timestamp()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists customer_loyalty_progress_after_award on public.customer_loyalty_awards;
create trigger customer_loyalty_progress_after_award
after insert or update of state on public.customer_loyalty_awards
for each row execute function public.customer_loyalty_progress_trigger_v1();

create or replace function public.customer_loyalty_consume_walkin_v1(
  p_mobile_user_id uuid,
  p_location_id uuid,
  p_service_type text,
  p_actor_employee_id uuid,
  p_idempotency_key uuid,
  p_used_at timestamptz default clock_timestamp(),
  p_is_override boolean default false,
  p_override_reason text default null,
  p_consume_allowance boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  usage_row public.customer_loyalty_walkin_usages%rowtype;
  rank_points_value integer;
  rank_row public.customer_loyalty_rank_rules%rowtype;
  programme_year_value integer := extract(year from p_used_at at time zone 'Europe/London')::integer;
  used_value integer;
  local_time timestamp := p_used_at at time zone 'Europe/London';
begin
  perform pg_advisory_xact_lock(hashtextextended('loyalty:walkin:' || p_mobile_user_id::text || ':' || programme_year_value::text, 0));
  select * into usage_row from public.customer_loyalty_walkin_usages
  where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(usage_row) || jsonb_build_object('idempotentReplay', true); end if;

  if p_service_type not in ('nadra','passport') then
    raise exception 'Walk-in service is not eligible' using errcode = '22023', hint = 'LOYALTY_WALKIN_SERVICE_INELIGIBLE';
  end if;
  if p_is_override and length(btrim(coalesce(p_override_reason, ''))) not between 5 and 300 then
    raise exception 'An override reason is required' using errcode = '22023', hint = 'LOYALTY_WALKIN_OVERRIDE_REASON_REQUIRED';
  end if;
  if not p_is_override and not exists (
    select 1 from public.customer_loyalty_walkin_windows window
    where window.location_id = p_location_id and window.service_type = p_service_type
      and window.is_active
      and window.iso_weekday = extract(isodow from local_time)::integer
      and local_time::time >= window.starts_at and local_time::time < window.ends_at
  ) then
    raise exception 'Walk-in access is not available at this branch and time'
      using errcode = '22023', hint = 'LOYALTY_WALKIN_WINDOW_CLOSED';
  end if;

  select coalesce(sum(points) filter (
    where state = 'available' and activation_milestone is distinct from 'voucher_redemption'
  ), 0)::integer into rank_points_value
  from public.customer_loyalty_awards where mobile_user_id = p_mobile_user_id;
  select * into rank_row from public.customer_loyalty_rank_for_points_v1(rank_points_value);
  if not found or (rank_row.walk_in_allowance = 0 and not p_is_override) then
    raise exception 'Customer rank does not include walk-in access'
      using errcode = '22023', hint = 'LOYALTY_WALKIN_NOT_ENTITLED';
  end if;

  select count(*)::integer into used_value
  from public.customer_loyalty_walkin_usages
  where mobile_user_id = p_mobile_user_id and programme_year = programme_year_value
    and consumes_allowance;
  if p_consume_allowance and not p_is_override and used_value >= rank_row.walk_in_allowance then
    raise exception 'Customer walk-in allowance has been used'
      using errcode = '22023', hint = 'LOYALTY_WALKIN_ALLOWANCE_EXHAUSTED';
  end if;

  insert into public.customer_loyalty_walkin_usages(
    mobile_user_id, location_id, service_type, actor_employee_id, idempotency_key,
    programme_year, rank_key, consumes_allowance, is_override, override_reason, used_at
  ) values (
    p_mobile_user_id, p_location_id, p_service_type, p_actor_employee_id, p_idempotency_key,
    programme_year_value, rank_row.rank_key, p_consume_allowance, p_is_override,
    case when p_is_override then btrim(p_override_reason) else null end, p_used_at
  ) returning * into usage_row;

  return to_jsonb(usage_row) || jsonb_build_object(
    'idempotentReplay', false,
    'allowance', rank_row.walk_in_allowance,
    'used', used_value + case when p_consume_allowance then 1 else 0 end,
    'remaining', greatest(rank_row.walk_in_allowance - used_value - case when p_consume_allowance then 1 else 0 end, 0)
  );
end;
$$;

create or replace function public.pos_post_transaction_v7(
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
  voucher_code_value text := nullif(upper(btrim(p_request ->> 'voucherCode')), '');
  category_key_value text;
  voucher_value integer;
begin
  if voucher_code_value is not null then
    select category.category_key into category_key_value
    from public.pos_catalogue_items item
    join public.pos_categories category on category.id = item.category_id
    where item.item_key = p_request ->> 'catalogueKey';
    if category_key_value = 'remittance' then
      select value_pence into voucher_value
      from public.customer_loyalty_vouchers where voucher_code = voucher_code_value;
      if voucher_value > 500 then
        raise exception 'Remittance transactions accept vouchers up to GBP 5.00'
          using errcode = '22023', hint = 'POS_REMITTANCE_VOUCHER_LIMIT';
      end if;
    end if;
  end if;
  return public.pos_post_transaction_v6(p_actor_employee_id, p_idempotency_key, p_request);
end;
$$;

create or replace function public.customer_loyalty_manage_program_v4(
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
  result_value jsonb;
  existing_rank public.customer_loyalty_rank_rules%rowtype;
  window_id_value uuid;
begin
  if p_action = 'UPDATE_RANK' then
    select * into existing_rank from public.customer_loyalty_rank_rules
    where rank_key = p_request ->> 'rankKey' for update;
    if not found then raise exception 'loyalty rank not found'; end if;
    if (
      existing_rank.minimum_points is distinct from (p_request ->> 'minimumPoints')::integer
      or existing_rank.maximum_points is distinct from nullif(p_request ->> 'maximumPoints', '')::integer
    ) and coalesce((p_request ->> 'confirmCustomerImpact')::boolean, false) = false then
      raise exception 'confirm customer impact before changing rank thresholds';
    end if;
    update public.customer_loyalty_rank_rules set
      minimum_points = (p_request ->> 'minimumPoints')::integer,
      maximum_points = nullif(p_request ->> 'maximumPoints', '')::integer,
      maintenance_points = (p_request ->> 'maintenancePoints')::integer,
      walk_in_allowance = (p_request ->> 'walkInAllowance')::integer,
      callback_priority = (p_request ->> 'callbackPriority')::integer,
      waitlist_priority = (p_request ->> 'waitlistPriority')::integer,
      perks = array(select jsonb_array_elements_text(p_request -> 'perks')),
      updated_at = clock_timestamp()
    where rank_key = existing_rank.rank_key
    returning to_jsonb(customer_loyalty_rank_rules.*) into result_value;
    if exists (
      select 1 from (
        select rank.*, lag(maximum_points) over(order by display_order) previous_maximum
        from public.customer_loyalty_rank_rules rank where is_active
      ) ordered
      where (previous_maximum is null and display_order <> 10)
        or (previous_maximum is not null and minimum_points <> previous_maximum + 1)
    ) then raise exception 'active loyalty ranks must be continuous and non-overlapping'; end if;
  elsif p_action = 'UPDATE_ACHIEVEMENT' then
    update public.customer_loyalty_achievement_rules set
      name = btrim(p_request ->> 'name'),
      description = btrim(p_request ->> 'description'),
      required_transactions = (p_request ->> 'requiredTransactions')::integer,
      bonus_points = (p_request ->> 'bonusPoints')::integer,
      is_active = coalesce((p_request ->> 'isActive')::boolean, true),
      updated_at = clock_timestamp()
    where achievement_key = p_request ->> 'achievementKey'
    returning to_jsonb(customer_loyalty_achievement_rules.*) into result_value;
    if result_value is null then raise exception 'loyalty achievement not found'; end if;
  elsif p_action = 'UPSERT_WALKIN_WINDOW' then
    window_id_value := nullif(p_request ->> 'id', '')::uuid;
    insert into public.customer_loyalty_walkin_windows(
      id, location_id, service_type, iso_weekday, starts_at, ends_at, is_active
    ) values (
      coalesce(window_id_value, gen_random_uuid()), (p_request ->> 'locationId')::uuid,
      p_request ->> 'serviceType', (p_request ->> 'isoWeekday')::smallint,
      (p_request ->> 'startsAt')::time, (p_request ->> 'endsAt')::time,
      coalesce((p_request ->> 'isActive')::boolean, true)
    ) on conflict(id) do update set
      location_id = excluded.location_id, service_type = excluded.service_type,
      iso_weekday = excluded.iso_weekday, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, is_active = excluded.is_active,
      updated_at = clock_timestamp()
    returning to_jsonb(customer_loyalty_walkin_windows.*) into result_value;
  elsif p_action = 'DELETE_WALKIN_WINDOW' then
    update public.customer_loyalty_walkin_windows set is_active = false, updated_at = clock_timestamp()
    where id = (p_request ->> 'id')::uuid
    returning to_jsonb(customer_loyalty_walkin_windows.*) into result_value;
  else
    return public.customer_loyalty_manage_program_v3(p_actor_employee_id, p_action, p_request);
  end if;

  insert into public.customer_loyalty_program_audit_events(
    actor_employee_id, entity_type, entity_id, action, after_value
  ) values (
    p_actor_employee_id, lower(split_part(p_action, '_', 2)),
    coalesce(p_request ->> 'rankKey', p_request ->> 'achievementKey', p_request ->> 'id', 'new'),
    p_action, result_value
  );
  return result_value;
end;
$$;

do $$
declare member_id uuid;
begin
  for member_id in select id from public.mobile_users where customer_code is not null loop
    perform public.customer_loyalty_reconcile_member_progress_v1(member_id, clock_timestamp());
  end loop;
end;
$$;

-- Upgrade the already-deployed campaign functions without copying their long,
-- security-sensitive bodies. Fail closed if the known prior definition has
-- drifted, so no deployment can silently retain the four-tier calculation.
do $$
declare definition text; upgraded text;
begin
  definition := pg_get_functiondef('public.customer_loyalty_apply_sale_campaigns_v1(text,text,text,uuid,bigint,timestamptz)'::regprocedure);
  upgraded := replace(definition,
    'select coalesce(sum(points), 0) into member_balance' || chr(10) ||
    '  from public.customer_loyalty_awards' || chr(10) ||
    '  where mobile_user_id = link_row.mobile_user_id and state = ''available'';' || chr(10) ||
    '  member_tier := case' || chr(10) ||
    '    when member_balance >= 10001 then ''Diamond''' || chr(10) ||
    '    when member_balance >= 5001 then ''Gold''' || chr(10) ||
    '    when member_balance >= 1001 then ''Silver''' || chr(10) ||
    '    else ''Bronze''' || chr(10) ||
    '  end;',
    'select coalesce(sum(points) filter (where activation_milestone is distinct from ''voucher_redemption''), 0) into member_balance' || chr(10) ||
    '  from public.customer_loyalty_awards' || chr(10) ||
    '  where mobile_user_id = link_row.mobile_user_id and state = ''available'';' || chr(10) ||
    '  select rank.name into member_tier from public.customer_loyalty_rank_for_points_v1(member_balance::integer) rank;');
  if upgraded = definition then raise exception 'sale campaign rank hook definition has drifted'; end if;
  execute upgraded;

  definition := pg_get_functiondef('public.customer_loyalty_run_scheduled_bonus_v1(timestamptz)'::regprocedure);
  upgraded := replace(definition,
    'case' || chr(10) ||
    '            when balance.available_points >= 10001 then ''Diamond''' || chr(10) ||
    '            when balance.available_points >= 5001 then ''Gold''' || chr(10) ||
    '            when balance.available_points >= 1001 then ''Silver''' || chr(10) ||
    '            else ''Bronze''' || chr(10) ||
    '          end',
    '(select rank.name from public.customer_loyalty_rank_for_points_v1(balance.rank_points::integer) rank)');
  if upgraded = definition then raise exception 'scheduled campaign rank hook definition has drifted'; end if;
  execute upgraded;
end;
$$;

revoke all on function public.customer_loyalty_rank_for_points_v1(integer) from public, anon, authenticated;
revoke all on function public.customer_loyalty_reconcile_member_progress_v1(uuid,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_consume_walkin_v1(uuid,uuid,text,uuid,uuid,timestamptz,boolean,text,boolean) from public, anon, authenticated;
revoke all on function public.pos_post_transaction_v6(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_post_transaction_v7(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_manage_program_v3(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.customer_loyalty_manage_program_v4(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.customer_loyalty_rank_for_points_v1(integer) to service_role;
grant execute on function public.customer_loyalty_consume_walkin_v1(uuid,uuid,text,uuid,uuid,timestamptz,boolean,text,boolean) to service_role;
grant execute on function public.pos_post_transaction_v7(uuid,text,jsonb) to service_role;
grant execute on function public.customer_loyalty_manage_program_v4(uuid,text,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
