import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
    }

    // Try to fetch installments from the database
    // If the table doesn't exist yet, return empty array
    try {
      const { data: installments, error } = await supabase
        .from('loan_installments')
        .select('*')
        .eq('loan_transaction_id', transactionId)
        .order('installment_number', { ascending: true })

      if (error) {
        console.warn('Installments table may not exist yet:', error.message)
        // Return empty array if table doesn't exist
        return NextResponse.json({ installments: [] })
      }

      return NextResponse.json({ installments: installments || [] })
    } catch (tableError: any) {
      console.warn('Error accessing installments table:', tableError.message)
      // Gracefully handle table not existing - return empty array
      // User can run migration endpoint to create table
      return NextResponse.json({ installments: [] })
    }
  } catch (error: any) {
    console.error('Error fetching installments:', error)
    // Return empty array instead of error to prevent UI breaking
    return NextResponse.json({ installments: [] })
  }
}

