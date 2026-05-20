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
