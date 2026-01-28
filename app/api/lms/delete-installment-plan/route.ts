import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // 1. Initialize Admin Client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { transactionId } = await request.json()

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    console.log(`[Delete Plan] Deleting plan for transaction: ${transactionId}`)

    // 2. Delete Child Records: Installments
    // These are the individual payment schedules in 'loan_installments'
    const { error: instError } = await supabase
      .from('loan_installments')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (instError) {
      console.error('[Delete Plan] Error deleting installments:', instError)
      throw new Error(`Failed to delete installments: ${instError.message}`)
    }

    // 3. Delete Child Records: Package Links
    // If the plan was linked to a package, remove that link from 'loan_package_links'
    const { error: linkError } = await supabase
      .from('loan_package_links')
      .delete()
      .eq('loan_transaction_id', transactionId)

    if (linkError) {
      console.error('[Delete Plan] Error deleting package links:', linkError)
      throw new Error(`Failed to delete package links: ${linkError.message}`)
    }

    // 4. Delete Parent Record: The Service Transaction
    // This removes the service charge from loan_transactions
    const { error: transError } = await supabase
      .from('loan_transactions')
      .delete()
      .eq('id', transactionId)

    if (transError) {
      console.error('[Delete Plan] Error deleting parent transaction:', transError)
      throw new Error(`Failed to delete transaction: ${transError.message}`)
    }

    console.log(`[Delete Plan] Successfully deleted transaction ${transactionId} and all related records`)

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[Delete Plan] Critical Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
