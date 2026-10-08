import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSupabaseClient: vi.fn(),
  enqueueIntegrationEvent: vi.fn(),
}))

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}))
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))
vi.mock('@/lib/integrations/frappe/syncEngine', () => ({
  enqueueIntegrationEvent: mocks.enqueueIntegrationEvent,
}))

import { POST as createLeaveRequest } from '@/app/api/hr/leave/requests/route'
import { PATCH as updateLeaveRequest } from '@/app/api/hr/leave/requests/[id]/route'

const leaveRequestHandlers: {
  label: string
  method: 'POST' | 'PATCH'
  call: (request: Request) => Promise<Response>
}[] = [
  {
    label: 'leave request creation',
    method: 'POST',
    call: (request) => createLeaveRequest(request),
  },
  {
    label: 'leave request status update',
    method: 'PATCH',
    call: (request) => updateLeaveRequest(request, { params: Promise.resolve({ id: 'leave-1' }) }),
  },
]

describe('HR leave request JSON boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } }, error: null })
  })

  it.each(leaveRequestHandlers)(
    'rejects malformed and empty JSON for $label before database or outbox writes',
    async ({ call, method }) => {
      for (const body of ['{', '']) {
        const response = await call(
          new Request('http://localhost/api/hr/leave/requests', {
            method,
            headers: { 'content-type': 'application/json' },
            body: body || undefined,
          }),
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
      }

      expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.enqueueIntegrationEvent).not.toHaveBeenCalled()
    },
  )

  it.each(leaveRequestHandlers)(
    'keeps authentication ahead of parsing for $label',
    async ({ call, method }) => {
      mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

      const response = await call(
        new Request('http://localhost/api/hr/leave/requests', {
          method,
          body: '{',
        }),
      )

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.enqueueIntegrationEvent).not.toHaveBeenCalled()
    },
  )
})
