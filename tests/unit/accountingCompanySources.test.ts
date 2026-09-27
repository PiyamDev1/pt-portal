import { describe, expect, it, vi } from 'vitest'
import { loadCompanyLmsLiveSummary } from '@/lib/accounting/companySources'

describe('Accounting company-wide live sources', () => {
  it('reads global LMS totals without turning them into branch values', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accounts: [],
        stats: {
          totalOutstanding: '1450.50',
          activeAccounts: 9,
          overdueAccounts: 2,
          dueSoonAccounts: 3,
          totalAccounts: 12,
        },
        pagination: { page: 1, limit: 1, total: 12, pages: 12 },
      },
      error: null,
    })

    const summary = await loadCompanyLmsLiveSummary({ rpc } as never)

    expect(rpc).toHaveBeenCalledWith('lms_list_accounts', {
      p_filter: 'all',
      p_account_id: null,
      p_page: 1,
      p_limit: 1,
    })
    expect(summary).toMatchObject({
      available: true,
      totalOutstanding: 1450.5,
      activeAccounts: 9,
      overdueAccounts: 2,
      dueSoonAccounts: 3,
      totalAccounts: 12,
      sourcePath: '/dashboard/lms',
    })
  })

  it('keeps the ledger available when LMS totals cannot be loaded', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42883' } })

    const summary = await loadCompanyLmsLiveSummary({ rpc } as never)

    expect(summary).toMatchObject({
      available: false,
      totalOutstanding: 0,
      warning: 'The live LMS company summary could not be loaded.',
    })
  })
})
