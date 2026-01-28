import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    console.log(`[DELETE-PLAN] Starting delete for transaction ${transactionId}`)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      console.error('Supabase credentials missing')
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Step 1: Try to delete from database
    console.log(`[DELETE-PLAN] Step 1: Attempting to delete database installments`)
    const { error: deleteError, count } = await supabase
      .from('loan_installments')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (deleteError) {
      console.error(`[DELETE-PLAN] Error deleting from loan_installments:`, deleteError)
    } else {
      console.log(`[DELETE-PLAN] Successfully deleted ${count || 0} database installments`)
    }

    // Step 2: Update transaction remark
    console.log(`[DELETE-PLAN] Step 2: Fetching transaction details`)
    const { data: transaction, error: fetchError } = await supabase
      .from('loan_transactions')
      .select('id, remark')
      .eq('id', transactionId)
      .single()

    if (fetchError) {
      console.error(`[DELETE-PLAN] Error fetching transaction:`, fetchError)
      return NextResponse.json({ 
        success: false, 
        error: 'Could not fetch transaction',
        details: fetchError 
      }, { status: 500 })
    }

    if (!transaction) {
      console.error(`[DELETE-PLAN] Transaction not found: ${transactionId}`)
      return NextResponse.json({ 
        success: false, 
        error: 'Transaction not found' 
      }, { status: 404 })
    }

    console.log(`[DELETE-PLAN] Current remark: "${transaction.remark}"`)
    console.log(`[DELETE-PLAN] Remark type: ${typeof transaction.remark}`)
    console.log(`[DELETE-PLAN] Remark length: ${(transaction.remark || '').length}`)
    console.log(`[DELETE-PLAN] Remark bytes: ${Buffer.from(transaction.remark || '').toString('hex')}`)

    // Remove all installment plan patterns from remark
    let newRemark = (transaction.remark || '')
      // Remove "X installments - frequency" pattern
      .replace(/\s*\d+\s+installments?\s*-\s*(weekly|biweekly|monthly)/gi, '')
      // Remove "X installments" pattern without frequency
      .replace(/\s*\d+\s+installments?/gi, '')
      .trim()

    // If remark is now empty or just whitespace, set to null
    newRemark = newRemark ? newRemark : null

    console.log(`[DELETE-PLAN] Updated remark: "${newRemark}"`)

    // Only update if remark changed
    if (newRemark !== transaction.remark) {
      console.log(`[DELETE-PLAN] Step 3: Updating transaction remark`)
      const { error: updateError } = await supabase
        .from('loan_transactions')
        .update({ remark: newRemark })
        .eq('id', transactionId)

      if (updateError) {
        console.error(`[DELETE-PLAN] Error updating transaction remark:`, updateError)
        return NextResponse.json({ 
          success: false, 
          error: 'Could not update transaction',
          details: updateError 
        }, { status: 500 })
      }

      console.log(`[DELETE-PLAN] Successfully updated transaction remark`)
    } else {
      console.log(`[DELETE-PLAN] Remark unchanged, no update needed`)
    }

    console.log(`[DELETE-PLAN] Deletion complete for transaction ${transactionId}`)
    return NextResponse.json({ 
      success: true,
      message: 'Installment plan deleted',
      deleted: {
        databaseRecords: count || 0,
        remarkedUpdated: newRemark !== transaction.remark
      }
    })
  } catch (error: any) {
    console.error('Error in delete-installment-plan:', error)
    return NextResponse.json({ 
      error: error.message || 'Unknown error',
      stack: error.stack 
    }, { status: 500 })
  }
}
