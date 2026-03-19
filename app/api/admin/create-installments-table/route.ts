import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    // Create the loan_installments table
    const SQL_CREATE_TABLE = `
      CREATE TABLE IF NOT EXISTS public.loan_installments (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        loan_transaction_id uuid NOT NULL,
        installment_number integer NOT NULL,
        due_date date NOT NULL,
        amount numeric NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        amount_paid numeric DEFAULT 0,
        created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
        CONSTRAINT loan_installments_pkey PRIMARY KEY (id),
        CONSTRAINT loan_installments_loan_transaction_id_fkey FOREIGN KEY (loan_transaction_id) REFERENCES public.loan_transactions(id) ON DELETE CASCADE,
        CONSTRAINT loan_installments_unique_per_transaction UNIQUE (loan_transaction_id, installment_number)
      );
      
      CREATE INDEX IF NOT EXISTS loan_installments_loan_transaction_id_idx ON public.loan_installments(loan_transaction_id);
      CREATE INDEX IF NOT EXISTS loan_installments_status_idx ON public.loan_installments(status);
    `

    // Execute the SQL using Supabase's RPC or direct query
    // Note: Supabase JS client doesn't support raw SQL execution directly
    // We need to use the SQL editor in Supabase dashboard OR create an RPC function

    // Try to insert a dummy record to see if table exists
    const { error: testError } = await supabase.from('loan_installments').select('id').limit(1)

    if (testError) {
      // Table doesn't exist
      return apiError('Table does not exist. Please run this SQL in your Supabase SQL Editor:', 400, {
        sql: SQL_CREATE_TABLE,
      })
    }

    return apiOk({
      tableReady: true,
      tableExists: true,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to verify installments table'), 500, {
      sql: 'Run the SQL from the error response in Supabase SQL Editor',
    })
  }
}
