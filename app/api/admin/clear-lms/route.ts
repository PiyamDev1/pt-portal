import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Admin endpoint to clear all LMS data
 * WARNING: This deletes all loans, transactions, customers, and installments
 */
export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    console.log('🗑️  Starting LMS data cleanup...')

    // Delete in order to respect foreign key constraints
    // 1. Delete installments first (references loan_transactions)
    const { error: installmentsError, count: installmentsCount } = await supabase
      .from('loan_installments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (installmentsError) {
      console.error('Error deleting installments:', installmentsError)
    } else {
      console.log(`✅ Deleted ${installmentsCount || 0} installment records`)
    }

    // 2. Delete loan transactions (references loans)
    const { error: txError, count: txCount } = await supabase
      .from('loan_transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (txError) {
      console.error('Error deleting transactions:', txError)
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }
    console.log(`✅ Deleted ${txCount || 0} loan transactions`)

    // 3. Delete loans (references loan_customers)
    const { error: loansError, count: loansCount } = await supabase
      .from('loans')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (loansError) {
      console.error('Error deleting loans:', loansError)
      return NextResponse.json({ error: loansError.message }, { status: 500 })
    }
    console.log(`✅ Deleted ${loansCount || 0} loans`)

    // 4. Delete loan customers
    const { error: customersError, count: customersCount } = await supabase
      .from('loan_customers')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (customersError) {
      console.error('Error deleting customers:', customersError)
      return NextResponse.json({ error: customersError.message }, { status: 500 })
    }
    console.log(`✅ Deleted ${customersCount || 0} loan customers`)

    console.log('🎉 LMS data cleanup completed successfully!')

    return NextResponse.json({ 
      success: true,
      message: 'LMS data cleared successfully',
      deleted: {
        installments: installmentsCount || 0,
        transactions: txCount || 0,
        loans: loansCount || 0,
        customers: customersCount || 0,
      }
    })

  } catch (error: any) {
    console.error('Error clearing LMS data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
