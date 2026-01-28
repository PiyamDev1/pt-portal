import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // 1. Initialize Admin Client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { transactionId } = await request.json()

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    console.log(`[Delete Plan] Deleting plan for transaction: ${transactionId}`)

    // First, get the transaction to find the loan_id and amount
    const { data: transaction, error: fetchError } = await supabase
      .from('loan_transactions')
      .select('loan_id, amount')
      .eq('id', transactionId)
      .single()

    if (fetchError || !transaction) {
      console.error('[Delete Plan] Error fetching transaction:', fetchError)
      throw new Error('Transaction not found')
    }

    const loanId = transaction.loan_id
    const deletedAmount = parseFloat(transaction.amount || 0)

    console.log(`[Delete Plan] Loan ID: ${loanId}, Amount to remove: ${deletedAmount}`)

    // 2. Delete Child Records: Installments
    // These are the individual payment schedules in 'loan_installments'
    const { error: instError } = await supabase
      .from('loan_installments')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (instError) {
      console.error('[Delete Plan] Error deleting installments:', instError)
      throw new Error(`Failed to delete installments: ${instError.message}`)
    }

    // 3. Delete Child Records: Package Links
    // If the plan was linked to a package, remove that link from 'loan_package_links'
    const { error: linkError } = await supabase
      .from('loan_package_links')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (linkError) {
      console.error('[Delete Plan] Error deleting package links:', linkError)
      throw new Error(`Failed to delete package links: ${linkError.message}`)
    }

    // 4. Delete Parent Record: The Service Transaction
    // This removes the service charge from loan_transactions
    const { error: transError } = await supabase
      .from('loan_transactions')
      .delete()
      .eq('id', transactionId)

    if (transError) {
      console.error('[Delete Plan] Error deleting parent transaction:', transError)
      throw new Error(`Failed to delete transaction: ${transError.message}`)
    }

    console.log(`[Delete Plan] Successfully deleted transaction ${transactionId} and all related records`)

    // 5. Update the loan's current_balance
    // Subtract the deleted service amount from the loan balance
    const { data: loan, error: loanFetchError } = await supabase
      .from('loans')
      .select('current_balance, total_debt_amount, status')
      .eq('id', loanId)
      .single()

    if (!loanFetchError && loan) {
      const newBalance = Math.max(0, parseFloat(loan.current_balance || 0) - deletedAmount)
      const newTotalDebt = Math.max(0, parseFloat(loan.total_debt_amount || 0) - deletedAmount)
      
      const { error: updateError } = await supabase
        .from('loans')
        .update({ 
          current_balance: newBalance,
          total_debt_amount: newTotalDebt,
          status: newBalance === 0 ? 'Settled' : loan.status || 'Active'
        })
        .eq('id', loanId)

      if (updateError) {
        console.error('[Delete Plan] Error updating loan balance:', updateError)
      } else {
        console.log(`[Delete Plan] Updated loan balance: ${newBalance}`)
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[Delete Plan] Critical Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
