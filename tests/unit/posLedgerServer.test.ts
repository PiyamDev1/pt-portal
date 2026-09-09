import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getServiceSupabaseClient } = vi.hoisted(() => ({
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({ getServiceSupabaseClient }))

import {
  isIsoDate,
  loadPosLedger,
  POS_TRANSACTION_SUPPLIER_RELATION,
  posLedgerPeriodBounds,
} from '@/lib/pos/ledgerServer'

describe('POS live ledger server', () => {
  beforeEach(() => {
    getServiceSupabaseClient.mockReset()
  })

  it('builds bounded day and month ranges', () => {
    expect(isIsoDate('2026-09-08')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(posLedgerPeriodBounds('2026-09-08', 'day')).toEqual({
      startDate: '2026-09-08',
      endDate: '2026-09-08',
    })
    expect(posLedgerPeriodBounds('2024-02-10', 'month')).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    })
  })

  it('disambiguates the transaction supplier join after the reporting supplier FK was added', () => {
    expect(POS_TRANSACTION_SUPPLIER_RELATION).toBe(
      'supplier:supplier_vendors!pos_transactions_supplier_vendor_id_fkey(name)',
    )
  })

  it('loads only branch employee rows and derives live tender totals', async () => {
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          location_id: 'branch-1',
          locations: { id: 'branch-1', name: 'Test branch', timezone: 'Europe/London' },
        },
        error: null,
      }),
    }
    const branchEmployeeQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: 'staff-1', full_name: 'Test Staff' },
          { id: 'staff-2', full_name: 'Branch Colleague' },
        ],
        error: null,
      }),
    }
    const ledgerQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: '12345678-1234-1234-1234-123456789012',
            work_date: '2026-09-08',
            created_at: '2026-09-08T09:15:00.000Z',
            customer_full_name: null,
            remark: 'Supplier deposit',
            source_link_id: null,
            total_amount: 100,
            employee_id: 'staff-2',
            accounting_category: { name: 'Supplier payment', type: 'EXPENSE' },
            supplier: { name: 'Example Supplier' },
            daily_payment_splits: [
              {
                amount: 100,
                transaction_type: 'EXPENSE',
                reconciliation_status: 'OWED_TO_US',
                transaction_method: { name: 'Bank transfer' },
              },
            ],
          },
        ],
        error: null,
      }),
    }
    const from = vi
      .fn()
      .mockReturnValueOnce(profileQuery)
      .mockReturnValueOnce(branchEmployeeQuery)
      .mockReturnValueOnce(ledgerQuery)
    getServiceSupabaseClient.mockReturnValue({
      from,
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }),
    })

    const result = await loadPosLedger('staff-1', 'day', '2026-09-08')

    expect(ledgerQuery.in).toHaveBeenCalledWith('employee_id', ['staff-1', 'staff-2'])
    expect(ledgerQuery.gte).toHaveBeenCalledWith('work_date', '2026-09-08')
    expect(ledgerQuery.lte).toHaveBeenCalledWith('work_date', '2026-09-08')
    expect(result.items[0]).toMatchObject({
      reference: 'POS-20260908-12345678',
      name: 'Example Supplier',
      category: 'Supplier payment',
      method: 'Bank',
      amount: -100,
      status: 'Pending',
      entryAgent: 'Branch Colleague',
    })
    expect(result.summary).toMatchObject({
      moneyIn: 0,
      moneyOut: 100,
      netMovement: -100,
      bankNet: -100,
      unreconciledCount: 1,
    })
  })
})
