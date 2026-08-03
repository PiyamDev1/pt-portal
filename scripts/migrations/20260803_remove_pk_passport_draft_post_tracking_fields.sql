-- Drafts stop before official tracking exists, so requested-page and
-- biometrics fields belong only to the tracked passport application record.

ALTER TABLE IF EXISTS public.pakistani_passport_drafts
  DROP COLUMN IF EXISTS fingerprints_completed,
  DROP COLUMN IF EXISTS requested_page_number,
  DROP COLUMN IF EXISTS requested_page_provided;
