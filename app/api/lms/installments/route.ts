import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { ensureInstallmentsTableExists } from '@/lib/installmentsDb'

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

    // Ensure table exists (creates it if needed)
    await ensureInstallmentsTableExists()

    // Try to fetch installments from the database
    try {
      const { data: installments, error } = await supabase
        .from('loan_installments')
        .select('*')
        .eq('loan_transaction_id', transactionId)
        .order('installment_number', { ascending: true })

      if (error) {
        console.warn('Error fetching installments:', error.message)
        return NextResponse.json({ installments: [] })
      }

      console.log(`Fetched ${installments?.length || 0} installments for transaction ${transactionId}`)
      return NextResponse.json({ installments: installments || [] })
    } catch (error: any) {
      console.warn('Error accessing installments:', error.message)
      return NextResponse.json({ installments: [] })
    }
  } catch (error: any) {
    console.error('Error fetching installments:', error)
    return NextResponse.json({ installments: [] })
  }
}

