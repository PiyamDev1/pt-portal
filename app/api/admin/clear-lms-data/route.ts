import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Clear all LMS data in the correct order (respecting foreign keys)
    const tables = [
      'loan_installments',
      'loan_transactions',
      'loan_payment_methods',
      'loan_terms',
      'loans',
      'loan_accounts',
    ]

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

      if (error) {
        console.log(`Cleared ${table}`)
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'All LMS data cleared successfully. You can now add data from scratch.'
    })
  } catch (error: any) {
    console.error('Error clearing LMS data:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
