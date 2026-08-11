-- Adds previous-package reimbursement credit as an explicit payment movement.
-- Quote discount types and allocations remain in the immutable quote JSON snapshot.

DO $$ DECLARE constraint_name TEXT; BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.travel_package_payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%payment_type%'
  LOOP
    EXECUTE 'ALTER TABLE public.travel_package_payments DROP CONSTRAINT ' ||
      quote_ident(constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.travel_package_payments
  ADD CONSTRAINT travel_package_payments_payment_type_check
  CHECK (
    payment_type IN (
      'deposit',
      'payment',
      'account_credit',
      'refund',
      'chargeback',
      'commission'
    )
  );
