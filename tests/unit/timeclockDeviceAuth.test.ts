import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  const maybeSingle = vi.fn()
  const secondDeviceEq = vi.fn(() => ({ maybeSingle }))
  const firstDeviceEq = vi.fn(() => ({ eq: secondDeviceEq }))
  const deviceSelect = vi.fn(() => ({ eq: firstDeviceEq }))

  const cleanupLt = vi.fn(async () => ({ error: null }))
  const cleanupEq = vi.fn(() => ({ lt: cleanupLt }))
  const deleteNonces = vi.fn(() => ({ eq: cleanupEq }))
  const insertNonce = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'timeclock_devices') return { select: deviceSelect }
    if (table === 'timeclock_device_request_nonces') {
      return { delete: deleteNonces, insert: insertNonce }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  const getSupabaseClient = vi.fn(() => ({ from }))

  return {
    maybeSingle,
    firstDeviceEq,
    secondDeviceEq,
    deviceSelect,
    cleanupLt,
    cleanupEq,
    deleteNonces,
    insertNonce,
    from,
    getSupabaseClient,
  }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import {
  authenticateTimeclockDevice,
  buildTimeclockDeviceSignatureMaterial,
} from '@/lib/timeclockDeviceAuth'

const device = {
  id: 'cb9008f8-0098-4b46-b77b-b82029aff3f2',
  name: 'Luton Office ESP32 Timeclock',
  secret: 'device-secret',
  location_id: 'a8b59d29-0d67-4cb7-a356-82c21534e5ff',
  qr_interval_sec: 30,
  is_active: true,
}

function makeSignedRequest({
  body = '',
  nonce = 'nonce-1',
  timestamp = String(Math.floor(Date.now() / 1000)),
  signatureOverride,
}: {
  body?: string
  nonce?: string
  timestamp?: string
  signatureOverride?: string
} = {}) {
  const url = `https://portal.test/api/timeclock/devices/config?device_id=${device.id}`
  const unsigned = new Request(url, { method: 'GET' })
  const material = buildTimeclockDeviceSignatureMaterial(unsigned, timestamp, nonce, body)
  const signature = crypto.createHmac('sha256', device.secret).update(material).digest('base64url')

  return new Request(url, {
    method: 'GET',
    headers: {
      'X-PTC-Device-Id': device.id,
      'X-PTC-Timestamp': timestamp,
      'X-PTC-Nonce': nonce,
      'X-PTC-Signature': signatureOverride || signature,
    },
  })
}

describe('timeclock device authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.maybeSingle.mockResolvedValue({ data: device, error: null })
    mocks.insertNonce.mockResolvedValue({ error: null })
  })

  it('authenticates a valid signed request and reserves its nonce', async () => {
    const request = makeSignedRequest()
    const result = await authenticateTimeclockDevice(request, {
      expectedDeviceId: device.id,
    })

    expect(result.authenticated).toBe(true)
    expect(mocks.firstDeviceEq).toHaveBeenCalledWith('id', device.id)
    expect(mocks.secondDeviceEq).toHaveBeenCalledWith('device_type', 'physical')
    expect(mocks.insertNonce).toHaveBeenCalledWith(
      expect.objectContaining({ device_id: device.id, nonce: 'nonce-1' }),
    )
    if (result.authenticated) expect(result.device).not.toHaveProperty('secret')
  })

  it('rejects missing authentication headers without a database lookup', async () => {
    const result = await authenticateTimeclockDevice(
      new Request('https://portal.test/api/timeclock/devices/config'),
    )

    expect(result.authenticated).toBe(false)
    if (!result.authenticated) expect(result.response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns 403 for an inactive physical device', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...device, is_active: false }, error: null })

    const result = await authenticateTimeclockDevice(makeSignedRequest())

    expect(result.authenticated).toBe(false)
    if (!result.authenticated) expect(result.response.status).toBe(403)
    expect(mocks.insertNonce).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature', async () => {
    const result = await authenticateTimeclockDevice(
      makeSignedRequest({ signatureOverride: 'invalid-signature' }),
    )

    expect(result.authenticated).toBe(false)
    if (!result.authenticated) expect(result.response.status).toBe(401)
    expect(mocks.insertNonce).not.toHaveBeenCalled()
  })

  it('rejects a nonce that has already been used', async () => {
    mocks.insertNonce.mockResolvedValueOnce({ error: { code: '23505' } })

    const result = await authenticateTimeclockDevice(makeSignedRequest())

    expect(result.authenticated).toBe(false)
    if (!result.authenticated) expect(result.response.status).toBe(401)
  })
})
