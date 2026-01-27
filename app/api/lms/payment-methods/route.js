import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  console.log('[GET /api/lms/payment-methods] API called')
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    console.log('[GET /api/lms/payment-methods] Config:', { url: !!url, key: !!key })
    
    if (!url || !key) {
      console.log('[GET /api/lms/payment-methods] Missing config, returning empty')
      return NextResponse.json({ 
        error: 'Missing config',
        methods: [] 
      }, { status: 500 })
    }

    const supabase = createClient(url, key)
    console.log('[GET /api/lms/payment-methods] Supabase client created')

    // Direct query - same as diagnostic
    console.log('[GET /api/lms/payment-methods] Executing SELECT query')
    const { data: methods, error } = await supabase
      .from('loan_payment_methods')
      .select('*')

    console.log('[GET /api/lms/payment-methods] Query result:', { error: error?.message, count: methods?.length })
    
    if (error) {
      console.log('[GET /api/lms/payment-methods] Error occurred, returning empty')
      return NextResponse.json({ 
        error: error.message,
        methods: [] 
      }, { status: 200 })
    }

    console.log('[GET /api/lms/payment-methods] Returning methods:', methods)
    const response = NextResponse.json({ 
      methods: methods || [] 
    })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    return response
    
  } catch (error) {
    console.error('[GET /api/lms/payment-methods] Exception:', error)
    return NextResponse.json({ 
      error: error.message,
      methods: [] 
    }, { status: 500 })
  }
}
