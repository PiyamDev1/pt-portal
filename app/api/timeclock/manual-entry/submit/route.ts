import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminSupabase = createClient(supabaseUrl, serviceKey)
const DUPLICATE_WINDOW_MS = 8_000

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

    const body = await request.json()
    const rawCode = typeof body?.code === 'string' ? body.code.trim() : ''
    const code = rawCode.replace(/\D/g, '')

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

    const duplicateThresholdIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()
    const { data: recentEvent } = await adminSupabase
      .from('timeclock_events')
      .select('id, scanned_at')
      .eq('employee_id', session.user.id)
      .eq('device_id', deviceId)
      .gte('scanned_at', duplicateThresholdIso)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentEvent) {
      return NextResponse.json({ error: 'Duplicate scan blocked. Please wait a few seconds and try again.' }, { status: 409 })
    }

    // Get location info from headers
    const headerStore = await headers()
    const ip = headerStore.get('x-forwarded-for') || ''
    const userAgent = headerStore.get('user-agent') || ''

    // Compute hash for tamper evidence
    const prevHash = lastEvent?.hash || null
    const nowIso = new Date().toISOString()
    const nonce = crypto.randomUUID()
    const hashMaterial = [
      'ptc1',
      deviceId,
      session.user.id,
      'MANUAL',
      punchType,
      nowIso,
      nonce,
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
        event_type: 'PUNCH',
        punch_type: punchType,
        qr_payload: {
          source: 'manual_code',
          code,
          payload: codeRecord.qr_payload,
        },
        nonce,
        device_ts: nowIso,
        scanned_at: nowIso,
        hash,
        prev_hash: prevHash,
        ip,
        user_agent: userAgent,
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
      eventId: insertedEvent?.id,
      eventType: insertedEvent?.event_type || 'PUNCH',
      punchType,
      scannedAt: nowIso,
      message: `Punch recorded: ${punchType}`,
    })
  } catch (error) {
    console.error('Manual entry submit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
