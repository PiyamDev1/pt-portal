import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminSupabase = createClient(supabaseUrl, serviceKey)

function computeHash(material: string) {
  return crypto.createHash('sha256').update(material).digest('hex')
}

function getUtcDayBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
  return { start, end }
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

    const body = await request.json()
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    if (!code || code.length !== 8 || !/^\d{8}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 })
    }

    // Look up the code
    const { data: codeRecord, error: codeError } = await adminSupabase
      .from('timeclock_manual_codes')
      .select('device_id, qr_payload, expires_at')
      .eq('code', code)
      .maybeSingle()

    if (codeError || !codeRecord) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 404 })
    }

    // Check expiration
    const expiresAt = new Date(codeRecord.expires_at).getTime()
    if (Date.now() > expiresAt) {
      return NextResponse.json({ error: 'Code expired' }, { status: 400 })
    }

    const deviceId = codeRecord.device_id

    // Get last event for hash chain
    const { data: lastEvent } = await adminSupabase
      .from('timeclock_events')
      .select('hash')
      .eq('device_id', deviceId)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Determine punch type (IN/OUT alternation per UTC day)
    const { start, end } = getUtcDayBounds(new Date())
    const { data: lastPunch } = await adminSupabase
      .from('timeclock_events')
      .select('punch_type')
      .eq('employee_id', session.user.id)
      .gte('scanned_at', start.toISOString())
      .lte('scanned_at', end.toISOString())
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const punchType = lastPunch?.punch_type === 'IN' ? 'OUT' : 'IN'

    // Get location info from headers
    const headerStore = await headers()
    const ip = headerStore.get('x-forwarded-for') || ''
    const userAgent = headerStore.get('user-agent') || ''

    // Compute hash for tamper evidence
    const prevHash = lastEvent?.hash || null
    const nowIso = new Date().toISOString()
    const hashMaterial = [
      'ptc1',
      deviceId,
      session.user.id,
      'MANUAL',
      punchType,
      nowIso,
      ip,
      userAgent,
      prevHash || '',
    ].join('|')

    const hash = computeHash(hashMaterial)

    // Record the punch
    const { error: insertError, data: insertedEvent } = await adminSupabase
      .from('timeclock_events')
      .insert({
        employee_id: session.user.id,
        device_id: deviceId,
        punch_type: punchType,
        scanned_at: nowIso,
        hash,
        prev_hash: prevHash,
        ip_address: ip,
        user_agent: userAgent,
        entry_method: 'MANUAL',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to record punch' }, { status: 500 })
    }

    // Delete the used code
    await adminSupabase
      .from('timeclock_manual_codes')
      .delete()
      .eq('code', code)

    return NextResponse.json({
      success: true,
      punchType,
      scannedAt: nowIso,
      message: `Punch recorded: ${punchType}`,
    })
  } catch (error) {
    console.error('Manual entry submit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
