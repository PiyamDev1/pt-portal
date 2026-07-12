-- Adds editable internal invoice workspace for travel package folders.
-- Customer release remains controlled by explicit agent action in later UI/API phases.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.travel_package_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_payment', 'part_paid', 'paid', 'released', 'void')),
  currency TEXT NOT NULL DEFAULT 'GBP',
  subtotal_sold NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sold NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_booked_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  projected_margin NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_commission_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_commission_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  released_to_customer BOOLEAN NOT NULL DEFAULT FALSE,
  released_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  customer_terms TEXT,
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_package_invoices_package
  ON public.travel_package_invoices (package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_invoices_status
  ON public.travel_package_invoices (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.travel_package_invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.travel_package_invoices(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL,
  reservation_item_id UUID REFERENCES public.travel_package_reservation_items(id) ON DELETE SET NULL,
  line_type TEXT NOT NULL DEFAULT 'other'
    CHECK (line_type IN ('flight', 'hotel', 'visa', 'transport', 'discount', 'commission', 'other')),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_sold_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sold_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_booked_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_booked_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_invoice_lines_invoice
  ON public.travel_package_invoice_lines (invoice_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_travel_package_invoice_lines_package
  ON public.travel_package_invoice_lines (package_id, line_type);

DROP TRIGGER IF EXISTS travel_package_invoices_updated_at
  ON public.travel_package_invoices;
CREATE TRIGGER travel_package_invoices_updated_at
  BEFORE UPDATE ON public.travel_package_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_invoice_lines_updated_at
  ON public.travel_package_invoice_lines;
CREATE TRIGGER travel_package_invoice_lines_updated_at
  BEFORE UPDATE ON public.travel_package_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

ALTER TABLE public.travel_package_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_invoice_lines ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'travel_package_invoices',
        'travel_package_invoice_lines'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can read travel package invoices"
  ON public.travel_package_invoices FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package invoices"
  ON public.travel_package_invoices FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package invoices"
  ON public.travel_package_invoices FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package invoice lines"
  ON public.travel_package_invoice_lines FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package invoice lines"
  ON public.travel_package_invoice_lines FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package invoice lines"
  ON public.travel_package_invoice_lines FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
