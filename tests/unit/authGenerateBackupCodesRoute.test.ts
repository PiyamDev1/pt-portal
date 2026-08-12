import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const hash = vi.fn()
  const getUser = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser } }))
  const rpc = vi.fn()
  const createClient = vi.fn(() => ({ rpc }))

  return { hash, getUser, getRouteSupabaseClient, rpc, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash, compare: vi.fn() } }))
vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/auth/generate-backup-codes/route'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/generate-backup-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/generate-backup-codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ rpc: mocks.rpc })
    mocks.hash.mockResolvedValue('hashed-code')
    vi.mocked(verifyFreshSecondFactor).mockResolvedValue({ verified: true, method: 'totp' })
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    })
  })

  it('returns 401 when the user is not authenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await POST(makeRequest({ count: 2, verificationCode: '123456' }))
    expect(res.status).toBe(401)
  })

  it('requires fresh second-factor verification', async () => {
    vi.mocked(verifyFreshSecondFactor).mockResolvedValueOnce({
      verified: false,
      error: 'Invalid authenticator code',
    })

    const res = await POST(makeRequest({ count: 2, verificationCode: 'bad' }))
    expect(res.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns 500 when the atomic replacement fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'replace fail' } })

    const res = await POST(makeRequest({ count: 2, verificationCode: '123456' }))
    expect(res.status).toBe(500)
  })

  it('returns 200 and generated plaintext codes on success', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null })

    const res = await POST(makeRequest({ count: 3, verificationCode: '123456' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.generatedCount).toBe(3)
    expect(body.codes).toHaveLength(3)
    expect(mocks.hash).toHaveBeenCalledTimes(3)
    expect(mocks.rpc).toHaveBeenCalledWith('replace_backup_codes', {
      p_user_id: 'u-1',
      p_code_hashes: ['hashed-code', 'hashed-code', 'hashed-code'],
    })
  })
})
