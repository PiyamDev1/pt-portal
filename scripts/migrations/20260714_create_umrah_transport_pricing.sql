-- Adds Umrah transport pricing matrices for supplier comparison.
-- Managers can keep route, supplier, vehicle, and net-cost data in one pricing source.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.umrah_transport_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_phone TEXT,
  default_currency TEXT NOT NULL DEFAULT 'SAR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.umrah_transport_suppliers
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'SAR';

CREATE TABLE IF NOT EXISTS public.umrah_transport_vehicle_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL UNIQUE,
  passenger_capacity TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.umrah_transport_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_name TEXT NOT NULL UNIQUE,
  preferred_supplier_id UUID REFERENCES public.umrah_transport_suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.umrah_transport_route_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_name TEXT NOT NULL UNIQUE,
  preferred_supplier_id UUID REFERENCES public.umrah_transport_suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.umrah_transport_route_plan_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.umrah_transport_route_plans(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES public.umrah_transport_routes(id) ON DELETE CASCADE,
  segment_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.umrah_transport_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES public.umrah_transport_routes(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.umrah_transport_suppliers(id) ON DELETE CASCADE,
  vehicle_type_id UUID NOT NULL REFERENCES public.umrah_transport_vehicle_types(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'SAR',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, supplier_id, vehicle_type_id)
);

CREATE TABLE IF NOT EXISTS public.umrah_transport_guide_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES public.umrah_transport_suppliers(id) ON DELETE CASCADE,
  guide_service TEXT NOT NULL
    CHECK (guide_service IN ('umrah', 'madinah', 'makkah')),
  currency TEXT NOT NULL DEFAULT 'SAR',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, guide_service)
);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_routes_sort
  ON public.umrah_transport_routes (is_active DESC, sort_order, route_name);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_route_plans_sort
  ON public.umrah_transport_route_plans (is_active DESC, sort_order, plan_name);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_route_plan_segments_plan
  ON public.umrah_transport_route_plan_segments (plan_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_rates_lookup
  ON public.umrah_transport_rates (vehicle_type_id, route_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_guide_rates_lookup
  ON public.umrah_transport_guide_rates (supplier_id, guide_service);

CREATE OR REPLACE FUNCTION public.update_umrah_transport_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS umrah_transport_suppliers_updated_at ON public.umrah_transport_suppliers;
CREATE TRIGGER umrah_transport_suppliers_updated_at
  BEFORE UPDATE ON public.umrah_transport_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

DROP TRIGGER IF EXISTS umrah_transport_vehicle_types_updated_at ON public.umrah_transport_vehicle_types;
CREATE TRIGGER umrah_transport_vehicle_types_updated_at
  BEFORE UPDATE ON public.umrah_transport_vehicle_types
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

DROP TRIGGER IF EXISTS umrah_transport_routes_updated_at ON public.umrah_transport_routes;
CREATE TRIGGER umrah_transport_routes_updated_at
  BEFORE UPDATE ON public.umrah_transport_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

DROP TRIGGER IF EXISTS umrah_transport_route_plans_updated_at ON public.umrah_transport_route_plans;
CREATE TRIGGER umrah_transport_route_plans_updated_at
  BEFORE UPDATE ON public.umrah_transport_route_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

DROP TRIGGER IF EXISTS umrah_transport_route_plan_segments_updated_at
  ON public.umrah_transport_route_plan_segments;
CREATE TRIGGER umrah_transport_route_plan_segments_updated_at
  BEFORE UPDATE ON public.umrah_transport_route_plan_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

DROP TRIGGER IF EXISTS umrah_transport_rates_updated_at ON public.umrah_transport_rates;
CREATE TRIGGER umrah_transport_rates_updated_at
  BEFORE UPDATE ON public.umrah_transport_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

DROP TRIGGER IF EXISTS umrah_transport_guide_rates_updated_at ON public.umrah_transport_guide_rates;
CREATE TRIGGER umrah_transport_guide_rates_updated_at
  BEFORE UPDATE ON public.umrah_transport_guide_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

INSERT INTO public.umrah_transport_suppliers (name, default_currency, sort_order)
VALUES
  ('Al Amani', 'GBP', 10),
  ('Polani', 'GBP', 20),
  ('Nasir', 'SAR', 30),
  ('MiTravel', 'SAR', 40),
  ('TTBOX', 'SAR', 50)
ON CONFLICT (name) DO NOTHING;

UPDATE public.umrah_transport_suppliers
SET is_active = FALSE
WHERE name IN ('Transport Supplier 1', 'Transport Supplier 2', 'Transport Supplier 3');

INSERT INTO public.umrah_transport_vehicle_types (label, passenger_capacity, sort_order)
VALUES
  ('Car', '2 ADT, 2 CHD, 2BG', 10),
  ('H1', '5 ADT, 2 CHD, 6BG', 20),
  ('Hiace', '7 ADT, 2 CHD, 8BG', 30),
  ('Coaster', '23 Seater', 40)
ON CONFLICT (label) DO NOTHING;

UPDATE public.umrah_transport_vehicle_types
SET is_active = FALSE
WHERE label IN (
  'Sedan Camry / Sonata',
  'Ford Taurus',
  'Hyundai H1 / Staria / Starex',
  'GMC Yukon XL',
  'New GMC Yukon XL',
  'Hiace High Roof',
  'Toyota Coaster'
);

INSERT INTO public.umrah_transport_routes (route_name, sort_order, notes)
VALUES
  ('Jeddah Airport to Jeddah Hotel (Arrival)', 10, 'Add 98 SAR for H1, Hiace, Coaster if from Hajj Terminal'),
  ('Jeddah Hotel to Jeddah Airport (Departure)', 20, 'Add 98 SAR for H1, Hiace, Coaster if from Hajj Terminal'),
  ('Jeddah Airport to Makkah Hotel (Arrival)', 30, 'Add 98 SAR for H1, Hiace, Coaster if from Hajj Terminal'),
  ('Makkah Hotel to Jeddah Airport (Departure)', 40, NULL),
  ('Jeddah Airport to Madina Hotel (Arrival)', 50, NULL),
  ('Madina Hotel to Jeddah Airport (Departure)', 60, NULL),
  ('Madina Airport to Madina Hotel (Arrival)', 70, NULL),
  ('Madina Hotel to Madina Airport (Departure)', 80, NULL),
  ('Makkah Hotel to Madina Hotel', 90, NULL),
  ('Madina Hotel to Makkah Hotel', 100, NULL),
  ('Makkah Hotel to Madina Hotel VIA BADR', 110, NULL),
  ('Madina Hotel to Makkah Hotel VIA BADR', 120, NULL),
  ('Makkah Hotel to Makkah Train Station or Vice Versa', 130, NULL),
  ('Madina Hotel to Madina Train Station or Vice Versa', 140, NULL),
  ('Madina Hotel to Madina Train Station VIA MEEQAT', 150, NULL),
  ('Makkah or Madinah Mazarat (Standard)', 160, NULL),
  ('Makkah Mazarat with Aysha Masjid', 170, NULL),
  ('Makkah Mazarat with Johrana Masjid', 180, NULL),
  ('Makkah Hotel to Taif Mazarat', 190, NULL),
  ('Taif Airport to Makkah Hotel (Arrival)', 200, NULL),
  ('Makkah Hotel to Taif Airport (Departure)', 210, NULL),
  ('Madina Hotel to Badar Mazarats', 220, NULL),
  ('Madina Hotel to Wadi e Jin', 230, NULL),
  ('Jeddah Airport to Makkah Hotel', 240, NULL),
  ('Makkah Hotel to Madinah Hotel', 250, NULL),
  ('Madinah Hotel to Madinah Airport', 260, NULL),
  ('Madinah Airport to Madinah Hotel', 270, NULL),
  ('Madinah Hotel to Makkah Hotel', 280, NULL),
  ('Makkah Hotel to Jeddah Airport', 290, NULL),
  ('Madinah Hotel to Jeddah Airport', 300, NULL),
  ('Makkah Ziyarat', 310, NULL),
  ('Madinah Ziyarat', 320, NULL)
ON CONFLICT (route_name) DO NOTHING;

INSERT INTO public.umrah_transport_route_plans (plan_name, sort_order)
VALUES
  ('STANDARD ROUTE - MAKKAH TO MADINAH', 10),
  ('STANDARD ROUTE - MADINAH TO MAKKAH', 20),
  ('JEDDAH ENTRY / EXIT - MAKKAH FIRST', 30),
  ('JEDDAH ENTRY / EXIT - MAKKAH TWICE', 40)
ON CONFLICT (plan_name) DO NOTHING;

WITH plan_segments(plan_name, route_name, segment_label, sort_order) AS (
  VALUES
    ('STANDARD ROUTE - MAKKAH TO MADINAH', 'Jeddah Airport to Makkah Hotel', 'Jeddah Airport to Makkah Hotel', 10),
    ('STANDARD ROUTE - MAKKAH TO MADINAH', 'Makkah Hotel to Madinah Hotel', 'Makkah Hotel to Madinah Hotel', 20),
    ('STANDARD ROUTE - MAKKAH TO MADINAH', 'Madinah Hotel to Madinah Airport', 'Madinah Hotel to Madinah Airport', 30),
    ('STANDARD ROUTE - MADINAH TO MAKKAH', 'Madinah Airport to Madinah Hotel', 'Madinah Airport to Madinah Hotel', 10),
    ('STANDARD ROUTE - MADINAH TO MAKKAH', 'Madinah Hotel to Makkah Hotel', 'Madinah Hotel to Makkah Hotel', 20),
    ('STANDARD ROUTE - MADINAH TO MAKKAH', 'Makkah Hotel to Jeddah Airport', 'Makkah Hotel to Jeddah Airport', 30),
    ('JEDDAH ENTRY / EXIT - MAKKAH FIRST', 'Jeddah Airport to Makkah Hotel', 'Jeddah Airport to Makkah Hotel', 10),
    ('JEDDAH ENTRY / EXIT - MAKKAH FIRST', 'Makkah Hotel to Madinah Hotel', 'Makkah Hotel to Madinah Hotel', 20),
    ('JEDDAH ENTRY / EXIT - MAKKAH FIRST', 'Madinah Hotel to Jeddah Airport', 'Madinah Hotel to Jeddah Airport', 30),
    ('JEDDAH ENTRY / EXIT - MAKKAH TWICE', 'Jeddah Airport to Makkah Hotel', 'Jeddah Airport to Makkah Hotel', 10),
    ('JEDDAH ENTRY / EXIT - MAKKAH TWICE', 'Makkah Hotel to Madinah Hotel', 'Makkah Hotel to Madinah Hotel', 20),
    ('JEDDAH ENTRY / EXIT - MAKKAH TWICE', 'Madinah Hotel to Makkah Hotel', 'Madinah Hotel to Makkah Hotel', 30),
    ('JEDDAH ENTRY / EXIT - MAKKAH TWICE', 'Makkah Hotel to Jeddah Airport', 'Makkah Hotel to Jeddah Airport', 40)
)
INSERT INTO public.umrah_transport_route_plan_segments (
  plan_id,
  route_id,
  segment_label,
  sort_order
)
SELECT
  route_plans.id,
  routes.id,
  plan_segments.segment_label,
  plan_segments.sort_order
FROM plan_segments
JOIN public.umrah_transport_route_plans route_plans
  ON route_plans.plan_name = plan_segments.plan_name
JOIN public.umrah_transport_routes routes
  ON routes.route_name = plan_segments.route_name
ON CONFLICT (plan_id, sort_order)
DO UPDATE SET
  route_id = EXCLUDED.route_id,
  segment_label = EXCLUDED.segment_label;

ALTER TABLE public.umrah_transport_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_route_plan_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_guide_rates ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'umrah_transport_suppliers',
        'umrah_transport_vehicle_types',
        'umrah_transport_routes',
        'umrah_transport_route_plans',
        'umrah_transport_route_plan_segments',
        'umrah_transport_rates',
        'umrah_transport_guide_rates'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can manage Umrah transport suppliers"
  ON public.umrah_transport_suppliers FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport suppliers"
  ON public.umrah_transport_suppliers FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage Umrah transport vehicle types"
  ON public.umrah_transport_vehicle_types FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport vehicle types"
  ON public.umrah_transport_vehicle_types FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage Umrah transport routes"
  ON public.umrah_transport_routes FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport routes"
  ON public.umrah_transport_routes FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage Umrah transport route plans"
  ON public.umrah_transport_route_plans FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport route plans"
  ON public.umrah_transport_route_plans FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage Umrah transport route plan segments"
  ON public.umrah_transport_route_plan_segments FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport route plan segments"
  ON public.umrah_transport_route_plan_segments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage Umrah transport rates"
  ON public.umrah_transport_rates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport rates"
  ON public.umrah_transport_rates FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage Umrah transport guide rates"
  ON public.umrah_transport_guide_rates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport guide rates"
  ON public.umrah_transport_guide_rates FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
