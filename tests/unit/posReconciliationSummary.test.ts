import { describe, expect, it, vi } from 'vitest'
import { loadPosReconciliationAttentionSummary } from '@/lib/pos/reconciliationSummary.server'

function queryResult(data: unknown[], error: unknown = null) {
  const query = {
    select: vi.fn(),
    neq: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data, error }),
  }
  query.select.mockReturnValue(query)
  query.neq.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.lte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

describe('POS reconciliation attention summary', () => {
  it('summarises current-month branch tenders from their latest events', async () => {
    const transactionQuery = queryResult([
      {
        id: 'tender-1',
        payment_method: 'CARD',
        destination: 'OUR_ACCOUNT',
        reconciliation_status: 'RECORDED',
        external_reference: null,
        created_at: '2026-09-02T09:00:00.000Z',
        pos_reconciliation_events: [
          {
            status: 'FAILED',
            external_reference: null,
            created_at: '2026-09-03T10:00:00.000Z',
            id: 2,
          },
        ],
      },
      {
        id: 'tender-2',
        payment_method: 'BANK',
        destination: 'OUR_ACCOUNT',
        reconciliation_status: 'RECORDED',
        external_reference: null,
        created_at: '2026-09-04T09:00:00.000Z',
        pos_reconciliation_events: [
          {
            status: 'COMPLETED',
            external_reference: 'bank-2',
            created_at: '2026-09-05T10:00:00.000Z',
            id: 3,
          },
        ],
      },
    ])
    const refundQuery = queryResult([
      {
        id: 'refund-tender-1',
        payment_method: 'BANK',
        reconciliation_status: 'PENDING',
        external_reference: null,
        created_at: '2026-09-06T09:00:00.000Z',
        pos_reconciliation_events: [],
      },
    ])
    const from = vi.fn().mockReturnValueOnce(transactionQuery).mockReturnValueOnce(refundQuery)

    const summary = await loadPosReconciliationAttentionSummary({ from } as never, {
      locationId: 'branch-1',
      branchName: 'Bradford',
      timezone: 'Europe/London',
      generatedAt: '2026-09-28T10:00:00.000Z',
    })

    expect(summary).toEqual({
      available: true,
      unresolvedCount: 2,
      failedCount: 1,
      oldestUnresolvedAt: '2026-09-02T09:00:00.000Z',
      month: '2026-09',
      branchName: 'Bradford',
    })
    expect(transactionQuery.eq).toHaveBeenCalledWith('pos_transactions.location_id', 'branch-1')
    expect(transactionQuery.gte).toHaveBeenCalledWith(
      'pos_transactions.business_date',
      '2026-09-01',
    )
    expect(transactionQuery.lte).toHaveBeenCalledWith(
      'pos_transactions.business_date',
      '2026-09-30',
    )
    expect(transactionQuery.neq).toHaveBeenCalledWith('destination', 'SUPPLIER_DIRECT')
    expect(refundQuery.eq).toHaveBeenCalledWith('pos_refunds.location_id', 'branch-1')
  })

  it('reports the provider as unavailable when the branch is missing', async () => {
    const from = vi.fn()
    const summary = await loadPosReconciliationAttentionSummary({ from } as never, {
      locationId: null,
      branchName: null,
      timezone: 'Europe/London',
      generatedAt: '2026-09-28T10:00:00.000Z',
    })

    expect(summary.available).toBe(false)
    expect(summary.month).toBe('2026-09')
    expect(from).not.toHaveBeenCalled()
  })
})
