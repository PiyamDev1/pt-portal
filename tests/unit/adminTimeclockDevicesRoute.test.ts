import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperAdminSession = vi.fn()
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const getSupabaseClient = vi.fn(() => ({ from }))
  return { requireSuperAdminSession, order, eq, select, from, getSupabaseClient }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireSuperAdminSession: mocks.requireSuperAdminSession,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { GET } from '@/app/api/admin/timeclock/devices/route'

describe('admin timeclock devices route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdminSession.mockResolvedValue({
      authorized: true,
      user: { id: 'super-1' },
    })
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.order.mockResolvedValue({
      data: [
        {
          id: 'cb9008f8-0098-4b46-b77b-b82029aff3f2',
          name: 'Luton Office ESP32 Timeclock',
          location: 'Luton Office',
          location_id: null,
          qr_interval_sec: 30,
          is_active: true,
          last_seen_at: null,
          firmware_version: null,
          ip: null,
          wifi_rssi: null,
          free_heap: null,
          uptime_sec: null,
        },
      ],
      error: null,
    })
  })

  it('passes through the Super Admin authorization response', async () => {
    mocks.requireSuperAdminSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('lists only physical devices without selecting their secret', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.eq).toHaveBeenCalledWith('device_type', 'physical')
    expect(mocks.select.mock.calls[0][0]).not.toMatch(/\bsecret\b/)
    expect(payload.devices[0]).not.toHaveProperty('secret')
  })
})
