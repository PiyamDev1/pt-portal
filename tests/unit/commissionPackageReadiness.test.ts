import { describe, expect, it } from 'vitest'
import {
  getPackageCommissionEventErrorLabel,
  getPackageCommissionIssueLabel,
  parsePackageCommissionReadiness,
} from '@/lib/commissions/packageReadiness'

describe('Package Commission readiness contract', () => {
  it('parses the pay-free handoff response', () => {
    expect(
      parsePackageCommissionReadiness({
        stage: 'pre_close',
        state: 'ready_to_close',
        handoffReady: true,
        authoritative: false,
        issues: [],
        passengerCount: 3,
        reservationCount: 4,
        calculationRowCount: 2,
        invoiceReferenceRowCount: 2,
        eventVersion: null,
        eventStatus: null,
        eventError: null,
        eventUpdatedAt: null,
        snapshotCurrent: false,
      }),
    ).toEqual(
      expect.objectContaining({
        stage: 'pre_close',
        state: 'ready_to_close',
        handoffReady: true,
        calculationRowCount: 2,
      }),
    )
  })

  it('rejects unknown workflow states and malformed issue lists', () => {
    expect(parsePackageCommissionReadiness({ stage: 'closed', state: 'payable', issues: [] })).toBe(
      null,
    )
    expect(
      parsePackageCommissionReadiness({
        stage: 'closed',
        state: 'processed',
        issues: 'none',
      }),
    ).toBe(null)
  })

  it('turns database reason codes into operational instructions', () => {
    expect(getPackageCommissionIssueLabel('invoice_sales_not_reconciled')).toContain(
      'Reconcile invoice sales',
    )
    expect(getPackageCommissionEventErrorLabel('needs_policy')).toContain('Commission Admin')
    expect(getPackageCommissionIssueLabel('future_reason')).toBe(
      'Review this package source issue.',
    )
  })
})
