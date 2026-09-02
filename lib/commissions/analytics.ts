import { COMMISSION_SERVICE_LABELS } from '@/lib/commissions/contracts'

export type CommissionEntryForAnalytics = {
  id: string
  entryMode: 'shadow' | 'live'
  entryKind: 'ordinary' | 'sales_bonus' | 'manual_adjustment' | 'refund_reversal'
  amountGbp: number
  amountPayCurrency?: number
  payCurrency?: string
  earningOn: string
  createdAt: string
  supersedesEntryId: string | null
  serviceCode: string | null
  sourcePath: string | null
  description: string
}

export type CommissionMonthPoint = {
  key: string
  label: string
  creditsGbp: number
  debitsGbp: number
  netGbp: number
}

export type CommissionBreakdownPoint = {
  code: string
  label: string
  amountGbp: number
  entryCount: number
  percentage: number
}

export type CommissionAnalytics = {
  mode: 'shadow' | 'live' | 'empty'
  currentMonth: {
    creditsGbp: number
    debitsGbp: number
    netGbp: number
    entryCount: number
  }
  yearToDateGbp: number
  monthly: CommissionMonthPoint[]
  breakdown: CommissionBreakdownPoint[]
  recent: CommissionEntryForAnalytics[]
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function safeDate(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function selectCurrentCommissionEntries(entries: CommissionEntryForAnalytics[]) {
  const supersededIds = new Set(
    entries
      .map((entry) => entry.supersedesEntryId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )

  return entries.filter((entry) => !supersededIds.has(entry.id))
}

export function buildCommissionAnalytics(
  rawEntries: CommissionEntryForAnalytics[],
  now = new Date(),
): CommissionAnalytics {
  const entries = selectCurrentCommissionEntries(rawEntries)
  const currentMonthKey = monthKey(now)
  const year = now.getUTCFullYear()
  const monthlyKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1))
    return { key: monthKey(date), label: date.toLocaleDateString('en-GB', { month: 'short' }) }
  })
  const points = new Map(
    monthlyKeys.map(({ key, label }) => [
      key,
      { key, label, creditsGbp: 0, debitsGbp: 0, netGbp: 0 },
    ]),
  )
  const breakdown = new Map<string, { amountGbp: number; entryCount: number }>()

  let currentCredits = 0
  let currentDebits = 0
  let currentCount = 0
  let yearToDate = 0

  for (const entry of entries) {
    const date = safeDate(entry.earningOn)
    if (!date) continue
    const amount = Number(entry.amountGbp || 0)
    const key = monthKey(date)
    const point = points.get(key)
    if (point) {
      if (amount >= 0) point.creditsGbp += amount
      else point.debitsGbp += Math.abs(amount)
      point.netGbp += amount
    }

    if (key === currentMonthKey) {
      if (amount >= 0) currentCredits += amount
      else currentDebits += Math.abs(amount)
      currentCount += 1

      const code = entry.serviceCode || entry.entryKind
      const item = breakdown.get(code) || { amountGbp: 0, entryCount: 0 }
      item.amountGbp += amount
      item.entryCount += 1
      breakdown.set(code, item)
    }
    if (date.getUTCFullYear() === year) yearToDate += amount
  }

  const positiveBreakdownTotal = Array.from(breakdown.values()).reduce(
    (sum, item) => sum + Math.max(0, item.amountGbp),
    0,
  )

  return {
    mode:
      entries.length === 0
        ? 'empty'
        : entries.some((entry) => entry.entryMode === 'live')
          ? 'live'
          : 'shadow',
    currentMonth: {
      creditsGbp: roundMoney(currentCredits),
      debitsGbp: roundMoney(currentDebits),
      netGbp: roundMoney(currentCredits - currentDebits),
      entryCount: currentCount,
    },
    yearToDateGbp: roundMoney(yearToDate),
    monthly: Array.from(points.values()).map((point) => ({
      ...point,
      creditsGbp: roundMoney(point.creditsGbp),
      debitsGbp: roundMoney(point.debitsGbp),
      netGbp: roundMoney(point.netGbp),
    })),
    breakdown: Array.from(breakdown.entries())
      .map(([code, item]) => ({
        code,
        label:
          COMMISSION_SERVICE_LABELS[code as keyof typeof COMMISSION_SERVICE_LABELS] ||
          code
            .split('_')
            .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(' '),
        amountGbp: roundMoney(item.amountGbp),
        entryCount: item.entryCount,
        percentage:
          positiveBreakdownTotal > 0
            ? Math.round((Math.max(0, item.amountGbp) / positiveBreakdownTotal) * 100)
            : 0,
      }))
      .sort((left, right) => right.amountGbp - left.amountGbp),
    recent: entries
      .filter((entry) => entry.earningOn.startsWith(currentMonthKey))
      .sort((left, right) => {
        const dateComparison = right.earningOn.localeCompare(left.earningOn)
        return dateComparison || right.createdAt.localeCompare(left.createdAt)
      })
      .slice(0, 12),
  }
}
