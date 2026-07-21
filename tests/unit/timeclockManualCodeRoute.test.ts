import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const authenticateTimeclockDevice = vi.fn()
  const rateInsert = vi.fn()
  const rateMaybeSingle = vi.fn()
  const rateSelect = vi.fn(() => ({ maybeSingle: rateMaybeSingle }))
  const rateLte = vi.fn(() => ({ select: rateSelect }))
  const rateEq = vi.fn(() => ({ lte: rateLte }))
  const rateUpdate = vi.fn(() => ({ eq: rateEq }))

  const codeInsert = vi.fn()
  const codeDeleteIs = vi.fn()
  const codeDeleteEq = vi.fn(() => ({ is: codeDeleteIs }))
  const codeDelete = vi.fn(() => ({ eq: codeDeleteEq }))

  const from = vi.fn((table: string) => {
    if (table === 'timeclock_device_manual_code_limits') {
      return { insert: rateInsert, update: rateUpdate }
    }
    if (table === 'timeclock_manual_codes') {
      return { insert: codeInsert, delete: codeDelete }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  const getSupabaseClient = vi.fn(() => ({ from }))

  return {
    authenticateTimeclockDevice,
    rateInsert,
    rateMaybeSingle,
    rateSelect,
    rateLte,
    rateEq,
    rateUpdate,
    codeInsert,
    codeDeleteIs,
    codeDeleteEq,
    codeDelete,
    from,
    getSupabaseClient,
  }
})

vi.mock('@/lib/timeclockDeviceAuth', () => ({
  authenticateTimeclockDevice: mocks.authenticateTimeclockDevice,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { POST } from '@/app/api/timeclock/devices/manual-code/route'

const device = {
  id: 'cb9008f8-0098-4b46-b77b-b82029aff3f2',
  name: 'Luton Office ESP32 Timeclock',
  location_id: null,
  qr_interval_sec: 20,
  is_active: true,
}

const makeRequest = (body: Record<string, unknown>) =>
  new Request('https://portal.test/api/timeclock/devices/manual-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('physical timeclock manual-code route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.authenticateTimeclockDevice.mockResolvedValue({ authenticated: true, device })
    mocks.rateInsert.mockResolvedValue({ error: null })
    mocks.codeDeleteIs.mockResolvedValue({ error: null })
    mocks.codeInsert.mockResolvedValue({ error: null })
  })

  it('creates a cryptographically generated short-lived code for a signed device request', async () => {
    const body = {
      device_id: device.id,
      qr_payload: 'ptc1:current-payload',
    }
    const request = makeRequest(body)
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.code).toMatch(/^\d{8}$/)
    expect(payload.code_display).toBe(`${payload.code.slice(0, 4)}-${payload.code.slice(4)}`)
    expect(Date.parse(payload.expires_at)).toBeGreaterThan(Date.now())
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.authenticateTimeclockDevice).toHaveBeenCalledWith(request, {
      bodyText: JSON.stringify(body),
      expectedDeviceId: device.id,
    })
    expect(mocks.codeDeleteEq).toHaveBeenCalledWith('device_id', device.id)
    expect(mocks.codeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_id: device.id,
        qr_payload: body.qr_payload,
        user_id: null,
      }),
    )
  })

  it('retries when a generated code collides with an existing code', async () => {
    mocks.codeInsert
      .mockResolvedValueOnce({ error: { code: '23505' } })
      .mockResolvedValueOnce({ error: null })

    const response = await POST(
      makeRequest({ device_id: device.id, qr_payload: 'ptc1:current-payload' }),
    )

    expect(response.status).toBe(200)
    expect(mocks.codeInsert).toHaveBeenCalledTimes(2)
  })

  it('rate limits repeated requests according to the device QR interval', async () => {
    mocks.rateInsert.mockResolvedValueOnce({ error: { code: '23505' } })
    mocks.rateMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const response = await POST(
      makeRequest({ device_id: device.id, qr_payload: 'ptc1:current-payload' }),
    )
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(payload).toEqual({ error: 'Manual code requested too soon', retry_after: 20 })
    expect(mocks.codeInsert).not.toHaveBeenCalled()
  })

  it('rejects a payload that is not a namespaced QR value before authentication', async () => {
    const response = await POST(makeRequest({ device_id: device.id, qr_payload: 'invalid' }))

    expect(response.status).toBe(400)
    expect(mocks.authenticateTimeclockDevice).not.toHaveBeenCalled()
  })
})
