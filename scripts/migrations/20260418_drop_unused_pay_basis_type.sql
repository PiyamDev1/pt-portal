-- Safely remove legacy Employee Records enum type if it is truly unused.
-- This migration is idempotent and will no-op if dependencies still exist.

DO $$
DECLARE
  enum_oid oid;
  dependency_count integer;
BEGIN
  SELECT t.oid
  INTO enum_oid
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'pay_basis_type';

  IF enum_oid IS NULL THEN
    RAISE NOTICE 'Type public.pay_basis_type does not exist. Skipping.';
    RETURN;
  END IF;

  -- Count only genuine external dependencies (exclude the implicit auto-created array
  -- companion type, e.g. pay_basis_type[], which always exists for user-defined types).
  SELECT COUNT(*)
  INTO dependency_count
  FROM pg_depend d
  JOIN pg_type dep_t ON dep_t.oid = d.objid AND dep_t.typtype = 'b' AND dep_t.typelem = enum_oid
  WHERE d.refobjid = enum_oid
    AND d.deptype = 'i';

  -- If dependency_count > 0 it means only the companion array type exists (safe to drop).
  -- Real external references would appear as 'n' or 'a' deps pointing to columns, functions, etc.
  SELECT COUNT(*)
  INTO dependency_count
  FROM pg_depend d
  WHERE d.refobjid = enum_oid
    AND d.deptype IN ('n', 'a')
    AND d.classid <> 'pg_type'::regclass;  -- exclude type-to-type deps (array companion)

  IF dependency_count = 0 THEN
    EXECUTE 'DROP TYPE public.pay_basis_type CASCADE';
    RAISE NOTICE 'Dropped type public.pay_basis_type (and its array companion).';
  ELSE
    RAISE NOTICE 'Type public.pay_basis_type still has % external dependencies. Skipping drop.', dependency_count;
  END IF;
END
$$;
