import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      return NextResponse.json({ 
        error: 'Missing config',
        methods: [] 
      }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Direct query - same as diagnostic
    const { data: methods, error } = await supabase
      .from('loan_payment_methods')
      .select('*')

    if (error) {
      console.error('DB query error:', error)
      return NextResponse.json({ 
        error: error.message,
        methods: [] 
      }, { status: 200 })
    }

    return NextResponse.json({ 
      methods: methods || [] 
    })
    
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ 
      error: error.message,
      methods: [] 
    }, { status: 500 })
  }
}
