begin;

select pg_advisory_xact_lock(hashtextextended('loyalty:rank:kryptonite:v1', 0));

update public.customer_loyalty_rank_rules
set
  name = 'Kryptonite',
  colour = '#16A34A',
  perks = array_replace(perks, 'Elite rank badge', 'Kryptonite rank badge'),
  updated_at = clock_timestamp()
where rank_key = 'elite';

alter table public.customer_loyalty_bonus_campaigns
  drop constraint if exists customer_loyalty_bonus_campaigns_audience_tiers_check;

update public.customer_loyalty_bonus_campaigns
set
  audience_tiers = array_replace(audience_tiers, 'Elite', 'Kryptonite'),
  updated_at = clock_timestamp()
where 'Elite' = any(audience_tiers);

alter table public.customer_loyalty_bonus_campaigns
  add constraint customer_loyalty_bonus_campaigns_audience_tiers_check check (
    cardinality(audience_tiers) between 1 and 7
    and audience_tiers <@ array[
      'Bronze','Silver','Gold','Platinum','Ruby','Diamond','Kryptonite'
    ]::text[]
  ) not valid;
alter table public.customer_loyalty_bonus_campaigns
  validate constraint customer_loyalty_bonus_campaigns_audience_tiers_check;

notify pgrst, 'reload schema';
commit;
