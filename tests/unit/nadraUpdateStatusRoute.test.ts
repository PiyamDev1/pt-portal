import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const servicesEq = vi.fn()
  const servicesUpdate = vi.fn(() => ({ eq: servicesEq }))
  const historyInsert = vi.fn()
  const from = vi.fn((table: string) => {
    if (table === 'nadra_services') return { update: servicesUpdate }
    if (table === 'nadra_status_history') return { insert: historyInsert }
    return {}
  })
  const createClient = vi.fn(() => ({ from }))
  return { servicesEq, servicesUpdate, historyInsert, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/nadra/update-status/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/nadra/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/nadra/update-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'nadra_services') return { update: mocks.servicesUpdate }
      if (table === 'nadra_status_history') return { insert: mocks.historyInsert }
      return {}
    })
    mocks.servicesUpdate.mockReturnValue({ eq: mocks.servicesEq })
  })

  it('returns 400 when nadraId is missing', async () => {
    const res = await POST(makeRequest({ status: 'Completed', userId: 'u-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing nadra id/i)
  })

  it('returns 500 when status update fails', async () => {
    mocks.servicesEq.mockResolvedValue({ error: { message: 'update failed' } })
    const res = await POST(makeRequest({ nadraId: 'n-1', status: 'Completed', userId: 'u-1' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/update failed/i)
  })

  it('returns 200 when status and history write succeed', async () => {
    mocks.servicesEq.mockResolvedValue({ error: null })
    mocks.historyInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ nadraId: 'n-1', status: 'Completed', userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedNadraId: 'n-1', status: 'Completed' })
    expect(mocks.historyInsert).toHaveBeenCalledWith({
      nadra_service_id: 'n-1',
      new_status: 'Completed',
      changed_by: 'u-1',
      entry_type: 'status',
    })
  })
})
