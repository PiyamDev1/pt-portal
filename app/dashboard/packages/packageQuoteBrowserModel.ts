import type { TravelPackageGroup, TravelPackageQuote } from '@/app/types/packages'
import {
  buildCustomerPackageOptions,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'

export type PackageQuoteFilter = 'all' | 'live' | 'draft' | 'selected' | 'expired' | 'bin'

export const PACKAGE_QUOTE_FILTERS: Array<{ value: PackageQuoteFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live Links' },
  { value: 'draft', label: 'Drafts' },
  { value: 'selected', label: 'Selected' },
  { value: 'expired', label: 'Expired' },
  { value: 'bin', label: 'Bin' },
]

export function getPackageTimestamp(value: string | null | undefined) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export function buildPackageShareUrl(token?: string) {
  if (!token || typeof window === 'undefined') return ''
  return `${window.location.origin}/packages/${token}`
}

export function formatPackageExpiry(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid expiry'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getPackageQuoteStartingPrice(quote: TravelPackageQuote) {
  return buildCustomerPackageOptions(quote.payload, 1)[0]?.combination || null
}

export function filterPackageQuotes(
  quotes: TravelPackageQuote[],
  packageGroups: TravelPackageGroup[],
  filter: PackageQuoteFilter,
) {
  const activeQuotes = quotes.filter((quote) => quote.status !== 'archived')
  let filteredQuotes: TravelPackageQuote[]

  if (filter === 'live') {
    filteredQuotes = activeQuotes.filter(
      (quote) =>
        quote.share_enabled &&
        quote.status === 'shared' &&
        !isPackageQuoteExpired(quote.expires_at),
    )
  } else if (filter === 'draft') {
    filteredQuotes = activeQuotes.filter(
      (quote) => quote.status === 'draft' || !quote.share_enabled,
    )
  } else if (filter === 'selected') {
    filteredQuotes = activeQuotes.filter((quote) => Boolean(quote.selected_at))
  } else if (filter === 'expired') {
    filteredQuotes = activeQuotes.filter((quote) => isPackageQuoteExpired(quote.expires_at))
  } else if (filter === 'bin') {
    filteredQuotes = quotes.filter((quote) => quote.status === 'archived')
  } else {
    const linkedGroupIds = new Set(packageGroups.map((group) => group.id))
    filteredQuotes = activeQuotes.filter((quote) => {
      const groupId = normalizePackageQuotePayload(quote.payload).linkedPackageGroup?.groupId
      return !groupId || !linkedGroupIds.has(groupId)
    })
  }

  return [...filteredQuotes].sort(
    (a, b) => getPackageTimestamp(b.created_at) - getPackageTimestamp(a.created_at),
  )
}
