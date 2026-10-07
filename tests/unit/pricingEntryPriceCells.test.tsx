import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PricingEntryPriceCells from '@/app/dashboard/settings/components/pricing/PricingEntryPriceCells'

describe('PricingEntryPriceCells', () => {
  it('renders editable prices and reports string input values', () => {
    const onCostPriceChange = vi.fn()
    const onSalePriceChange = vi.fn()
    render(
      <table>
        <tbody>
          <tr>
            <PricingEntryPriceCells
              mode="edit"
              costPrice="7.5"
              salePrice="13"
              onCostPriceChange={onCostPriceChange}
              onSalePriceChange={onSalePriceChange}
            />
          </tr>
        </tbody>
      </table>,
    )

    expect(screen.getByText('5.50')).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cost price' }), {
      target: { value: '8.25' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sale price' }), {
      target: { value: '15' },
    })

    expect(onCostPriceChange).toHaveBeenCalledWith('8.25')
    expect(onSalePriceChange).toHaveBeenCalledWith('15')
  })

  it('renders stored prices and their sale-minus-cost margin', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PricingEntryPriceCells mode="display" costPrice={10.5} salePrice={15.75} />
          </tr>
        </tbody>
      </table>,
    )

    expect(screen.getByText('10.50')).toBeTruthy()
    expect(screen.getByText('15.75')).toBeTruthy()
    expect(screen.getByText('5.25')).toBeTruthy()
  })
})
