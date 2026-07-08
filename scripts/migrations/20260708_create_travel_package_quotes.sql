-- Creates package quote storage for the integrated holidays/ziyarat/umrah package creator.
-- Staff manage quotes from PT-Portal; public customer views are loaded through token API routes.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.travel_package_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'umrah'
    CHECK (package_type IN ('umrah', 'ziyarat', 'holiday')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'shared', 'archived')),
  currency TEXT NOT NULL DEFAULT 'GBP',
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  share_token TEXT NOT NULL UNIQUE,
  share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  selected_option JSONB,
  selected_at TIMESTAMPTZ,
  selection_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_quotes_status_created
  ON public.travel_package_quotes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_quotes_created_by
  ON public.travel_package_quotes (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_quotes_share_token
  ON public.travel_package_quotes (share_token)
  WHERE share_enabled = TRUE;

ALTER TABLE public.travel_package_quotes
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours');

CREATE INDEX IF NOT EXISTS idx_travel_package_quotes_expires_at
  ON public.travel_package_quotes (expires_at);

CREATE OR REPLACE FUNCTION public.update_travel_package_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS travel_package_quotes_updated_at ON public.travel_package_quotes;

CREATE TRIGGER travel_package_quotes_updated_at
  BEFORE UPDATE ON public.travel_package_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_package_quotes_updated_at();

ALTER TABLE public.travel_package_quotes ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'travel_package_quotes'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.travel_package_quotes';
  END LOOP;
END $$;

CREATE POLICY "Authenticated can read travel package quotes"
  ON public.travel_package_quotes
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated can insert travel package quotes"
  ON public.travel_package_quotes
  FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "Authenticated can update travel package quotes"
  ON public.travel_package_quotes
  FOR UPDATE TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role can manage travel package quotes"
  ON public.travel_package_quotes
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
