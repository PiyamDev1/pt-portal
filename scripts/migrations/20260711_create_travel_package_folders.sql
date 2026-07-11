-- Creates package folder storage for finalised holidays/ziyarat/umrah quotations.
-- A travel_package is the operational workspace after a quote is selected/finalised.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.travel_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_reference TEXT NOT NULL UNIQUE,
  source_quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  package_type TEXT NOT NULL DEFAULT 'umrah'
    CHECK (package_type IN ('umrah', 'ziyarat', 'holiday')),
  destination TEXT,
  departure_date DATE,
  return_date DATE,
  status TEXT NOT NULL DEFAULT 'selected'
    CHECK (
      status IN (
        'selected',
        'awaiting_passports',
        'awaiting_deposit',
        'reservation_pending',
        'partially_booked',
        'fully_reserved',
        'documents_pending',
        'documents_released',
        'travelling_soon',
        'travelling',
        'returned',
        'closed',
        'cancelled',
        'archived'
      )
    ),
  passenger_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_quote_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_public_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  passport_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (
      passport_status IN (
        'not_requested',
        'requested',
        'received_whatsapp',
        'checked',
        'issues_found',
        'ready'
      )
    ),
  payment_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (
      payment_status IN (
        'not_requested',
        'deposit_requested',
        'deposit_received',
        'partial',
        'paid',
        'overdue',
        'refunded'
      )
    ),
  invoice_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (
      invoice_status IN (
        'not_started',
        'draft',
        'internal_review',
        'finalised',
        'released_to_customer',
        'amended',
        'void',
        'closed'
      )
    ),
  document_release_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (
      document_release_status IN (
        'not_started',
        'pending',
        'partial',
        'released',
        'revoked'
      )
    ),
  next_action TEXT,
  next_action_due_at TIMESTAMPTZ,
  risk_level TEXT NOT NULL DEFAULT 'none'
    CHECK (risk_level IN ('none', 'low', 'medium', 'high', 'critical')),
  minio_bucket TEXT,
  minio_prefix TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_packages_status_departure
  ON public.travel_packages (status, departure_date NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_packages_source_quote
  ON public.travel_packages (source_quote_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_packages_source_quote_unique
  ON public.travel_packages (source_quote_id)
  WHERE source_quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_packages_assigned_agent
  ON public.travel_packages (assigned_agent_id, created_at DESC);

ALTER TABLE public.travel_package_quotes
  ADD COLUMN IF NOT EXISTS converted_package_id UUID REFERENCES public.travel_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_travel_package_quotes_converted_package
  ON public.travel_package_quotes (converted_package_id);

CREATE TABLE IF NOT EXISTS public.travel_package_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  source_rule TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_tasks_package_status
  ON public.travel_package_tasks (package_id, status, due_at NULLS LAST);

CREATE TABLE IF NOT EXISTS public.travel_package_deadlines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  deadline_type TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'met', 'missed', 'cancelled', 'extended')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reminder_sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_deadlines_package_due
  ON public.travel_package_deadlines (package_id, due_at);

CREATE TABLE IF NOT EXISTS public.travel_package_risk_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  risk_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  source TEXT NOT NULL DEFAULT 'automatic'
    CHECK (source IN ('automatic', 'manual')),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_risk_flags_package_status
  ON public.travel_package_risk_flags (package_id, status, severity);

CREATE TABLE IF NOT EXISTS public.travel_package_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'internal'
    CHECK (channel IN ('whatsapp', 'phone', 'in_person', 'email', 'internal')),
  direction TEXT NOT NULL DEFAULT 'internal'
    CHECK (direction IN ('inbound', 'outbound', 'internal')),
  summary TEXT NOT NULL,
  follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_due_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_travel_package_communications_package_created
  ON public.travel_package_communications (package_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.travel_package_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  version_number INTEGER NOT NULL DEFAULT 1,
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'ready_for_review', 'released_to_customer', 'revoked')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_change_summary TEXT,
  internal_change_summary TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_travel_package_versions_package_type
  ON public.travel_package_versions (package_id, object_type, version_number DESC);

CREATE OR REPLACE FUNCTION public.update_travel_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS travel_packages_updated_at ON public.travel_packages;
CREATE TRIGGER travel_packages_updated_at
  BEFORE UPDATE ON public.travel_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_tasks_updated_at ON public.travel_package_tasks;
CREATE TRIGGER travel_package_tasks_updated_at
  BEFORE UPDATE ON public.travel_package_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_deadlines_updated_at ON public.travel_package_deadlines;
CREATE TRIGGER travel_package_deadlines_updated_at
  BEFORE UPDATE ON public.travel_package_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_risk_flags_updated_at ON public.travel_package_risk_flags;
CREATE TRIGGER travel_package_risk_flags_updated_at
  BEFORE UPDATE ON public.travel_package_risk_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

ALTER TABLE public.travel_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_versions ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'travel_packages',
        'travel_package_tasks',
        'travel_package_deadlines',
        'travel_package_risk_flags',
        'travel_package_communications',
        'travel_package_versions'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can read travel packages"
  ON public.travel_packages FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can insert travel packages"
  ON public.travel_packages FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());
CREATE POLICY "Authenticated can update travel packages"
  ON public.travel_packages FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel packages"
  ON public.travel_packages FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package tasks"
  ON public.travel_package_tasks FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package tasks"
  ON public.travel_package_tasks FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package tasks"
  ON public.travel_package_tasks FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package deadlines"
  ON public.travel_package_deadlines FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package deadlines"
  ON public.travel_package_deadlines FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package deadlines"
  ON public.travel_package_deadlines FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package risk flags"
  ON public.travel_package_risk_flags FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package risk flags"
  ON public.travel_package_risk_flags FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package risk flags"
  ON public.travel_package_risk_flags FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package communications"
  ON public.travel_package_communications FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package communications"
  ON public.travel_package_communications FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package communications"
  ON public.travel_package_communications FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package versions"
  ON public.travel_package_versions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package versions"
  ON public.travel_package_versions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package versions"
  ON public.travel_package_versions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
