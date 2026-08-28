import { describe, expect, it } from 'vitest'
import {
  getPackageAgentCommissionAmount,
  getPackageAgentCommissionDeduction,
  normalizePackageAgentCommissionAllocations,
} from '@/lib/packageAgentCommission'

describe('package agent commission deductions', () => {
  it('supports ticket, fixed assistance, and no-commission agents', () => {
    const allocations = normalizePackageAgentCommissionAllocations([
      {
        id: 'agent-1',
        employeeId: 'employee-1',
        role: 'ticketing_agent',
        basis: 'ticket_commission',
        quantity: 5,
        unitAmount: 10,
        deductFromProfit: true,
      },
      {
        id: 'agent-2',
        employeeId: 'employee-2',
        role: 'assisting_agent',
        basis: 'fixed_amount',
        quantity: 99,
        unitAmount: 75,
        deductFromProfit: true,
      },
      {
        id: 'agent-3',
        employeeId: 'employee-3',
        role: 'main_dealer',
        basis: 'none',
        quantity: 1,
        unitAmount: 500,
        deductFromProfit: true,
      },
    ])

    expect(allocations.map(getPackageAgentCommissionAmount)).toEqual([50, 75, 0])
    expect(getPackageAgentCommissionDeduction(allocations)).toBe(125)
    expect(allocations[2].deductFromProfit).toBe(false)
  })

  it('does not deduct an informational allocation', () => {
    const allocations = normalizePackageAgentCommissionAllocations([
      {
        employeeId: 'employee-1',
        role: 'other',
        basis: 'fixed_amount',
        unitAmount: 100,
        deductFromProfit: false,
      },
    ])

    expect(getPackageAgentCommissionDeduction(allocations)).toBe(0)
  })
})
