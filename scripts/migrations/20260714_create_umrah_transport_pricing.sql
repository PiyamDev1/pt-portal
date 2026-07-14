-- Adds Umrah transport pricing matrices for supplier comparison.
-- Managers can keep route, supplier, vehicle, and net-cost data in one pricing source.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.umrah_transport_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_umrah_transport_routes_sort
  ON public.umrah_transport_routes (is_active DESC, sort_order, route_name);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_rates_lookup
  ON public.umrah_transport_rates (vehicle_type_id, route_id, supplier_id);

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

DROP TRIGGER IF EXISTS umrah_transport_rates_updated_at ON public.umrah_transport_rates;
CREATE TRIGGER umrah_transport_rates_updated_at
  BEFORE UPDATE ON public.umrah_transport_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_umrah_transport_pricing_updated_at();

INSERT INTO public.umrah_transport_suppliers (name, sort_order)
VALUES
  ('Transport Supplier 1', 10),
  ('Transport Supplier 2', 20),
  ('Transport Supplier 3', 30)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.umrah_transport_vehicle_types (label, passenger_capacity, sort_order)
VALUES
  ('Sedan Camry / Sonata', '2-3 Pax', 10),
  ('Ford Taurus', '2-3 Pax', 20),
  ('Hyundai H1 / Staria / Starex', '3-5 Pax', 30),
  ('GMC Yukon XL', '6-7 Pax', 40),
  ('New GMC Yukon XL', '5-7 Pax', 50),
  ('Hiace High Roof', '10-12 Pax', 60),
  ('Toyota Coaster', '15-16 Pax', 70)
ON CONFLICT (label) DO NOTHING;

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
  ('Madina Hotel to Wadi e Jin', 230, NULL)
ON CONFLICT (route_name) DO NOTHING;

ALTER TABLE public.umrah_transport_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.umrah_transport_rates ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'umrah_transport_suppliers',
        'umrah_transport_vehicle_types',
        'umrah_transport_routes',
        'umrah_transport_rates'
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

CREATE POLICY "Authenticated can manage Umrah transport rates"
  ON public.umrah_transport_rates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage Umrah transport rates"
  ON public.umrah_transport_rates FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
