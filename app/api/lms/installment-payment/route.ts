import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ensureInstallmentsTableExists } from '@/lib/installmentsDb'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    // Ensure table exists
    await ensureInstallmentsTableExists()

    const body = await request.json()
    const {
      installmentId,
      employeeId,
      paymentAmount,
      paymentMethod,
      paymentDate,
    } = body

    if (!installmentId) {
      return NextResponse.json(
        { ok: false, message: 'installmentId is required' },
        { status: 400 }
      )
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
        return NextResponse.json(
          { ok: false, message: 'Installment not found' },
          { status: 404 }
        )
      }

      installment = data
      loanId = data.loan_transactions.loan_id
      serviceTransactionId = data.loan_transactions.id
    } else {
      // For temporary IDs, extract loan info from request body
      const { loanId: bodyLoanId, serviceTransactionId: bodyServiceId } = body
      if (!bodyLoanId || !bodyServiceId) {
        return NextResponse.json(
          { ok: false, message: 'loanId and serviceTransactionId required for temporary installments' },
          { status: 400 }
        )
      }
      loanId = bodyLoanId
      serviceTransactionId = bodyServiceId
    }

    // 2. Record the payment transaction with installment reference
    const paymentTimestamp = paymentDate ? new Date(`${paymentDate}T00:00:00Z`).toISOString() : new Date().toISOString()
    
    const remarkText = installment 
      ? `Installment #${installment.installment_number} payment - ID: ${installmentId.substring(0, 8)}`
      : `Payment against installment - ID: ${installmentId.substring(0, 8)}`
    
    const { data: paymentData, error: paymentError } = await supabase
      .from('loan_transactions')
      .insert({
        loan_id: loanId,
        employee_id: employeeId,
        transaction_type: 'payment',
        amount: paymentAmount,
        remark: remarkText,
        transaction_timestamp: paymentTimestamp,
        payment_method_id: paymentMethod || null,
      })
      .select()
      .single()

    if (paymentError) throw paymentError

    // 3. Update the installment record if it exists in DB
    if (!isTempId && installment) {
      const newAmountPaid = parseFloat(installment.amount_paid || 0) + parseFloat(paymentAmount)
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

    return NextResponse.json({
      ok: true,
      message: `Payment of £${paymentAmount} recorded successfully`,
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