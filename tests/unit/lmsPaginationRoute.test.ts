import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLmsStaff: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsStaff: mocks.requireLmsStaff,
  getLmsIdempotencyKey: vi.fn(),
  verifyLmsDestructiveAction: vi.fn(),
}))
vi.mock('@/lib/installmentsDb', () => ({
  ensureInstallmentsTableExists: vi.fn(),
  createInstallmentRecords: vi.fn(),
  createDetailedInstallmentRecords: vi.fn(),
}))

import { GET } from '@/app/api/lms/route'

describe('LMS global pagination contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.requireLmsStaff.mockResolvedValue({ authorized: true, employee: { id: 'employee-1' } })
  })

  it('delegates filtering, totals, and pagination to the database RPC', async () => {
    const databasePayload = {
      accounts: [{ id: 'filtered-account-on-page-3' }],
      stats: { totalOutstanding: 900, activeAccounts: 9 },
      pagination: { page: 3, limit: 2, total: 9, pages: 5 },
    }
    const rpc = vi.fn(async () => ({ data: databasePayload, error: null }))
    mocks.createClient.mockReturnValue({ rpc })

    const response = await GET(
      new Request(
        'http://localhost/api/lms?filter=overdue&page=3&limit=2&accountId=outside-old-page',
      ),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(databasePayload)
    expect(rpc).toHaveBeenCalledWith('lms_list_accounts', {
      p_filter: 'overdue',
      p_account_id: 'outside-old-page',
      p_page: 3,
      p_limit: 2,
    })
  })
})
