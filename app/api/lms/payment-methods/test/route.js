import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      supabaseUrl: url ? `${url.substring(0, 30)}...` : 'MISSING',
      serviceRoleKey: key ? `${key.substring(0, 10)}...` : 'MISSING',
      configStatus: url && key ? 'OK' : 'INCOMPLETE'
    }
    
    if (!url || !key) {
      return NextResponse.json({ 
        status: 'error',
        message: 'Missing environment variables',
        diagnostics 
      }, { status: 500 })
    }

    const supabase = createClient(url, key)

    // Test 1: Simple select
    const { data: testData, error: testError } = await supabase
      .from('loan_payment_methods')
      .select('*')

    diagnostics.test1_select = {
      success: !testError,
      error: testError ? testError.message : null,
      rowCount: testData?.length || 0,
      data: testData
    }

    // Test 2: Check RLS policies
    const { data: policies, error: policyError } = await supabase
      .rpc('exec_sql', { 
        query: `SELECT * FROM pg_policies WHERE tablename = 'loan_payment_methods'` 
      })
      .catch(() => ({ data: null, error: { message: 'RPC not available' } }))

    diagnostics.test2_policies = {
      success: !policyError,
      error: policyError ? policyError.message : null,
      policies: policies || 'Unable to fetch (RPC not available)'
    }

    return NextResponse.json({ 
      status: 'success',
      diagnostics 
    })

  } catch (err) {
    return NextResponse.json({ 
      status: 'error',
      message: err.message,
      stack: err.stack 
    }, { status: 500 })
  }
}
