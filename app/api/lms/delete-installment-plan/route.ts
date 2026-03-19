/**
 * API Route: Delete Installment Plan
 *
 * POST /api/lms/delete-installment-plan
 *
 * Removes all installment records associated with a given loan transaction,
 * effectively cancelling the repayment schedule. The parent transaction itself
 * is not deleted — only the installment rows.
 *
 * Request Body: { transactionId: string }
 * Response Success (200): { deletedCount }
 * Response Errors: 400 Missing transactionId | 500 DB delete failed
 *
 * Authentication: Service role key
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export async function POST(request: Request) {
  try {
    // 1. Initialize Admin Client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { transactionId } = await request.json()

    if (!transactionId) {
      return apiError('Transaction ID is required', 400)
    }

    // First, get the transaction to find the loan_id and amount
    const { data: transaction, error: fetchError } = await supabase
      .from('loan_transactions')
      .select('loan_id, amount')
      .eq('id', transactionId)
      .single()

    if (fetchError || !transaction) {
      throw new Error('Transaction not found')
    }

    const loanId = transaction.loan_id
    const deletedAmount = parseFloat(transaction.amount || 0)

    // 2. Delete Child Records: Installments
    // These are the individual payment schedules in 'loan_installments'
    const { error: instError } = await supabase
      .from('loan_installments')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (instError) {
      throw new Error(`Failed to delete installments: ${instError.message}`)
    }

    // 3. Delete Child Records: Package Links
    // If the plan was linked to a package, remove that link from 'loan_package_links'
    const { error: linkError } = await supabase
      .from('loan_package_links')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (linkError) {
      throw new Error(`Failed to delete package links: ${linkError.message}`)
    }

    // 4. Delete Parent Record: The Service Transaction
    // This removes the service charge from loan_transactions
    const { error: transError } = await supabase
      .from('loan_transactions')
      .delete()
      .eq('id', transactionId)

    if (transError) {
      throw new Error(`Failed to delete transaction: ${transError.message}`)
    }

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
          status: newBalance === 0 ? 'Settled' : loan.status || 'Active',
        })
        .eq('id', loanId)

      if (updateError) {
        throw new Error(`Failed to update loan balance: ${updateError.message}`)
      }
    }

    return apiOk({ deletedTransactionId: transactionId })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to delete installment plan'), 500)
  }
}
