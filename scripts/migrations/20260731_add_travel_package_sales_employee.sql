-- Adds stable sales attribution for converted travel packages.
-- assigned_agent_id is the operational auth user; sales_employee_id is the staff record credited later.

ALTER TABLE public.travel_packages
  ADD COLUMN IF NOT EXISTS sales_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

UPDATE public.travel_packages packages
SET sales_employee_id = employees.id
FROM public.employees employees
WHERE packages.sales_employee_id IS NULL
  AND packages.assigned_agent_id = employees.id;

CREATE INDEX IF NOT EXISTS idx_travel_packages_sales_employee
  ON public.travel_packages (sales_employee_id, created_at DESC);
