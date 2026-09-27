import { describe, expect, it } from 'vitest'
import {
  calculateReplacementChange,
  calculateReplacementCommissionDecision,
  calculateReplacementRecovery,
  ticketingAppendReplacementChangeSchema,
  ticketingCreateReplacementCaseSchema,
} from '@/lib/ticketing/replacementCaseContracts'

const ORIGINAL_BOOKING = '10000000-0000-4000-8000-000000000001'
const ORIGINAL_TRANSACTION = '20000000-0000-4000-8000-000000000001'
const REPLACEMENT_BOOKING = '10000000-0000-4000-8000-000000000002'
const REPLACEMENT_TRANSACTION = '20000000-0000-4000-8000-000000000002'
const EMPLOYEE = '30000000-0000-4000-8000-000000000001'

describe('Ticketing replacement cases', () => {
  it('calculates only the amount above the customer sale for the agreed staff recovery rule', () => {
    expect(
      calculateReplacementRecovery({
        originalSaleGbp: 940,
        originalSupplierCostGbp: 832.99,
        replacementSupplierCostGbp: 478.59 + 574,
        recoveryPolicy: 'above_customer_sale',
      }),
    ).toEqual({
      supplierCostIncreaseGbp: 219.6,
      originalMarginGbp: 107.01,
      employeeRecoveryGbp: 112.59,
      companyMarginAbsorbedGbp: 107.01,
    })
  })

  it('keeps a later customer-requested replacement as a separate incremental result', () => {
    expect(
      calculateReplacementChange({
        supplierRefundGbp: 564,
        newSupplierCostGbp: 665.9,
        customerChargeGbp: 480,
      }),
    ).toBe(378.1)
  })

  it('keeps cross-agent replacement commission standard', () => {
    expect(
      calculateReplacementCommissionDecision({
        originalOwnerId: EMPLOYEE,
        replacementOwnerId: '30000000-0000-4000-8000-000000000002',
        originalSaleGbp: 940,
        replacementSupplierCostGbp: 1052.59,
        crossAgentFeesGbp: 20,
      }),
    ).toEqual({ treatment: 'standard_cross_agent', companyProfitGbp: -132.59 })
  })

  it('allows the same agent only the original commission when the replacement is profitable', () => {
    expect(
      calculateReplacementCommissionDecision({
        originalOwnerId: EMPLOYEE,
        replacementOwnerId: EMPLOYEE,
        originalSaleGbp: 940,
        replacementSupplierCostGbp: 900,
      }),
    ).toEqual({ treatment: 'original_only_if_profitable', companyProfitGbp: 40 })
    expect(
      calculateReplacementCommissionDecision({
        originalOwnerId: EMPLOYEE,
        replacementOwnerId: EMPLOYEE,
        originalSaleGbp: 940,
        replacementSupplierCostGbp: 1052.59,
      }),
    ).toEqual({ treatment: 'none_same_agent_loss', companyProfitGbp: -112.59 })
  })

  it('rejects duplicate replacement PNR links and the original as its own replacement', () => {
    const base = {
      original: {
        bookingId: ORIGINAL_BOOKING,
        transactionId: ORIGINAL_TRANSACTION,
        expectedBookingVersion: 2,
      },
      responsibleEmployeeId: EMPLOYEE,
      reason: 'fare_expired_staff_error' as const,
      recoveryPolicy: 'above_customer_sale' as const,
      replacements: [{ bookingId: REPLACEMENT_BOOKING, transactionId: REPLACEMENT_TRANSACTION }],
      notes: null,
    }
    expect(ticketingCreateReplacementCaseSchema.safeParse(base).success).toBe(true)
    expect(
      ticketingCreateReplacementCaseSchema.safeParse({
        ...base,
        replacements: [...base.replacements, ...base.replacements],
      }).success,
    ).toBe(false)
    expect(
      ticketingCreateReplacementCaseSchema.safeParse({
        ...base,
        replacements: [{ bookingId: ORIGINAL_BOOKING, transactionId: REPLACEMENT_TRANSACTION }],
      }).success,
    ).toBe(false)
  })

  it('accepts a bounded later-change payload with exact GBP amounts', () => {
    expect(
      ticketingAppendReplacementChangeSchema.safeParse({
        expectedVersion: 1,
        replacedItemId: '40000000-0000-4000-8000-000000000001',
        replacement: {
          bookingId: REPLACEMENT_BOOKING,
          transactionId: REPLACEMENT_TRANSACTION,
        },
        supplierRefundGbp: 564,
        supplierAdminFeeGbp: 10,
        customerChargeGbp: 480,
        notes: 'Customer requested a later travel date.',
      }).success,
    ).toBe(true)
  })

  it('accepts the refund story fields used to explain a later change', () => {
    const result = ticketingAppendReplacementChangeSchema.safeParse({
      expectedVersion: 1,
      replacedItemId: '40000000-0000-4000-8000-000000000001',
      replacement: {
        bookingId: REPLACEMENT_BOOKING,
        transactionId: REPLACEMENT_TRANSACTION,
      },
      airlinePredictedRefundGbp: 574,
      airlineCancellationFeeGbp: 0,
      supplierRefundGbp: 564,
      supplierAdminFeeGbp: 10,
      customerChargeGbp: 480,
      notes: null,
    })
    expect(result.success).toBe(true)
    expect(
      ticketingAppendReplacementChangeSchema.safeParse({
        expectedVersion: 1,
        replacedItemId: '40000000-0000-4000-8000-000000000001',
        replacement: {
          bookingId: REPLACEMENT_BOOKING,
          transactionId: REPLACEMENT_TRANSACTION,
        },
        airlinePredictedRefundGbp: 574,
        airlineCancellationFeeGbp: 0,
        supplierRefundGbp: 600,
        supplierAdminFeeGbp: 10,
        customerChargeGbp: 480,
        notes: null,
      }).success,
    ).toBe(false)
  })
})
