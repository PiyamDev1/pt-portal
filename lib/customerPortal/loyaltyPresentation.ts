export interface CustomerAchievementRule {
  key: string
  name: string
  description: string
  requiredTransactions: number
  bonusPoints: number
  isActive?: boolean
}

export interface CustomerAchievementAward {
  achievement_key: string
  status: string
  earned_at: string | null
}

export function customerAchievementSummaries(
  rules: CustomerAchievementRule[],
  awards: CustomerAchievementAward[],
  validTransactions: number,
) {
  const awardByKey = new Map(awards.map((award) => [award.achievement_key, award] as const))

  return rules
    .filter((rule) => rule.isActive !== false)
    .map((rule) => {
      const award = awardByKey.get(rule.key)
      return {
        key: rule.key,
        name: rule.name,
        description: rule.description,
        requiredTransactions: rule.requiredTransactions,
        bonusPoints: rule.bonusPoints,
        progress: Math.min(validTransactions, rule.requiredTransactions),
        status:
          award?.status === 'earned'
            ? ('earned' as const)
            : award?.status === 'suspended'
              ? ('suspended' as const)
              : ('locked' as const),
        earnedAt: award?.earned_at ? new Date(award.earned_at).toISOString() : null,
      }
    })
}
