import { describe, expect, it } from 'vitest'
import { suggestPosPricing } from '@/lib/pos/pricingMatcher'

const prices = [
  {
    id: 'nicop-normal',
    category: 'NADRA',
    section: 'Identity documents',
    service_name: 'NICOP/CNIC',
    service_option: 'Normal',
    sale_price: 50,
  },
  {
    id: 'poc-normal',
    category: 'NADRA',
    section: 'Identity documents',
    service_name: 'POC',
    service_option: 'Normal',
    sale_price: 60,
  },
  {
    id: 'cargo',
    category: 'Cargo',
    section: 'Delivery',
    service_name: 'Parcel',
    service_option: null,
    sale_price: 25,
  },
]

describe('POS pricing suggestions', () => {
  it('prefers the configured service identity over a broad category match', () => {
    const matches = suggestPosPricing(
      { key: 'poc', groupKey: 'applications', label: 'NADRA', optionLabel: 'POC' },
      prices,
    )

    expect(matches.map((match) => match.id)).toEqual(['poc-normal'])
  })

  it('allows a soft category match without inventing a required selection', () => {
    const matches = suggestPosPricing(
      {
        key: 'cargo-delivery',
        groupKey: 'cargo',
        label: 'Cargo/Delivery',
        optionLabel: null,
      },
      prices,
    )

    expect(matches.map((match) => match.id)).toEqual(['cargo'])
  })

  it('returns no suggestion when catalogue and pricing text are unrelated', () => {
    expect(
      suggestPosPricing(
        {
          key: 'document-assistance',
          groupKey: 'document-assistance',
          label: 'Document Assistance',
          optionLabel: null,
        },
        prices,
      ),
    ).toEqual([])
  })
})
