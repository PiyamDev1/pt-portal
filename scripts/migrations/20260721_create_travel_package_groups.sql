-- Adds linked travel package groups for families travelling together.
-- Packages remain separate; shared services such as transport belong to the group.
-- Customer-facing output should use notes only unless an agent explicitly enables group visibility.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.travel_package_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_reference TEXT NOT NULL UNIQUE
    DEFAULT (
      'PTG-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', '') FROM 1 FOR 6))
    ),
  title TEXT NOT NULL,
  lead_package_id UUID REFERENCES public.travel_packages(id) ON DELETE SET NULL,
  lead_quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'active',
        'partially_finalised',
        'finalised',
        'cancelled',
        'completed',
        'archived'
      )
    ),
  customer_visibility_mode TEXT NOT NULL DEFAULT 'linked_notice_only'
    CHECK (
      customer_visibility_mode IN (
        'private',
        'linked_notice_only',
        'shared_group_view'
      )
    ),
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_package_groups_status_created
  ON public.travel_package_groups (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_groups_lead_package
  ON public.travel_package_groups (lead_package_id)
  WHERE lead_package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_package_groups_lead_quote
  ON public.travel_package_groups (lead_quote_id)
  WHERE lead_quote_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.travel_package_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.travel_package_groups(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE CASCADE,
  family_label TEXT NOT NULL DEFAULT 'Family',
  customer_display_name TEXT,
  is_lead_family BOOLEAN NOT NULL DEFAULT FALSE,
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (package_id IS NOT NULL OR quote_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_group_members_package_unique
  ON public.travel_package_group_members (group_id, package_id)
  WHERE package_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_group_members_quote_unique
  ON public.travel_package_group_members (group_id, quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_package_group_members_group_sort
  ON public.travel_package_group_members (group_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_travel_package_group_members_package
  ON public.travel_package_group_members (package_id)
  WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_travel_package_group_members_quote
  ON public.travel_package_group_members (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.travel_package_group_shared_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.travel_package_groups(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL DEFAULT 'transport'
    CHECK (service_type IN ('transport', 'guide', 'ziyarat', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'quoted',
        'reserved',
        'confirmed',
        'changed',
        'cancelled'
      )
    ),
  supplier_name TEXT,
  supplier_reference TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  internal_total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_note TEXT NOT NULL DEFAULT '',
  allocation_mode TEXT NOT NULL DEFAULT 'no_split_note_only'
    CHECK (
      allocation_mode IN (
        'per_passenger',
        'equal_per_package',
        'manual',
        'one_package_pays',
        'no_split_note_only'
      )
    ),
  allocation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_package_group_shared_services_group
  ON public.travel_package_group_shared_services (group_id, service_type, status);

CREATE TABLE IF NOT EXISTS public.travel_package_group_service_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shared_service_id UUID NOT NULL REFERENCES public.travel_package_group_shared_services(id)
    ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.travel_package_groups(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.travel_packages(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE CASCADE,
  allocation_mode TEXT NOT NULL DEFAULT 'no_split_note_only'
    CHECK (
      allocation_mode IN (
        'per_passenger',
        'equal_per_package',
        'manual',
        'one_package_pays',
        'no_split_note_only'
      )
    ),
  passenger_count INTEGER NOT NULL DEFAULT 0,
  allocated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  allocated_sale_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (package_id IS NOT NULL OR quote_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_travel_package_group_allocations_service
  ON public.travel_package_group_service_allocations (shared_service_id, package_id, quote_id);

CREATE INDEX IF NOT EXISTS idx_travel_package_group_allocations_group
  ON public.travel_package_group_service_allocations (group_id, package_id, quote_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_group_allocations_package_unique
  ON public.travel_package_group_service_allocations (shared_service_id, package_id)
  WHERE package_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_group_allocations_quote_unique
  ON public.travel_package_group_service_allocations (shared_service_id, quote_id)
  WHERE quote_id IS NOT NULL;

DROP TRIGGER IF EXISTS travel_package_groups_updated_at
  ON public.travel_package_groups;
CREATE TRIGGER travel_package_groups_updated_at
  BEFORE UPDATE ON public.travel_package_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_group_members_updated_at
  ON public.travel_package_group_members;
CREATE TRIGGER travel_package_group_members_updated_at
  BEFORE UPDATE ON public.travel_package_group_members
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_group_shared_services_updated_at
  ON public.travel_package_group_shared_services;
CREATE TRIGGER travel_package_group_shared_services_updated_at
  BEFORE UPDATE ON public.travel_package_group_shared_services
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

DROP TRIGGER IF EXISTS travel_package_group_service_allocations_updated_at
  ON public.travel_package_group_service_allocations;
CREATE TRIGGER travel_package_group_service_allocations_updated_at
  BEFORE UPDATE ON public.travel_package_group_service_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_travel_packages_updated_at();

ALTER TABLE public.travel_package_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_group_shared_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_package_group_service_allocations ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'travel_package_groups',
        'travel_package_group_members',
        'travel_package_group_shared_services',
        'travel_package_group_service_allocations'
      )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can manage travel package groups"
  ON public.travel_package_groups FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package groups"
  ON public.travel_package_groups FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage travel package group members"
  ON public.travel_package_group_members FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package group members"
  ON public.travel_package_group_members FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage travel package group shared services"
  ON public.travel_package_group_shared_services FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package group shared services"
  ON public.travel_package_group_shared_services FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can manage travel package group service allocations"
  ON public.travel_package_group_service_allocations FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role can manage travel package group service allocations"
  ON public.travel_package_group_service_allocations FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
