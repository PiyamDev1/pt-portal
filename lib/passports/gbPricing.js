/**
 * Shared GB passport pricing helpers.
 *
 * Pricing rows and lookup labels have historically used slightly different
 * display text, especially for page counts. Keep matching centralized so the
 * form preview, create route, and update route resolve the same pricing row.
 */

export function normaliseGbPricingText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normaliseGbPageValue(value) {
  const text = String(value || '').trim()
  const numeric = text.match(/\d+/)?.[0]
  return numeric || normaliseGbPricingText(text)
}

export function gbPageMatchKeys(value) {
  const key = normaliseGbPageValue(value)
  if (!key) return new Set()

  const keys = new Set([key])

  // Legacy seeded GB passport pricing used 32 where the lookup option can be
  // displayed as 34 pages. Prefer exact matches first; this is only fallback.
  if (key === '32') keys.add('34')
  if (key === '34') keys.add('32')

  return keys
}

export function toGbPricingNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function mapGbPricingRule(row) {
  return {
    id: row.id,
    cost: toGbPricingNumber(row.cost_price),
    price: toGbPricingNumber(row.sale_price),
    age: row.age_group,
    pages: row.pages,
    service: row.service_type,
    ageKey: normaliseGbPricingText(row.age_group),
    pagesKey: normaliseGbPageValue(row.pages),
    serviceKey: normaliseGbPricingText(row.service_type),
  }
}

export function gbPricingRowMatches(row, { ageGroup, pages, serviceType }, { allowAliases = true } = {}) {
  const ageMatches =
    normaliseGbPricingText(row.age_group) === normaliseGbPricingText(ageGroup)
  const serviceMatches =
    normaliseGbPricingText(row.service_type) === normaliseGbPricingText(serviceType)

  if (!ageMatches || !serviceMatches) return false

  const rowPageKey = normaliseGbPageValue(row.pages)
  const requestedPageKey = normaliseGbPageValue(pages)
  if (rowPageKey === requestedPageKey) return true
  if (!allowAliases) return false

  const rowKeys = gbPageMatchKeys(row.pages)
  const requestedKeys = gbPageMatchKeys(pages)
  return [...requestedKeys].some((key) => rowKeys.has(key))
}

export function findGbPricingRow(rows, request) {
  const activeRows = (rows || []).filter((row) => row.is_active !== false)
  return (
    activeRows.find((row) => gbPricingRowMatches(row, request, { allowAliases: false })) ||
    activeRows.find((row) => gbPricingRowMatches(row, request, { allowAliases: true })) ||
    null
  )
}

export function gbPricingRuleMatches(
  rule,
  { ageGroup, pages, serviceType },
  { allowAliases = true } = {},
) {
  const ageMatches =
    (rule.ageKey || normaliseGbPricingText(rule.age)) === normaliseGbPricingText(ageGroup)
  const serviceMatches =
    (rule.serviceKey || normaliseGbPricingText(rule.service)) ===
    normaliseGbPricingText(serviceType)

  if (!ageMatches || !serviceMatches) return false

  const rulePageKey = rule.pagesKey || normaliseGbPageValue(rule.pages)
  const requestedPageKey = normaliseGbPageValue(pages)
  if (rulePageKey === requestedPageKey) return true
  if (!allowAliases) return false

  const ruleKeys = gbPageMatchKeys(rule.pages)
  const requestedKeys = gbPageMatchKeys(pages)
  return [...requestedKeys].some((key) => ruleKeys.has(key))
}

export function findGbPricingRule(rules, request) {
  return (
    (rules || []).find((rule) => gbPricingRuleMatches(rule, request, { allowAliases: false })) ||
    (rules || []).find((rule) => gbPricingRuleMatches(rule, request, { allowAliases: true })) ||
    null
  )
}
