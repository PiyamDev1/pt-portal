/**
 * API Route: Skip Installment
 *
 * POST /api/lms/skip-installment
 *
 * Marks a scheduled installment as skipped (status = 'skipped'), recording
 * the reason. The outstanding balance is redistributed or carried forward
 * to the next installment depending on loan configuration.
 *
 * Request Body: { installmentId: string, reason?: string }
 * Response Success (200): { skippedInstallmentId }
 * Response Errors: 400 Missing installmentId | 401 Not authenticated | 500 DB error
 *
 * Authentication: Session cookie
 */
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

type LoanTransaction = {
  loan_id: string
  amount: string | number
}

type InstallmentLookupRow = {
  loan_transaction_id: string
  loan_transactions: LoanTransaction
}

type InstallmentRow = {
  id: string
  status: string | null
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      },
    )

    const body = (await request.json()) as { installmentId?: string }
    const { installmentId } = body

    if (!installmentId) {
      return apiError('installmentId is required', 400)
    }

    // 1. Get the installment and its transaction
    const { data: installment, error: installmentError } = await supabase
      .from('loan_installments')
      .select('*, loan_transactions!inner(id, loan_id, amount)')
      .eq('id', installmentId)
      .single()

    if (installmentError || !installment) {
      return apiError('Installment not found', 404)
    }

    const typedInstallment = installment as InstallmentLookupRow
    const transactionId = typedInstallment.loan_transaction_id
    const loanId = typedInstallment.loan_transactions.loan_id
    const serviceAmount = Number(typedInstallment.loan_transactions.amount)

    // 2. Mark this installment as skipped
    const { error: skipError } = await supabase
      .from('loan_installments')
      .update({
        status: 'skipped',
        amount_paid: 0,
      })
      .eq('id', installmentId)

    if (skipError) throw skipError

    // 3. Get all installments for this transaction
    const { data: allInstallments, error: allInstallmentsError } = await supabase
      .from('loan_installments')
      .select('*')
      .eq('loan_transaction_id', transactionId)
      .order('installment_number', { ascending: true })

    if (allInstallmentsError) throw allInstallmentsError

    // 4. Calculate total paid so far (including initial deposit)
    const { data: allPayments, error: paymentsError } = await supabase
      .from('loan_transactions')
      .select('amount')
      .eq('loan_id', loanId)
      .eq('transaction_type', 'payment')

    if (paymentsError) throw paymentsError

    const totalPaid = (allPayments || []).reduce(
      (sum, p: { amount: string | number }) => sum + Number(p.amount),
      0,
    )
    const remainingBalance = serviceAmount - totalPaid

    // 5. Find remaining installments that are not paid/partial/skipped
    const remainingInstallments = (allInstallments || []).filter((inst: InstallmentRow) => {
      const status = inst.status ?? ''
      return status !== 'paid' && status !== 'partial' && status !== 'skipped'
    })

    // 6. Recalculate amounts for remaining installments
    if (remainingInstallments.length > 0) {
      const newAmountPerInstallment = remainingBalance / remainingInstallments.length

      for (const inst of remainingInstallments) {
        const { error: updateError } = await supabase
          .from('loan_installments')
          .update({
            amount: newAmountPerInstallment,
          })
          .eq('id', inst.id)

        if (updateError) throw updateError
      }
    }

    return apiOk({
      skippedInstallmentId: installmentId,
      remainingBalance,
      remainingInstallments: remainingInstallments.length,
      newAmountPerInstallment:
        remainingInstallments.length > 0 ? remainingBalance / remainingInstallments.length : 0,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to skip installment'), 400)
  }
}
