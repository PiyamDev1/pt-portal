import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Cash' },
  { name: 'Bank Transfer' },
  { name: 'Card Payment' },
]

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Check if methods already exist
    const { data: existing } = await supabase
      .from('loan_payment_methods')
      .select('id')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ 
        message: 'Payment methods already exist',
        skipped: true 
      })
    }

    // Insert default payment methods
    const { data, error } = await supabase
      .from('loan_payment_methods')
      .insert(DEFAULT_PAYMENT_METHODS)
      .select()

    if (error) {
      console.error('Error seeding payment methods:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: `Created ${data?.length || 0} payment methods`,
      methods: data
    })
  } catch (error: any) {
    console.error('Error in seed-payment-methods:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
