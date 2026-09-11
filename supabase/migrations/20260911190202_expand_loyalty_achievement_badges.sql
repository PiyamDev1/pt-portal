begin;

select pg_advisory_xact_lock(
  hashtextextended('loyalty:expand-achievement-badges:v1', 0)
);

do $$
begin
  if to_regclass('public.customer_loyalty_achievement_rules') is null then
    raise exception 'customer loyalty achievement rules are not installed'
      using hint = 'Apply 20260911151622_loyalty_seven_ranks_achievements_walkins.sql first.';
  end if;
  if to_regprocedure(
    'public.customer_loyalty_reconcile_member_progress_v1(uuid,timestamptz)'
  ) is null then
    raise exception 'customer loyalty achievement reconciliation is not installed'
      using hint = 'Apply 20260911151622_loyalty_seven_ranks_achievements_walkins.sql first.';
  end if;
end;
$$;

-- Move the original four rows out of the final display-order range first so
-- the batch upsert remains safe under the existing unique constraint.
update public.customer_loyalty_achievement_rules
set display_order = case achievement_key
  when 'first_ten' then 901
  when 'piyam_regular' then 902
  when 'loyalty_champion' then 903
  when 'century_member' then 904
end,
updated_at = clock_timestamp()
where achievement_key in (
  'first_ten', 'piyam_regular', 'loyalty_champion', 'century_member'
);

insert into public.customer_loyalty_achievement_rules (
  achievement_key,
  name,
  description,
  required_transactions,
  bonus_points,
  display_order,
  is_active,
  updated_at
) values
  ('first_step', 'First Step', 'Complete your first paid and valid loyalty transaction.', 1, 5, 10, true, clock_timestamp()),
  ('travel_explorer', 'Travel Explorer', 'Complete 3 paid and valid loyalty transactions.', 3, 5, 20, true, clock_timestamp()),
  ('high_five', 'High Five', 'Complete 5 paid and valid loyalty transactions.', 5, 10, 30, true, clock_timestamp()),
  ('first_ten', 'First Ten', 'Complete 10 paid and valid loyalty transactions.', 10, 50, 40, true, clock_timestamp()),
  ('taking_off', 'Taking Off', 'Complete 15 paid and valid loyalty transactions.', 15, 10, 50, true, clock_timestamp()),
  ('travel_trail', 'Travel Trail', 'Complete 20 paid and valid loyalty transactions.', 20, 15, 60, true, clock_timestamp()),
  ('piyam_regular', 'Piyam Regular', 'Complete 25 paid and valid loyalty transactions.', 25, 100, 70, true, clock_timestamp()),
  ('journey_builder', 'Journey Builder', 'Complete 35 paid and valid loyalty transactions.', 35, 25, 80, true, clock_timestamp()),
  ('loyalty_champion', 'Loyalty Champion', 'Complete 50 paid and valid loyalty transactions.', 50, 200, 90, true, clock_timestamp()),
  ('seasoned_traveller', 'Seasoned Traveller', 'Complete 65 paid and valid loyalty transactions.', 65, 40, 100, true, clock_timestamp()),
  ('frequent_flyer', 'Frequent Flyer', 'Complete 80 paid and valid loyalty transactions.', 80, 50, 110, true, clock_timestamp()),
  ('century_member', 'Century Member', 'Complete 100 paid and valid loyalty transactions.', 100, 400, 120, true, clock_timestamp()),
  ('route_runner', 'Route Runner', 'Complete 125 paid and valid loyalty transactions.', 125, 75, 130, true, clock_timestamp()),
  ('globe_hopper', 'Globe Hopper', 'Complete 150 paid and valid loyalty transactions.', 150, 100, 140, true, clock_timestamp()),
  ('passport_pro', 'Passport Pro', 'Complete 175 paid and valid loyalty transactions.', 175, 125, 150, true, clock_timestamp()),
  ('journey_master', 'Journey Master', 'Complete 200 paid and valid loyalty transactions.', 200, 150, 160, true, clock_timestamp()),
  ('silver_voyage', 'Silver Voyage', 'Complete 250 paid and valid loyalty transactions.', 250, 175, 170, true, clock_timestamp()),
  ('boarding_club', 'Boarding Club', 'Complete 300 paid and valid loyalty transactions.', 300, 200, 180, true, clock_timestamp()),
  ('horizon_seeker', 'Horizon Seeker', 'Complete 400 paid and valid loyalty transactions.', 400, 250, 190, true, clock_timestamp()),
  ('five_hundred', 'Five Hundred', 'Complete 500 paid and valid loyalty transactions.', 500, 300, 200, true, clock_timestamp()),
  ('atlas_adventurer', 'Atlas Adventurer', 'Complete 650 paid and valid loyalty transactions.', 650, 350, 210, true, clock_timestamp()),
  ('world_wanderer', 'World Wanderer', 'Complete 800 paid and valid loyalty transactions.', 800, 400, 220, true, clock_timestamp()),
  ('thousand_club', 'Thousand Club', 'Complete 1,000 paid and valid loyalty transactions.', 1000, 500, 230, true, clock_timestamp()),
  ('trailblazer', 'Trailblazer', 'Complete 1,250 paid and valid loyalty transactions.', 1250, 600, 240, true, clock_timestamp()),
  ('legacy_traveller', 'Legacy Traveller', 'Complete 1,500 paid and valid loyalty transactions.', 1500, 750, 250, true, clock_timestamp()),
  ('globe_guardian', 'Globe Guardian', 'Complete 1,750 paid and valid loyalty transactions.', 1750, 850, 260, true, clock_timestamp()),
  ('piyam_icon', 'Piyam Icon', 'Complete 2,000 paid and valid loyalty transactions.', 2000, 1000, 270, true, clock_timestamp()),
  ('royal_voyager', 'Royal Voyager', 'Complete 2,500 paid and valid loyalty transactions.', 2500, 1250, 280, true, clock_timestamp()),
  ('grand_explorer', 'Grand Explorer', 'Complete 3,000 paid and valid loyalty transactions.', 3000, 1500, 290, true, clock_timestamp()),
  ('lifetime_legend', 'Lifetime Legend', 'Complete 5,000 paid and valid loyalty transactions.', 5000, 2500, 300, true, clock_timestamp())
on conflict (achievement_key) do update
set name = excluded.name,
    description = excluded.description,
    required_transactions = excluded.required_transactions,
    bonus_points = excluded.bonus_points,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

do $$
declare
  installed_count integer;
begin
  select count(*) into installed_count
  from public.customer_loyalty_achievement_rules
  where achievement_key in (
    'first_step', 'travel_explorer', 'high_five', 'first_ten',
    'taking_off', 'travel_trail', 'piyam_regular', 'journey_builder',
    'loyalty_champion', 'seasoned_traveller', 'frequent_flyer',
    'century_member', 'route_runner', 'globe_hopper', 'passport_pro',
    'journey_master', 'silver_voyage', 'boarding_club', 'horizon_seeker',
    'five_hundred', 'atlas_adventurer', 'world_wanderer', 'thousand_club',
    'trailblazer', 'legacy_traveller', 'globe_guardian', 'piyam_icon',
    'royal_voyager', 'grand_explorer', 'lifetime_legend'
  );

  if installed_count <> 30 then
    raise exception 'expected 30 loyalty achievement badge rules, found %', installed_count;
  end if;
end;
$$;

-- Reconcile existing members so a completed milestone is never displayed as
-- locked until their next purchase. The reconciliation function is already
-- advisory-locked and idempotent per member and achievement.
do $$
declare
  member record;
begin
  for member in
    select distinct award.mobile_user_id
    from public.customer_loyalty_awards award
  loop
    perform public.customer_loyalty_reconcile_member_progress_v1(
      member.mobile_user_id,
      clock_timestamp()
    );
  end loop;
end;
$$;

commit;
