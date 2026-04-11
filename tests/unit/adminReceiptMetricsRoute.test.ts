import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireMaintenanceSession = vi.fn()

  const from = vi.fn((table: string) => {
    if (table !== 'generated_receipts') {
      throw new Error(`Unexpected table: ${table}`)
    }

    return {
      select: vi.fn((_columns: string, _options?: { count?: 'exact' }) => {
        const state = {
          orderColumn: '',
          ascending: false,
          limit: 1000,
        }

        const resolve = () => ({
          data: [
            {
              id: 'r-1',
              service_type: 'nadra',
              receipt_type: 'submission',
              generated_at: '2026-04-11T10:00:00.000Z',
              is_shared: true,
              shared_via: 'clipboard',
              share_count: 2,
            },
            {
              id: 'r-2',
              service_type: 'pk_passport',
              receipt_type: 'biometrics',
              generated_at: '2026-04-11T09:00:00.000Z',
              is_shared: false,
              shared_via: null,
              share_count: 0,
            },
          ],
          error: null,
          count: 2,
        })

        const query: {
          order: (column: string, options: { ascending: boolean }) => typeof query
          limit: (value: number) => typeof query
          then: (resolveThen: (value: unknown) => unknown) => Promise<unknown>
        } = {
          order: (column, options) => {
            state.orderColumn = column
            state.ascending = options.ascending
            return query
          },
          limit: (value) => {
            state.limit = value
            return query
          },
          then: (resolveThen) => Promise.resolve(resolve()).then(resolveThen),
        }

        return query
      }),
    }
  })

  const getSupabaseClient = vi.fn(() => ({ from }))

  return {
    requireMaintenanceSession,
    getSupabaseClient,
    from,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { GET } from '@/app/api/admin/receipt-metrics/route'

describe('GET /api/admin/receipt-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireMaintenanceSession.mockResolvedValue({ authorized: true, user: { id: 'admin-1' } })
  })

  it('passes through unauthorized response', async () => {
    mocks.requireMaintenanceSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
  })

  it('returns computed receipt metrics summary', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.supported).toBe(true)
    expect(payload.summary.totalReceipts).toBe(2)
    expect(payload.summary.sharedReceipts).toBe(1)
    expect(payload.summary.totalShares).toBe(2)
    expect(payload.byService[0].serviceType).toBe('nadra')
    expect(payload.byChannel[0]).toEqual({ channel: 'clipboard', shares: 2 })
    expect(payload.backfill.healthy).toBe(true)
  })
})
