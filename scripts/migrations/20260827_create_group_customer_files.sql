-- Creates one operational customer file for linked package groups that pay together.
-- Family quotations remain separate financial sub-accounts inside the shared package folder.

ALTER TABLE public.travel_package_groups
  ADD COLUMN IF NOT EXISTS customer_file_mode TEXT NOT NULL DEFAULT 'separate',
  ADD COLUMN IF NOT EXISTS customer_package_id UUID REFERENCES public.travel_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_file_created_at TIMESTAMPTZ;

ALTER TABLE public.travel_package_groups
  DROP CONSTRAINT IF EXISTS travel_package_groups_customer_file_mode_check;
ALTER TABLE public.travel_package_groups
  ADD CONSTRAINT travel_package_groups_customer_file_mode_check
  CHECK (customer_file_mode IN ('separate', 'combined'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_groups_customer_package
  ON public.travel_package_groups (customer_package_id)
  WHERE customer_package_id IS NOT NULL;

ALTER TABLE public.travel_packages
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.travel_package_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_file_mode TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.travel_packages
  DROP CONSTRAINT IF EXISTS travel_packages_customer_file_mode_check;
ALTER TABLE public.travel_packages
  ADD CONSTRAINT travel_packages_customer_file_mode_check
  CHECK (customer_file_mode IN ('individual', 'group'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_packages_combined_group
  ON public.travel_packages (group_id)
  WHERE group_id IS NOT NULL AND customer_file_mode = 'group';

-- The quote identifies the family financial account. The group member preserves
-- its display label and remains stable even if the quote is archived later.
ALTER TABLE public.travel_package_passengers
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_member_id UUID REFERENCES public.travel_package_group_members(id) ON DELETE SET NULL;

ALTER TABLE public.travel_package_reservations
  ADD COLUMN IF NOT EXISTS group_member_id UUID REFERENCES public.travel_package_group_members(id) ON DELETE SET NULL;

ALTER TABLE public.travel_package_payments
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.travel_package_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_member_id UUID REFERENCES public.travel_package_group_members(id) ON DELETE SET NULL;

ALTER TABLE public.travel_package_invoices
  ADD COLUMN IF NOT EXISTS group_member_id UUID REFERENCES public.travel_package_group_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_travel_package_passengers_family
  ON public.travel_package_passengers (package_id, quote_id, group_member_id);

CREATE INDEX IF NOT EXISTS idx_travel_package_reservations_family
  ON public.travel_package_reservations (package_id, quote_id, group_member_id);

CREATE INDEX IF NOT EXISTS idx_travel_package_payments_family
  ON public.travel_package_payments (package_id, quote_id, group_member_id);

CREATE INDEX IF NOT EXISTS idx_travel_package_invoices_family
  ON public.travel_package_invoices (package_id, quote_id, group_member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_package_invoices_active_family
  ON public.travel_package_invoices (package_id, quote_id)
  WHERE quote_id IS NOT NULL AND status <> 'void';
