import crypto from 'node:crypto'
import { apiError } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'

const MAX_CLOCK_SKEW_SECONDS = 120
const NONCE_TTL_SECONDS = 300

type AuthenticatedDevice = {
  id: string
  name: string
  location_id: string | null
  qr_interval_sec: number
  is_active: boolean
}

type DeviceAuthResult =
  | { authenticated: true; device: AuthenticatedDevice }
  | { authenticated: false; response: Response }

type AuthenticateDeviceOptions = {
  bodyText?: string
  expectedDeviceId?: string | null
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function buildTimeclockDeviceSignatureMaterial(
  request: Request,
  timestamp: string,
  nonce: string,
  bodyText = '',
) {
  const url = new URL(request.url)
  const pathAndQuery = `${url.pathname}${url.search}`
  const bodyHash = crypto.createHash('sha256').update(bodyText).digest('hex')
  return [request.method.toUpperCase(), pathAndQuery, timestamp, nonce, bodyHash].join('\n')
}

export async function authenticateTimeclockDevice(
  request: Request,
  options: AuthenticateDeviceOptions = {},
): Promise<DeviceAuthResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { authenticated: false, response: apiError('Server configuration error', 500) }
  }

  const deviceId = request.headers.get('x-ptc-device-id')?.trim() || ''
  const timestamp = request.headers.get('x-ptc-timestamp')?.trim() || ''
  const nonce = request.headers.get('x-ptc-nonce')?.trim() || ''
  const signature = request.headers.get('x-ptc-signature')?.trim() || ''

  if (!deviceId || !timestamp || !nonce || !signature || nonce.length > 128) {
    return { authenticated: false, response: apiError('Invalid device authentication', 401) }
  }

  if (options.expectedDeviceId && options.expectedDeviceId !== deviceId) {
    return { authenticated: false, response: apiError('Invalid device authentication', 401) }
  }

  const timestampSeconds = Number(timestamp)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (
    !/^\d+$/.test(timestamp) ||
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return { authenticated: false, response: apiError('Invalid device authentication', 401) }
  }

  const supabase = getSupabaseClient()
  const { data: device, error: deviceError } = await supabase
    .from('timeclock_devices')
    .select('id, name, secret, location_id, qr_interval_sec, is_active')
    .eq('id', deviceId)
    .eq('device_type', 'physical')
    .maybeSingle()

  if (deviceError || !device) {
    return { authenticated: false, response: apiError('Invalid device authentication', 401) }
  }

  if (!device.is_active) {
    return { authenticated: false, response: apiError('Device inactive', 403) }
  }

  const material = buildTimeclockDeviceSignatureMaterial(
    request,
    timestamp,
    nonce,
    options.bodyText || '',
  )
  const expectedSignature = crypto
    .createHmac('sha256', device.secret)
    .update(material)
    .digest('base64url')

  if (!safeEqual(expectedSignature, signature)) {
    return { authenticated: false, response: apiError('Invalid device authentication', 401) }
  }

  await supabase
    .from('timeclock_device_request_nonces')
    .delete()
    .eq('device_id', deviceId)
    .lt('expires_at', new Date().toISOString())

  const expiresAt = new Date((nowSeconds + NONCE_TTL_SECONDS) * 1000).toISOString()
  const { error: nonceError } = await supabase.from('timeclock_device_request_nonces').insert({
    device_id: deviceId,
    nonce,
    expires_at: expiresAt,
  })

  if (nonceError) {
    if (nonceError.code === '23505') {
      return { authenticated: false, response: apiError('Invalid device authentication', 401) }
    }
    return { authenticated: false, response: apiError('Device authentication unavailable', 500) }
  }

  return {
    authenticated: true,
    device: {
      id: device.id,
      name: device.name,
      location_id: device.location_id,
      qr_interval_sec: device.qr_interval_sec,
      is_active: device.is_active,
    },
  }
}
