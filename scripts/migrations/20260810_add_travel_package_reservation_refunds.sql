-- Adds explicit reservation refund tracking.
-- Refunds are stored as positive values so original booked and sold figures remain auditable.

ALTER TABLE public.travel_package_reservations
  ADD COLUMN IF NOT EXISTS supplier_refund_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_refund_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_refunded_at TIMESTAMPTZ;

ALTER TABLE public.travel_package_payments
  ADD COLUMN IF NOT EXISTS reservation_id UUID
    REFERENCES public.travel_package_reservations(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.travel_package_reservations'::regclass
      AND conname = 'travel_package_reservations_supplier_refund_nonnegative'
  ) THEN
    ALTER TABLE public.travel_package_reservations
      ADD CONSTRAINT travel_package_reservations_supplier_refund_nonnegative
      CHECK (supplier_refund_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.travel_package_reservations'::regclass
      AND conname = 'travel_package_reservations_customer_refund_nonnegative'
  ) THEN
    ALTER TABLE public.travel_package_reservations
      ADD CONSTRAINT travel_package_reservations_customer_refund_nonnegative
      CHECK (customer_refund_total >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_package_payments_reservation
  ON public.travel_package_payments (reservation_id, created_at DESC)
  WHERE reservation_id IS NOT NULL;
