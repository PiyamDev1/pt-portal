-- Ensure staff can belong to one or more departments and seed the Applications department.

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_departments (
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, department_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.departments
    WHERE lower(name) = 'applications'
  ) THEN
    INSERT INTO public.departments (name) VALUES ('Applications');
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'department_id'
  ) THEN
    INSERT INTO public.employee_departments (employee_id, department_id)
    SELECT employees.id, employees.department_id
    FROM public.employees employees
    WHERE employees.department_id IS NOT NULL
    ON CONFLICT (employee_id, department_id) DO NOTHING;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_employee_departments_department
  ON public.employee_departments (department_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_departments_employee
  ON public.employee_departments (employee_id);
