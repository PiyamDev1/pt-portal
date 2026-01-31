-- ============================================================================
-- DROP AND RECREATE SERVICE PRICING TABLES
-- ============================================================================

-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.nadra_pricing CASCADE;
DROP TABLE IF EXISTS public.pk_passport_pricing CASCADE;
DROP TABLE IF EXISTS public.gb_passport_pricing CASCADE;
DROP TABLE IF EXISTS public.visa_pricing CASCADE;

-- NADRA PRICING TABLE
CREATE TABLE public.nadra_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  service_option TEXT,
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
CREATE TABLE public.pk_passport_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  speed TEXT NOT NULL,
  application_type TEXT NOT NULL,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_pricing_unique UNIQUE(category, speed, application_type),
  CONSTRAINT pk_passport_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- GB PASSPORT PRICING TABLE
CREATE TABLE public.gb_passport_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group TEXT NOT NULL,
  pages TEXT NOT NULL,
  service_type TEXT NOT NULL,
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
CREATE TABLE public.visa_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  visa_type TEXT NOT NULL,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT visa_pricing_unique UNIQUE(country, visa_type),
  CONSTRAINT visa_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- Create indexes
CREATE INDEX nadra_pricing_service_type_idx ON public.nadra_pricing(service_type);
CREATE INDEX nadra_pricing_is_active_idx ON public.nadra_pricing(is_active);
CREATE INDEX pk_passport_pricing_category_idx ON public.pk_passport_pricing(category);
CREATE INDEX pk_passport_pricing_is_active_idx ON public.pk_passport_pricing(is_active);
CREATE INDEX gb_passport_pricing_age_group_idx ON public.gb_passport_pricing(age_group);
CREATE INDEX gb_passport_pricing_is_active_idx ON public.gb_passport_pricing(is_active);
CREATE INDEX visa_pricing_country_idx ON public.visa_pricing(country);
CREATE INDEX visa_pricing_is_active_idx ON public.visa_pricing(is_active);

-- Enable RLS
ALTER TABLE public.nadra_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_passport_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gb_passport_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read access for authenticated users" ON public.nadra_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.nadra_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for authenticated users" ON public.pk_passport_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.pk_passport_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for authenticated users" ON public.gb_passport_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.gb_passport_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for authenticated users" ON public.visa_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.visa_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);
