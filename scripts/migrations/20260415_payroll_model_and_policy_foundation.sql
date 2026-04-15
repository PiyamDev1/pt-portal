-- Payroll model and policy foundation
-- Safe to run multiple times.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pay_basis TEXT,
  ADD COLUMN IF NOT EXISTS hourly_source TEXT,
  ADD COLUMN IF NOT EXISTS salary_currency TEXT,
  ADD COLUMN IF NOT EXISTS payroll_effective_from DATE;

UPDATE public.employees
SET pay_basis = COALESCE(NULLIF(pay_basis, ''), 'salaried')
WHERE pay_basis IS NULL OR btrim(pay_basis) = '';

UPDATE public.employees
SET salary_currency = COALESCE(NULLIF(salary_currency, ''), 'GBP')
WHERE salary_currency IS NULL OR btrim(salary_currency) = '';

ALTER TABLE public.employees
  ALTER COLUMN pay_basis SET DEFAULT 'salaried',
  ALTER COLUMN salary_currency SET DEFAULT 'GBP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_pay_basis_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_pay_basis_check
      CHECK (pay_basis IN ('salaried', 'hourly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_hourly_source_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_hourly_source_check
      CHECK (hourly_source IS NULL OR hourly_source IN ('contracted', 'timeclock'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.contract_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type TEXT NOT NULL UNIQUE,
  sick_pay_mode TEXT NOT NULL DEFAULT 'statutory',
  paid_break_minutes_per_shift INTEGER NOT NULL DEFAULT 0,
  holiday_entitlement_days NUMERIC(6,2) NOT NULL DEFAULT 28,
  bank_holidays_included BOOLEAN NOT NULL DEFAULT TRUE,
  overtime_mode TEXT NOT NULL DEFAULT 'none',
  overtime_threshold_hours NUMERIC(6,2),
  overtime_rate_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_policy_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sick_pay_mode TEXT,
  paid_break_minutes_per_shift INTEGER,
  holiday_entitlement_days NUMERIC(6,2),
  bank_holidays_included BOOLEAN,
  overtime_mode TEXT,
  overtime_threshold_hours NUMERIC(6,2),
  overtime_rate_multiplier NUMERIC(6,2),
  effective_from DATE,
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_policy_overrides_employee_id_uq
  ON public.employee_policy_overrides(employee_id);

CREATE INDEX IF NOT EXISTS employee_policy_overrides_effective_from_idx
  ON public.employee_policy_overrides(effective_from DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_policies_sick_pay_mode_check'
      AND conrelid = 'public.contract_policies'::regclass
  ) THEN
    ALTER TABLE public.contract_policies
      ADD CONSTRAINT contract_policies_sick_pay_mode_check
      CHECK (sick_pay_mode IN ('none', 'statutory', 'full'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_policies_overtime_mode_check'
      AND conrelid = 'public.contract_policies'::regclass
  ) THEN
    ALTER TABLE public.contract_policies
      ADD CONSTRAINT contract_policies_overtime_mode_check
      CHECK (overtime_mode IN ('none', 'flat', 'tiered'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_sick_pay_mode_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_sick_pay_mode_check
      CHECK (sick_pay_mode IS NULL OR sick_pay_mode IN ('none', 'statutory', 'full'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_overtime_mode_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_overtime_mode_check
      CHECK (overtime_mode IS NULL OR overtime_mode IN ('none', 'flat', 'tiered'));
  END IF;
END $$;

ALTER TABLE public.contract_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_policy_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_policies'
      AND policyname = 'Service role has full access to contract_policies'
  ) THEN
    CREATE POLICY "Service role has full access to contract_policies"
      ON public.contract_policies
      FOR ALL
      TO service_role
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_policy_overrides'
      AND policyname = 'Service role has full access to employee_policy_overrides'
  ) THEN
    CREATE POLICY "Service role has full access to employee_policy_overrides"
      ON public.employee_policy_overrides
      FOR ALL
      TO service_role
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END $$;
