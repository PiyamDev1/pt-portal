import { describe, expect, it } from 'vitest'
import { createPackageInstallmentSchedule } from '@/lib/packagePaymentPlans'

describe('package installment schedules', () => {
  it('splits pennies exactly without changing the plan total', () => {
    const schedule = createPackageInstallmentSchedule({
      totalAmount: 1000,
      depositAmount: 100,
      installmentCount: 7,
      frequency: 'monthly',
      startsOn: '2026-07-15',
    })
    expect(schedule).toHaveLength(7)
    expect(schedule.reduce((total, item) => total + Math.round(item.amount * 100), 0)).toBe(90_000)
    expect(schedule[0].amount).toBe(128.58)
    expect(schedule.at(-1)?.due_on).toBe('2027-01-15')
  })

  it('supports fortnightly schedules', () => {
    const schedule = createPackageInstallmentSchedule({
      totalAmount: 300,
      installmentCount: 3,
      frequency: 'fortnightly',
      startsOn: '2026-07-01',
    })
    expect(schedule.map((item) => item.due_on)).toEqual(['2026-07-01', '2026-07-15', '2026-07-29'])
  })
})
