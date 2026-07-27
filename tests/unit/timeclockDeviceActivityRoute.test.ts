import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateTimeclockDevice: vi.fn(),
  from: vi.fn(),
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/timeclockDeviceAuth', () => ({
  authenticateTimeclockDevice: mocks.authenticateTimeclockDevice,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { GET } from '@/app/api/timeclock/devices/activity/route'

const device = {
  id: 'cb9008f8-0098-4b46-b77b-b82029aff3f2',
  name: 'Luton Office ESP32 Timeclock',
  location_id: 'a8b59d29-0d67-4cb7-a356-82c21534e5ff',
  qr_interval_sec: 30,
  is_active: true,
}

function makeActivityQuery(data: unknown[] = [], error: unknown = null) {
  const limit = vi.fn(async () => ({ data, error }))
  const secondOrder = vi.fn(() => ({ limit }))
  const order = vi.fn(() => ({ order: secondOrder }))
  const gt = vi.fn(() => ({ order }))
  const inFilter = vi.fn(() => ({ gt, order }))
  const eventTypeEq = vi.fn(() => ({ in: inFilter }))
  const deviceEq = vi.fn(() => ({ eq: eventTypeEq }))
  const select = vi.fn(() => ({ eq: deviceEq }))
  mocks.from.mockReturnValue({ select })

  return { deviceEq, eventTypeEq, inFilter, gt, order, secondOrder, limit }
}

describe('GET /api/timeclock/devices/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.authenticateTimeclockDevice.mockResolvedValue({ authenticated: true, device })
  })

  it('returns the latest device events oldest to newest in the firmware contract', async () => {
    const query = makeActivityQuery([
      {
        id: 'event-2',
        punch_type: 'OUT',
        scanned_at: '2026-07-27T10:30:45.900Z',
        employees: { full_name: 'Jane Smith' },
      },
      {
        id: 'event-1',
        punch_type: 'IN',
        scanned_at: '2026-07-27T08:00:00.000Z',
        employees: [{ full_name: 'Jane Smith' }],
      },
    ])
    const request = new Request(
      `https://portal.test/api/timeclock/devices/activity?device_id=${device.id}`,
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: 'event-1',
        user_name: 'Jane Smith',
        timestamp: 1785139200,
        action: 'clocked in',
      },
      {
        id: 'event-2',
        user_name: 'Jane Smith',
        timestamp: 1785148245,
        action: 'clocked out',
      },
    ])
    expect(mocks.authenticateTimeclockDevice).toHaveBeenCalledWith(request, {
      expectedDeviceId: device.id,
    })
    expect(query.deviceEq).toHaveBeenCalledWith('device_id', device.id)
    expect(query.eventTypeEq).toHaveBeenCalledWith('event_type', 'PUNCH')
    expect(query.inFilter).toHaveBeenCalledWith('punch_type', ['IN', 'OUT'])
    expect(query.order).toHaveBeenCalledWith('scanned_at', { ascending: false })
    expect(query.secondOrder).toHaveBeenCalledWith('id', { ascending: false })
    expect(query.limit).toHaveBeenCalledWith(50)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('filters records newer than since and returns an empty array', async () => {
    const query = makeActivityQuery()
    const request = new Request(
      `https://portal.test/api/timeclock/devices/activity?device_id=${device.id}&since=1785160930`,
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(query.gt).toHaveBeenCalledWith('scanned_at', '2026-07-27T14:02:10.000Z')
  })

  it('rejects an invalid since timestamp before querying activity', async () => {
    const response = await GET(
      new Request(
        `https://portal.test/api/timeclock/devices/activity?device_id=${device.id}&since=12.5`,
      ),
    )

    expect(response.status).toBe(400)
    expect(mocks.authenticateTimeclockDevice).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects a numeric since timestamp outside the JavaScript date range', async () => {
    const response = await GET(
      new Request(
        `https://portal.test/api/timeclock/devices/activity?device_id=${device.id}&since=9007199254740991`,
      ),
    )

    expect(response.status).toBe(400)
    expect(mocks.authenticateTimeclockDevice).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns device authentication failures without querying activity', async () => {
    mocks.authenticateTimeclockDevice.mockResolvedValue({
      authenticated: false,
      response: new Response('Unauthorized', { status: 401 }),
    })
    const request = new Request(
      `https://portal.test/api/timeclock/devices/activity?device_id=${device.id}`,
    )

    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
