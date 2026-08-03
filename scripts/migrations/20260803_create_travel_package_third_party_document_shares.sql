-- Adds controlled third-party document sharing for package folders.
-- These links are separate from customer document portal access.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.travel_package_third_party_document_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT 'Third-party document access',
  recipient_name TEXT,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  token_hash TEXT NOT NULL UNIQUE,
  access_code_hash TEXT NOT NULL,
  access_code_hint TEXT NOT NULL DEFAULT '',
  allowed_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  terms_text TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ,
  terms_accepted_by TEXT,
  last_accessed_at TIMESTAMPTZ,
  last_access_ip_hash TEXT,
  failed_access_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_third_party_shares_package
  ON public.travel_package_third_party_document_shares (package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_third_party_shares_status_expiry
  ON public.travel_package_third_party_document_shares (status, expires_at);

CREATE TABLE IF NOT EXISTS public.travel_package_third_party_access_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  share_id UUID NOT NULL REFERENCES public.travel_package_third_party_document_shares(id)
    ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'access_granted', 'access_denied', 'revoked')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_name TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_third_party_events_share
  ON public.travel_package_third_party_access_events (share_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_third_party_events_package
  ON public.travel_package_third_party_access_events (package_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_travel_package_third_party_shares_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS travel_package_third_party_shares_updated_at
  ON public.travel_package_third_party_document_shares;

CREATE TRIGGER travel_package_third_party_shares_updated_at
  BEFORE UPDATE ON public.travel_package_third_party_document_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_package_third_party_shares_updated_at();

ALTER TABLE public.travel_package_third_party_document_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_third_party_access_events ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'travel_package_third_party_document_shares',
        'travel_package_third_party_access_events'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can manage travel package third party shares"
  ON public.travel_package_third_party_document_shares
  FOR ALL TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role can manage travel package third party shares"
  ON public.travel_package_third_party_document_shares
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package third party events"
  ON public.travel_package_third_party_access_events
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated can insert travel package third party events"
  ON public.travel_package_third_party_access_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

CREATE POLICY "Service role can manage travel package third party events"
  ON public.travel_package_third_party_access_events
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
