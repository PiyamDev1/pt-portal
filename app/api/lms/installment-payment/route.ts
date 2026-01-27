import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    const body = await request.json()
    const {
      accountId,
      installmentDate,
      paymentAmount,
      paymentMethod,
      paymentDate,
      installmentTerm,
      totalTerms,
    } = body

    // 1. Record the payment transaction
    const { data: paymentData, error: paymentError } = await supabase
      .from('loan_transactions')
      .insert({
        loan_id: accountId,
        transaction_type: 'payment',
        amount: paymentAmount,
        remark: `Installment payment - Term ${installmentTerm}/${totalTerms}`,
        transaction_timestamp: paymentDate,
        payment_method_id: paymentMethod || null,
      })

    if (paymentError) throw paymentError

    // 2. Get the installment's original loan service transaction
    const { data: transactions, error: txError } = await supabase
      .from('loan_transactions')
      .select('*')
      .eq('loan_id', accountId)
      .eq('transaction_type', 'service')
      .order('transaction_timestamp', { ascending: false })
      .limit(1)

    if (txError) throw txError
    if (!transactions || transactions.length === 0) {
      throw new Error('Loan service transaction not found')
    }

    const originalLoan = transactions[0]
    const originalAmount = parseFloat(originalLoan.amount)
    const installmentAmount = originalAmount / totalTerms

    // 3. Calculate new installment amounts based on payment
    const difference = paymentAmount - installmentAmount
    const remainingTerms = totalTerms - installmentTerm

    let newInstallmentAmount = installmentAmount

    if (difference > 0 && remainingTerms > 0) {
      // Overpayment: split across remaining terms
      newInstallmentAmount = installmentAmount + difference / remainingTerms
    } else if (difference < 0 && installmentTerm === totalTerms) {
      // Underpayment on last term: reduce it
      newInstallmentAmount = paymentAmount
    } else if (difference < 0) {
      // Underpayment on earlier term: just take what was paid
      newInstallmentAmount = paymentAmount
    }

    // 4. Update the loan with new installment info (store as metadata)
    const { error: updateError } = await supabase
      .from('loans')
      .update({
        current_balance: Math.max(0, originalAmount - paymentAmount),
        installment_amount: newInstallmentAmount,
        paid_installments: installmentTerm,
      })
      .eq('id', originalLoan.loan_id)

    if (updateError) throw updateError

    return NextResponse.json({
      ok: true,
      message: `Payment recorded. Remaining installments adjusted.`,
      newInstallmentAmount,
    })
  } catch (err: any) {
    console.error('[Installment Payment]', err)
    return NextResponse.json(
      { ok: false, message: err.message || 'Failed to record payment' },
      { status: 400 }
    )
  }
}
