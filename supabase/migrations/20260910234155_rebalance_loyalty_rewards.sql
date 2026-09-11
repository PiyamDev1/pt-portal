begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:reward-economics:v1', 0));

-- Issued vouchers retain their immutable points/value snapshots. Only the
-- catalogue used for future issuance is rebalanced here.
update public.customer_loyalty_voucher_rewards
set is_active = false,
    updated_at = clock_timestamp()
where is_active = true
  and points_cost < value_pence * 3;

insert into public.customer_loyalty_voucher_rewards (
  points_cost, value_pence, validity_months, display_order, is_active
) values
  (1000, 250, 6, 10, true),
  (2000, 500, 6, 20, true),
  (4000, 1000, 6, 30, true),
  (8000, 2000, 6, 40, true),
  (20000, 5000, 6, 50, true),
  (40000, 12000, 6, 60, true)
on conflict(points_cost) do update set
  value_pence = excluded.value_pence,
  validity_months = excluded.validity_months,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = clock_timestamp();

alter table public.customer_loyalty_voucher_rewards
  drop constraint if exists customer_loyalty_voucher_rewards_minimum_exchange_rate;
alter table public.customer_loyalty_voucher_rewards
  add constraint customer_loyalty_voucher_rewards_minimum_exchange_rate check (
    not is_active or points_cost >= value_pence * 3
  ) not valid;
alter table public.customer_loyalty_voucher_rewards
  validate constraint customer_loyalty_voucher_rewards_minimum_exchange_rate;

notify pgrst, 'reload schema';
commit;
