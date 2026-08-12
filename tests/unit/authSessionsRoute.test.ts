import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const getSession = vi.fn()
  const rpc = vi.fn()
  const signOut = vi.fn()
  const serverClient = vi.fn(() => ({ auth: { getUser, getSession }, rpc }))

  const limit = vi.fn()
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const adminClient = vi.fn(() => ({ from, auth: { admin: { signOut } } }))

  return {
    getUser,
    getSession,
    rpc,
    signOut,
    serverClient,
    limit,
    order,
    eq,
    select,
    from,
    adminClient,
  }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({ createServerClient: mocks.serverClient }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.adminClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}))

import { DELETE, GET } from '@/app/api/auth/sessions/route'

const makeRequest = () => new Request('http://localhost/api/auth/sessions')

describe('GET /api/auth/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.serverClient.mockReturnValue({
      auth: { getUser: mocks.getUser, getSession: mocks.getSession },
      rpc: mocks.rpc,
    })
    mocks.adminClient.mockReturnValue({
      from: mocks.from,
      auth: { admin: { signOut: mocks.signOut } },
    })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ eq: mocks.eq })
    mocks.eq.mockReturnValue({ order: mocks.order })
    mocks.order.mockReturnValue({ limit: mocks.limit })
  })

  it('returns 401 when user is not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns sessions list on success', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.limit.mockResolvedValue({
      data: [
        {
          id: 'sess-1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          ip: '127.0.0.1',
          user_agent: 'TestBrowser/1.0',
        },
      ],
      error: null,
    })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toBeInstanceOf(Array)
    expect(body.sessions[0].id).toBe('sess-1')
  })

  it('falls back to RPC when direct table access fails', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.limit.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: 'rpc-sess-1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: null,
          ip: null,
          user_agent: 'UA',
        },
      ],
      error: null,
    })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions[0].id).toBe('rpc-sess-1')
  })
})

describe('DELETE /api/auth/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    })
    mocks.serverClient.mockReturnValue({
      auth: { getUser: mocks.getUser, getSession: mocks.getSession },
      rpc: mocks.rpc,
    })
    mocks.adminClient.mockReturnValue({
      from: mocks.from,
      auth: { admin: { signOut: mocks.signOut } },
    })
  })

  const deleteRequest = (body: unknown) =>
    new Request('http://localhost/api/auth/sessions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('rejects malformed session revocation payloads', async () => {
    const response = await DELETE(deleteRequest({ type: 'single' }))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('revokes a bounded session identifier through the caller-scoped RPC', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    const response = await DELETE(deleteRequest({ type: 'single', id: 'session-1' }))

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_my_session', { session_id: 'session-1' })
  })
})
