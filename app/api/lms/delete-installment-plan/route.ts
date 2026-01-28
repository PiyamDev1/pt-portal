import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Delete all installments for this transaction
    const { error } = await supabase
      .from('loan_installments')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (error) {
      console.error('Error deleting installment plan:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in delete-installment-plan:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
