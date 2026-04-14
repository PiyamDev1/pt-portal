-- Employee Record foundation: payroll fields + employee-scoped documents.
-- Safe to run multiple times.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS annual_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS working_hours_per_week NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS employment_start_date DATE,
  ADD COLUMN IF NOT EXISTS employment_end_date DATE,
  ADD COLUMN IF NOT EXISTS payroll_notes TEXT;

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID,
  minio_bucket TEXT NOT NULL,
  minio_key TEXT NOT NULL,
  minio_etag TEXT NOT NULL DEFAULT '',
  deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS employee_documents_employee_id_idx
  ON public.employee_documents(employee_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS employee_documents_type_idx
  ON public.employee_documents(document_type, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS employee_documents_deleted_idx
  ON public.employee_documents(deleted);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_documents'
      AND policyname = 'Service role has full access to employee_documents'
  ) THEN
    CREATE POLICY "Service role has full access to employee_documents"
      ON public.employee_documents
      FOR ALL
      TO service_role
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END $$;
