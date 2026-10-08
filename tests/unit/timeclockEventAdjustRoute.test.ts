import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireMaintenanceSession: vi.fn(),
  getSupabaseClient: vi.fn(),
  queueAttendanceSyncForEmployeeDay: vi.fn(),
}))

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: mocks.getSupabaseClient }))
vi.mock('@/lib/integrations/frappe/syncEngine', () => ({
  queueAttendanceSyncForEmployeeDay: mocks.queueAttendanceSyncForEmployeeDay,
}))

import { PATCH } from '@/app/api/timeclock/events/[eventId]/adjust/route'

const context = { params: Promise.resolve({ eventId: 'event-1' }) }

describe('PATCH /api/timeclock/events/[eventId]/adjust request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireMaintenanceSession.mockResolvedValue({
      authorized: true,
      user: { id: 'maintenance-1' },
    })
  })

  it.each([
    ['malformed', '{'],
    ['empty', undefined],
  ])('rejects a %s body before reading or adjusting attendance', async (_kind, body) => {
    const response = await PATCH(
      new Request('http://localhost/api/timeclock/events/event-1/adjust', {
        method: 'PATCH',
        ...(body === undefined ? {} : { body }),
      }),
      context,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
    expect(mocks.requireMaintenanceSession).toHaveBeenCalledOnce()
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.queueAttendanceSyncForEmployeeDay).not.toHaveBeenCalled()
  })
})
