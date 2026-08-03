-- Create pre-tracking draft workflow for Pakistani passport applications.
-- Drafts are operational records only and are converted into applications
-- only after an official tracking number is received.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pakistani_application_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typname = 'pakistani_application_type'
        AND enum_value.enumlabel = 'Lost'
    ) THEN
      EXECUTE 'ALTER TYPE public.pakistani_application_type ADD VALUE ''Lost''';
    END IF;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.pakistani_passport_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL UNIQUE,
  applicant_id UUID REFERENCES public.applicants(id),
  created_by UUID NOT NULL REFERENCES public.employees(id),
  updated_by UUID REFERENCES public.employees(id),
  assigned_employee_id UUID REFERENCES public.employees(id),
  converted_application_id UUID REFERENCES public.applications(id),
  converted_by UUID REFERENCES public.employees(id),
  cancelled_by UUID REFERENCES public.employees(id),

  applicant_name TEXT NOT NULL,
  applicant_cnic TEXT NOT NULL,
  applicant_email TEXT,
  applicant_phone TEXT,
  family_head_email TEXT NOT NULL,

  application_type TEXT NOT NULL,
  category TEXT NOT NULL,
  page_count TEXT,
  speed TEXT NOT NULL,
  old_passport_number TEXT,
  fingerprints_completed BOOLEAN NOT NULL DEFAULT FALSE,
  requested_page_number TEXT,
  requested_page_provided BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'Documents Pending',
  payment_status TEXT NOT NULL DEFAULT 'unknown',
  payment_amount NUMERIC(10, 2),
  payment_note TEXT,
  payment_refunded_at TIMESTAMPTZ,

  official_tracking_number TEXT,
  sent_to_external_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_passport_draft_id_format
    CHECK (draft_id ~ '^PKD-[A-Z0-9]{10}$'),
  CONSTRAINT pk_passport_draft_status_check
    CHECK (status IN (
      'Draft',
      'Documents Pending',
      'Ready to Process',
      'With External Staff',
      'Tracking Received',
      'Converted',
      'Cancelled'
    )),
  CONSTRAINT pk_passport_draft_payment_status_check
    CHECK (payment_status IN ('unknown', 'not_taken', 'taken', 'refunded')),
  CONSTRAINT pk_passport_draft_payment_amount_check
    CHECK (payment_amount IS NULL OR payment_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pk_passport_drafts_status_updated
  ON public.pakistani_passport_drafts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pk_passport_drafts_assigned_status
  ON public.pakistani_passport_drafts (assigned_employee_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pk_passport_drafts_cancel_cleanup
  ON public.pakistani_passport_drafts (cancelled_at)
  WHERE status = 'Cancelled' AND converted_application_id IS NULL;

CREATE OR REPLACE FUNCTION public.update_pk_passport_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pk_passport_drafts_updated_at ON public.pakistani_passport_drafts;
CREATE TRIGGER pk_passport_drafts_updated_at
  BEFORE UPDATE ON public.pakistani_passport_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_pk_passport_drafts_updated_at();

ALTER TABLE public.pakistani_passport_drafts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy RECORD;
BEGIN
  FOR policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pakistani_passport_drafts'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(policy.policyname) ||
      ' ON public.pakistani_passport_drafts';
  END LOOP;
END;
$$;

CREATE POLICY "Authenticated can read Pakistani passport drafts"
  ON public.pakistani_passport_drafts
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated can insert Pakistani passport drafts"
  ON public.pakistani_passport_drafts
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Authenticated can update Pakistani passport drafts"
  ON public.pakistani_passport_drafts
  FOR UPDATE TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role can manage Pakistani passport drafts"
  ON public.pakistani_passport_drafts
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
