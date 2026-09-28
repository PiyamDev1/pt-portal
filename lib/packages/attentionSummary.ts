import type { TravelPackageFolder, TravelPackageQuote } from '@/app/types/packages'
import { isPackageQuoteExpired } from '@/lib/packageQuote'

export const ACTIVE_PACKAGE_FOLDER_STATUSES: TravelPackageFolder['status'][] = [
  'selected',
  'awaiting_passports',
  'awaiting_deposit',
  'reservation_pending',
  'partially_booked',
  'fully_reserved',
  'documents_pending',
  'documents_released',
  'travelling_soon',
  'travelling',
]

const PACKAGE_ATTENTION_RISKS = new Set<TravelPackageFolder['risk_level']>([
  'medium',
  'high',
  'critical',
])

export type PackageAttentionFolder = Pick<
  TravelPackageFolder,
  'id' | 'status' | 'risk_level' | 'next_action_due_at' | 'created_at' | 'updated_at'
>

export type PackageAttentionQuote = Pick<
  TravelPackageQuote,
  | 'id'
  | 'status'
  | 'selected_at'
  | 'converted_package_id'
  | 'expires_at'
  | 'created_at'
  | 'updated_at'
>

export type PackageAttentionSummary = {
  available: boolean
  attentionCount: number
  packageCount: number
  overduePackageCount: number
  criticalPackageCount: number
  highRiskPackageCount: number
  selectedQuoteCount: number
  expiredQuoteCount: number
  oldestAttentionAt: string | null
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function isActivePackageFolder(packageFolder: Pick<TravelPackageFolder, 'status'>) {
  return ACTIVE_PACKAGE_FOLDER_STATUSES.includes(packageFolder.status)
}

export function isPackageFolderOverdue(
  packageFolder: Pick<TravelPackageFolder, 'next_action_due_at'>,
  now = Date.now(),
) {
  const dueAt = timestamp(packageFolder.next_action_due_at)
  return dueAt !== null && dueAt < now
}

export function isPackageFolderNeedingAttention(
  packageFolder: Pick<TravelPackageFolder, 'status' | 'risk_level' | 'next_action_due_at'>,
  now = Date.now(),
) {
  return (
    isActivePackageFolder(packageFolder) &&
    (isPackageFolderOverdue(packageFolder, now) ||
      PACKAGE_ATTENTION_RISKS.has(packageFolder.risk_level))
  )
}

export function isPackageQuoteReadyForConversion(
  quote: Pick<TravelPackageQuote, 'selected_at' | 'converted_package_id'>,
) {
  return Boolean(quote.selected_at) && !quote.converted_package_id
}

export function isExpiredPackageQuoteToClear(
  quote: Pick<TravelPackageQuote, 'status' | 'selected_at' | 'converted_package_id' | 'expires_at'>,
  now = Date.now(),
) {
  return (
    quote.status !== 'archived' &&
    !quote.selected_at &&
    !quote.converted_package_id &&
    isPackageQuoteExpired(quote.expires_at, now)
  )
}

export function summarizePackageAttention(input: {
  folders: PackageAttentionFolder[]
  quotes: PackageAttentionQuote[]
  groupedQuoteIds: Iterable<string>
  generatedAt: string
}): PackageAttentionSummary {
  const generatedAtMs = Date.parse(input.generatedAt)
  if (!Number.isFinite(generatedAtMs)) throw new Error('Invalid generatedAt value')

  const groupedQuoteIds = new Set(input.groupedQuoteIds)
  const packages = input.folders.filter((folder) =>
    isPackageFolderNeedingAttention(folder, generatedAtMs),
  )
  const standaloneQuotes = input.quotes.filter((quote) => !groupedQuoteIds.has(quote.id))
  const selectedQuotes = standaloneQuotes.filter(isPackageQuoteReadyForConversion)
  const expiredQuotes = standaloneQuotes.filter((quote) =>
    isExpiredPackageQuoteToClear(quote, generatedAtMs),
  )
  const attentionDates = [
    ...packages.map(
      (folder) => folder.next_action_due_at || folder.updated_at || folder.created_at,
    ),
    ...selectedQuotes.map((quote) => quote.selected_at || quote.updated_at || quote.created_at),
    ...expiredQuotes.map((quote) => quote.expires_at || quote.updated_at || quote.created_at),
  ].filter((value): value is string => timestamp(value) !== null)

  attentionDates.sort((left, right) => Date.parse(left) - Date.parse(right))

  return {
    available: true,
    attentionCount: packages.length + selectedQuotes.length + expiredQuotes.length,
    packageCount: packages.length,
    overduePackageCount: packages.filter((folder) => isPackageFolderOverdue(folder, generatedAtMs))
      .length,
    criticalPackageCount: packages.filter((folder) => folder.risk_level === 'critical').length,
    highRiskPackageCount: packages.filter((folder) => folder.risk_level === 'high').length,
    selectedQuoteCount: selectedQuotes.length,
    expiredQuoteCount: expiredQuotes.length,
    oldestAttentionAt: attentionDates[0] || null,
  }
}
