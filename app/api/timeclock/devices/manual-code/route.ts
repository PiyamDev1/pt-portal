import crypto from 'node:crypto'
import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authenticateTimeclockDevice } from '@/lib/timeclockDeviceAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CODE_LIFETIME_MS = 30_000
const CODE_GENERATION_ATTEMPTS = 5

type ManualCodeBody = {
  device_id?: unknown
  qr_payload?: unknown
}

async function claimRateLimit(deviceId: string, intervalSeconds: number, now: Date) {
  const admin = getSupabaseClient()
  const nextAllowedAt = new Date(now.getTime() + intervalSeconds * 1000).toISOString()
  const limitRow = {
    device_id: deviceId,
    next_allowed_at: nextAllowedAt,
    updated_at: now.toISOString(),
  }

  const { error: insertError } = await admin
    .from('timeclock_device_manual_code_limits')
    .insert(limitRow)

  if (!insertError) return { allowed: true as const }
  if (insertError.code !== '23505') return { allowed: false as const, unavailable: true as const }

  const { data, error } = await admin
    .from('timeclock_device_manual_code_limits')
    .update(limitRow)
    .eq('device_id', deviceId)
    .lte('next_allowed_at', now.toISOString())
    .select('device_id')
    .maybeSingle()

  if (error) return { allowed: false as const, unavailable: true as const }
  if (!data) {
    return { allowed: false as const, retryAfter: intervalSeconds }
  }
  return { allowed: true as const }
}

function generateCode() {
  return crypto.randomInt(0, 100_000_000).toString().padStart(8, '0')
}

export async function POST(request: Request) {
  const bodyText = await request.text()
  let body: ManualCodeBody
  try {
    body = JSON.parse(bodyText) as ManualCodeBody
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : ''
  const qrPayload = typeof body.qr_payload === 'string' ? body.qr_payload.trim() : ''
  if (!deviceId) return apiError('device_id required', 400)
  if (!qrPayload.startsWith('ptc1:') || qrPayload.length > 4096) {
    return apiError('Valid qr_payload required', 400)
  }

  const auth = await authenticateTimeclockDevice(request, {
    bodyText,
    expectedDeviceId: deviceId,
  })
  if (!auth.authenticated) return auth.response

  const admin = getSupabaseClient()
  const now = new Date()
  const rateLimit = await claimRateLimit(auth.device.id, auth.device.qr_interval_sec, now)
  if (!rateLimit.allowed) {
    if ('unavailable' in rateLimit) return apiError('Manual code service unavailable', 500)
    return apiError('Manual code requested too soon', 429, {
      retry_after: rateLimit.retryAfter,
    })
  }

  const { error: deleteError } = await admin
    .from('timeclock_manual_codes')
    .delete()
    .eq('device_id', auth.device.id)
    .is('used_at', null)

  if (deleteError) return apiError('Failed to replace previous manual code', 500)

  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS).toISOString()
  for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateCode()
    const { error } = await admin.from('timeclock_manual_codes').insert({
      code,
      device_id: auth.device.id,
      qr_payload: qrPayload,
      user_id: null,
      expires_at: expiresAt,
    })

    if (!error) {
      return apiOk(
        {
          code,
          code_display: `${code.slice(0, 4)}-${code.slice(4)}`,
          expires_at: expiresAt,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (error.code !== '23505') return apiError('Failed to create manual code', 500)
  }

  return apiError('Unable to allocate a unique manual code', 503)
}
