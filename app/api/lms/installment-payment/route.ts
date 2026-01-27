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
      employeeId,
      installmentDate,
      paymentAmount,
      paymentMethod,
      paymentDate,
      installmentTerm,
      totalTerms,
    } = body

    // 1. Record the payment transaction
    // Convert date string to proper timestamp
    const paymentTimestamp = paymentDate ? new Date(`${paymentDate}T00:00:00Z`).toISOString() : new Date().toISOString()
    
    const { data: paymentData, error: paymentError } = await supabase
      .from('loan_transactions')
      .insert({
        loan_id: accountId,
        employee_id: employeeId,
        transaction_type: 'payment',
        amount: paymentAmount,
        remark: `Installment payment - Term ${installmentTerm}/${totalTerms}`,
        transaction_timestamp: paymentTimestamp,
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

    // 3. Update the loan current balance
    // Note: Calculate total payments for this loan to update balance accurately
    const { data: allPayments, error: paymentsError } = await supabase
      .from('loan_transactions')
      .select('amount')
      .eq('loan_id', originalLoan.loan_id)
      .eq('transaction_type', 'payment')

    if (paymentsError) throw paymentsError

    const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0)
    const newBalance = Math.max(0, originalAmount - totalPaid)

    const { error: updateError } = await supabase
      .from('loans')
      .update({
        current_balance: newBalance,
      })
      .eq('id', originalLoan.loan_id)

    if (updateError) throw updateError

    return NextResponse.json({
      ok: true,
      message: `Payment recorded successfully.`,
      newBalance,
    })
  } catch (err: any) {
    console.error('[Installment Payment]', err)
    return NextResponse.json(
      { ok: false, message: err.message || 'Failed to record payment' },
      { status: 400 }
    )
  }
}
// DELETE - Remove a payment transaction
export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')
    const accountId = searchParams.get('accountId')

    if (!transactionId || !accountId) {
      return NextResponse.json(
        { ok: false, message: 'transactionId and accountId are required' },
        { status: 400 }
      )
    }

    // Delete the transaction
    const { error: deleteError } = await supabase
      .from('loan_transactions')
      .delete()
      .eq('id', transactionId)

    if (deleteError) throw deleteError

    return NextResponse.json({
      ok: true,
      message: 'Payment deleted successfully',
    })
  } catch (err: any) {
    console.error('[Installment Payment Delete]', err)
    return NextResponse.json(
      { ok: false, message: err.message || 'Failed to delete payment' },
      { status: 400 }
    )
  }
}

// PATCH - Update a payment transaction
export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    const body = await request.json()
    const { transactionId, paymentAmount, paymentDate, paymentMethod } = body

    if (!transactionId) {
      return NextResponse.json(
        { ok: false, message: 'transactionId is required' },
        { status: 400 }
      )
    }

    // Convert date string to proper timestamp if provided
    const updates: any = {}
    if (paymentAmount !== undefined) updates.amount = paymentAmount
    if (paymentDate) updates.transaction_timestamp = new Date(`${paymentDate}T00:00:00Z`).toISOString()
    if (paymentMethod) updates.payment_method_id = paymentMethod

    const { error: updateError } = await supabase
      .from('loan_transactions')
      .update(updates)
      .eq('id', transactionId)

    if (updateError) throw updateError

    return NextResponse.json({
      ok: true,
      message: 'Payment updated successfully',
    })
  } catch (err: any) {
    console.error('[Installment Payment Update]', err)
    return NextResponse.json(
      { ok: false, message: err.message || 'Failed to update payment' },
      { status: 400 }
    )
  }
}