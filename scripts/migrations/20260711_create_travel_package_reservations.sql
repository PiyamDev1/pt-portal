-- Adds reservation tracking for operational travel package folders.
-- Each package can hold flight, hotel, visa, transport, or other reservations.
-- Customer visibility stays off by default; agents decide what is released later.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.travel_package_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reservation_type TEXT NOT NULL DEFAULT 'other'
    CHECK (reservation_type IN ('flight', 'hotel', 'visa', 'transport', 'other')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (
      status IN (
        'not_started',
        'quote_requested',
        'availability_checked',
        'reservation_pending',
        'reserved',
        'deposit_required',
        'paid',
        'confirmed',
        'changed',
        'cancelled',
        'failed'
      )
    ),
  supplier_name TEXT,
  supplier_reference TEXT,
  booking_reference TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  booked_cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sold_price_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_expected_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_received_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_required BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_due_at TIMESTAMPTZ,
  payment_due_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  public_notes TEXT,
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_reservations_package_type
  ON public.travel_package_reservations (package_id, reservation_type, status);

CREATE INDEX IF NOT EXISTS idx_travel_package_reservations_package_created
  ON public.travel_package_reservations (package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_reservations_payment_due
  ON public.travel_package_reservations (payment_due_at)
  WHERE payment_due_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_reservations_id_package
  ON public.travel_package_reservations (id, package_id);

CREATE TABLE IF NOT EXISTS public.travel_package_reservation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES public.travel_package_reservations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'other'
    CHECK (item_type IN ('flight', 'hotel', 'visa', 'transport', 'commission', 'discount', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_booked_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_sold_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_expected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_booked_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sold_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  supplier_reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reserved', 'confirmed', 'changed', 'cancelled')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_package_reservation_items_reservation
  ON public.travel_package_reservation_items (reservation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_travel_package_reservation_items_package
  ON public.travel_package_reservation_items (package_id, item_type);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'travel_package_reservation_items_reservation_package_fk'
  ) THEN
    ALTER TABLE public.travel_package_reservation_items
      ADD CONSTRAINT travel_package_reservation_items_reservation_package_fk
      FOREIGN KEY (reservation_id, package_id)
      REFERENCES public.travel_package_reservations(id, package_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.calculate_travel_package_reservation_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_booked_cost = ROUND((NEW.quantity * NEW.unit_booked_cost)::numeric, 2);
  NEW.total_sold_price = ROUND((NEW.quantity * NEW.unit_sold_price)::numeric, 2);
  NEW.discount_amount = ROUND(NEW.discount_amount::numeric, 2);
  NEW.commission_expected_amount = ROUND(NEW.commission_expected_amount::numeric, 2);
  NEW.commission_received_amount = ROUND(NEW.commission_received_amount::numeric, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS travel_package_reservation_items_calculate_totals
  ON public.travel_package_reservation_items;
CREATE TRIGGER travel_package_reservation_items_calculate_totals
  BEFORE INSERT OR UPDATE ON public.travel_package_reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.calculate_travel_package_reservation_item_totals();

CREATE OR REPLACE FUNCTION public.refresh_travel_package_reservation_totals()
RETURNS TRIGGER AS $$
DECLARE
  target_reservation_id UUID;
  target_package_id UUID;
BEGIN
  target_reservation_id = COALESCE(NEW.reservation_id, OLD.reservation_id);
  target_package_id = COALESCE(NEW.package_id, OLD.package_id);

  UPDATE public.travel_package_reservations
  SET
    booked_cost_total = COALESCE((
      SELECT SUM(total_booked_cost)
      FROM public.travel_package_reservation_items
      WHERE reservation_id = target_reservation_id
        AND package_id = target_package_id
        AND status <> 'cancelled'
    ), 0),
    sold_price_total = COALESCE((
      SELECT SUM(total_sold_price)
      FROM public.travel_package_reservation_items
      WHERE reservation_id = target_reservation_id
        AND package_id = target_package_id
        AND status <> 'cancelled'
    ), 0),
    discount_total = COALESCE((
      SELECT SUM(discount_amount)
      FROM public.travel_package_reservation_items
      WHERE reservation_id = target_reservation_id
        AND package_id = target_package_id
        AND status <> 'cancelled'
    ), 0),
    commission_expected_total = COALESCE((
      SELECT SUM(commission_expected_amount)
      FROM public.travel_package_reservation_items
      WHERE reservation_id = target_reservation_id
        AND package_id = target_package_id
        AND status <> 'cancelled'
    ), 0),
    commission_received_total = COALESCE((
      SELECT SUM(commission_received_amount)
      FROM public.travel_package_reservation_items
      WHERE reservation_id = target_reservation_id
        AND package_id = target_package_id
        AND status <> 'cancelled'
    ), 0)
  WHERE id = target_reservation_id
    AND package_id = target_package_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS travel_package_reservation_items_refresh_parent_totals
  ON public.travel_package_reservation_items;
CREATE TRIGGER travel_package_reservation_items_refresh_parent_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.travel_package_reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.refresh_travel_package_reservation_totals();

DROP TRIGGER IF EXISTS travel_package_reservations_updated_at
  ON public.travel_package_reservations;
CREATE TRIGGER travel_package_reservations_updated_at
  BEFORE UPDATE ON public.travel_package_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_reservation_items_updated_at
  ON public.travel_package_reservation_items;
CREATE TRIGGER travel_package_reservation_items_updated_at
  BEFORE UPDATE ON public.travel_package_reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

ALTER TABLE public.travel_package_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_reservation_items ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'travel_package_reservations',
        'travel_package_reservation_items'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can read travel package reservations"
  ON public.travel_package_reservations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package reservations"
  ON public.travel_package_reservations FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package reservations"
  ON public.travel_package_reservations FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read travel package reservation items"
  ON public.travel_package_reservation_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can manage travel package reservation items"
  ON public.travel_package_reservation_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package reservation items"
  ON public.travel_package_reservation_items FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
