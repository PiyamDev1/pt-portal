import { describe, expect, it } from 'vitest'
import { isPosTenderUnreconciled, resolvePosTenderReconciliation } from '@/lib/pos/reconciliation'

describe('POS reconciliation rules', () => {
  it('uses the newest event, including the event id tie-breaker', () => {
    const reconciliation = resolvePosTenderReconciliation({
      reconciliation_status: 'RECORDED',
      external_reference: 'initial',
      pos_reconciliation_events: [
        {
          status: 'COMPLETED',
          external_reference: 'settled',
          created_at: '2026-09-20T10:00:00.000Z',
          id: 4,
        },
        {
          status: 'FAILED',
          external_reference: 'reopened',
          created_at: '2026-09-20T10:00:00.000Z',
          id: 5,
        },
      ],
    })

    expect(reconciliation).toEqual({ status: 'FAILED', externalReference: 'reopened' })
  })

  it('excludes settled and supplier-direct tenders from our reconciliation queue', () => {
    expect(
      isPosTenderUnreconciled({ reconciliationStatus: 'RECORDED', destination: 'OUR_ACCOUNT' }),
    ).toBe(true)
    expect(
      isPosTenderUnreconciled({ reconciliationStatus: 'COMPLETED', destination: 'OUR_ACCOUNT' }),
    ).toBe(false)
    expect(
      isPosTenderUnreconciled({
        reconciliationStatus: 'RECORDED',
        destination: 'SUPPLIER_DIRECT',
      }),
    ).toBe(false)
  })
})
