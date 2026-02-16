import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

type QrPayload = {
  v: number
  device_id: string
  ts: number
  nonce: string
  sig: string
}

type GeoPoint = {
  lat: number
  lng: number
  accuracy: number
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminSupabase = createClient(supabaseUrl, serviceKey)
const PAYLOAD_NAMESPACE = 'ptc1:'

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4)
  const normalized = padded + '='.repeat(padLength)
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function parseQrPayload(qrText: string): QrPayload | null {
  const trimmed = qrText.trim()
  if (!trimmed) return null

  const tryParseJson = (text: string): QrPayload | null => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  if (trimmed.startsWith('{')) {
    return tryParseJson(trimmed)
  }

  if (trimmed.startsWith(PAYLOAD_NAMESPACE)) {
    try {
      const decoded = base64UrlDecode(trimmed.slice(PAYLOAD_NAMESPACE.length))
      return tryParseJson(decoded)
    } catch {
      return null
    }
  }

  try {
    const decoded = base64UrlDecode(trimmed)
    return tryParseJson(decoded)
  } catch {
    return null
  }
}

function normalizeTimestamp(ts: number) {
  if (!Number.isFinite(ts)) return null
  if (ts > 1_000_000_000_000) return Math.floor(ts / 1000)
  return Math.floor(ts)
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

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
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

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
    const qrText = typeof body?.qrText === 'string' ? body.qrText : ''
    const geo: GeoPoint | null = body?.geo || null

    const payload = parseQrPayload(qrText)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid QR payload' }, { status: 400 })
    }

    if (!payload.device_id || !payload.nonce || !payload.sig || payload.v !== 1) {
      return NextResponse.json({ error: 'QR payload missing required fields' }, { status: 400 })
    }

    const normalizedTs = normalizeTimestamp(payload.ts)
    if (!normalizedTs) {
      return NextResponse.json({ error: 'Invalid device timestamp' }, { status: 400 })
    }

    const { data: device, error: deviceError } = await adminSupabase
      .from('timeclock_devices')
      .select('id, secret, is_active')
      .eq('id', payload.device_id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    if (!device.is_active) {
      return NextResponse.json({ error: 'Device inactive' }, { status: 403 })
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const skewSeconds = Math.abs(nowSeconds - normalizedTs)
    if (skewSeconds > 120) {
      return NextResponse.json({ error: 'QR expired' }, { status: 400 })
    }

    const signatureBase = `${payload.device_id}.${normalizedTs}.${payload.nonce}`
    const expectedSig = crypto
      .createHmac('sha256', device.secret)
      .update(signatureBase)
      .digest('base64url')

    if (!safeEqual(expectedSig, payload.sig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const { data: lastEvent } = await adminSupabase
      .from('timeclock_events')
      .select('hash')
      .eq('device_id', payload.device_id)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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

    const prevHash = lastEvent?.hash || null
    const deviceTsIso = new Date(normalizedTs * 1000).toISOString()
    const headerStore = await headers()
    const ip = headerStore.get('x-forwarded-for') || ''
    const userAgent = headerStore.get('user-agent') || ''

    const hashMaterial = [
      PAYLOAD_NAMESPACE.slice(0, -1),
      payload.device_id,
      session.user.id,
      'PUNCH',
      punchType,
      deviceTsIso,
      payload.nonce,
      geo?.lat ?? '',
      geo?.lng ?? '',
      geo?.accuracy ?? '',
      ip,
      userAgent,
      JSON.stringify(payload),
      prevHash ?? '',
    ].join('|')

    const hash = computeHash(hashMaterial)

    const { data: inserted, error: insertError } = await adminSupabase
      .from('timeclock_events')
      .insert({
        employee_id: session.user.id,
        device_id: payload.device_id,
        event_type: 'PUNCH',
        punch_type: punchType,
        qr_payload: payload,
        nonce: payload.nonce,
        device_ts: deviceTsIso,
        scanned_at: new Date().toISOString(),
        geo,
        ip,
        user_agent: userAgent,
        hash,
        prev_hash: prevHash,
      })
      .select('id, event_type, scanned_at')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'QR already used' }, { status: 409 })
      }
      throw insertError
    }

    return NextResponse.json({
      ok: true,
      message: 'Clock event recorded.',
      eventId: inserted?.id,
      eventType: inserted?.event_type,
      scannedAt: inserted?.scanned_at,
    })
  } catch (error: any) {
    console.error('[TIMECLOCK SCAN] Error:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}
