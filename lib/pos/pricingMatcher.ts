export type PosPricingCandidate = {
  id: string
  category: string | null
  section: string | null
  service_name: string | null
  service_option: string | null
  sale_price: number | string | null
}

export type PosPricingTarget = {
  key: string
  groupKey: string
  label: string
  optionLabel: string | null
}

const GENERIC_WORDS = new Set(['application', 'applications', 'general', 'service', 'services'])

function normalise(value: string | null | undefined) {
  return (value || '')
    .toLocaleLowerCase('en-GB')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string | null | undefined) {
  return new Set(
    normalise(value)
      .split(' ')
      .filter((token) => token.length >= 2 && !GENERIC_WORDS.has(token)),
  )
}

function tokenOverlap(left: Set<string>, right: Set<string>) {
  let matches = 0
  for (const token of left) {
    if (right.has(token)) matches += 1
  }
  return matches
}

function pricingMatchScore(target: PosPricingTarget, candidate: PosPricingCandidate) {
  const candidateParts = [candidate.category, candidate.section, candidate.service_name]
    .map(normalise)
    .filter(Boolean)
  const candidateText = candidateParts.join(' ')
  const candidateTokens = tokens(candidateText)
  const identities = [
    { value: target.optionLabel, weight: 120 },
    { value: target.key.replace(/[-_]+/g, ' '), weight: 100 },
    { value: target.label, weight: 80 },
    { value: target.groupKey.replace(/[-_]+/g, ' '), weight: 30 },
  ]

  let score = 0
  for (const identity of identities) {
    const phrase = normalise(identity.value)
    if (!phrase) continue
    if (candidateParts.includes(phrase)) score = Math.max(score, identity.weight)
    else if (candidateText.includes(phrase) || phrase.includes(candidateText)) {
      score = Math.max(score, identity.weight - 10)
    }

    const identityTokens = tokens(identity.value)
    const overlap = tokenOverlap(identityTokens, candidateTokens)
    if (overlap > 0) {
      score = Math.max(
        score,
        Math.round((identity.weight * overlap) / Math.max(identityTokens.size, 1)),
      )
    }
  }
  return score
}

/**
 * Suggests pricing rows using configured catalogue text. This deliberately remains
 * advisory: a weak or absent match must never prevent a POS transaction.
 */
export function suggestPosPricing(target: PosPricingTarget, candidates: PosPricingCandidate[]) {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: pricingMatchScore(target, candidate) }))
    .filter(({ score }) => score >= 25)
    .sort((left, right) => right.score - left.score)

  if (!ranked.length) return []
  const bestScore = ranked[0].score
  return ranked
    .filter(({ score }) => score >= Math.max(25, bestScore - 20))
    .map(({ candidate }) => candidate)
}
