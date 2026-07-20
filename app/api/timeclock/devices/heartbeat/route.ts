import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authenticateTimeclockDevice } from '@/lib/timeclockDeviceAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type HeartbeatBody = {
  device_id?: unknown
  firmware_version?: unknown
  ip?: unknown
  wifi_rssi?: unknown
  free_heap?: unknown
  uptime_sec?: unknown
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, maxLength)
  return trimmed || null
}

function optionalInteger(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null
  return parsed
}

export async function POST(request: Request) {
  const bodyText = await request.text()
  let body: HeartbeatBody
  try {
    body = JSON.parse(bodyText) as HeartbeatBody
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : ''
  if (!deviceId) return apiError('device_id required', 400)

  const auth = await authenticateTimeclockDevice(request, {
    bodyText,
    expectedDeviceId: deviceId,
  })
  if (!auth.authenticated) return auth.response

  const now = new Date().toISOString()
  const { error } = await getSupabaseClient()
    .from('timeclock_devices')
    .update({
      last_seen_at: now,
      firmware_version: optionalText(body.firmware_version, 80),
      ip: optionalText(body.ip, 64),
      wifi_rssi: optionalInteger(body.wifi_rssi, -200, 0),
      free_heap: optionalInteger(body.free_heap, 0, Number.MAX_SAFE_INTEGER),
      uptime_sec: optionalInteger(body.uptime_sec, 0, Number.MAX_SAFE_INTEGER),
      updated_at: now,
    })
    .eq('id', auth.device.id)

  if (error) return apiError('Failed to record heartbeat', 500)

  return apiOk({ ok: true, server_time: now })
}
