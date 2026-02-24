import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signatureBase)
    .digest('base64url')

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
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has Master Admin role or is a manager (has direct reports)
    const { data: user } = await supabase
      .from('employees')
      .select('roles(name)')
      .eq('id', session.user.id)
      .single()

    const { count: reportCount } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', session.user.id)

    const role = Array.isArray(user?.roles) ? user.roles[0] : user?.roles
    const isManager = role?.name === 'Master Admin' || (reportCount || 0) > 0

    if (!isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get or create a virtual device for manual entry
    const deviceId = `MANUAL-${session.user.id.slice(0, 8)}`
    const { data: device, error: deviceError } = await adminSupabase
      .from('timeclock_devices')
      .select('id, secret')
      .eq('id', deviceId)
      .maybeSingle()

    let deviceSecret: string
    if (device) {
      deviceSecret = device.secret
    } else {
      // Create virtual device if it doesn't exist
      deviceSecret = crypto.randomBytes(32).toString('hex')
      await adminSupabase
        .from('timeclock_devices')
        .insert({
          id: deviceId,
          secret: deviceSecret,
          location: 'Virtual - Manual Entry',
          is_active: true,
        })
        .select()
        .single()
    }

    // Generate code and payload
    const numericCode = generateNumericCode()
    const codeDisplay = formatCodeDisplay(numericCode)
    const qrPayload = generateQrPayload(deviceId, deviceSecret)
    const expiresAt = Date.now() + 30000 // 30 seconds

    // Store code mapping (will be cleaned up after expiry)
    const { error: codeError } = await adminSupabase
      .from('timeclock_manual_codes')
      .insert({
        code: numericCode,
        device_id: deviceId,
        qr_payload: qrPayload,
        user_id: session.user.id,
        expires_at: new Date(expiresAt).toISOString(),
      })

    if (codeError) {
      console.error('Code storage error:', codeError)
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
    }

    return NextResponse.json({
      code: numericCode,
      codeDisplay,
      qrPayload,
      expiresAt,
    })
  } catch (error) {
    console.error('Manual entry generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
