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

    const { data: installments, error } = await supabase
      .from('loan_installments')
      .select('*')
      .eq('loan_transaction_id', transactionId)
      .order('installment_number', { ascending: true })

    if (error) throw error

    return NextResponse.json({ installments: installments || [] })
  } catch (error: any) {
    console.error('Error fetching installments:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
