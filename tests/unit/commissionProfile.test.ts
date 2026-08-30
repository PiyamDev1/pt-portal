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
      'application_nadra',
      'application_nadra_urgent',
      'application_passport_pk',
      'application_passport_pk_urgent',
      'application_passport_gb',
      'application_visa',
    ])
    expect(stored.services.every((service) => service.components.length === 1)).toBe(true)
    expect(profile.assistanceScope).toEqual({ mode: 'all', employeeIds: [], agentRates: [] })
    expect(profile.applicationRouting).toEqual({ mode: 'self', recipientEmployeeId: null })
    expect(stored.uiVersion).toBe(5)
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

  it('maps flat package bands to the authoritative passenger count', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.packageSale = {
      kind: 'tiered',
      value: 0,
      tiers: [
        { minUnit: 6, rateGbp: 8 },
        { minUnit: 1, rateGbp: 5 },
      ],
    }

    const component = toStoredCommissionProfile(profile).services.find(
      (service) => service.serviceCode === 'package_sale',
    )?.components[0]

    expect(component).toMatchObject({
      componentType: 'marginal_ticket_tier',
      recipientRole: 'package_sales',
      config: { marginalUnit: 'package_passenger_band' },
      tiers: [
        { minUnit: 1, rateGbp: 5 },
        { minUnit: 6, rateGbp: 8 },
      ],
    })
    expect(profileNeedsWholeMonths(profile)).toBe(false)
  })

  it('maps each completed Application service to a fixed employee-owned event rate', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.applicationNadra = { kind: 'per_event', value: 10, tiers: [] }
    profile.services.applicationNadraUrgent = { kind: 'per_event', value: 15, tiers: [] }
    profile.services.applicationPassportPk = { kind: 'per_event', value: 20, tiers: [] }
    profile.services.applicationPassportPkUrgent = { kind: 'per_event', value: 25, tiers: [] }
    profile.services.applicationPassportGb = { kind: 'per_event', value: 30, tiers: [] }
    profile.services.applicationVisa = { kind: 'per_event', value: 40, tiers: [] }

    const applicationServices = toStoredCommissionProfile(
      commissionProfileSchema.parse(profile),
    ).services.filter((service) => service.sourceModule === 'applications')

    expect(applicationServices.map((service) => service.serviceCode)).toEqual([
      'application_nadra',
      'application_nadra_urgent',
      'application_passport_pk',
      'application_passport_pk_urgent',
      'application_passport_gb',
      'application_visa',
    ])
    expect(applicationServices.map((service) => service.components[0]?.rateValue)).toEqual([
      10, 15, 20, 25, 30, 40,
    ])
    expect(
      applicationServices.every(
        (service) =>
          service.recipientRole === 'application_agent' &&
          service.components[0]?.componentType === 'fixed_per_event' &&
          service.components[0]?.config.payCurrency === 'GBP',
      ),
    ).toBe(true)
  })

  it('rejects percentage or ticket-unit methods for Application completion rates', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.applicationVisa = { kind: 'percentage', value: 10, tiers: [] }

    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)
  })

  it('stores a separate Application commission recipient without changing the plan owner', () => {
    const recipientEmployeeId = '22222222-2222-4222-8222-222222222222'
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.applicationRouting = { mode: 'another_employee', recipientEmployeeId }

    const stored = toStoredCommissionProfile(commissionProfileSchema.parse(profile))

    expect(stored.draft.employeeId).toBe(EMPLOYEE_ID)
    expect(stored.draft.applicationRouting).toEqual({
      mode: 'another_employee',
      recipientEmployeeId,
    })
  })

  it('rejects missing, self-referencing, or stray Application recipients', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.applicationRouting = { mode: 'another_employee', recipientEmployeeId: null }
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)

    profile.applicationRouting.recipientEmployeeId = EMPLOYEE_ID
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)

    profile.applicationRouting = {
      mode: 'none',
      recipientEmployeeId: '22222222-2222-4222-8222-222222222222',
    }
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)
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
    profile.assistanceScope = {
      mode: 'specific_agents',
      employeeIds: [primaryAgentId],
      agentRates: [{ employeeId: primaryAgentId, value: 4 }],
    }

    const parsed = commissionProfileSchema.parse(profile)
    const assistance = toStoredCommissionProfile(parsed).services.find(
      (service) => service.serviceCode === 'tk_assistance',
    )

    expect(assistance?.components[0]).toMatchObject({
      componentType: 'fixed_per_unit',
      rateValue: 4,
      config: {
        serviceCode: 'tk_assistance',
        assistanceScope: {
          mode: 'specific_agents',
          employeeIds: [primaryAgentId],
          agentRates: [{ employeeId: primaryAgentId, value: 4 }],
        },
      },
    })
  })

  it('rejects empty, duplicate, or self-referencing selected-agent scopes', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.assistanceScope = { mode: 'specific_agents', employeeIds: [], agentRates: [] }
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)

    profile.assistanceScope.employeeIds = [EMPLOYEE_ID]
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)

    const other = '22222222-2222-4222-8222-222222222222'
    profile.assistanceScope.employeeIds = [other, other]
    profile.assistanceScope.agentRates = [{ employeeId: other, value: 2 }]
    expect(commissionProfileSchema.safeParse(profile).success).toBe(false)
  })

  it('upgrades stored version-one drafts to all-agent assistance', () => {
    const legacy = createDefaultCommissionProfile(EMPLOYEE_ID) as Record<string, unknown>
    delete legacy.assistanceScope
    delete legacy.applicationRouting

    expect(commissionProfileSchema.parse(legacy).assistanceScope).toEqual({
      mode: 'all',
      employeeIds: [],
      agentRates: [],
    })
    expect(commissionProfileSchema.parse(legacy).applicationRouting).toEqual({
      mode: 'self',
      recipientEmployeeId: null,
    })
  })

  it('stores separate Ticket Assistance rates for each selected primary agent', () => {
    const first = '22222222-2222-4222-8222-222222222222'
    const second = '33333333-3333-4333-8333-333333333333'
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.tkAssistance = { kind: 'per_unit', value: 0, tiers: [] }
    profile.assistanceScope = {
      mode: 'specific_agents',
      employeeIds: [first, second],
      agentRates: [
        { employeeId: first, value: 3 },
        { employeeId: second, value: 2 },
      ],
    }

    const component = toStoredCommissionProfile(
      commissionProfileSchema.parse(profile),
    ).services.find((service) => service.serviceCode === 'tk_assistance')?.components[0]

    expect(component?.config.assistanceScope).toEqual(profile.assistanceScope)
  })

  it('maps the full fare increase and fixed Low Fare ticket methods explicitly', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.services.higherFare = { kind: 'full_difference', value: 100, tiers: [] }
    profile.services.lowFare = { kind: 'per_unit', value: 5, tiers: [] }
    const stored = toStoredCommissionProfile(commissionProfileSchema.parse(profile))

    expect(
      stored.services.find((service) => service.serviceCode === 'higher_fare')?.components[0],
    ).toMatchObject({
      componentType: 'signed_percentage',
      sourceVariable: 'difference_gbp',
      rateValue: 100,
    })
    expect(
      stored.services.find((service) => service.serviceCode === 'low_fare')?.components[0],
    ).toMatchObject({
      componentType: 'fixed_per_unit',
      sourceVariable: 'passenger_ticket_count',
      rateValue: 5,
    })
  })

  it('stores local compensation and the date-change marginal-volume choice', () => {
    const profile = createDefaultCommissionProfile(EMPLOYEE_ID)
    profile.compensation = { currency: 'PKR', monthlySalary: 150_000 }
    profile.services.tkPrimary = {
      kind: 'tiered',
      value: 0,
      tiers: [{ minUnit: 1, rateGbp: 500 }],
    }
    profile.ticketTierOptions.includeDateChanges = true

    const stored = toStoredCommissionProfile(commissionProfileSchema.parse(profile))
    const ticketComponent = stored.services.find((service) => service.serviceCode === 'tk_primary')
      ?.components[0]
    expect(ticketComponent?.config).toMatchObject({
      payCurrency: 'PKR',
      includeDateChangesInMarginalTiers: true,
    })
    expect(stored.draft.compensation).toEqual({ currency: 'PKR', monthlySalary: 150_000 })
    expect(profileNeedsWholeMonths(profile)).toBe(true)
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
