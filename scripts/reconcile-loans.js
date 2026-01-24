#!/usr/bin/env node
/*
  Reconcile LMS loans: for any loan with no transactions, insert a backfilled Service transaction
  equal to total_debt_amount so statements and computed balances align with loan balances.
*/
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const { data: loans, error: loansError } = await supabase
    .from('loans')
    .select('id, loan_customer_id, total_debt_amount, current_balance, created_at')
    .order('created_at', { ascending: false })
  if (loansError) throw loansError

  let backfilled = 0
  for (const loan of loans || []) {
    const { data: txs, error: txError } = await supabase
      .from('loan_transactions')
      .select('id, transaction_type')
      .eq('loan_id', loan.id)
    if (txError) throw txError

    const hasDebtTx = (txs || []).some(t => t.transaction_type === 'Service' || t.transaction_type === 'Fee')
    if (!hasDebtTx) {
      const amount = Number(loan.total_debt_amount || loan.current_balance || 0)
      if (amount <= 0) continue
      const { error: insertErr } = await supabase
        .from('loan_transactions')
        .insert({
          loan_id: loan.id,
          employee_id: null,
          transaction_type: 'DEBIT',
          amount,
          remark: 'Backfilled service to reconcile loan',
          transaction_timestamp: new Date().toISOString()
        })
      if (insertErr) throw insertErr
      backfilled++
      console.log(`Backfilled loan ${loan.id} with Service £${amount}`)
    }
  }

  console.log(`Reconciliation complete. Loans backfilled: ${backfilled}`)
}

main().catch(err => { console.error(err); process.exit(1) })
