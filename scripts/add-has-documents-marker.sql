-- Migration: Add has_documents marker to applications table
-- Purpose: Track whether a PAK Passport application has uploaded documents
--          without needing to JOIN/COUNT the documents table on every page load.
--
-- Run this once in Supabase SQL Editor (or via CLI):
--   psql $DATABASE_URL -f scripts/add-has-documents-marker.sql

-- 1. Add the column (safe to run multiple times thanks to IF NOT EXISTS)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS has_documents BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: mark applications that already have at least one non-deleted,
--    non-zip-archive document attached.
UPDATE applications
SET has_documents = true
WHERE id::text IN (
  SELECT DISTINCT family_head_id
  FROM documents
  WHERE deleted = false
    AND category IS DISTINCT FROM 'zip-archive'
);

-- 3. Trigger function: recalculate has_documents automatically whenever a
--    document row is inserted or updated (e.g. soft-deleted).
--    This replaces the application-layer fire-and-forget updates and
--    ensures the flag stays accurate even if documents are modified
--    directly in the database.
CREATE OR REPLACE FUNCTION sync_has_documents()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_family_id TEXT;
BEGIN
  -- For INSERT use NEW; for UPDATE/DELETE fall back to OLD
  target_family_id := COALESCE(NEW.family_head_id, OLD.family_head_id);

  IF target_family_id IS NOT NULL THEN
    UPDATE applications
    SET has_documents = EXISTS (
      SELECT 1
      FROM documents
      WHERE family_head_id = target_family_id
        AND deleted = false
        AND category IS DISTINCT FROM 'zip-archive'
    )
    WHERE id::text = target_family_id;
  END IF;

  RETURN NULL;
END;
$$;

-- 4. Attach the trigger to the documents table.
--    Runs once per changed row, after the change is committed.
DROP TRIGGER IF EXISTS trg_sync_has_documents ON documents;

CREATE TRIGGER trg_sync_has_documents
  AFTER INSERT OR UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION sync_has_documents();
