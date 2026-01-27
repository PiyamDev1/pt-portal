import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      return NextResponse.json({ 
        methods: [] 
      })
    }

    const supabase = createClient(url, key)

    const { data: methods, error } = await supabase
      .from('loan_payment_methods')
      .select('*')

    if (error) {
      console.error('Query error:', error)
      return NextResponse.json({ 
        methods: [] 
      })
    }

    return NextResponse.json({ 
      methods: methods || [] 
    })

  } catch (err) {
    console.error('Exception:', err)
    return NextResponse.json({ 
      methods: [] 
    })
  }
}
