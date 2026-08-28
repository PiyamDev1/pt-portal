-- Allows every family in a combined customer file to point at the same package folder.
-- The previous (group_id, package_id) uniqueness rule only allowed one family link and
-- caused the post-conversion backfill to fail for every multi-family package group.

DROP INDEX IF EXISTS public.idx_travel_package_group_members_package_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_package_group_members_package_quote_unique
  ON public.travel_package_group_members (group_id, package_id, quote_id)
  WHERE package_id IS NOT NULL AND quote_id IS NOT NULL;

UPDATE public.travel_package_group_members AS member
SET
  package_id = package_group.customer_package_id,
  updated_at = NOW()
FROM public.travel_package_groups AS package_group
WHERE member.group_id = package_group.id
  AND package_group.customer_file_mode = 'combined'
  AND package_group.customer_package_id IS NOT NULL
  AND member.quote_id IS NOT NULL
  AND member.package_id IS DISTINCT FROM package_group.customer_package_id;
