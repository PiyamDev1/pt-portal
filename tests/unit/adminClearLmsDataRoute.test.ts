import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const neq = vi.fn()
  const deleteFn = vi.fn(() => ({ neq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  const createClient = vi.fn(() => ({ from }))

  return { neq, deleteFn, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/clear-lms-data/route'

describe('POST /api/admin/clear-lms-data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.neq.mockResolvedValue({ error: null })
  })

  it('returns semantic success payload when all tables are cleared', async () => {
    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      clearedTables: [
        'loan_installments',
        'loan_transactions',
        'loan_payment_methods',
        'loan_terms',
        'loans',
        'loan_accounts',
      ],
      clearedTableCount: 6,
    })
    expect(mocks.from).toHaveBeenCalledTimes(6)
  })

  it('returns 500 with specific table failure', async () => {
    let call = 0
    mocks.neq.mockImplementation(async () => {
      call += 1
      if (call === 3) {
        return { error: { message: 'fk violation' } }
      }
      return { error: null }
    })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Failed to clear loan_payment_methods' })
  })

  it('returns fallback 500 for thrown errors', async () => {
    mocks.from.mockImplementationOnce(() => {
      throw new Error('unexpected')
    })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'unexpected' })
  })
})
