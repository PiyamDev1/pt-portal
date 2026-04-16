-- Add persistent work schedule and break settings for HR Setup.
-- Safe to run multiple times.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS work_schedule JSONB,
  ADD COLUMN IF NOT EXISTS statutory_break_paid BOOLEAN,
  ADD COLUMN IF NOT EXISTS company_lunch_break_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS company_lunch_break_paid BOOLEAN;

UPDATE public.employees
SET statutory_break_paid = FALSE
WHERE statutory_break_paid IS NULL;

UPDATE public.employees
SET company_lunch_break_minutes = 30
WHERE company_lunch_break_minutes IS NULL;

UPDATE public.employees
SET company_lunch_break_paid = FALSE
WHERE company_lunch_break_paid IS NULL;

ALTER TABLE public.employees
  ALTER COLUMN statutory_break_paid SET DEFAULT FALSE,
  ALTER COLUMN company_lunch_break_minutes SET DEFAULT 30,
  ALTER COLUMN company_lunch_break_paid SET DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_company_lunch_break_minutes_check'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_company_lunch_break_minutes_check
      CHECK (
        company_lunch_break_minutes IS NULL
        OR (company_lunch_break_minutes >= 0 AND company_lunch_break_minutes <= 180)
      );
  END IF;
END $$;
