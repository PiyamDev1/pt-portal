-- Convert pay_basis, hourly_source, and salary_currency from enum types to plain TEXT.
-- Required when these columns exist on the employees table as USER-DEFINED (enum) types,
-- which prevents writing standard text values like 'salaried' / 'hourly'.
-- Safe to run multiple times.

DO $$
DECLARE
  col_type TEXT;
BEGIN
  -- ── pay_basis ────────────────────────────────────────────────────────────────
  SELECT data_type
  INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'employees'
    AND column_name  = 'pay_basis';

  IF col_type = 'USER-DEFINED' THEN
    -- Drop dependent CHECK constraint first if it exists.
    ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_pay_basis_check;
    -- Cast enum to TEXT. All existing values are preserved.
    ALTER TABLE public.employees ALTER COLUMN pay_basis TYPE TEXT USING pay_basis::TEXT;
    RAISE NOTICE 'pay_basis converted from enum to TEXT';
  ELSE
    RAISE NOTICE 'pay_basis is already %, no conversion needed', col_type;
  END IF;

  -- ── hourly_source ─────────────────────────────────────────────────────────────
  SELECT data_type
  INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'employees'
    AND column_name  = 'hourly_source';

  IF col_type = 'USER-DEFINED' THEN
    ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_hourly_source_check;
    ALTER TABLE public.employees ALTER COLUMN hourly_source TYPE TEXT USING hourly_source::TEXT;
    RAISE NOTICE 'hourly_source converted from enum to TEXT';
  ELSE
    RAISE NOTICE 'hourly_source is already %, no conversion needed', col_type;
  END IF;

  -- ── salary_currency ───────────────────────────────────────────────────────────
  SELECT data_type
  INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'employees'
    AND column_name  = 'salary_currency';

  IF col_type = 'USER-DEFINED' THEN
    ALTER TABLE public.employees ALTER COLUMN salary_currency TYPE TEXT USING salary_currency::TEXT;
    RAISE NOTICE 'salary_currency converted from enum to TEXT';
  ELSE
    RAISE NOTICE 'salary_currency is already %, no conversion needed', col_type;
  END IF;
END $$;

-- Re-apply defaults and CHECK constraints now that columns are plain TEXT.

ALTER TABLE public.employees
  ALTER COLUMN pay_basis      SET DEFAULT 'salaried',
  ALTER COLUMN salary_currency SET DEFAULT 'GBP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_pay_basis_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_pay_basis_check
      CHECK (pay_basis IS NULL OR pay_basis IN ('salaried', 'hourly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_hourly_source_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_hourly_source_check
      CHECK (hourly_source IS NULL OR hourly_source IN ('contracted', 'timeclock'));
  END IF;
END $$;

-- Backfill any NULL pay_basis rows to the default.
UPDATE public.employees
SET pay_basis = 'salaried'
WHERE pay_basis IS NULL OR btrim(pay_basis) = '';

-- Backfill any NULL salary_currency rows.
UPDATE public.employees
SET salary_currency = 'GBP'
WHERE salary_currency IS NULL OR btrim(salary_currency) = '';
