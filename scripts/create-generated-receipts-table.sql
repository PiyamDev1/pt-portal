-- Creates storage for generated receipt records used by verification/list APIs.
-- Run in Supabase SQL editor or your migration workflow.

CREATE TABLE IF NOT EXISTS public.generated_receipts (
  id UUID PRIMARY KEY,
  service_type TEXT NOT NULL,
  receipt_type TEXT NOT NULL,
  service_record_id UUID NOT NULL,
  application_id UUID NOT NULL,
  applicant_id UUID NOT NULL,
  tracking_number TEXT,
  receipt_pin VARCHAR(6) NOT NULL,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL
);

ALTER TABLE public.generated_receipts
  ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shared_via TEXT,
  ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_generated_receipts_tracking_pin
  ON public.generated_receipts (tracking_number, receipt_pin);

CREATE INDEX IF NOT EXISTS idx_generated_receipts_applicant
  ON public.generated_receipts (applicant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_receipts_service
  ON public.generated_receipts (service_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_receipts_shared_at
  ON public.generated_receipts (shared_at DESC);
