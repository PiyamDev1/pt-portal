import crypto from 'node:crypto'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ONLINE_WINDOW_MS = 180_000

const createDeviceSchema = z
  .object({
    name: z.unknown(),
    location_id: z.unknown().optional(),
    qr_interval_sec: z.unknown().optional(),
    is_active: z.unknown().optional(),
  })
  .strict()

const updateDeviceSchema = z
  .object({
    id: z.unknown(),
    action: z.unknown().optional(),
    name: z.unknown().optional(),
    location_id: z.unknown().optional(),
    qr_interval_sec: z.unknown().optional(),
    is_active: z.unknown().optional(),
    confirmation: z.unknown().optional(),
    verificationCode: z.unknown().optional(),
    verificationMethod: z.unknown().optional(),
  })
  .strict()

function parseUuid(value: unknown) {
  if (value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return UUID_PATTERN.test(trimmed) ? trimmed : undefined
}

function parseName(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 120)
  return trimmed || null
}

function parseQrInterval(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 300 ? parsed : null
}

async function getLocationName(locationId: string | null) {
  if (!locationId) return null
  const { data, error } = await getSupabaseClient()
    .from('locations')
    .select('name')
    .eq('id', locationId)
    .maybeSingle()
  if (error || !data) return undefined
  return data.name as string
}

function presentDevice(device: Record<string, unknown>) {
  const lastSeen = typeof device.last_seen_at === 'string' ? Date.parse(device.last_seen_at) : NaN
  return {
    ...device,
    online:
      device.is_active === true &&
      Number.isFinite(lastSeen) &&
      Date.now() - lastSeen <= ONLINE_WINDOW_MS,
  }
}

export async function GET() {
  const access = await requireAdminSession()
  if (!access.authorized) return access.response

  const { data, error } = await getSupabaseClient()
    .from('timeclock_devices')
    .select(
      'id, name, location, location_id, qr_interval_sec, is_active, last_seen_at, firmware_version, ip, wifi_rssi, free_heap, uptime_sec, created_at, updated_at',
    )
    .eq('device_type', 'physical')
    .order('name', { ascending: true })

  if (error) return apiError('Failed to load timeclock devices', 500)
  return apiOk({ devices: (data || []).map(presentDevice) })
}

export async function POST(request: Request) {
  const access = await requireAdminSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.timeclock-device-mutate',
    limit: 10,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, createDeviceSchema, {
    maxBytes: 8 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
  const name = parseName(body.name)
  const locationId = parseUuid(body.location_id)
  const qrInterval = parseQrInterval(body.qr_interval_sec ?? 30)

  if (!name) return apiError('Device name required', 400)
  if (locationId === undefined) return apiError('Invalid location_id', 400)
  if (qrInterval === null) return apiError('QR interval must be between 5 and 300 seconds', 400)

  const locationName = await getLocationName(locationId)
  if (locationName === undefined) return apiError('Location not found', 400)

  const id = crypto.randomUUID()
  const secret = crypto.randomBytes(32).toString('hex')
  const { data, error } = await getSupabaseClient()
    .from('timeclock_devices')
    .insert({
      id,
      name,
      secret,
      device_type: 'physical',
      location_id: locationId,
      location: locationName,
      qr_interval_sec: qrInterval,
      is_active: true,
    })
    .select(
      'id, name, location, location_id, qr_interval_sec, is_active, last_seen_at, firmware_version, ip, wifi_rssi, free_heap, uptime_sec, created_at, updated_at',
    )
    .single()

  if (error) {
    if (error.code === '23505') return apiError('A device with this name already exists', 409)
    return apiError('Failed to create timeclock device', 500)
  }

  return apiOk(
    { device: presentDevice(data), provisioning_secret: secret },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(request: Request) {
  const access = await requireAdminSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.timeclock-device-mutate',
    limit: 10,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, updateDeviceSchema, {
    maxBytes: 8 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
  const id = parseUuid(body.id)
  if (!id) return apiError('Valid device id required', 400)

  const admin = getSupabaseClient()
  const { data: existing, error: lookupError } = await admin
    .from('timeclock_devices')
    .select('id, name')
    .eq('id', id)
    .eq('device_type', 'physical')
    .maybeSingle()

  if (lookupError) return apiError('Failed to load timeclock device', 500)
  if (!existing) return apiError('Device not found', 404)

  if (body.action === 'rotate_secret') {
    if (body.confirmation !== existing.name) {
      return apiError('Type the device name exactly to confirm secret rotation', 400)
    }

    const verification = await verifyFreshSecondFactor({
      userId: access.user.id,
      code: body.verificationCode,
      method: body.verificationMethod,
    })
    if (!verification.verified) return apiError(verification.error, 403)

    const secret = crypto.randomBytes(32).toString('hex')
    const { error } = await admin
      .from('timeclock_devices')
      .update({ secret, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return apiError('Failed to rotate device secret', 500)
    return apiOk({ id, provisioning_secret: secret }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const name = parseName(body.name)
  const locationId = parseUuid(body.location_id)
  const qrInterval = parseQrInterval(body.qr_interval_sec)
  if (!name) return apiError('Device name required', 400)
  if (locationId === undefined) return apiError('Invalid location_id', 400)
  if (qrInterval === null) return apiError('QR interval must be between 5 and 300 seconds', 400)
  if (typeof body.is_active !== 'boolean') return apiError('is_active must be boolean', 400)

  const locationName = await getLocationName(locationId)
  if (locationName === undefined) return apiError('Location not found', 400)

  const { data, error } = await admin
    .from('timeclock_devices')
    .update({
      name,
      location_id: locationId,
      location: locationName,
      qr_interval_sec: qrInterval,
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('device_type', 'physical')
    .select(
      'id, name, location, location_id, qr_interval_sec, is_active, last_seen_at, firmware_version, ip, wifi_rssi, free_heap, uptime_sec, created_at, updated_at',
    )
    .single()

  if (error) {
    if (error.code === '23505') return apiError('A device with this name already exists', 409)
    return apiError('Failed to update timeclock device', 500)
  }

  return apiOk({ device: presentDevice(data) })
}
