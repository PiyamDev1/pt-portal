import { describe, expect, it } from 'vitest'
import {
  commissionComponentSchema,
  commissionPreviewSchema,
  createCommissionAssignmentSchema,
  createCommissionPolicyVersionSchema,
} from '@/lib/commissions/contracts'

const EMPLOYEE_ID = '40000000-0000-4000-8000-000000000001'
const VERSION_ID = '50000000-0000-4000-8000-000000000001'

describe('Commission contracts', () => {
  it('accepts fixed and percentage threshold-gated sales bonuses', () => {
    const base = {
      componentType: 'sales_profit_bonus' as const,
      recipientRole: 'sales_bonus' as const,
      thresholdGbp: '1000.00',
      eligibleServices: ['tk_primary' as const],
      config: { period: 'calendar_month' },
    }
    expect(
      commissionComponentSchema.safeParse({
        ...base,
        rewardKind: 'fixed_gbp',
        rewardValue: '100.00',
      }).success,
    ).toBe(true)
    expect(
      commissionComponentSchema.safeParse({
        ...base,
        rewardKind: 'percentage_of_qualifying_profit',
        rewardValue: '10',
      }).success,
    ).toBe(true)
  })

  it('rejects an incomplete bonus and arbitrary formula or identity fields', () => {
    expect(
      commissionComponentSchema.safeParse({
        componentType: 'sales_profit_bonus',
        recipientRole: 'primary',
        thresholdGbp: '1000',
        rewardKind: 'fixed_gbp',
        rewardValue: '100',
        eligibleServices: [],
        config: {},
      }).success,
    ).toBe(false)
    expect(
      createCommissionPolicyVersionSchema.safeParse({
        components: [
          {
            componentType: 'fixed_per_event',
            recipientRole: 'assistant',
            rateValue: '5',
            eligibleServices: [],
            config: {},
            formula: 'company_profit * 0.1',
          },
        ],
        actingEmployeeId: EMPLOYEE_ID,
      }).success,
    ).toBe(false)
  })

  it('validates effective assignment dates and supported scopes', () => {
    const assignment = {
      employeeId: EMPLOYEE_ID,
      policyVersionId: VERSION_ID,
      sourceModule: 'ticketing' as const,
      serviceCode: 'tk_primary' as const,
      recipientRole: 'primary' as const,
      locationId: null,
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-31',
    }
    expect(createCommissionAssignmentSchema.safeParse(assignment).success).toBe(true)
    expect(
      createCommissionAssignmentSchema.safeParse({
        ...assignment,
        effectiveTo: '2026-07-31',
      }).success,
    ).toBe(false)
  })

  it('requires the relevant synthetic variables for ordinary and bonus previews', () => {
    expect(
      commissionPreviewSchema.safeParse({
        component: {
          componentType: 'fixed_per_unit',
          sourceVariable: 'passenger_ticket_count',
          recipientRole: 'primary',
          rateValue: '5',
          eligibleServices: [],
          config: {},
        },
        variables: { units: 50 },
      }).success,
    ).toBe(true)
    expect(
      commissionPreviewSchema.safeParse({
        component: {
          componentType: 'sales_profit_bonus',
          recipientRole: 'sales_bonus',
          thresholdGbp: '1000',
          rewardKind: 'fixed_gbp',
          rewardValue: '100',
          eligibleServices: ['tk_primary'],
          config: {},
        },
        variables: {},
      }).success,
    ).toBe(false)
  })
})
