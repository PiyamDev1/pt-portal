import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

  const getUser = vi.fn()
  const adminFrom = vi.fn()
  const createClient = vi.fn(() => ({ from: adminFrom }))
  const createServerClient = vi.fn(() => ({ auth: { getUser } }))
  const cookies = vi.fn(async () => ({ getAll: () => [] }))
  const queueAttendanceSyncForEmployeeDay = vi.fn()

  return {
    getUser,
    adminFrom,
    createClient,
    createServerClient,
    cookies,
    queueAttendanceSyncForEmployeeDay,
  }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: vi.fn(async () => ({ get: () => null })),
}))

vi.mock('@/lib/integrations/frappe/syncEngine', () => ({
  queueAttendanceSyncForEmployeeDay: mocks.queueAttendanceSyncForEmployeeDay,
}))

import { POST } from '@/app/api/timeclock/manual-entry/submit/route'

const makeRequest = (body: string) =>
  new Request('http://localhost/api/timeclock/manual-entry/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('POST /api/timeclock/manual-entry/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockReturnValue({ from: mocks.adminFrom })
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } }, error: null })
  })

  it('rejects malformed JSON before touching attendance records', async () => {
    const response = await POST(makeRequest('{'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid code format' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('rejects an invalid code before touching attendance records', async () => {
    const response = await POST(makeRequest(JSON.stringify({ code: '123' })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid code format' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })
})
