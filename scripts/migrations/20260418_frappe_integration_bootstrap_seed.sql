-- 20260418_frappe_integration_bootstrap_seed.sql
-- Bootstrap seed for Frappe HR integration after foundation migration.
-- Safe to run multiple times.

-- 1) Seed default leave types.
insert into public.leave_types (
  name,
  code,
  is_paid,
  requires_approval,
  include_holidays,
  max_consecutive_days,
  default_annual_allocation
)
values
  ('Annual Leave', 'annual_leave', true, true, false, 21, 28.00),
  ('Sick Leave', 'sick_leave', true, true, true, 14, 10.00),
  ('Unpaid Leave', 'unpaid_leave', false, true, false, 30, 0.00),
  ('Compassionate Leave', 'compassionate_leave', true, true, true, 7, 5.00)
on conflict (code) do update set
  name = excluded.name,
  is_paid = excluded.is_paid,
  requires_approval = excluded.requires_approval,
  include_holidays = excluded.include_holidays,
  max_consecutive_days = excluded.max_consecutive_days,
  default_annual_allocation = excluded.default_annual_allocation,
  updated_at = now();

-- 2) Backfill integration identity map for all employees using a stable domain.
insert into public.integration_identity_map (
  domain,
  supabase_employee_id,
  frappe_employee_id,
  frappe_user_id
)
select
  'hr_core' as domain,
  e.id as supabase_employee_id,
  null::text as frappe_employee_id,
  null::text as frappe_user_id
from public.employees e
on conflict (domain, supabase_employee_id) do nothing;

-- 3) Seed annual leave balances for current year where missing.
insert into public.leave_balances (
  employee_id,
  leave_type_id,
  balance_year,
  allocated_days,
  used_days,
  pending_days
)
select
  e.id as employee_id,
  lt.id as leave_type_id,
  extract(year from now())::int as balance_year,
  coalesce(lt.default_annual_allocation, 0) as allocated_days,
  0 as used_days,
  0 as pending_days
from public.employees e
cross join public.leave_types lt
where not exists (
  select 1
  from public.leave_balances lb
  where lb.employee_id = e.id
    and lb.leave_type_id = lt.id
    and lb.balance_year = extract(year from now())::int
);
