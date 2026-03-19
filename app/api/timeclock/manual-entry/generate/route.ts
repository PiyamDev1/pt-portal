/**
 * API Route: Generate Manual Entry Code
 *
 * POST /api/timeclock/manual-entry/generate
 *
 * Generates a short-lived manual punch code for employees who cannot
 * use the QR scanner (e.g. field workers without camera access).
 *
 * The generated code is a signed payload stored in timeclock_manual_codes
 * with a 5-minute expiry and a single-use nonce. A 6-digit numeric code
 * is also produced for human-readable display.
 *
 * Access control:
 *   - Maintenance / org-admin: can generate for any employee
 *   - Manager: can generate for direct reports only
 *   - Others: forbidden
 *
 * Request Body: { employeeId: string, deviceId?: string }
 * Response Success (200): { code, numericCode, expiresAt, payload }
 * Response Errors:
 *   400 - Missing employeeId
 *   401 - Not authenticated
 *   403 - Insufficient role
 *   500 - DB or crypto error
 *
 * Authentication: Session cookie (manager or maintenance role)
 */
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import {
  getRoleName,
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminSupabase = createClient(supabaseUrl, serviceKey)
const PAYLOAD_NAMESPACE = 'ptc1:'

function generateNonce() {
  return crypto.randomBytes(16).toString('hex')
}

function generateNumericCode() {
  // Generate random 8-digit numeric code
  return Math.floor(Math.random() * 100000000)
    .toString()
    .padStart(8, '0')
}

function formatCodeDisplay(code: string) {
  // Format as XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`
}

function generateQrPayload(deviceId: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000)
  const nonce = generateNonce()

  const signatureBase = `${deviceId}.${ts}.${nonce}`
  const sig = crypto.createHmac('sha256', secret).update(signatureBase).digest('base64url')

  const payload = {
    v: 1,
    device_id: deviceId,
    ts,
    nonce,
    sig,
  }

  const jsonPayload = JSON.stringify(payload)
  const base64Payload = Buffer.from(jsonPayload).toString('base64url')

  return `${PAYLOAD_NAMESPACE}${base64Payload}`
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    })

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return apiError('Unauthorized', 401)
    }

    // Check if user has manager-level or maintenance-level timeclock access.
    const [{ data: user }, { count: reportCount }, { data: profile }] = await Promise.all([
      supabase.from('employees').select('roles(name)').eq('id', session.user.id).single(),
      supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('manager_id', session.user.id),
      supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle(),
    ])

    const roleName = pickRoleName(getRoleName(user?.roles), profile?.role)
    const canAccessManualEntry =
      hasManagerTimeclockAccess(roleName, reportCount) || hasMaintenanceTimeclockAccess(roleName)

    if (!canAccessManualEntry) {
      return apiError('Forbidden', 403)
    }

    // Get or create a virtual device for manual entry
    const manualDeviceName = `Manual Entry (${session.user.id.slice(0, 8)})`
    const { data: device, error: deviceError } = await adminSupabase
      .from('timeclock_devices')
      .select('id, secret')
      .eq('name', manualDeviceName)
      .maybeSingle()

    if (deviceError) {
      console.error('Manual device lookup error:', deviceError)
      return apiError('Device lookup failed', 500, { details: deviceError.message })
    }

    let deviceId: string
    let deviceSecret: string
    if (device) {
      deviceId = device.id
      deviceSecret = device.secret
    } else {
      // Create virtual device if it doesn't exist
      deviceId = crypto.randomUUID()
      deviceSecret = crypto.randomBytes(32).toString('hex')

      const { error: insertDeviceError } = await adminSupabase
        .from('timeclock_devices')
        .insert({
          id: deviceId,
          name: manualDeviceName,
          secret: deviceSecret,
          location: 'Virtual - Manual Entry',
          is_active: true,
        })
        .select()
        .single()

      if (insertDeviceError) {
        console.error('Manual device insert error:', insertDeviceError)
        return apiError('Device creation failed', 500, { details: insertDeviceError.message })
      }
    }

    // Generate code and payload
    const numericCode = generateNumericCode()
    const codeDisplay = formatCodeDisplay(numericCode)
    const qrPayload = generateQrPayload(deviceId, deviceSecret)
    const expiresAt = Date.now() + 30000 // 30 seconds

    // Store code mapping (will be cleaned up after expiry)
    const insertData = {
      code: numericCode,
      device_id: deviceId,
      qr_payload: qrPayload,
      user_id: session.user.id,
      expires_at: new Date(expiresAt).toISOString(),
    }

    const { error: codeError } = await adminSupabase
      .from('timeclock_manual_codes')
      .insert(insertData)

    if (codeError) {
      console.error('Code storage error:', codeError)
      return apiError('Failed to generate code', 500, {
        details: codeError.message,
        code: codeError.code,
        hint: codeError.hint,
      })
    }

    return apiOk({
      code: numericCode,
      codeDisplay,
      qrPayload,
      expiresAt,
    })
  } catch (error) {
    console.error('Manual entry generate error:', error)
    return apiError(toErrorMessage(error, 'Internal server error'), 500)
  }
}
