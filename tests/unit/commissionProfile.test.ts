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
    expect(profile.assistanceScope).toEqual({ mode: 'all', employeeIds: [] })
    expect(stored.uiVersion).toBe(2)
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

  it('stores an independent selected-agent scope for Ticket Assistance', () => {
    const primaryAgentId = '22222222-2222-4222-8222-222222222222'
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.tkAssistance = { kind: 'per_unit', value: 4, tiers: [] }
    profile.assistanceScope = { mode: 'specific_agents', employeeIds: [primaryAgentId] }

    const parsed = commissionProfileSchema.parse(profile)
    const assistance = toStoredCommissionProfile(parsed).services.find(
      (service) => service.serviceCode === 'tk_assistance',
    )

    expect(assistance?.components[0]).toMatchObject({
      componentType: 'fixed_per_unit',
      rateValue: 4,
      config: {
        serviceCode: 'tk_assistance',
        assistanceScope: { mode: 'specific_agents', employeeIds: [primaryAgentId] },
      },
    })
  })

  it('rejects empty, duplicate, or self-referencing selected-agent scopes', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.assistanceScope = { mode: 'specific_agents', employeeIds: [] }
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)

    profile.assistanceScope.employeeIds = [EMPLOYEE_ID]
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)

    const other = '22222222-2222-4222-8222-222222222222'
    profile.assistanceScope.employeeIds = [other, other]
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)
  })

  it('upgrades stored version-one drafts to all-agent assistance', () => {
    const legacy = createDefaultCommissionProfile(EMPLOYEE_ID) as Record<string, unknown>
    delete legacy.assistanceScope

    expect(commissionProfileSchema.parse(legacy).assistanceScope).toEqual({
      mode: 'all',
      employeeIds: [],
    })
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
