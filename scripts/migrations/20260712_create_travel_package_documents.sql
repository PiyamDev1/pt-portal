-- Adds package document metadata and controlled customer document portal access.
-- Files are stored under the package MinIO prefix; metadata and release state live here.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE public.travel_packages
  ADD COLUMN IF NOT EXISTS document_access_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS document_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS document_access_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS document_access_last_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_travel_packages_document_access_token
  ON public.travel_packages (document_access_token)
  WHERE document_access_enabled = TRUE;

CREATE TABLE IF NOT EXISTS public.travel_package_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('flight', 'hotel', 'transport', 'visa', 'e_sim', 'insurance', 'invoice', 'other')),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_provider TEXT NOT NULL DEFAULT 'minio'
    CHECK (storage_provider IN ('minio', 'r3_backup', 'external')),
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  storage_etag TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready_for_review', 'released', 'revoked', 'deleted')),
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  public_notes TEXT,
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_package_documents_package_category
  ON public.travel_package_documents (package_id, category, created_at DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_travel_package_documents_customer_visible
  ON public.travel_package_documents (package_id, customer_visible, status)
  WHERE customer_visible = TRUE AND status = 'released';

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_documents_storage_key
  ON public.travel_package_documents (storage_bucket, storage_key)
  WHERE status <> 'deleted';

DROP TRIGGER IF EXISTS travel_package_documents_updated_at
  ON public.travel_package_documents;
CREATE TRIGGER travel_package_documents_updated_at
  BEFORE UPDATE ON public.travel_package_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

ALTER TABLE public.travel_package_documents ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'travel_package_documents'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.travel_package_documents';
  END LOOP;
END $$;

CREATE POLICY "Authenticated can read travel package documents"
  ON public.travel_package_documents FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package documents"
  ON public.travel_package_documents FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package documents"
  ON public.travel_package_documents FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
