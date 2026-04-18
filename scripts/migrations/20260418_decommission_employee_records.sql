-- Decommission Employee Records module and related schema.
-- WARNING: This is destructive and removes Employee Record data structures.

BEGIN;

-- Remove Employee Record tables.
DROP TABLE IF EXISTS public.employee_company_holiday_assignments CASCADE;
DROP TABLE IF EXISTS public.company_calendar_events CASCADE;
DROP TABLE IF EXISTS public.company_holiday_calendar CASCADE;
DROP TABLE IF EXISTS public.employee_policy_overrides CASCADE;
DROP TABLE IF EXISTS public.contract_policies CASCADE;
DROP TABLE IF EXISTS public.employee_documents CASCADE;

-- Remove constraints added for Employee Record payroll/schedule fields.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_pay_basis_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_hourly_source_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_work_time_range_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_national_insurance_number_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_company_lunch_break_minutes_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_work_pattern_check;

-- Remove Employee Record columns from employees table.
ALTER TABLE public.employees
  DROP COLUMN IF EXISTS pay_basis,
  DROP COLUMN IF EXISTS hourly_source,
  DROP COLUMN IF EXISTS hourly_rate,
  DROP COLUMN IF EXISTS annual_salary,
  DROP COLUMN IF EXISTS working_hours_per_week,
  DROP COLUMN IF EXISTS salary_currency,
  DROP COLUMN IF EXISTS payroll_effective_from,
  DROP COLUMN IF EXISTS employment_type,
  DROP COLUMN IF EXISTS employment_start_date,
  DROP COLUMN IF EXISTS employment_end_date,
  DROP COLUMN IF EXISTS work_start_time,
  DROP COLUMN IF EXISTS work_end_time,
  DROP COLUMN IF EXISTS national_insurance_number,
  DROP COLUMN IF EXISTS payroll_notes,
  DROP COLUMN IF EXISTS work_schedule,
  DROP COLUMN IF EXISTS statutory_break_paid,
  DROP COLUMN IF EXISTS company_lunch_break_minutes,
  DROP COLUMN IF EXISTS company_lunch_break_paid,
  DROP COLUMN IF EXISTS work_pattern;

COMMIT;
