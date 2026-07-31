-- Adds an agent-only Travel Documents category for package document storage.
-- These files are internal to staff and must not be released to the customer portal.

DO $$ DECLARE constraint_name TEXT; BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.travel_package_documents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%category%'
    AND pg_get_constraintdef(oid) LIKE '%flight%'
    AND pg_get_constraintdef(oid) LIKE '%invoice%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.travel_package_documents DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE public.travel_package_documents
  ADD CONSTRAINT travel_package_documents_category_check
  CHECK (
    category IN (
      'flight',
      'hotel',
      'transport',
      'visa',
      'e_sim',
      'insurance',
      'invoice',
      'travel_documents',
      'other'
    )
  );

UPDATE public.travel_package_documents
SET customer_visible = FALSE,
    status = CASE WHEN status = 'released' THEN 'ready_for_review' ELSE status END,
    released_at = CASE WHEN status = 'released' THEN NULL ELSE released_at END,
    released_by = CASE WHEN status = 'released' THEN NULL ELSE released_by END
WHERE category = 'travel_documents';
