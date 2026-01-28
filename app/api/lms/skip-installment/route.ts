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
    const { installmentId } = body

    if (!installmentId) {
      return NextResponse.json(
        { error: 'installmentId is required' },
        { status: 400 }
      )
    }

    // 1. Get the installment and its transaction
    const { data: installment, error: installmentError } = await supabase
      .from('loan_installments')
      .select('*, loan_transactions!inner(id, loan_id, amount)')
      .eq('id', installmentId)
      .single()

    if (installmentError || !installment) {
      return NextResponse.json(
        { error: 'Installment not found' },
        { status: 404 }
      )
    }

    const transactionId = installment.loan_transaction_id
    const loanId = installment.loan_transactions.loan_id
    const serviceAmount = parseFloat(installment.loan_transactions.amount)

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

    const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0)
    const remainingBalance = serviceAmount - totalPaid

    console.log(`[SKIP-INSTALLMENT] Service: £${serviceAmount}, Paid: £${totalPaid}, Remaining: £${remainingBalance}`)

    // 5. Find remaining installments that are not paid/partial/skipped
    const remainingInstallments = (allInstallments || []).filter((inst: any) => 
      inst.status !== 'paid' && 
      inst.status !== 'partial' && 
      inst.status !== 'skipped'
    )

    console.log(`[SKIP-INSTALLMENT] Found ${remainingInstallments.length} remaining installments to recalculate`)

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

      console.log(`[SKIP-INSTALLMENT] Updated ${remainingInstallments.length} installments to £${newAmountPerInstallment.toFixed(2)} each`)
    }

    return NextResponse.json({
      success: true,
      message: 'Installment skipped and amounts recalculated',
      remainingBalance,
      remainingInstallments: remainingInstallments.length,
      newAmountPerInstallment: remainingInstallments.length > 0 ? remainingBalance / remainingInstallments.length : 0,
    })
  } catch (err: any) {
    console.error('[Skip Installment]', err)
    return NextResponse.json(
      { error: err.message || 'Failed to skip installment' },
      { status: 400 }
    )
  }
}
