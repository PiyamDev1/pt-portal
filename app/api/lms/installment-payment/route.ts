import { z } from 'zod'
import { ensureInstallmentsTableExists } from '@/lib/installmentsDb'
import { apiError, apiOk } from '@/lib/api/http'
import { getSearchParam, parseBodyWithSchema } from '@/lib/api/request'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

const postBodySchema = z.object({
  installmentId: z.string().optional(),
  employeeId: z.string().optional(),
  paymentAmount: z.union([z.string(), z.number()]).optional(),
  paymentMethod: z.string().optional().nullable(),
  paymentDate: z.string().optional().nullable(),
  loanId: z.string().optional(),
  serviceTransactionId: z.string().optional(),
})

const patchBodySchema = z.object({
  transactionId: z.string().optional(),
  paymentAmount: z.union([z.string(), z.number()]).optional(),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const supabase = await getRouteSupabaseClient()

    // Ensure table exists
    await ensureInstallmentsTableExists()

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, postBodySchema)
    if (bodyError || !body) {
      return apiError(bodyError || 'Invalid request payload', 400)
    }

    const { installmentId, employeeId, paymentAmount, paymentMethod, paymentDate } = body

    if (!installmentId) {
      return apiError('installmentId is required', 400)
    }

    if (paymentAmount === undefined || Number.isNaN(Number(paymentAmount))) {
      return apiError('paymentAmount must be a valid number', 400)
    }

    // Handle temporary installment IDs (generated client-side before table exists)
    const isTempId = installmentId.startsWith('temp__')

    let loanId: string
    let serviceTransactionId: string
    let installment: any = null

    // 1. Get the installment record if using database-backed IDs
    if (!isTempId) {
      const { data, error: installmentError } = await supabase
        .from('loan_installments')
        .select('*, loan_transactions!inner(loan_id, id)')
        .eq('id', installmentId)
        .single()

      if (installmentError || !data) {
        return apiError('Installment not found', 404)
      }

      installment = data
      loanId = data.loan_transactions.loan_id
      serviceTransactionId = data.loan_transactions.id
    } else {
      // For temporary IDs, extract loan info from request body
      const { loanId: bodyLoanId, serviceTransactionId: bodyServiceId } = body
      if (!bodyLoanId || !bodyServiceId) {
        return apiError(
          'loanId and serviceTransactionId required for temporary installments',
          400,
          {
            loanId: bodyLoanId || null,
            serviceTransactionId: bodyServiceId || null,
          },
        )
      }
      loanId = bodyLoanId
      serviceTransactionId = bodyServiceId
    }

    // 2. Record the payment transaction with installment reference
    const paymentTimestamp = paymentDate
      ? new Date(`${paymentDate}T00:00:00Z`).toISOString()
      : new Date().toISOString()

    const remarkText = installment
      ? `Service Plan ${serviceTransactionId.substring(0, 8)} - Installment #${installment.installment_number} payment`
      : `Service Plan ${serviceTransactionId.substring(0, 8)} - Payment against installment`

    const { data: paymentData, error: paymentError } = await supabase
      .from('loan_transactions')
      .insert({
        loan_id: loanId,
        employee_id: employeeId,
        transaction_type: 'payment',
        amount: Number(paymentAmount),
        remark: remarkText,
        transaction_timestamp: paymentTimestamp,
        payment_method_id: paymentMethod || null,
      })
      .select()
      .single()

    if (paymentError) throw paymentError

    // 3. Update the installment record if it exists in DB
    if (!isTempId && installment) {
      const newAmountPaid = parseFloat(String(installment.amount_paid || 0)) + parseFloat(String(paymentAmount))
      const installmentAmount = parseFloat(installment.amount)

      let newStatus = 'pending'
      if (newAmountPaid >= installmentAmount) {
        newStatus = 'paid'
      } else if (newAmountPaid > 0) {
        newStatus = 'partial'
      }

      const { error: updateInstallmentError } = await supabase
        .from('loan_installments')
        .update({
          amount_paid: newAmountPaid,
          status: newStatus,
        })
        .eq('id', installmentId)

      if (updateInstallmentError) throw updateInstallmentError

      // Handle skipped installments: mark earlier unpaid installments as 'skipped'
      if (installment.installment_number > 1) {
        // Get the service transaction to find all installments
        const { data: allInstallments, error: allInstallmentsError } = await supabase
          .from('loan_installments')
          .select('*')
          .eq('loan_transaction_id', serviceTransactionId)
          .lt('installment_number', installment.installment_number)
          .eq('status', 'pending')

        if (allInstallmentsError) throw allInstallmentsError

        // Mark earlier pending installments as 'skipped' with 0 amount paid
        if (allInstallments && allInstallments.length > 0) {
          for (const earlier of allInstallments) {
            const { error: skipError } = await supabase
              .from('loan_installments')
              .update({
                status: 'skipped',
                amount_paid: 0,
              })
              .eq('id', earlier.id)

            if (skipError) throw skipError
          }
        }
      }

      // Recalculate remaining installments after payment

      // Get total paid so far
      const { data: allPaymentsNow, error: paymentsNowError } = await supabase
        .from('loan_transactions')
        .select('amount')
        .eq('loan_id', loanId)
        .eq('transaction_type', 'payment')

      if (paymentsNowError) throw paymentsNowError

      const totalPaidNow = (allPaymentsNow || []).reduce((sum, p) => sum + parseFloat(p.amount), 0)

      // Get service transaction amount
      const { data: serviceTxNow, error: serviceTxNowError } = await supabase
        .from('loan_transactions')
        .select('amount')
        .eq('id', serviceTransactionId)
        .single()

      if (serviceTxNowError) throw serviceTxNowError

      const serviceAmount = parseFloat(serviceTxNow.amount)
      const remainingBalance = serviceAmount - totalPaidNow

      // Get all remaining unpaid/unskipped installments
      const { data: futureInstallments, error: futureError } = await supabase
        .from('loan_installments')
        .select('*')
        .eq('loan_transaction_id', serviceTransactionId)
        .gt('installment_number', installment.installment_number)
        .in('status', ['pending', 'overdue'])

      if (futureError) throw futureError

      if (futureInstallments && futureInstallments.length > 0) {
        const newAmountPerInstallment = remainingBalance / futureInstallments.length

        for (const future of futureInstallments) {
          const { error: updateFutureError } = await supabase
            .from('loan_installments')
            .update({ amount: newAmountPerInstallment })
            .eq('id', future.id)

          if (updateFutureError) throw updateFutureError
        }
      }
    } else if (isTempId) {
      // temp IDs don't need installment updates
    }

    // 4. Update the loan current balance
    const { data: allPayments, error: paymentsError } = await supabase
      .from('loan_transactions')
      .select('amount')
      .eq('loan_id', loanId)
      .eq('transaction_type', 'payment')

    if (paymentsError) throw paymentsError

    // Get original service amount
    const { data: serviceTx, error: serviceTxError } = await supabase
      .from('loan_transactions')
      .select('amount')
      .eq('id', serviceTransactionId)
      .single()

    if (serviceTxError) throw serviceTxError

    const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0)
    const originalAmount = parseFloat(serviceTx.amount)
    const newBalance = Math.max(0, originalAmount - totalPaid)

    const { error: updateLoanError } = await supabase
      .from('loans')
      .update({
        current_balance: newBalance,
      })
      .eq('id', loanId)

    if (updateLoanError) throw updateLoanError

    return apiOk({
      recordedPaymentAmount: paymentAmount,
      loanId,
      newBalance,
    })
  } catch (err: unknown) {
    console.error('[Installment Payment]', err)
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    return apiError(message, 400)
  }
}

// DELETE - Remove a payment transaction
export async function DELETE(request: Request) {
  try {
    const supabase = await getRouteSupabaseClient()

    const transactionId = getSearchParam(request.url, 'transactionId')
    const accountId = getSearchParam(request.url, 'accountId')

    if (!transactionId || !accountId) {
      return apiError('transactionId and accountId are required', 400)
    }

    // Delete the transaction
    const { error: deleteError } = await supabase
      .from('loan_transactions')
      .delete()
      .eq('id', transactionId)

    if (deleteError) throw deleteError

    return apiOk({
      deletedTransactionId: transactionId,
    })
  } catch (err: unknown) {
    console.error('[Installment Payment Delete]', err)
    const message = err instanceof Error ? err.message : 'Failed to delete payment'
    return apiError(message, 400)
  }
}

// PATCH - Update a payment transaction
export async function PATCH(request: Request) {
  try {
    const supabase = await getRouteSupabaseClient()

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, patchBodySchema)
    if (bodyError || !body) {
      return apiError(bodyError || 'Invalid request payload', 400)
    }

    const { transactionId, paymentAmount, paymentDate, paymentMethod } = body

    if (!transactionId) {
      return apiError('transactionId is required', 400)
    }

    // Convert date string to proper timestamp if provided
    const updates: Record<string, unknown> = {}
    if (paymentAmount !== undefined) updates.amount = Number(paymentAmount)
    if (paymentDate)
      updates.transaction_timestamp = new Date(`${paymentDate}T00:00:00Z`).toISOString()
    if (paymentMethod) updates.payment_method_id = paymentMethod

    const { error: updateError } = await supabase
      .from('loan_transactions')
      .update(updates)
      .eq('id', transactionId)

    if (updateError) throw updateError

    return apiOk({
      updatedTransactionId: transactionId,
    })
  } catch (err: unknown) {
    console.error('[Installment Payment Update]', err)
    const message = err instanceof Error ? err.message : 'Failed to update payment'
    return apiError(message, 400)
  }
}
