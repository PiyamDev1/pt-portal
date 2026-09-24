import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const insertSingle = vi.fn()
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn(() => ({ select: insertSelect }))

  const updateSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateEq = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: updateEq }))

  const from = vi.fn(() => ({ insert, update }))
  const getSupabaseClient = vi.fn(() => ({ from }))
  const requireAdminSession = vi.fn()

  return {
    insert,
    insertSingle,
    update,
    updateSingle,
    getSupabaseClient,
    requireAdminSession,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireAdminSession: mocks.requireAdminSession,
}))
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { POST as createService } from '@/app/api/bookings/settings/services/route'
import { PATCH as updateService } from '@/app/api/bookings/settings/services/[id]/route'

function request(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('booking service customer-portal settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({ authorized: true })
    mocks.insertSingle.mockResolvedValue({ data: { id: 'service-1' }, error: null })
    mocks.updateSingle.mockResolvedValue({ data: { id: 'service-1' }, error: null })
  })

  it('persists customer-portal publication controls when creating a service', async () => {
    const response = await createService(
      request('http://localhost/api/bookings/settings/services', {
        location_id: 'location-1',
        name: 'Visa consultation',
        duration_minutes: 30,
        customer_visible: true,
        customer_description: 'Bring your supporting documents.',
        customer_max_group_size: 4,
        customer_modification_cutoff_hours: 48,
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_visible: true,
        customer_description: 'Bring your supporting documents.',
        customer_max_group_size: 4,
        customer_modification_cutoff_hours: 48,
      }),
    )
  })

  it('updates customer-portal publication controls without changing other service rules', async () => {
    const response = await updateService(
      request('http://localhost/api/bookings/settings/services/service-1', {
        customer_visible: false,
        customer_description: null,
        customer_max_group_size: 2,
        customer_modification_cutoff_hours: 24,
      }) as never,
      { params: Promise.resolve({ id: 'service-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      customer_visible: false,
      customer_description: null,
      customer_max_group_size: 2,
      customer_modification_cutoff_hours: 24,
    })
  })
})
