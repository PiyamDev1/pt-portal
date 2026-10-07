import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PricingAmountFields from '@/app/dashboard/settings/components/pricing/PricingAmountFields'

describe('PricingAmountFields', () => {
  it('preserves caller labels and IDs while returning numeric amounts', () => {
    const onCostPriceChange = vi.fn()
    const onSalePriceChange = vi.fn()
    render(
      <PricingAmountFields
        costPrice={12.5}
        salePrice={20}
        costInputId="service-cost"
        saleInputId="service-sale"
        costAriaLabel="Enter cost price for this service"
        saleAriaLabel="Enter sale price for this service"
        onCostPriceChange={onCostPriceChange}
        onSalePriceChange={onSalePriceChange}
      />,
    )

    expect(screen.getByLabelText('Cost Price').getAttribute('id')).toBe('service-cost')
    expect(screen.getByLabelText('Sale Price').getAttribute('id')).toBe('service-sale')

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Enter cost price for this service' }),
      {
        target: { value: '15.75' },
      },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Enter sale price for this service' }),
      {
        target: { value: '27' },
      },
    )

    expect(onCostPriceChange).toHaveBeenCalledWith(15.75)
    expect(onSalePriceChange).toHaveBeenCalledWith(27)
  })
})
