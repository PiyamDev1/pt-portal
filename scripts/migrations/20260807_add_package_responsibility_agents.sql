-- Tracks which employee is responsible for each package function.
-- These are employee records, not auth user ids, so package responsibility can be used for
-- operational handover and future commission/reporting.

ALTER TABLE public.travel_packages
  ADD COLUMN IF NOT EXISTS sales_responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modify_responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.travel_packages'::regclass
      AND contype = 'f'
      AND ARRAY(
        SELECT attname
        FROM unnest(conkey) AS column_number
        JOIN pg_attribute
          ON pg_attribute.attrelid = 'public.travel_packages'::regclass
         AND pg_attribute.attnum = column_number
      ) = ARRAY['assigned_agent_id']
  LOOP
    EXECUTE 'ALTER TABLE public.travel_packages DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

UPDATE public.travel_packages packages
SET assigned_agent_id = packages.sales_employee_id
WHERE packages.assigned_agent_id IS NOT NULL
  AND packages.sales_employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.employees employees
    WHERE employees.id = packages.assigned_agent_id
  );

UPDATE public.travel_packages packages
SET assigned_agent_id = NULL
WHERE packages.assigned_agent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.employees employees
    WHERE employees.id = packages.assigned_agent_id
  );

ALTER TABLE public.travel_packages
  ADD CONSTRAINT travel_packages_assigned_agent_id_fkey
  FOREIGN KEY (assigned_agent_id) REFERENCES public.employees(id) ON DELETE SET NULL;

UPDATE public.travel_packages
SET sales_responsible_employee_id = sales_employee_id
WHERE sales_responsible_employee_id IS NULL
  AND sales_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_packages_sales_responsible_employee
  ON public.travel_packages (sales_responsible_employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_packages_booking_responsible_employee
  ON public.travel_packages (booking_responsible_employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_packages_modify_responsible_employee
  ON public.travel_packages (modify_responsible_employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_packages_service_responsible_employee
  ON public.travel_packages (service_responsible_employee_id, created_at DESC);
