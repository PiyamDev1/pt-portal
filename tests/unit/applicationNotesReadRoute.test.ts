import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

  const getUser = vi.fn()
  const createServerClient = vi.fn(() => ({ auth: { getUser } }))
  const upsert = vi.fn()
  const deleteEqUser = vi.fn()
  const deleteEqRecord = vi.fn(() => ({ eq: deleteEqUser }))
  const deleteEqContext = vi.fn(() => ({ eq: deleteEqRecord }))
  const deleteQuery = vi.fn(() => ({ eq: deleteEqContext }))
  const from = vi.fn(() => ({ upsert, delete: deleteQuery }))
  const createClient = vi.fn(() => ({ from }))
  const cookies = vi.fn(async () => ({ getAll: () => [] }))

  return {
    getUser,
    createServerClient,
    upsert,
    deleteEqUser,
    deleteEqRecord,
    deleteEqContext,
    deleteQuery,
    from,
    createClient,
    cookies,
  }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))

import { DELETE, POST } from '@/app/api/applications/notes-read/route'

const makeRequest = (method: 'POST' | 'DELETE', body: string) =>
  new Request('http://localhost/api/applications/notes-read', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('/api/applications/notes-read mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } })
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } }, error: null })
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.deleteEqUser.mockResolvedValue({ error: null })
  })

  it.each(['nadra', 'pk-passport'] as const)(
    'upserts a user-scoped read marker for the %s context',
    async (context) => {
      const response = await POST(
        makeRequest(
          'POST',
          JSON.stringify({ context, recordId: 'record-1', noteSignature: 'signature-1' }),
        ),
      )

      expect(response.status).toBe(200)
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ context, record_id: 'record-1', user_id: 'staff-1' }),
        { onConflict: 'context,record_id,user_id' },
      )
    },
  )

  it('rejects malformed JSON before creating the service client', async () => {
    const response = await POST(makeRequest('POST', '{'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid context' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('clears only this user’s read marker', async () => {
    const response = await DELETE(
      makeRequest('DELETE', JSON.stringify({ context: 'nadra', recordId: 'record-1' })),
    )

    expect(response.status).toBe(200)
    expect(mocks.deleteEqContext).toHaveBeenCalledWith('context', 'nadra')
    expect(mocks.deleteEqRecord).toHaveBeenCalledWith('record_id', 'record-1')
    expect(mocks.deleteEqUser).toHaveBeenCalledWith('user_id', 'staff-1')
  })

  it('does not write when the session is missing', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const response = await POST(
      makeRequest('POST', JSON.stringify({ context: 'nadra', recordId: 'record-1' })),
    )

    expect(response.status).toBe(401)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
