-- Completes the operational travel package workflow.
-- Run after the quote, package folder, reservation, document, and invoice migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Quote lifecycle and immutable finalisation metadata.
ALTER TABLE public.travel_package_quotes
  ADD COLUMN IF NOT EXISTS finalised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalised_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finalised_source TEXT
    CHECK (finalised_source IS NULL OR finalised_source IN ('customer', 'agent')),
  ADD COLUMN IF NOT EXISTS customer_selection_note TEXT,
  ADD COLUMN IF NOT EXISTS agent_selection_note TEXT,
  ADD COLUMN IF NOT EXISTS last_shared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$ DECLARE constraint_name TEXT; BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.travel_package_quotes'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.travel_package_quotes DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE public.travel_package_quotes
  ADD CONSTRAINT travel_package_quotes_status_check
  CHECK (
    status IN (
      'draft', 'shared', 'expired', 'customer_selected', 'agent_selected',
      'finalised', 'converted', 'archived'
    )
  );

-- Portal identity and lifecycle facts used for customer access and earned reporting.
ALTER TABLE public.travel_packages
  ADD COLUMN IF NOT EXISTS customer_access_last_name TEXT,
  ADD COLUMN IF NOT EXISTS portal_access_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS travelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS earned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.travel_packages
SET customer_access_last_name = LOWER(
  REGEXP_REPLACE(TRIM(customer_name), '^.*\s', '')
)
WHERE customer_access_last_name IS NULL
  AND NULLIF(TRIM(customer_name), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_packages_reference_customer_access
  ON public.travel_packages (UPPER(package_reference), customer_access_last_name)
  WHERE document_access_enabled = TRUE;

CREATE TABLE IF NOT EXISTS public.travel_package_portal_access_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_hash TEXT NOT NULL,
  package_reference TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_portal_attempts_ip_created
  ON public.travel_package_portal_access_attempts (ip_hash, created_at DESC);

-- Passenger-level operational tracking. Passport files remain private/optional.
CREATE TABLE IF NOT EXISTS public.travel_package_passengers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  passenger_type TEXT NOT NULL DEFAULT 'adult'
    CHECK (passenger_type IN ('adult', 'child', 'infant')),
  passport_received BOOLEAN NOT NULL DEFAULT FALSE,
  passport_checked BOOLEAN NOT NULL DEFAULT FALSE,
  passport_issue_note TEXT,
  visa_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (visa_status IN ('not_started', 'details_required', 'submitted', 'approved', 'rejected', 'not_required')),
  ticket_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (ticket_status IN ('not_started', 'held', 'ticketed', 'changed', 'cancelled')),
  room_allocation TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_passengers_package
  ON public.travel_package_passengers (package_id, created_at);

-- Recorded money movements. Only completed payments contribute to invoice totals.
CREATE TABLE IF NOT EXISTS public.travel_package_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.travel_package_invoices(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  payment_type TEXT NOT NULL DEFAULT 'payment'
    CHECK (payment_type IN ('deposit', 'payment', 'refund', 'chargeback', 'commission')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'other')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  requested_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  receipt_reference TEXT,
  receipt_document_id UUID REFERENCES public.travel_package_documents(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_payments_package_received
  ON public.travel_package_payments (package_id, received_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_package_payments_invoice
  ON public.travel_package_payments (invoice_id, payment_status);

-- Optional installment schedules, with a stable hook for the LMS module.
CREATE TABLE IF NOT EXISTS public.travel_package_payment_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.travel_package_invoices(id) ON DELETE SET NULL,
  lms_plan_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'defaulted')),
  currency TEXT NOT NULL DEFAULT 'GBP',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('weekly', 'fortnightly', 'monthly', 'custom')),
  starts_on DATE,
  internal_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_package_installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.travel_package_payment_plans(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.travel_package_payments(id) ON DELETE SET NULL,
  sequence_number INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'due', 'paid', 'overdue', 'waived', 'cancelled')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_travel_package_installments_package_due
  ON public.travel_package_installments (package_id, due_on, status);

-- Every sensitive package mutation can be traced without exposing it to customers.
CREATE TABLE IF NOT EXISTS public.travel_package_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_summary TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_audit_events_package_created
  ON public.travel_package_audit_events (package_id, created_at DESC);

-- Transport vouchers are versioned records and may be released independently.
CREATE TABLE IF NOT EXISTS public.travel_package_transport_vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.travel_package_documents(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'released_to_customer', 'amended', 'revoked')),
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  voucher_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_html TEXT,
  generated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_transport_vouchers_package
  ON public.travel_package_transport_vouchers (package_id, version DESC);

-- Legacy import bookkeeping makes scans and imports idempotent and retryable.
CREATE TABLE IF NOT EXISTS public.travel_package_legacy_migration_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mode TEXT NOT NULL DEFAULT 'dry_run'
    CHECK (mode IN ('scan', 'dry_run', 'sample', 'full', 'retry')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'completed_with_errors', 'failed')),
  source_cursor TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  document_count INTEGER NOT NULL DEFAULT 0,
  copied_document_count INTEGER NOT NULL DEFAULT 0,
  failed_document_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_package_legacy_migration_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_run_id UUID REFERENCES public.travel_package_legacy_migration_runs(id) ON DELETE SET NULL,
  legacy_customer_id TEXT NOT NULL UNIQUE,
  legacy_reference_number TEXT,
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE SET NULL,
  migration_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (migration_status IN ('pending', 'imported', 'partial', 'failed', 'skipped')),
  migrated_documents_count INTEGER NOT NULL DEFAULT 0,
  failed_documents_count INTEGER NOT NULL DEFAULT 0,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  migrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_legacy_migration_map_reference
  ON public.travel_package_legacy_migration_map (legacy_reference_number);

-- Complete cross-object links planned for operations, documents, and finance.
ALTER TABLE public.travel_package_tasks
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.travel_package_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.travel_package_deadlines
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.travel_package_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.travel_package_communications
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.travel_package_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.travel_package_documents
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.travel_package_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS backup_provider TEXT,
  ADD COLUMN IF NOT EXISTS backup_bucket TEXT,
  ADD COLUMN IF NOT EXISTS backup_key TEXT,
  ADD COLUMN IF NOT EXISTS backup_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (backup_status IN ('pending', 'copied', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS backup_error TEXT;

ALTER TABLE public.travel_package_invoices
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amendment_reason TEXT,
  ADD COLUMN IF NOT EXISTS released_version INTEGER;

DO $$ DECLARE constraint_name TEXT; BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.travel_package_invoices'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.travel_package_invoices DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE public.travel_package_invoices
  ADD CONSTRAINT travel_package_invoices_status_check
  CHECK (
    status IN (
      'draft', 'internal_review', 'finalised', 'pending_payment', 'part_paid',
      'paid', 'released', 'amended', 'void', 'closed'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_versions_object_version
  ON public.travel_package_versions (object_type, object_id, version_number)
  WHERE object_id IS NOT NULL;

-- Keep updated timestamps consistent across new mutable tables.
DROP TRIGGER IF EXISTS travel_package_passengers_updated_at ON public.travel_package_passengers;
CREATE TRIGGER travel_package_passengers_updated_at BEFORE UPDATE ON public.travel_package_passengers
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();
DROP TRIGGER IF EXISTS travel_package_payments_updated_at ON public.travel_package_payments;
CREATE TRIGGER travel_package_payments_updated_at BEFORE UPDATE ON public.travel_package_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();
DROP TRIGGER IF EXISTS travel_package_payment_plans_updated_at ON public.travel_package_payment_plans;
CREATE TRIGGER travel_package_payment_plans_updated_at BEFORE UPDATE ON public.travel_package_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();
DROP TRIGGER IF EXISTS travel_package_installments_updated_at ON public.travel_package_installments;
CREATE TRIGGER travel_package_installments_updated_at BEFORE UPDATE ON public.travel_package_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();
DROP TRIGGER IF EXISTS travel_package_transport_vouchers_updated_at ON public.travel_package_transport_vouchers;
CREATE TRIGGER travel_package_transport_vouchers_updated_at BEFORE UPDATE ON public.travel_package_transport_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();
DROP TRIGGER IF EXISTS travel_package_legacy_migration_map_updated_at ON public.travel_package_legacy_migration_map;
CREATE TRIGGER travel_package_legacy_migration_map_updated_at BEFORE UPDATE ON public.travel_package_legacy_migration_map
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

ALTER TABLE public.travel_package_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_transport_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_legacy_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_legacy_migration_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_portal_access_attempts ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'travel_package_passengers', 'travel_package_payments',
        'travel_package_payment_plans', 'travel_package_installments',
        'travel_package_audit_events', 'travel_package_transport_vouchers',
        'travel_package_legacy_migration_runs', 'travel_package_legacy_migration_map'
        , 'travel_package_portal_access_attempts'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can manage travel package passengers"
  ON public.travel_package_passengers FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package passengers"
  ON public.travel_package_passengers FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can manage travel package payments"
  ON public.travel_package_payments FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package payments"
  ON public.travel_package_payments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can manage travel package payment plans"
  ON public.travel_package_payment_plans FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package payment plans"
  ON public.travel_package_payment_plans FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can manage travel package installments"
  ON public.travel_package_installments FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package installments"
  ON public.travel_package_installments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can read travel package audit events"
  ON public.travel_package_audit_events FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can insert travel package audit events"
  ON public.travel_package_audit_events FOR INSERT TO authenticated WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());
CREATE POLICY "Service role can manage travel package audit events"
  ON public.travel_package_audit_events FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can manage travel package transport vouchers"
  ON public.travel_package_transport_vouchers FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package transport vouchers"
  ON public.travel_package_transport_vouchers FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can read travel package migration runs"
  ON public.travel_package_legacy_migration_runs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Service role can manage travel package migration runs"
  ON public.travel_package_legacy_migration_runs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated can read travel package migration map"
  ON public.travel_package_legacy_migration_map FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Service role can manage travel package migration map"
  ON public.travel_package_legacy_migration_map FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package portal access attempts"
  ON public.travel_package_portal_access_attempts FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
