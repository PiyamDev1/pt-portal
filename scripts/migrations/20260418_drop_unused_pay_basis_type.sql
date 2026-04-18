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

  SELECT COUNT(*)
  INTO dependency_count
  FROM pg_depend d
  WHERE d.refobjid = enum_oid
    AND d.deptype IN ('n', 'a', 'i', 'P', 'S', 'e');

  IF dependency_count = 0 THEN
    EXECUTE 'DROP TYPE public.pay_basis_type';
    RAISE NOTICE 'Dropped type public.pay_basis_type.';
  ELSE
    RAISE NOTICE 'Type public.pay_basis_type still has % dependencies. Skipping drop.', dependency_count;
  END IF;
END
$$;
