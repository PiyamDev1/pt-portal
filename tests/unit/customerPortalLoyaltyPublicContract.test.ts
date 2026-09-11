import { describe, expect, it } from 'vitest'

import { customerAchievementSummaries } from '@/lib/customerPortal/loyaltyPresentation'

describe('customer loyalty public achievement contract', () => {
  it('omits staff-only activation state from customer summaries', () => {
    const summaries = customerAchievementSummaries(
      [
        {
          key: 'first_ten',
          name: 'First Ten',
          description: 'Complete 10 eligible transactions.',
          requiredTransactions: 10,
          bonusPoints: 50,
          isActive: true,
        },
      ],
      [],
      4,
    )

    expect(summaries).toEqual([
      {
        key: 'first_ten',
        name: 'First Ten',
        description: 'Complete 10 eligible transactions.',
        requiredTransactions: 10,
        bonusPoints: 50,
        progress: 4,
        status: 'locked',
        earnedAt: null,
      },
    ])
    expect(summaries[0]).not.toHaveProperty('isActive')
  })
})
