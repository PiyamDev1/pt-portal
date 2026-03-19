import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const compare = vi.fn()

  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))

  const selectEq = vi.fn()
  const select = vi.fn(() => ({ eq: selectEq }))

  const from = vi.fn((table: string) => {
    if (table === 'backup_codes') {
      return { select, update }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return { compare, updateEq, update, selectEq, select, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare, hash: vi.fn() } }))

import { POST } from '@/app/api/auth/consume-backup-code/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/consume-backup-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/consume-backup-code', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
    mocks.select.mockReturnValue({ eq: mocks.selectEq })
    mocks.update.mockReturnValue({ eq: mocks.updateEq })
  })

  it('returns 400 when userId or code missing', async () => {
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 500 when backup code query fails', async () => {
    mocks.selectEq.mockResolvedValue({ data: null, error: { message: 'db fail' } })
    const res = await POST(makeRequest({ userId: 'u-1', code: 'ABCD' }))
    expect(res.status).toBe(500)
  })

  it('returns 200 and marks code as used when a valid unused code matches', async () => {
    mocks.selectEq.mockResolvedValue({
      data: [
        { id: 'c-1', code_hash: 'h1', used: true },
        { id: 'c-2', code_hash: 'h2', used: false },
      ],
      error: null,
    })
    mocks.compare.mockImplementation(async (_code: string, hash: string) => hash === 'h2')
    mocks.updateEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ userId: 'u-1', code: 'ABCD-EFGH' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ consumedCodeId: 'c-2' })
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'c-2')
  })

  it('returns 400 when no valid unused code matches', async () => {
    mocks.selectEq.mockResolvedValue({
      data: [{ id: 'c-1', code_hash: 'h1', used: true }],
      error: null,
    })
    mocks.compare.mockResolvedValue(false)

    const res = await POST(makeRequest({ userId: 'u-1', code: 'BAD' }))
    expect(res.status).toBe(400)
  })
})
