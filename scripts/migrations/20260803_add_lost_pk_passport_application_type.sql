-- Ensure Lost is available as a Pakistani passport application type.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pakistani_application_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typname = 'pakistani_application_type'
        AND enum_value.enumlabel = 'Lost'
    ) THEN
      EXECUTE 'ALTER TYPE public.pakistani_application_type ADD VALUE ''Lost''';
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pk_passport_application_types') IS NOT NULL THEN
    INSERT INTO public.pk_passport_application_types (name, is_active)
    SELECT 'Lost', TRUE
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.pk_passport_application_types
      WHERE name = 'Lost'
    );
  END IF;
END;
$$;
