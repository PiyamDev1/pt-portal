-- ============================================================================
-- SERVICE LOOKUP TABLES (Following GB Passport Pattern)
-- ============================================================================
-- These are the master service registries that applications will reference
-- The pricing tables will link to these lookup tables via foreign keys

-- ============================================================================
-- NADRA SERVICE LOOKUP TABLES
-- ============================================================================

-- NADRA Service Types
CREATE TABLE IF NOT EXISTS public.nadra_service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_service_types_name_check CHECK (name != '')
);

-- Insert default NADRA service types
INSERT INTO public.nadra_service_types (name, description) VALUES
  ('NICOP/CNIC', 'National Identity Card for Overseas Pakistanis / Computerized National ID Card'),
  ('POC', 'Proof of Citizenship'),
  ('FRC', 'Family Registration Certificate'),
  ('CRC', 'Character Registration Certificate'),
  ('POA', 'Power of Attorney'),
  ('FAMILY REGISTRATION', 'Family Registration Service'),
  ('POLICE VERIFICATION', 'Police Verification Service')
ON CONFLICT DO NOTHING;

-- NADRA Service Options (for each service type)
CREATE TABLE IF NOT EXISTS public.nadra_service_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id UUID NOT NULL REFERENCES public.nadra_service_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_service_options_unique UNIQUE(service_type_id, name),
  CONSTRAINT nadra_service_options_name_check CHECK (name != '')
);

-- Insert default NADRA service options
INSERT INTO public.nadra_service_options (service_type_id, name, description) 
SELECT id, 'Normal', 'Standard processing' FROM public.nadra_service_types WHERE name = 'NICOP/CNIC'
ON CONFLICT DO NOTHING;

INSERT INTO public.nadra_service_options (service_type_id, name, description) 
SELECT id, 'Executive', 'Expedited processing' FROM public.nadra_service_types WHERE name = 'NICOP/CNIC'
ON CONFLICT DO NOTHING;

INSERT INTO public.nadra_service_options (service_type_id, name, description) 
SELECT id, 'Upgrade to Fast', 'Upgrade to faster service' FROM public.nadra_service_types WHERE name = 'NICOP/CNIC'
ON CONFLICT DO NOTHING;

INSERT INTO public.nadra_service_options (service_type_id, name, description) 
SELECT id, 'Modification', 'Modify existing record' FROM public.nadra_service_types WHERE name = 'NICOP/CNIC'
ON CONFLICT DO NOTHING;

INSERT INTO public.nadra_service_options (service_type_id, name, description) 
SELECT id, 'Reprint', 'Reprint of card' FROM public.nadra_service_types WHERE name = 'NICOP/CNIC'
ON CONFLICT DO NOTHING;

INSERT INTO public.nadra_service_options (service_type_id, name, description) 
SELECT id, 'Cancellation', 'Cancel service' FROM public.nadra_service_types WHERE name = 'NICOP/CNIC'
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS nadra_service_types_is_active_idx ON public.nadra_service_types(is_active);
CREATE INDEX IF NOT EXISTS nadra_service_options_service_type_id_idx ON public.nadra_service_options(service_type_id);
CREATE INDEX IF NOT EXISTS nadra_service_options_is_active_idx ON public.nadra_service_options(is_active);

-- Enable RLS
ALTER TABLE public.nadra_service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nadra_service_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read access for all" ON public.nadra_service_types FOR SELECT USING (true);
CREATE POLICY "Enable admin write access" ON public.nadra_service_types FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all" ON public.nadra_service_options FOR SELECT USING (true);
CREATE POLICY "Enable admin write access" ON public.nadra_service_options FOR ALL USING (auth.role() = 'authenticated'::text);

-- ============================================================================
-- PAKISTANI PASSPORT LOOKUP TABLES
-- ============================================================================

-- Passport Categories
CREATE TABLE IF NOT EXISTS public.pk_passport_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_categories_name_check CHECK (name != '')
);

-- Insert default categories
INSERT INTO public.pk_passport_categories (name, description) VALUES
  ('Child 5 Year', 'Passport valid for 5 years for children'),
  ('Adult 10 Year', 'Passport valid for 10 years for adults')
ON CONFLICT DO NOTHING;

-- Passport Speeds
CREATE TABLE IF NOT EXISTS public.pk_passport_speeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_speeds_name_check CHECK (name != '')
);

-- Insert default speeds
INSERT INTO public.pk_passport_speeds (name, description) VALUES
  ('Executive', 'Expedited processing'),
  ('Normal', 'Standard processing')
ON CONFLICT DO NOTHING;

-- Application Types
CREATE TABLE IF NOT EXISTS public.pk_passport_application_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_application_types_name_check CHECK (name != '')
);

-- Insert default application types
INSERT INTO public.pk_passport_application_types (name, description) VALUES
  ('First Time', 'First time passport application'),
  ('Renewal', 'Passport renewal')
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS pk_passport_categories_is_active_idx ON public.pk_passport_categories(is_active);
CREATE INDEX IF NOT EXISTS pk_passport_speeds_is_active_idx ON public.pk_passport_speeds(is_active);
CREATE INDEX IF NOT EXISTS pk_passport_application_types_is_active_idx ON public.pk_passport_application_types(is_active);

-- Enable RLS
ALTER TABLE public.pk_passport_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_passport_speeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_passport_application_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read access for all" ON public.pk_passport_categories FOR SELECT USING (true);
CREATE POLICY "Enable admin write access" ON public.pk_passport_categories FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all" ON public.pk_passport_speeds FOR SELECT USING (true);
CREATE POLICY "Enable admin write access" ON public.pk_passport_speeds FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all" ON public.pk_passport_application_types FOR SELECT USING (true);
CREATE POLICY "Enable admin write access" ON public.pk_passport_application_types FOR ALL USING (auth.role() = 'authenticated'::text);

-- ============================================================================
-- REFACTORED PRICING TABLES (with foreign keys to lookup tables)
-- ============================================================================

-- NADRA PRICING (now referencing lookup tables)
DROP TABLE IF EXISTS public.nadra_pricing CASCADE;

CREATE TABLE public.nadra_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id UUID NOT NULL REFERENCES public.nadra_service_types(id) ON DELETE CASCADE,
  service_option_id UUID REFERENCES public.nadra_service_options(id) ON DELETE CASCADE,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_pricing_unique UNIQUE(service_type_id, service_option_id),
  CONSTRAINT nadra_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- PK PASSPORT PRICING (now referencing lookup tables)
DROP TABLE IF EXISTS public.pk_passport_pricing CASCADE;

CREATE TABLE public.pk_passport_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.pk_passport_categories(id) ON DELETE CASCADE,
  speed_id UUID NOT NULL REFERENCES public.pk_passport_speeds(id) ON DELETE CASCADE,
  application_type_id UUID NOT NULL REFERENCES public.pk_passport_application_types(id) ON DELETE CASCADE,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_pricing_unique UNIQUE(category_id, speed_id, application_type_id),
  CONSTRAINT pk_passport_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS nadra_pricing_service_type_id_idx ON public.nadra_pricing(service_type_id);
CREATE INDEX IF NOT EXISTS nadra_pricing_service_option_id_idx ON public.nadra_pricing(service_option_id);
CREATE INDEX IF NOT EXISTS nadra_pricing_is_active_idx ON public.nadra_pricing(is_active);

CREATE INDEX IF NOT EXISTS pk_passport_pricing_category_id_idx ON public.pk_passport_pricing(category_id);
CREATE INDEX IF NOT EXISTS pk_passport_pricing_speed_id_idx ON public.pk_passport_pricing(speed_id);
CREATE INDEX IF NOT EXISTS pk_passport_pricing_application_type_id_idx ON public.pk_passport_pricing(application_type_id);
CREATE INDEX IF NOT EXISTS pk_passport_pricing_is_active_idx ON public.pk_passport_pricing(is_active);

-- Enable RLS
ALTER TABLE public.nadra_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_passport_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read access for all authenticated users" ON public.nadra_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.nadra_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable read access for all authenticated users" ON public.pk_passport_pricing
  FOR SELECT USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Enable write access for authenticated users" ON public.pk_passport_pricing
  FOR ALL USING (auth.role() = 'authenticated'::text);
