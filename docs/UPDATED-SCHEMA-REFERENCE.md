-- UPDATED DATABASE SCHEMA (Reference Only)
-- This schema reflects the latest architecture with proper lookup tables
-- For the master copy in your reference, update it with this content

-- ============================================================================
-- NADRA SERVICE LOOKUP TABLES
-- ============================================================================

CREATE TABLE public.nadra_service_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_service_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.nadra_service_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_type_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_service_options_pkey PRIMARY KEY (id),
  CONSTRAINT nadra_service_options_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.nadra_service_types(id) ON DELETE CASCADE,
  CONSTRAINT nadra_service_options_unique UNIQUE(service_type_id, name)
);

-- ============================================================================
-- PAKISTANI PASSPORT LOOKUP TABLES
-- ============================================================================

CREATE TABLE public.pk_passport_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pk_passport_speeds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_speeds_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pk_passport_application_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_application_types_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- PRICING TABLES (REFACTORED - now reference lookup tables)
-- ============================================================================

CREATE TABLE public.nadra_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_type_id uuid NOT NULL,
  service_option_id uuid,
  cost_price numeric(10,2) DEFAULT 0,
  sale_price numeric(10,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_pricing_pkey PRIMARY KEY (id),
  CONSTRAINT nadra_pricing_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.nadra_service_types(id) ON DELETE CASCADE,
  CONSTRAINT nadra_pricing_service_option_id_fkey FOREIGN KEY (service_option_id) REFERENCES public.nadra_service_options(id) ON DELETE CASCADE,
  CONSTRAINT nadra_pricing_unique UNIQUE(service_type_id, service_option_id),
  CONSTRAINT nadra_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

CREATE TABLE public.pk_passport_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  speed_id uuid NOT NULL,
  application_type_id uuid NOT NULL,
  cost_price numeric(10,2) DEFAULT 0,
  sale_price numeric(10,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_pricing_pkey PRIMARY KEY (id),
  CONSTRAINT pk_passport_pricing_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.pk_passport_categories(id) ON DELETE CASCADE,
  CONSTRAINT pk_passport_pricing_speed_id_fkey FOREIGN KEY (speed_id) REFERENCES public.pk_passport_speeds(id) ON DELETE CASCADE,
  CONSTRAINT pk_passport_pricing_application_type_id_fkey FOREIGN KEY (application_type_id) REFERENCES public.pk_passport_application_types(id) ON DELETE CASCADE,
  CONSTRAINT pk_passport_pricing_unique UNIQUE(category_id, speed_id, application_type_id),
  CONSTRAINT pk_passport_pricing_prices_check CHECK (cost_price >= 0 AND sale_price >= 0)
);

-- ============================================================================
-- EXISTING APPLICATION TABLES (UPDATED)
-- ============================================================================
-- These tables now show the relationship to the service lookup tables
-- No changes needed - they continue to work as before

CREATE TABLE public.nadra_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  service_type text NOT NULL,
  -- service_type should match nadra_service_types.name (e.g., "NICOP/CNIC", "POC")
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  tracking_number text,
  status text NOT NULL DEFAULT 'Pending Submission',
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  application_pin text,
  application_id uuid,
  CONSTRAINT nadra_services_pkey PRIMARY KEY (id),
  CONSTRAINT nadra_services_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT nadra_services_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT nadra_services_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id)
);

CREATE TABLE public.nicop_cnic_details (
  id uuid NOT NULL,
  service_option text NOT NULL,
  -- service_option should match nadra_service_options.name (e.g., "Normal", "Executive")
  CONSTRAINT nicop_cnic_details_pkey PRIMARY KEY (id),
  CONSTRAINT nicop_cnic_details_id_fkey FOREIGN KEY (id) REFERENCES public.nadra_services(id)
);

CREATE TABLE public.pakistani_passport_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  tracking_number text,
  passport_number text,
  status text NOT NULL DEFAULT 'Pending Submission',
  category text NOT NULL,
  -- category should match pk_passport_categories.name
  speed text NOT NULL,
  -- speed should match pk_passport_speeds.name
  application_type text NOT NULL,
  -- application_type should match pk_passport_application_types.name
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  old_passport_number text,
  new_passport_number text,
  is_old_passport_returned boolean DEFAULT false,
  old_passport_returned_at timestamp with time zone,
  old_passport_returned_by uuid,
  fingerprints_completed boolean DEFAULT false,
  page_count text,
  application_id uuid,
  family_head_email text,
  CONSTRAINT pakistani_passport_applications_pkey PRIMARY KEY (id),
  CONSTRAINT pakistani_passport_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT pakistani_passport_applications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT pakistani_passport_applications_old_passport_returned_by_fkey FOREIGN KEY (old_passport_returned_by) REFERENCES public.employees(id),
  CONSTRAINT pakistani_passport_applications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id)
);

-- ============================================================================
-- GB PASSPORT (Already properly structured)
-- ============================================================================

CREATE TABLE public.gb_passport_ages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_ages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gb_passport_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  option_label text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_pages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gb_passport_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_services_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gb_passport_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  age_id uuid,
  pages_id uuid,
  service_id uuid,
  cost_price numeric DEFAULT 0,
  sale_price numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gb_passport_pricing_pkey PRIMARY KEY (id),
  CONSTRAINT gb_passport_pricing_age_id_fkey FOREIGN KEY (age_id) REFERENCES public.gb_passport_ages(id),
  CONSTRAINT gb_passport_pricing_pages_id_fkey FOREIGN KEY (pages_id) REFERENCES public.gb_passport_pages(id),
  CONSTRAINT gb_passport_pricing_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.gb_passport_services(id)
);

CREATE TABLE public.british_passport_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  pex_number text,
  passport_number text,
  status text NOT NULL DEFAULT 'Pending Submission',
  age_group text NOT NULL,
  service_type text NOT NULL,
  pages text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  application_id uuid,
  cost_price numeric DEFAULT 0,
  sale_price numeric DEFAULT 0,
  pricing_id uuid,
  CONSTRAINT british_passport_applications_pkey PRIMARY KEY (id),
  CONSTRAINT british_passport_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id),
  CONSTRAINT british_passport_applications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT british_passport_applications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id),
  CONSTRAINT british_passport_applications_pricing_id_fkey FOREIGN KEY (pricing_id) REFERENCES public.gb_passport_pricing(id)
);
