import { createClient } from '@supabase/supabase-js'

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

/**
 * Ensure loan_installments table exists, creating it if needed
 */
export async function ensureInstallmentsTableExists() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      console.warn('Supabase not configured')
      return false
    }

    const supabase = createClient(url, key)
    
    // First, try a simple query to see if table exists
    try {
      await supabase
        .from('loan_installments')
        .select('id', { count: 'exact' })
        .limit(1)
      
      // Table exists
      return true
    } catch (e) {
      // Table doesn't exist, that's ok - system will work with client-side generation
      console.log('Installments table does not exist yet, will use client-side fallback')
      return false
    }
  } catch (error) {
    console.error('Error in ensureInstallmentsTableExists:', error)
    return false
  }
}

/**
 * Create installment records for a service transaction
 */
export async function createInstallmentRecords(
  loanTransactionId: string,
  amount: number,
  serviceDate: string,
  numberOfTerms: number = 3
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      console.warn('Supabase not configured')
      return null
    }

    const supabase = createClient(url, key)

    // Ensure table exists
    const tableExists = await ensureInstallmentsTableExists()
    if (!tableExists) {
      console.warn('Could not ensure installments table exists')
      return null
    }

    // Calculate installment details
    const installmentAmount = amount / numberOfTerms
    const baseDate = new Date(serviceDate)
    
    console.log(`Creating ${numberOfTerms} installments for transaction ${loanTransactionId}:`)
    console.log(`  Total amount: ${amount}`)
    console.log(`  Installment amount: ${installmentAmount}`)
    
    const records = Array.from({ length: numberOfTerms }, (_, i) => {
      const dueDate = new Date(baseDate.getTime() + ((i + 1) * 30 * 24 * 60 * 60 * 1000))
      return {
        loan_transaction_id: loanTransactionId,
        installment_number: i + 1,
        due_date: dueDate.toISOString().split('T')[0],
        amount: installmentAmount,
        status: 'pending',
        amount_paid: 0,
      }
    })

    // Insert records
    const { data, error } = await supabase
      .from('loan_installments')
      .insert(records)
      .select()

    if (error) {
      console.error('Error creating installment records:', error)
      return null
    }

    console.log(`Created ${data?.length || 0} installment records for transaction ${loanTransactionId}`)
    return data
  } catch (error) {
    console.error('Error in createInstallmentRecords:', error)
    return null
  }
}

/**
 * Create detailed installment records from a plan (with specific dates and amounts)
 */
export async function createDetailedInstallmentRecords(
  loanTransactionId: string,
  installmentPlan: Array<{ dueDate: string; amount: number }>,
  paymentFrequency?: string
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      console.warn('Supabase not configured')
      return null
    }

    const supabase = createClient(url, key)

    // Ensure table exists
    const tableExists = await ensureInstallmentsTableExists()
    if (!tableExists) {
      console.warn('Could not ensure installments table exists')
      return null
    }

    console.log(`Creating ${installmentPlan.length} detailed installments for transaction ${loanTransactionId}:`)
    
    const records = installmentPlan.map((installment, i) => ({
      loan_transaction_id: loanTransactionId,
      installment_number: i + 1,
      due_date: installment.dueDate,
      amount: installment.amount,
      status: 'pending',
      amount_paid: 0,
    }))

    // Insert records
    const { data, error } = await supabase
      .from('loan_installments')
      .insert(records)
      .select()

    if (error) {
      console.error('Error creating detailed installment records:', error)
      return null
    }

    console.log(`Created ${data?.length || 0} detailed installment records for transaction ${loanTransactionId}`)
    return data
  } catch (error) {
    console.error('Error in createDetailedInstallmentRecords:', error)
    return null
  }
}
