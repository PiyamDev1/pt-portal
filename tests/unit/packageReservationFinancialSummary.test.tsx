import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PackageReservationFinancialSummary from '@/app/dashboard/packages/[id]/PackageReservationFinancialSummary'

const totals = {
  booked: 500,
  supplierRefund: 40,
  sold: 600,
  customerRefund: 25,
  discount: 30,
  paidAmount: 200,
  balance: 345,
  commission: 50,
  receivedCommission: 15,
  netSold: 545,
}

describe('Package reservation financial summary', () => {
  it('presents the parent-owned totals and keeps provisional staff cost clearly labelled', () => {
    render(
      <PackageReservationFinancialSummary
        totals={totals}
        currency="GBP"
        showPayment
        provisionalStaffCost={20}
        profitBeforeStaffCost={55}
        estimatedMargin={35}
      />,
    )

    expect(screen.getByRole('region', { name: 'Reservation financial summary' })).toBeTruthy()
    expect(screen.getByText('Net booked cost')).toBeTruthy()
    expect(screen.getByText('£500.00')).toBeTruthy()
    expect(screen.getByText(/Supplier credits: -£40\.00/)).toBeTruthy()
    expect(screen.getByText('Net sold price')).toBeTruthy()
    expect(screen.getByText(/Customer refunds: -£25\.00/)).toBeTruthy()
    expect(screen.getByText(/Paid £200\.00 · Balance £345\.00/)).toBeTruthy()
    expect(screen.getByText('Expected supplier commission')).toBeTruthy()
    expect(screen.getByText('Received £15.00')).toBeTruthy()
    expect(screen.getByText('Provisional staff cost')).toBeTruthy()
    expect(screen.getByText('-£20.00')).toBeTruthy()
    expect(screen.getByText('Profit estimate')).toBeTruthy()
    expect(screen.getByText('£35.00')).toBeTruthy()
    expect(
      screen.getByText('Sold - discounts - booked + supplier commission - provisional staff cost'),
    ).toBeTruthy()
  })

  it('hides zero-value detail rows and invoice payment context', () => {
    render(
      <PackageReservationFinancialSummary
        totals={{
          booked: 0,
          supplierRefund: 0,
          sold: 0,
          customerRefund: 0,
          discount: 0,
          paidAmount: 0,
          balance: 0,
          commission: 0,
          receivedCommission: 0,
          netSold: 0,
        }}
        currency="GBP"
        showPayment={false}
        provisionalStaffCost={0}
        profitBeforeStaffCost={0}
        estimatedMargin={0}
      />,
    )

    expect(screen.queryByText(/Supplier credits/)).toBeNull()
    expect(screen.queryByText(/Customer refunds/)).toBeNull()
    expect(screen.queryByText(/Net after discount/)).toBeNull()
    expect(screen.queryByText(/Paid .* Balance/)).toBeNull()
    expect(screen.queryByText(/Received/)).toBeNull()
  })
})
