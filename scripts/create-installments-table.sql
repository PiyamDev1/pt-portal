-- Create installments table to track individual installment plans
CREATE TABLE IF NOT EXISTS public.loan_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_transaction_id uuid NOT NULL,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, paid, partial, overdue
  amount_paid numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT loan_installments_pkey PRIMARY KEY (id),
  CONSTRAINT loan_installments_loan_transaction_id_fkey FOREIGN KEY (loan_transaction_id) REFERENCES public.loan_transactions(id) ON DELETE CASCADE,
  CONSTRAINT loan_installments_unique_per_transaction UNIQUE (loan_transaction_id, installment_number)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS loan_installments_loan_transaction_id_idx ON public.loan_installments(loan_transaction_id);
CREATE INDEX IF NOT EXISTS loan_installments_status_idx ON public.loan_installments(status);

-- Add comment
COMMENT ON TABLE public.loan_installments IS 'Tracks individual installment plans for loan service transactions';
