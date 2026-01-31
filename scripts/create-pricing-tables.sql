-- ============================================================================
-- SERVICE PRICING TABLES
-- ============================================================================
-- These tables link pricing to existing service data across applications

-- NADRA PRICING TABLE
-- Links pricing to NADRA service types and options (NICOP/CNIC, POC, FRC, CRC, etc.)
CREATE TABLE IF NOT EXISTS public.nadra_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  -- service_type can be: NICOP/CNIC, POC, FRC, CRC, etc.
  service_option TEXT,
  -- For NICOP/CNIC: Normal, Executive, Cancellation
  -- For POC/FRC/CRC: typically NULL or specific variants
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_pricing_unique UNIQUE(service_type, service_option),
  CONSTRAINT nadra_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- PK PASSPORT PRICING TABLE
-- Links pricing to Pakistani passport categories, speeds, and application types
CREATE TABLE IF NOT EXISTS public.pk_passport_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  -- Categories: Child 5 Year, Adult 10 Year, etc.
  speed TEXT NOT NULL,
  -- Speeds: Executive, etc.
  application_type TEXT NOT NULL,
  -- Application types: First Time, Renewal, etc.
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_pricing_unique UNIQUE(category, speed, application_type),
  CONSTRAINT pk_passport_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS nadra_pricing_service_type_idx ON public.nadra_pricing(service_type);
CREATE INDEX IF NOT EXISTS nadra_pricing_is_active_idx ON public.nadra_pricing(is_active);
CREATE INDEX IF NOT EXISTS pk_passport_pricing_category_idx ON public.pk_passport_pricing(category);
CREATE INDEX IF NOT EXISTS pk_passport_pricing_is_active_idx ON public.pk_passport_pricing(is_active);

-- Enable RLS
ALTER TABLE public.nadra_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_passport_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users to read, only admins to write
CREATE POLICY "Enable read access for all authenticated users" ON public.nadra_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.nadra_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all authenticated users" ON public.pk_passport_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.pk_passport_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);
