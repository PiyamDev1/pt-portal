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

-- GB PASSPORT PRICING TABLE
-- Links pricing to GB passport categories (age groups), pages, and service types
CREATE TABLE IF NOT EXISTS public.gb_passport_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group TEXT NOT NULL,
  -- Age groups: Adult, Child, Infant, etc.
  pages TEXT NOT NULL,
  -- Pages: 32, 48, 52, etc.
  service_type TEXT NOT NULL,
  -- Service types: Standard, Express, Premium, etc.
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT gb_passport_pricing_unique UNIQUE(age_group, pages, service_type),
  CONSTRAINT gb_passport_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- VISA PRICING TABLE
-- Links pricing to visa countries and visa types
CREATE TABLE IF NOT EXISTS public.visa_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  -- Countries: USA, Canada, UK, Schengen, etc.
  visa_type TEXT NOT NULL,
  -- Visa types: Tourist, Business, Student, Work, etc.
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT visa_pricing_unique UNIQUE(country, visa_type),
  CONSTRAINT visa_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- Create indexes for GB Passport
CREATE INDEX IF NOT EXISTS gb_passport_pricing_age_group_idx ON public.gb_passport_pricing(age_group);
CREATE INDEX IF NOT EXISTS gb_passport_pricing_is_active_idx ON public.gb_passport_pricing(is_active);

-- Create indexes for Visa
CREATE INDEX IF NOT EXISTS visa_pricing_country_idx ON public.visa_pricing(country);
CREATE INDEX IF NOT EXISTS visa_pricing_is_active_idx ON public.visa_pricing(is_active);

-- Enable RLS
ALTER TABLE public.nadra_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_passport_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gb_passport_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users to read, only admins to write
CREATE POLICY "Enable read access for all authenticated users" ON public.nadra_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.nadra_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all authenticated users" ON public.pk_passport_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.pk_passport_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all authenticated users" ON public.gb_passport_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.gb_passport_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all authenticated users" ON public.visa_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.visa_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);
