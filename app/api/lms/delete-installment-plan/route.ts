import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      console.error('Supabase credentials missing')
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Delete from database if table exists
    try {
      const { error: deleteError } = await supabase
        .from('loan_installments')
        .delete()
        .eq('loan_transaction_id', transactionId)

      if (!deleteError) {
        console.log(`Deleted database installments for transaction ${transactionId}`)
      }
    } catch (e: any) {
      console.warn('Could not delete from database:', e.message)
    }

    // Update the transaction to remove installment plan info from remark
    const { data: transaction, error: fetchError } = await supabase
      .from('loan_transactions')
      .select('remark')
      .eq('id', transactionId)
      .single()

    if (!fetchError && transaction) {
      // Remove installment plan patterns more aggressively
      let newRemark = (transaction.remark || '')
        // Remove "X installments - frequency" pattern
        .replace(/\s*\d+\s+installments?\s*-\s*(weekly|biweekly|monthly)/gi, '')
        // Remove "X installments" pattern without frequency
        .replace(/\s*\d+\s+installments?/gi, '')
        .trim()
      
      // If remark is now empty or just whitespace, set to null
      newRemark = newRemark || null
      
      const { error: updateError } = await supabase
        .from('loan_transactions')
        .update({ remark: newRemark })
        .eq('id', transactionId)

      if (updateError) {
        console.error('Error updating transaction remark:', updateError)
      } else {
        console.log(`Updated transaction remark for ${transactionId}: "${transaction.remark}" -> "${newRemark}"`)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in delete-installment-plan:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}
