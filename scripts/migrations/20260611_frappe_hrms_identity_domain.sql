-- 20260611_frappe_hrms_identity_domain.sql
-- Ensure the Frappe HRMS integration uses the same identity-map domain as the sync engine.

insert into public.integration_identity_map (
  domain,
  supabase_employee_id,
  frappe_employee_id,
  frappe_user_id
)
select
  'hrms' as domain,
  e.id as supabase_employee_id,
  null::text as frappe_employee_id,
  null::text as frappe_user_id
from public.employees e
on conflict (domain, supabase_employee_id) do nothing;
