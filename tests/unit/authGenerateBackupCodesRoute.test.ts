import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const hash = vi.fn()

  const deleteEq = vi.fn()
  const del = vi.fn(() => ({ eq: deleteEq }))
  const insert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'backup_codes') {
      return { delete: del, insert }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return { hash, deleteEq, del, insert, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash, compare: vi.fn() } }))

import { POST } from '@/app/api/auth/generate-backup-codes/route'

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

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ delete: mocks.del, insert: mocks.insert })
    mocks.del.mockReturnValue({ eq: mocks.deleteEq })
    mocks.hash.mockResolvedValue('hashed-code')
  })

  it('returns 400 when userId is missing', async () => {
    const res = await POST(makeRequest({ count: 2 }))
    expect(res.status).toBe(400)
  })

  it('returns 500 when insert fails', async () => {
    mocks.deleteEq.mockResolvedValue({ error: null })
    mocks.insert.mockResolvedValue({ error: { message: 'insert fail' } })

    const res = await POST(makeRequest({ userId: 'u-1', count: 2 }))
    expect(res.status).toBe(500)
  })

  it('returns 200 and generated plaintext codes on success', async () => {
    mocks.deleteEq.mockResolvedValue({ error: null })
    mocks.insert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ userId: 'u-1', count: 3 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.generatedCount).toBe(3)
    expect(body.codes).toHaveLength(3)
    expect(mocks.hash).toHaveBeenCalledTimes(3)
  })
})
