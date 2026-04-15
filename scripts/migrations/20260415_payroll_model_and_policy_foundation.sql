-- Payroll model and policy foundation
-- Safe to run multiple times.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pay_basis TEXT,
  ADD COLUMN IF NOT EXISTS hourly_source TEXT,
  ADD COLUMN IF NOT EXISTS salary_currency TEXT,
  ADD COLUMN IF NOT EXISTS payroll_effective_from DATE;

DO $$
DECLARE
  pay_basis_data_type TEXT;
  pay_basis_udt_schema TEXT;
  pay_basis_udt_name TEXT;
  pay_basis_fill TEXT := 'salaried';
  salary_currency_data_type TEXT;
  salary_currency_udt_schema TEXT;
  salary_currency_udt_name TEXT;
  salary_currency_fill TEXT := 'GBP';
BEGIN
  SELECT data_type, udt_schema, udt_name
  INTO pay_basis_data_type, pay_basis_udt_schema, pay_basis_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'employees'
    AND column_name = 'pay_basis';

  IF pay_basis_data_type = 'USER-DEFINED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = pay_basis_udt_schema
        AND t.typname = pay_basis_udt_name
        AND e.enumlabel = 'salaried'
    ) THEN
      SELECT e.enumlabel
      INTO pay_basis_fill
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = pay_basis_udt_schema
        AND t.typname = pay_basis_udt_name
      ORDER BY e.enumsortorder
      LIMIT 1;
    END IF;

    IF pay_basis_fill IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.employees SET pay_basis = %L::%I.%I WHERE pay_basis IS NULL OR btrim(pay_basis::text) = ''''',
        pay_basis_fill,
        pay_basis_udt_schema,
        pay_basis_udt_name
      );
      EXECUTE format(
        'ALTER TABLE public.employees ALTER COLUMN pay_basis SET DEFAULT %L::%I.%I',
        pay_basis_fill,
        pay_basis_udt_schema,
        pay_basis_udt_name
      );
    END IF;
  ELSE
    UPDATE public.employees
    SET pay_basis = 'salaried'
    WHERE pay_basis IS NULL OR btrim(pay_basis::text) = '';

    ALTER TABLE public.employees
      ALTER COLUMN pay_basis SET DEFAULT 'salaried';
  END IF;

  SELECT data_type, udt_schema, udt_name
  INTO salary_currency_data_type, salary_currency_udt_schema, salary_currency_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'employees'
    AND column_name = 'salary_currency';

  IF salary_currency_data_type = 'USER-DEFINED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = salary_currency_udt_schema
        AND t.typname = salary_currency_udt_name
        AND e.enumlabel = 'GBP'
    ) THEN
      SELECT e.enumlabel
      INTO salary_currency_fill
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = salary_currency_udt_schema
        AND t.typname = salary_currency_udt_name
      ORDER BY e.enumsortorder
      LIMIT 1;
    END IF;

    IF salary_currency_fill IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.employees SET salary_currency = %L::%I.%I WHERE salary_currency IS NULL OR btrim(salary_currency::text) = ''''',
        salary_currency_fill,
        salary_currency_udt_schema,
        salary_currency_udt_name
      );
      EXECUTE format(
        'ALTER TABLE public.employees ALTER COLUMN salary_currency SET DEFAULT %L::%I.%I',
        salary_currency_fill,
        salary_currency_udt_schema,
        salary_currency_udt_name
      );
    END IF;
  ELSE
    UPDATE public.employees
    SET salary_currency = 'GBP'
    WHERE salary_currency IS NULL OR btrim(salary_currency::text) = '';

    ALTER TABLE public.employees
      ALTER COLUMN salary_currency SET DEFAULT 'GBP';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_pay_basis_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.employees
      WHERE pay_basis IS NOT NULL
        AND pay_basis::text NOT IN ('salaried', 'hourly')
    ) THEN
      ALTER TABLE public.employees
        ADD CONSTRAINT employees_pay_basis_check
        CHECK (pay_basis IS NULL OR pay_basis::text IN ('salaried', 'hourly'));
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_hourly_source_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.employees
      WHERE hourly_source IS NOT NULL
        AND hourly_source::text NOT IN ('contracted', 'timeclock')
    ) THEN
      ALTER TABLE public.employees
        ADD CONSTRAINT employees_hourly_source_check
        CHECK (hourly_source IS NULL OR hourly_source::text IN ('contracted', 'timeclock'));
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.contract_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type TEXT NOT NULL UNIQUE,
  sick_pay_mode TEXT NOT NULL DEFAULT 'statutory',
  ssp_eligibility_default TEXT,
  ssp_weekly_rate_default NUMERIC(8,2),
  paid_break_minutes_per_shift INTEGER NOT NULL DEFAULT 0,
  holiday_entitlement_days NUMERIC(6,2) NOT NULL DEFAULT 28,
  bank_holidays_included BOOLEAN NOT NULL DEFAULT TRUE,
  pension_status_default TEXT,
  pension_provider_name_default TEXT,
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
  ssp_eligibility TEXT,
  ssp_weekly_rate NUMERIC(8,2),
  paid_break_minutes_per_shift INTEGER,
  holiday_entitlement_days NUMERIC(6,2),
  bank_holidays_included BOOLEAN,
  pension_status TEXT,
  pension_provider_name TEXT,
  pension_enrolment_date DATE,
  overtime_mode TEXT,
  overtime_threshold_hours NUMERIC(6,2),
  overtime_rate_multiplier NUMERIC(6,2),
  effective_from DATE,
  notes TEXT,
  policy_source TEXT,
  policy_contract_type TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contract_policies
  ADD COLUMN IF NOT EXISTS ssp_eligibility_default TEXT,
  ADD COLUMN IF NOT EXISTS ssp_weekly_rate_default NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS pension_status_default TEXT,
  ADD COLUMN IF NOT EXISTS pension_provider_name_default TEXT;

ALTER TABLE public.employee_policy_overrides
  ADD COLUMN IF NOT EXISTS ssp_eligibility TEXT,
  ADD COLUMN IF NOT EXISTS ssp_weekly_rate NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS pension_status TEXT,
  ADD COLUMN IF NOT EXISTS pension_provider_name TEXT,
  ADD COLUMN IF NOT EXISTS pension_enrolment_date DATE,
  ADD COLUMN IF NOT EXISTS policy_source TEXT,
  ADD COLUMN IF NOT EXISTS policy_contract_type TEXT;

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
    WHERE conname = 'contract_policies_ssp_eligibility_default_check'
      AND conrelid = 'public.contract_policies'::regclass
  ) THEN
    ALTER TABLE public.contract_policies
      ADD CONSTRAINT contract_policies_ssp_eligibility_default_check
      CHECK (ssp_eligibility_default IS NULL OR ssp_eligibility_default IN ('not-assessed', 'eligible', 'not-eligible'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_policies_pension_status_default_check'
      AND conrelid = 'public.contract_policies'::regclass
  ) THEN
    ALTER TABLE public.contract_policies
      ADD CONSTRAINT contract_policies_pension_status_default_check
      CHECK (pension_status_default IS NULL OR pension_status_default IN ('not-assessed', 'eligible', 'enrolled', 'opted-out', 'postponed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_policies_ssp_weekly_rate_default_check'
      AND conrelid = 'public.contract_policies'::regclass
  ) THEN
    ALTER TABLE public.contract_policies
      ADD CONSTRAINT contract_policies_ssp_weekly_rate_default_check
      CHECK (ssp_weekly_rate_default IS NULL OR ssp_weekly_rate_default >= 0);
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_ssp_eligibility_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_ssp_eligibility_check
      CHECK (ssp_eligibility IS NULL OR ssp_eligibility IN ('not-assessed', 'eligible', 'not-eligible'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_pension_status_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_pension_status_check
      CHECK (pension_status IS NULL OR pension_status IN ('not-assessed', 'eligible', 'enrolled', 'opted-out', 'postponed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_ssp_weekly_rate_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_ssp_weekly_rate_check
      CHECK (ssp_weekly_rate IS NULL OR ssp_weekly_rate >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_holiday_entitlement_min_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_holiday_entitlement_min_check
      CHECK (holiday_entitlement_days IS NULL OR holiday_entitlement_days >= 5.6);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_policy_overrides_policy_source_check'
      AND conrelid = 'public.employee_policy_overrides'::regclass
  ) THEN
    ALTER TABLE public.employee_policy_overrides
      ADD CONSTRAINT employee_policy_overrides_policy_source_check
      CHECK (policy_source IS NULL OR policy_source IN ('manual', 'uk-default'));
  END IF;
END $$;

INSERT INTO public.contract_policies (
  contract_type,
  sick_pay_mode,
  ssp_eligibility_default,
  paid_break_minutes_per_shift,
  holiday_entitlement_days,
  bank_holidays_included,
  pension_status_default,
  overtime_mode,
  overtime_threshold_hours,
  overtime_rate_multiplier
)
VALUES
  ('permanent', 'statutory', 'eligible', 0, 28, TRUE, 'eligible', 'none', NULL, 1.00),
  ('fixed-term', 'statutory', 'eligible', 0, 28, TRUE, 'eligible', 'none', NULL, 1.00),
  ('part-time', 'statutory', 'eligible', 0, 16.80, TRUE, 'eligible', 'none', NULL, 1.00),
  ('contractor', 'none', 'not-eligible', 0, 0, FALSE, 'not-assessed', 'none', NULL, 1.00)
ON CONFLICT (contract_type) DO NOTHING;

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
