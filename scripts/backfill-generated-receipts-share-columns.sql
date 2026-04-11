-- Backfill and normalize generated_receipts share columns after schema updates.
-- Safe to run multiple times.

ALTER TABLE public.generated_receipts
  ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shared_via TEXT,
  ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.generated_receipts
SET
  is_shared = COALESCE(is_shared, FALSE),
  share_count = COALESCE(share_count, 0),
  shared_via = CASE
    WHEN COALESCE(is_shared, FALSE) = TRUE AND (shared_via IS NULL OR shared_via = '') THEN 'legacy'
    ELSE shared_via
  END,
  shared_at = CASE
    WHEN COALESCE(is_shared, FALSE) = TRUE AND shared_at IS NULL THEN generated_at
    ELSE shared_at
  END
WHERE
  is_shared IS NULL
  OR share_count IS NULL
  OR (COALESCE(is_shared, FALSE) = TRUE AND (shared_via IS NULL OR shared_via = '' OR shared_at IS NULL));

CREATE INDEX IF NOT EXISTS idx_generated_receipts_tracking_pin
  ON public.generated_receipts (tracking_number, receipt_pin);

CREATE INDEX IF NOT EXISTS idx_generated_receipts_applicant
  ON public.generated_receipts (applicant_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_receipts_service
  ON public.generated_receipts (service_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_receipts_shared_at
  ON public.generated_receipts (shared_at DESC);
