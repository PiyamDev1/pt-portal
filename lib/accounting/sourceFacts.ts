export const ACCOUNTING_SOURCE_KEYS = ['ticketing', 'packages', 'pos'] as const
export type AccountingSourceKey = (typeof ACCOUNTING_SOURCE_KEYS)[number]

export const ACCOUNTING_METRIC_TYPES = [
  'commercial_margin',
  'projected_margin',
  'cash_movement',
] as const
export type AccountingMetricType = (typeof ACCOUNTING_METRIC_TYPES)[number]

export const ACCOUNTING_DATE_BASES = [
  'booking_date',
  'reservation_created_at',
  'business_date',
] as const
export type AccountingDateBasis = (typeof ACCOUNTING_DATE_BASES)[number]

export type AccountingSourceReference = {
  id: string
  label: string
  path: string
}

/**
 * Read-only reporting summary produced by an operational module.
 *
 * These values are not editable accounting postings. The owning module remains
 * the source of truth and every reference links back to that module.
 */
export type AccountingSourceSummary = {
  snapshotVersion: 1
  key: AccountingSourceKey
  label: string
  metricType: AccountingMetricType
  metricLabel: string
  dateBasis: AccountingDateBasis
  dateBasisLabel: string
  count: number
  excludedCount: number
  income: number
  expenses: number
  net: number
  includedInBranchResult: boolean
  inclusionNote: string
  sourcePath: string
  references: AccountingSourceReference[]
  referencesTruncated: boolean
  available: boolean
  warning?: string
}

export const ACCOUNTING_SOURCE_REFERENCE_LIMIT = 25
