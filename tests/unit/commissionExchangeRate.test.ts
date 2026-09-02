import { describe, expect, it } from 'vitest'
import { commissionExchangeRateAvailability } from '@/lib/commissions/contracts'

describe('commissionExchangeRateAvailability', () => {
  it('opens a monthly rate on the 26th in London', () => {
    expect(
      commissionExchangeRateAvailability('2026-09-01', new Date('2026-09-25T22:59:59Z')),
    ).toMatchObject({ available: false, opensOn: '2026-09-26' })
    expect(
      commissionExchangeRateAvailability('2026-09-01', new Date('2026-09-25T23:00:00Z')),
    ).toMatchObject({ available: true, opensOn: '2026-09-26' })
  })

  it('keeps past months available and rejects a future month', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(commissionExchangeRateAvailability('2026-08-01', now).available).toBe(true)
    expect(commissionExchangeRateAvailability('2026-10-01', now).available).toBe(false)
  })
})
