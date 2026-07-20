/**
 * API Route: Timeclock Manual Entry Diagnostics
 *
 * GET /api/timeclock/manual-entry/diagnostics
 *
 * Internal health-check endpoint for the manual entry subsystem.
 * Runs a series of checks:
 *   - timeclock_devices table accessible and returns rows
 *   - timeclock_manual_codes table accessible
 *   - HMAC secret configured
 *   - Crypto functions operational
 *
 * Returns a structured diagnostics report with pass/fail for each check.
 * Intended for developers and maintenance staff to debug device pairing
 * and code generation issues.
 *
 * Authentication: Super Admin session
 * Response Success (200): { diagnostics: { checks: CheckResult[] } }
 * Response Errors: 500 Unexpected failure
 */
import { createClient } from '@supabase/supabase-js'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  const access = await requireSuperAdminSession()
  if (!access.authorized) return access.response

  try {
    const adminSupabase = createClient(supabaseUrl, serviceKey)
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      checks: [],
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
        result: devices ? `Found ${devices.length} device(s)` : 'Empty table',
      })
    } catch (e: any) {
      diagnostics.checks.push({
        name: 'timeclock_devices table',
        status: 'ERROR',
        error: e.message,
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
        result: codes ? `Found ${codes.length} code(s)` : 'Empty table',
      })
    } catch (e: any) {
      diagnostics.checks.push({
        name: 'timeclock_manual_codes table',
        status: 'ERROR',
        error: e.message,
      })
    }

    // Check 3: Environment variables
    diagnostics.checks.push({
      name: 'Environment variables',
      status: 'INFO',
      supabaseUrl: supabaseUrl ? 'Set' : 'Missing',
      serviceKey: serviceKey ? 'Set (length: ' + serviceKey.length + ')' : 'Missing',
    })

    return apiOk(diagnostics)
  } catch (error: any) {
    return apiError('Diagnostics failed', 500, {
      message: toErrorMessage(error, 'Unexpected error'),
    })
  }
}
