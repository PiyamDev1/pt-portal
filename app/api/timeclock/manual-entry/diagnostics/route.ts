import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: Request) {
  try {
    const adminSupabase = createClient(supabaseUrl, serviceKey)
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      checks: []
    }

    // Check 1: timeclock_devices table exists and is accessible
    try {
      const { data: devices, error: devicesError } = await adminSupabase
        .from('timeclock_devices')
        .select('id, name')
        .limit(1)
      
      diagnostics.checks.push({
        name: 'timeclock_devices table',
        status: devicesError ? 'FAIL' : 'PASS',
        error: devicesError?.message,
        result: devices ? `Found ${devices.length} device(s)` : 'Empty table'
      })
    } catch (e: any) {
      diagnostics.checks.push({
        name: 'timeclock_devices table',
        status: 'ERROR',
        error: e.message
      })
    }

    // Check 2: timeclock_manual_codes table exists and is accessible
    try {
      const { data: codes, error: codesError } = await adminSupabase
        .from('timeclock_manual_codes')
        .select('id, code')
        .limit(1)
      
      diagnostics.checks.push({
        name: 'timeclock_manual_codes table',
        status: codesError ? 'FAIL' : 'PASS',
        error: codesError?.message,
        result: codes ? `Found ${codes.length} code(s)` : 'Empty table'
      })
    } catch (e: any) {
      diagnostics.checks.push({
        name: 'timeclock_manual_codes table',
        status: 'ERROR',
        error: e.message
      })
    }

    // Check 3: Test insert into timeclock_devices
    try {
      const testDeviceId = crypto.randomUUID()
      const { data: insertResult, error: insertError } = await adminSupabase
        .from('timeclock_devices')
        .insert({
          id: testDeviceId,
          name: `Test Device ${Date.now()}`,
          secret: 'test-secret-' + Date.now(),
          location: 'Test',
          is_active: true
        })
        .select()
      
      diagnostics.checks.push({
        name: 'Insert test device',
        status: insertError ? 'FAIL' : 'PASS',
        error: insertError?.message,
        errorCode: insertError?.code,
        errorHint: insertError?.hint
      })

      // Clean up test device
      if (!insertError && testDeviceId) {
        await adminSupabase
          .from('timeclock_devices')
          .delete()
          .eq('id', testDeviceId)
      }
    } catch (e: any) {
      diagnostics.checks.push({
        name: 'Insert test device',
        status: 'ERROR',
        error: e.message
      })
    }

    // Check 4: Environment variables
    diagnostics.checks.push({
      name: 'Environment variables',
      status: 'INFO',
      supabaseUrl: supabaseUrl ? 'Set' : 'Missing',
      serviceKey: serviceKey ? 'Set (length: ' + serviceKey.length + ')' : 'Missing'
    })

    return NextResponse.json(diagnostics, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({
      error: 'Diagnostics failed',
      message: error.message
    }, { status: 500 })
  }
}
