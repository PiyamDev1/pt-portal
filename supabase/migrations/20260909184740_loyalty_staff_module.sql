begin;

create table public.customer_loyalty_staff_adjustments (
  id uuid primary key default gen_random_uuid(),
  mobile_user_id uuid not null references public.mobile_users(id) on delete restrict,
  award_id uuid not null unique references public.customer_loyalty_awards(id) on delete restrict,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  idempotency_key uuid not null unique,
  points integer not null check (points between -100000 and 100000 and points <> 0),
  reason text not null check (length(btrim(reason)) between 5 and 300),
  created_at timestamptz not null default clock_timestamp()
);

create index customer_loyalty_staff_adjustments_member_time_idx
  on public.customer_loyalty_staff_adjustments(mobile_user_id, created_at desc);
create index customer_loyalty_staff_adjustments_actor_time_idx
  on public.customer_loyalty_staff_adjustments(actor_employee_id, created_at desc);

create view public.customer_loyalty_staff_member_summary
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
  max(award.created_at) as last_activity_at
from public.mobile_users member
left join public.mobile_users_profile_link profile_link on profile_link.mobile_user_id = member.id
left join public.applicants applicant on applicant.id = profile_link.applicant_id
left join public.customer_loyalty_awards award on award.mobile_user_id = member.id
where member.customer_code is not null
group by member.id, applicant.first_name, applicant.last_name;

create view public.customer_loyalty_staff_overview
with (security_invoker = true)
as
select
  count(distinct member.id) filter (where member.customer_code is not null)::integer as member_count,
  count(distinct member.id) filter (
    where member.customer_code is not null and member.external_customer_subject is not null
  )::integer as portal_linked_count,
  coalesce(sum(award.points) filter (where award.state = 'available'), 0)::integer
    as available_points,
  coalesce(sum(award.points) filter (where award.state = 'pending'), 0)::integer
    as pending_points,
  count(award.id) filter (where award.created_at >= clock_timestamp() - interval '30 days')::integer
    as entries_last_30_days
from public.mobile_users member
left join public.customer_loyalty_awards award on award.mobile_user_id = member.id;

create or replace function public.prevent_customer_loyalty_staff_adjustment_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'loyalty staff adjustments are immutable';
end;
$$;

create trigger customer_loyalty_staff_adjustments_immutable
before update or delete on public.customer_loyalty_staff_adjustments
for each row execute function public.prevent_customer_loyalty_staff_adjustment_mutation();

create or replace function public.customer_loyalty_staff_adjust_v1(
  p_actor_employee_id uuid,
  p_mobile_user_id uuid,
  p_points integer,
  p_reason text,
  p_idempotency_key uuid
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  existing_adjustment public.customer_loyalty_staff_adjustments%rowtype;
  member public.mobile_users%rowtype;
  award public.customer_loyalty_awards%rowtype;
  current_available integer;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  source_reference_value text := 'staff-adjustment.v1:' || p_idempotency_key::text;
begin
  if p_points is null or p_points = 0 or abs(p_points) > 100000 then
    raise exception 'loyalty adjustment points must be between -100000 and 100000 and cannot be zero';
  end if;
  if length(normalized_reason) not between 5 and 300 then
    raise exception 'loyalty adjustment reason must be between 5 and 300 characters';
  end if;
  if not exists (
    select 1
    from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = p_actor_employee_id
      and employee.is_active = true
      and lower(btrim(role.name)) in ('admin', 'master admin', 'super admin')
  ) then
    raise exception 'loyalty adjustment requires an active portal administrator';
  end if;

  -- Serialise retries before checking the immutable idempotency record.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select * into existing_adjustment
  from public.customer_loyalty_staff_adjustments
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_adjustment.mobile_user_id is distinct from p_mobile_user_id
      or existing_adjustment.actor_employee_id is distinct from p_actor_employee_id
      or existing_adjustment.points is distinct from p_points
      or existing_adjustment.reason is distinct from normalized_reason then
      raise exception 'loyalty adjustment idempotency key reused with different data';
    end if;
    select * into award from public.customer_loyalty_awards where id = existing_adjustment.award_id;
    return award;
  end if;

  select * into member
  from public.mobile_users
  where id = p_mobile_user_id
  for update;
  if not found then raise exception 'loyalty member not found'; end if;
  if member.customer_lifecycle_status <> 'active' then
    raise exception 'loyalty member is not active';
  end if;

  select coalesce(sum(points) filter (where state = 'available'), 0)::integer
  into current_available
  from public.customer_loyalty_awards
  where mobile_user_id = p_mobile_user_id;
  if p_points < 0 and current_available + p_points < 0 then
    raise exception 'loyalty adjustment cannot make the available balance negative';
  end if;

  insert into public.customer_loyalty_awards (
    mobile_user_id,
    source_type,
    source_reference,
    description,
    points,
    state,
    activation_milestone,
    activated_at
  ) values (
    p_mobile_user_id,
    'adjustment',
    source_reference_value,
    normalized_reason,
    p_points,
    'available',
    'staff_adjustment',
    clock_timestamp()
  ) returning * into award;

  insert into public.loyalty_points_ledger (
    mobile_user_id,
    transaction_type,
    points_change,
    reason,
    employee_id,
    customer_state,
    customer_source_reference,
    customer_activation_milestone
  ) values (
    p_mobile_user_id,
    'Adjusted',
    p_points,
    normalized_reason,
    p_actor_employee_id,
    'available',
    source_reference_value,
    'staff_adjustment'
  );

  insert into public.customer_loyalty_staff_adjustments (
    mobile_user_id,
    award_id,
    actor_employee_id,
    idempotency_key,
    points,
    reason
  ) values (
    p_mobile_user_id,
    award.id,
    p_actor_employee_id,
    p_idempotency_key,
    p_points,
    normalized_reason
  );
  return award;
end;
$$;

alter table public.customer_loyalty_staff_adjustments enable row level security;
revoke all on table public.customer_loyalty_staff_adjustments from public, anon, authenticated;
revoke all on table public.customer_loyalty_staff_adjustments from service_role;
grant select on table public.customer_loyalty_staff_adjustments to service_role;
revoke all on table public.customer_loyalty_staff_member_summary from public, anon, authenticated;
grant select on table public.customer_loyalty_staff_member_summary to service_role;
revoke all on table public.customer_loyalty_staff_overview from public, anon, authenticated;
grant select on table public.customer_loyalty_staff_overview to service_role;

revoke all on function public.prevent_customer_loyalty_staff_adjustment_mutation() from public, anon, authenticated;
revoke all on function public.customer_loyalty_staff_adjust_v1(uuid, uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.customer_loyalty_staff_adjust_v1(uuid, uuid, integer, text, uuid)
  to service_role;

commit;
