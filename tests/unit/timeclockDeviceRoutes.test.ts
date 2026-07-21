import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const authenticateTimeclockDevice = vi.fn()
  const from = vi.fn()
  const getSupabaseClient = vi.fn(() => ({ from }))
  return { authenticateTimeclockDevice, from, getSupabaseClient }
})

vi.mock('@/lib/timeclockDeviceAuth', () => ({
  authenticateTimeclockDevice: mocks.authenticateTimeclockDevice,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { GET as getConfig } from '@/app/api/timeclock/devices/config/route'
import { POST as postHeartbeat } from '@/app/api/timeclock/devices/heartbeat/route'
import { GET as getNotices } from '@/app/api/timeclock/notices/route'

const device = {
  id: 'cb9008f8-0098-4b46-b77b-b82029aff3f2',
  name: 'Luton Office ESP32 Timeclock',
  location_id: 'a8b59d29-0d67-4cb7-a356-82c21534e5ff',
  qr_interval_sec: 30,
  is_active: true,
}

describe('timeclock firmware routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.authenticateTimeclockDevice.mockResolvedValue({ authenticated: true, device })
  })

  it('returns the signed device configuration without a secret', async () => {
    const maybeSingle = vi.fn(async () => ({ data: { name: 'Luton Office' }, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    mocks.from.mockReturnValue({ select })

    const request = new Request(
      `https://portal.test/api/timeclock/devices/config?device_id=${device.id}`,
    )
    const response = await getConfig(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      device_id: device.id,
      location_id: device.location_id,
      location_name: 'Luton Office',
      qr_interval_sec: 30,
      is_active: true,
    })
    expect(payload).not.toHaveProperty('secret')
    expect(mocks.authenticateTimeclockDevice).toHaveBeenCalledWith(request, {
      expectedDeviceId: device.id,
    })
  })

  it('accepts the current firmware heartbeat while optional telemetry is absent', async () => {
    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    mocks.from.mockReturnValue({ update })

    const body = JSON.stringify({
      device_id: device.id,
      firmware_version: '1.0.0',
      ip: '192.0.2.10',
    })
    const request = new Request('https://portal.test/api/timeclock/devices/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const response = await postHeartbeat(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.server_time).toEqual(expect.any(Number))
    expect(mocks.authenticateTimeclockDevice).toHaveBeenCalledWith(request, {
      bodyText: body,
      expectedDeviceId: device.id,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        firmware_version: '1.0.0',
        ip: '192.0.2.10',
        wifi_rssi: null,
        free_heap: null,
        uptime_sec: null,
      }),
    )
  })

  it('returns location-visible notices as the firmware JSON array contract', async () => {
    const notices = [
      {
        id: 'notice-1',
        title: 'Office notice',
        body: 'Notice text',
        created_at: '2026-07-21T00:00:00.000Z',
      },
    ]
    const or = vi.fn(async () => ({ data: notices, error: null }))
    const secondOrder = vi.fn(() => ({ or }))
    const firstOrder = vi.fn(() => ({ order: secondOrder }))
    const secondIs = vi.fn(() => ({ order: firstOrder }))
    const firstIs = vi.fn(() => ({ is: secondIs }))
    const eq = vi.fn(() => ({ is: firstIs }))
    const select = vi.fn(() => ({ eq }))
    mocks.from.mockReturnValue({ select })

    const request = new Request(`https://portal.test/api/timeclock/notices?device_id=${device.id}`)
    const response = await getNotices(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(notices)
    expect(or).toHaveBeenCalledWith(
      `target_location_id.is.null,target_location_id.eq.${device.location_id}`,
    )
  })
})
