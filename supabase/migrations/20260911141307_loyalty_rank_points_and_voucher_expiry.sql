begin;

-- Spendable points include issued voucher deductions. Rank points deliberately
-- exclude only those deductions, while refunds and audited negative adjustments
-- continue to affect rank progress.
create or replace view public.customer_loyalty_staff_member_summary
with (security_invoker = true)
as
select
  member.id,
  member.customer_code,
  member.email,
  member.phone_number,
  member.customer_lifecycle_status,
  member.external_customer_subject is not null as portal_linked,
  member.created_at as joined_at,
  nullif(btrim(concat_ws(' ', applicant.first_name, applicant.last_name)), '') as customer_name,
  lower(concat_ws(' ', member.customer_code, member.email, member.phone_number,
    applicant.first_name, applicant.last_name)) as search_text,
  coalesce(sum(award.points) filter (where award.state = 'available'), 0)::integer
    as available_points,
  coalesce(sum(award.points) filter (where award.state = 'pending'), 0)::integer
    as pending_points,
  coalesce(sum(award.points) filter (where award.points > 0), 0)::integer
    as lifetime_points,
  count(award.id)::integer as entry_count,
  max(award.created_at) as last_activity_at,
  coalesce(sum(award.points) filter (
    where award.state = 'available'
      and award.activation_milestone is distinct from 'voucher_redemption'
  ), 0)::integer as rank_points
from public.mobile_users member
left join public.mobile_users_profile_link profile_link on profile_link.mobile_user_id = member.id
left join public.applicants applicant on applicant.id = profile_link.applicant_id
left join public.customer_loyalty_awards award on award.mobile_user_id = member.id
where member.customer_code is not null
group by member.id, applicant.first_name, applicant.last_name;

comment on column public.customer_loyalty_staff_member_summary.rank_points is
  'Available qualifying points used for rank; voucher issuance deductions are excluded.';

create or replace function public.customer_loyalty_expiry_summary_v1(
  p_mobile_user_id uuid,
  p_validity_months integer,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with spend as (
    select coalesce(abs(sum(points) filter (where points < 0)), 0)::integer as points
    from public.customer_loyalty_awards
    where mobile_user_id = p_mobile_user_id and state = 'available'
  ),
  earned as (
    select
      greatest(points, 0)::integer as points,
      coalesce(activated_at, created_at) + make_interval(months => p_validity_months) as expires_at,
      coalesce(sum(points) over (
        order by coalesce(activated_at, created_at), id
        rows between unbounded preceding and 1 preceding
      ), 0)::integer as prior_points
    from public.customer_loyalty_awards
    where mobile_user_id = p_mobile_user_id and state = 'available' and points > 0
  ),
  remaining as (
    select
      greatest(0, earned.points - greatest(0, spend.points - earned.prior_points))::integer as points,
      earned.expires_at
    from earned cross join spend
  ),
  next_expiry as (
    select min(expires_at) as expires_at
    from remaining
    where points > 0 and expires_at > p_as_of
  )
  select jsonb_build_object(
    'nextExpiryAt', next_expiry.expires_at,
    'expiringPoints', coalesce(sum(remaining.points) filter (
      where remaining.expires_at::date = next_expiry.expires_at::date
    ), 0)::integer
  )
  from next_expiry
  left join remaining on remaining.expires_at::date = next_expiry.expires_at::date
  group by next_expiry.expires_at;
$$;

revoke all on function public.customer_loyalty_expiry_summary_v1(uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.customer_loyalty_expiry_summary_v1(uuid,integer,timestamptz) to service_role;

commit;
