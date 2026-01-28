import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if table exists first
    try {
      const { error: tableCheckError } = await supabase
        .from('loan_installments')
        .select('id', { count: 'exact' })
        .limit(1)

      if (tableCheckError) {
        console.warn('Installments table does not exist, skipping delete')
        return NextResponse.json({ success: true, message: 'No installments to delete (table does not exist)' })
      }
    } catch (e) {
      console.warn('Could not check installments table:', e)
      return NextResponse.json({ success: true, message: 'No installments to delete (table check failed)' })
    }

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
    return NextResponse.json({ error: error.message }, { status: 500 }))
  }
}
