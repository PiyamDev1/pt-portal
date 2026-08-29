import { describe, expect, it } from 'vitest'
import {
  buildCommissionAnalytics,
  selectCurrentCommissionEntries,
  type CommissionEntryForAnalytics,
} from '@/lib/commissions/analytics'

function entry(
  id: string,
  amountGbp: number,
  earningOn: string,
  overrides: Partial<CommissionEntryForAnalytics> = {},
): CommissionEntryForAnalytics {
  return {
    id,
    entryMode: 'shadow',
    entryKind: 'ordinary',
    amountGbp,
    earningOn,
    createdAt: `${earningOn}T12:00:00Z`,
    supersedesEntryId: null,
    serviceCode: 'tk_primary',
    sourcePath: 'ticketing:test',
    description: 'Ticket sales',
    ...overrides,
  }
}

describe('commission analytics', () => {
  it('excludes entries superseded by a newer calculation', () => {
    const original = entry('original', 5, '2026-08-10')
    const correction = entry('correction', 7, '2026-08-10', {
      supersedesEntryId: original.id,
    })

    expect(selectCurrentCommissionEntries([original, correction])).toEqual([correction])
  })

  it('separates credits and debits while retaining the signed net value', () => {
    const analytics = buildCommissionAnalytics(
      [
        entry('sale', 30, '2026-08-10'),
        entry('fare-debit', -8, '2026-08-11', {
          serviceCode: 'higher_fare',
          description: 'Higher-fare adjustments',
        }),
        entry('previous-month', 12, '2026-07-20'),
      ],
      new Date('2026-08-29T12:00:00Z'),
    )

    expect(analytics.mode).toBe('shadow')
    expect(analytics.currentMonth).toEqual({
      creditsGbp: 30,
      debitsGbp: 8,
      netGbp: 22,
      entryCount: 2,
    })
    expect(analytics.yearToDateGbp).toBe(34)
    expect(analytics.monthly.at(-1)).toMatchObject({
      key: '2026-08',
      creditsGbp: 30,
      debitsGbp: 8,
      netGbp: 22,
    })
  })

  it('reports an empty mode without manufacturing earnings', () => {
    const analytics = buildCommissionAnalytics([], new Date('2026-08-29T12:00:00Z'))
    expect(analytics.mode).toBe('empty')
    expect(analytics.currentMonth.netGbp).toBe(0)
    expect(analytics.breakdown).toEqual([])
  })
})
