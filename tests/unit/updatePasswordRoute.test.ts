import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser } }))
  const updateUserById = vi.fn()
  const signInWithPassword = vi.fn()
  const updateEq = vi.fn(async () => ({ error: null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const insertFn = vi.fn(async () => ({ error: null }))
  const selectHistory = vi.fn()
  const orderHistory = vi.fn(() => ({ limit: vi.fn(async () => ({ data: [] })) }))
  const eqHistory = vi.fn(() => ({ order: orderHistory }))
  selectHistory.mockReturnValue({ eq: eqHistory })
  const notFn = vi.fn(async () => ({}))
  const eqNotFn = vi.fn(() => ({ not: notFn }))
  const deleteFn = vi.fn(() => ({ eq: eqNotFn }))
  const from = vi.fn((table: string) => {
    if (table === 'employees') return { update }
    return { insert: insertFn, select: selectHistory, delete: deleteFn }
  })
  const createClient = vi.fn(() => ({
    auth: { signInWithPassword, admin: { updateUserById } },
    from,
  }))
  const hash = vi.fn(async () => 'hashed-pw')
  return {
    getUser,
    getRouteSupabaseClient,
    updateUserById,
    signInWithPassword,
    update,
    updateEq,
    from,
    createClient,
    hash,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash, compare: vi.fn(async () => false) } }))
vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/auth/update-password/route'

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/auth/update-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/update-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockReturnValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        admin: { updateUserById: mocks.updateUserById },
      },
      from: mocks.from,
    })
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    })
  })

  it('returns 401 when the user is not authenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await POST(
      makeRequest({ currentPassword: 'CurrentPass1!', newPassword: 'StrongPass1!' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when newPassword is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/required/i)
  })

  it('returns 400 for a weak password (too short)', async () => {
    const res = await POST(makeRequest({ currentPassword: 'CurrentPass1!', newPassword: 'short' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/password must contain/i)
  })

  it('returns 400 for a password missing uppercase', async () => {
    const res = await POST(
      makeRequest({ currentPassword: 'CurrentPass1!', newPassword: 'alllower1!' }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/uppercase/i)
  })

  it('returns 400 when Supabase auth update fails', async () => {
    mocks.updateUserById.mockResolvedValue({ error: { message: 'auth error' } })
    const res = await POST(
      makeRequest({ currentPassword: 'CurrentPass1!', newPassword: 'StrongPass1!' }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('auth error')
  })

  it('returns 200 on successful password update', async () => {
    mocks.updateUserById.mockResolvedValue({ error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'employees')
        return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
      return {
        insert: vi.fn(async () => ({ error: null })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [] })) })),
          })),
        })),
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ not: vi.fn(async () => ({})) })) })),
      }
    })
    const res = await POST(
      makeRequest({ currentPassword: 'CurrentPass1!', newPassword: 'StrongPass1!' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedUserId: 'u-1', message: 'Password updated successfully' })
  })

  it('rejects the change when server-side password reauthentication fails', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid credentials' },
    })

    const res = await POST(
      makeRequest({ currentPassword: 'WrongPassword1!', newPassword: 'StrongPass1!' }),
    )

    expect(res.status).toBe(403)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })
})
