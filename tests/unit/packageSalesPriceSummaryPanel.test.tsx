import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  PackagePaymentBreakdown,
  PackageQuotePayload,
  PackageResolvedSelection,
} from '@/app/types/packages'
import PackageSalesPriceSummaryPanel from '@/app/dashboard/packages/quotations/[id]/sales/PackageSalesPriceSummaryPanel'

const payload = {
  currency: 'GBP',
  cardProcessingFeePercent: 2,
  depositRequired: false,
} as PackageQuotePayload

const resolved = {
  combination: {
    grossPrice: 1000,
    offerDiscountTotal: 100,
    refundAdjustmentTotal: 0,
    paymentSurchargeTotal: 20,
    totalPrice: 920,
    currency: 'GBP',
  },
} as PackageResolvedSelection

function renderPanel(onPaymentBreakdownChange = vi.fn()) {
  return render(
    <PackageSalesPriceSummaryPanel
      payload={payload}
      resolved={resolved}
      priceBreakdown={null}
      combinedGroupPricing={null}
      promoCode=""
      onPromoCodeChange={vi.fn()}
      paymentBreakdown={{ cash: 700, bankTransfer: 200, card: 20 }}
      paymentBreakdownBalanced
      paymentBreakdownRemaining={0}
      onPaymentBreakdownChange={onPaymentBreakdownChange}
    />,
  )
}

describe('PackageSalesPriceSummaryPanel', () => {
  it('shows the parent-calculated package total and balanced payment message', () => {
    renderPanel()

    expect(screen.getByText('Total package price')).toBeTruthy()
    expect(screen.getByText('£920.00')).toBeTruthy()
    expect(screen.getByText('Payment split matches the package subtotal.')).toBeTruthy()
  })

  it('delegates payment edits without owning selection state', () => {
    const onPaymentBreakdownChange = vi.fn<(value: PackagePaymentBreakdown) => void>()
    renderPanel(onPaymentBreakdownChange)

    fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '750' } })

    expect(onPaymentBreakdownChange).toHaveBeenCalledWith({
      cash: 750,
      bankTransfer: 200,
      card: 20,
    })
  })
})
