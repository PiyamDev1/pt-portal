import { describe, expect, it } from 'vitest'
import {
  buildPackageCombinations,
  formatPackageCombinationForCopy,
  getDefaultPackageExpiry,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'
import type { PackageQuotePayload } from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Family Umrah',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'A Khan',
  customerPhone: '',
  customerEmail: '',
  adults: 2,
  childrenPaying: 1,
  childrenFree: 1,
  itineraryOrder: ['makkah', 'madinah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [
        { id: 'mk-a', title: 'Makkah A', summary: 'Makkah A\n5 nights', price: 400 },
        { id: 'mk-b', title: 'Makkah B', summary: 'Makkah B\n5 nights', price: 350 },
      ],
    },
    {
      id: 'madinah',
      label: 'Madinah',
      options: [
        { id: 'md-a', title: 'Madinah A', summary: 'Madinah A\n4 nights', price: 300 },
        { id: 'md-b', title: 'Madinah B', summary: 'Madinah B\n4 nights', price: 275 },
      ],
    },
  ],
  flightOptions: [{ id: 'flt-a', title: 'Direct flights', summary: 'Direct flights', price: 900 }],
  transportOptions: [
    { id: 'tr-a', title: 'Private transfers', summary: 'Private transfers', price: 180 },
  ],
  notes: '',
}

describe('package quote calculator', () => {
  it('generates sorted combinations including hotels, flights, and transport', () => {
    const combinations = buildPackageCombinations(payload)

    expect(combinations).toHaveLength(4)
    expect(combinations[0].staySelections.map((stay) => stay.option.id)).toEqual(['mk-b', 'md-b'])
    expect(combinations[0].totalPrice).toBe(1705)
    expect(combinations[0].perPersonPrice).toBeCloseTo(568.333, 3)
    expect(combinations.at(-1)?.totalPrice).toBe(1780)
  })

  it('formats WhatsApp-friendly copy for an option', () => {
    const [first] = buildPackageCombinations(payload)
    const copy = formatPackageCombinationForCopy(payload, first, 1)

    expect(copy).toContain('*Option 1*')
    expect(copy).toContain('*(Makkah)*')
    expect(copy).toContain('*Flight*')
    expect(copy).toContain('*Total Package Cost: £1,705.00*')
  })

  it('resolves a customer selection and rejects invalid option ids', () => {
    const resolved = resolvePackageSelection(payload, {
      stayOptionIds: { makkah: 'mk-a', madinah: 'md-b' },
      flightOptionId: 'flt-a',
      transportOptionId: 'tr-a',
    })

    expect(resolved.combination.totalPrice).toBe(1755)
    expect(() =>
      resolvePackageSelection(payload, {
        stayOptionIds: { makkah: 'missing', madinah: 'md-b' },
      }),
    ).toThrow('Select a valid Makkah option')
  })

  it('defaults quote expiry to 72 hours from now', () => {
    const now = Date.now()
    const expiresAt = getDefaultPackageExpiry()
    const diffHours = (new Date(expiresAt).getTime() - now) / (60 * 60 * 1000)

    expect(diffHours).toBeGreaterThan(71.9)
    expect(diffHours).toBeLessThanOrEqual(72)
    expect(isPackageQuoteExpired(expiresAt, now)).toBe(false)
    expect(isPackageQuoteExpired(new Date(now - 1000).toISOString(), now)).toBe(true)
  })

  it('preserves textarea spacing in component summaries', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-space',
              title: 'Makkah spaced',
              summary: 'Line one\n\n  Line two with leading space',
              price: 400,
            },
          ],
        },
        payload.stayGroups[1],
      ],
    })

    expect(normalized.stayGroups[0].options[0].summary).toBe(
      'Line one\n\n  Line two with leading space',
    )
  })
})
