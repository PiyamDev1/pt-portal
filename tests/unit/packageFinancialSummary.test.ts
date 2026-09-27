import { describe, expect, it } from 'vitest'
import { createPackageFinancialSummary } from '@/lib/packageFinancialSummary'
import { getPackageReservationFinancialSummary } from '@/lib/packageReservationFinancials'

describe('Package financial summary', () => {
  it('uses one formula for sale, cost, refunds, commission, payments and margin', () => {
    expect(
      createPackageFinancialSummary(
        {
          soldAmount: 1_000,
          bookedCost: 700,
          discountAmount: 50,
          customerRefundAmount: 25,
          supplierRefundAmount: 100,
          expectedCommissionAmount: 75,
          receivedCommissionAmount: 20,
          paidAmount: 300,
        },
        'reservation_created_at',
      ),
    ).toEqual({
      version: 1,
      dateBasis: 'reservation_created_at',
      soldAmount: 1_000,
      bookedCost: 700,
      discountAmount: 50,
      customerRefundAmount: 25,
      supplierRefundAmount: 100,
      expectedCommissionAmount: 75,
      receivedCommissionAmount: 20,
      paidAmount: 300,
      netSoldAmount: 925,
      netBookedCost: 600,
      balanceAmount: 625,
      projectedMargin: 400,
    })
  })

  it('folds shared transport references into one package calculation row', () => {
    const summary = getPackageReservationFinancialSummary(
      [
        {
          reservation_type: 'transport',
          metadata: {
            sharedGroupTransport: true,
            physicalReservation: true,
            soldPriceOverride: true,
          },
          quote_id: null,
          group_member_id: null,
          booked_cost_total: 800,
          sold_price_total: 1_200,
          discount_total: 0,
          commission_expected_total: 0,
          commission_received_total: 0,
          supplier_refund_total: 0,
          customer_refund_total: 0,
        },
        {
          reservation_type: 'transport',
          metadata: { sharedGroupTransport: true, billingAllocation: true },
          quote_id: 'quote-1',
          group_member_id: null,
          booked_cost_total: 0,
          sold_price_total: 1_200,
          discount_total: 50,
          commission_expected_total: 75,
          commission_received_total: 20,
          supplier_refund_total: 100,
          customer_refund_total: 25,
        },
      ],
      300,
    )

    expect(summary).toMatchObject({
      soldAmount: 1_200,
      bookedCost: 800,
      discountAmount: 50,
      customerRefundAmount: 25,
      supplierRefundAmount: 100,
      expectedCommissionAmount: 75,
      receivedCommissionAmount: 20,
      paidAmount: 300,
      netSoldAmount: 1_125,
      netBookedCost: 700,
      balanceAmount: 825,
      projectedMargin: 500,
      calculationRows: 1,
      referenceRows: 1,
    })
  })
})
