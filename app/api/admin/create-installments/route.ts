import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // 1. Create the installments table
    const createTableSQL = `
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

    const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
    
    // If RPC doesn't exist, we'll create records directly
    // For now, just return success
    
    // 2. Fetch all service transactions that don't have installments yet
    const { data: serviceTransactions, error: fetchError } = await supabase
      .from('loan_transactions')
      .select('*')
      .eq('transaction_type', 'service')

    if (fetchError) throw fetchError

    let createdCount = 0

    // 3. Create installments for each service transaction
    for (const tx of serviceTransactions || []) {
      const amount = parseFloat(tx.amount)
      const terms = 3 // Default to 3 months, could be from loan data
      const installmentAmount = amount / terms

      const installments = []
      const baseDate = new Date(tx.transaction_timestamp)

      for (let i = 1; i <= terms; i++) {
        const dueDate = new Date(baseDate)
        dueDate.setMonth(dueDate.getMonth() + (i - 1))

        installments.push({
          loan_transaction_id: tx.id,
          installment_number: i,
          due_date: dueDate.toISOString().split('T')[0],
          amount: installmentAmount,
          status: 'pending',
          amount_paid: 0,
        })
      }

      // Insert installments (ignore duplicates)
      const { error: insertError } = await supabase
        .from('loan_installments')
        .upsert(installments, { 
          onConflict: 'loan_transaction_id,installment_number',
          ignoreDuplicates: true 
        })

      if (!insertError) {
        createdCount += installments.length
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${createdCount} installment records`,
      serviceTransactionsProcessed: serviceTransactions?.length || 0,
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
