import { describe, expect, it } from 'vitest'
import {
  commissionProfileSchema,
  createDefaultCommissionProfile,
  profileNeedsWholeMonths,
  toStoredCommissionProfile,
} from '@/lib/commissions/contracts'

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111'

describe('employee commission profile contract', () => {
  it('creates a complete agreement with an explicit decision for every service', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    const parsed = commissionProfileSchema.parse(profile)
    const stored = toStoredCommissionProfile(parsed)

    expect(stored.services.map((service) => service.serviceCode)).toEqual([
      'tk_primary',
      'tk_assistance',
      'dc',
      'r_er',
      'low_fare',
      'higher_fare',
      'package_sale',
    ])
    expect(stored.services.every((service) => service.components.length === 1)).toBe(true)
    expect(
      stored.services.every(
        (service) =>
          service.components[0]?.componentType === 'explicit_zero' &&
          service.components[0]?.rateValue === 0,
      ),
    ).toBe(true)
  })

  it('maps package methods to package-specific calculation components', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.packageSale = { kind: 'percentage', value: 12.5, tiers: [] }

    const component = toStoredCommissionProfile(profile).services.find(
      (service) => service.serviceCode === 'package_sale',
    )?.components[0]

    expect(component).toMatchObject({
      componentType: 'percentage_of_package_profit',
      sourceVariable: 'package_profit_gbp',
      recipientRole: 'package_sales',
      rateValue: 12.5,
    })
  })

  it('sorts marginal tiers before creating the immutable policy payload', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.tkPrimary = {
      kind: 'tiered',
      value: 0,
      tiers: [
        { minUnit: 21, rateGbp: 8 },
        { minUnit: 1, rateGbp: 5 },
        { minUnit: 11, rateGbp: 6 },
      ],
    }

    const stored = toStoredCommissionProfile(commissionProfileSchema.parse(profile))
    expect(stored.services[0]?.components[0]?.tiers).toEqual([
      { minUnit: 1, rateGbp: 5 },
      { minUnit: 11, rateGbp: 6 },
      { minUnit: 21, rateGbp: 8 },
    ])
    expect(profileNeedsWholeMonths(profile)).toBe(true)
  })

  it('rejects service combinations the processor cannot interpret safely', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.tkAssistance = { kind: 'percentage', value: 10, tiers: [] }

    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)
  })

  it('keeps a copied setup independent of its source', () => {
    const source = createDefaultCommissionProfile(EMPLOYEE_ID)
    source.services.tkPrimary = { kind: 'per_unit', value: 5, tiers: [] }
    const copy = structuredClone(source)
    copy.employeeId = '22222222-2222-4222-8222-222222222222'
    copy.services.tkPrimary.value = 9

    expect(source.services.tkPrimary.value).toBe(5)
    expect(copy.services.tkPrimary.value).toBe(9)
  })
})
