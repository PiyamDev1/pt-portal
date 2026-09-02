export type CommissionReviewBatchState =
  | 'draft'
  | 'submitted_to_accounting'
  | 'returned'
  | 'approved_locked'
  | string

export type CommissionReviewCurrencyTotal = {
  currency: string
  amount: number
}

export type CommissionReviewBatchSummary = {
  id: string
  revision: number
  state: CommissionReviewBatchState
  contentHash: string | null
  periodStart: string | null
  periodEnd: string | null
  preparedAt: string | null
  preparedByEmployeeId: string | null
  preparedByName: string | null
  submittedAt: string | null
  submittedByEmployeeId: string | null
  submittedByName: string | null
  returnedAt: string | null
  returnedByEmployeeId: string | null
  returnReason: string | null
  approvedAt: string | null
  approvedByEmployeeId: string | null
  approvedByName: string | null
  employeeCount: number
  entryCount: number
  totalGbp: number
  totalsByCurrency: CommissionReviewCurrencyTotal[]
  isStale: boolean
  canApprove: boolean
  canReturn: boolean
}

export type CommissionReviewStaffLine = {
  employeeId: string | null
  employeeName: string
  currency: string
  salary: number
  ticketing: number
  applications: number
  packages: number
  bonus: number
  penalties: number
  refunds: number
  netAmount: number
  totalGbp: number
}

export type CommissionReviewEntry = {
  id: string
  employeeId: string | null
  employeeName: string
  sourceModule: string
  serviceCode: string
  entryKind: string
  earningOn: string | null
  currency: string
  amount: number
  amountGbp: number
  detail: string | null
  reference: string | null
}

export type CommissionReviewEvent = {
  id: string
  action: string
  actorName: string | null
  reason: string | null
  createdAt: string | null
}

export type CommissionReviewBatchList = {
  items: CommissionReviewBatchSummary[]
  total: number | null
  hasMore: boolean
  limit: number
  offset: number
}

export type CommissionReviewBatchDetail = {
  batch: CommissionReviewBatchSummary
  staff: CommissionReviewStaffLine[]
  entries: CommissionReviewEntry[]
  events: CommissionReviewEvent[]
  warnings: string[]
}

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function first(row: JsonObject, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key]
  }
  return undefined
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function nullableText(value: unknown) {
  const valueText = text(value)
  return valueText || null
}

function firstNonEmptyText(...values: unknown[]) {
  for (const value of values) {
    const valueText = nullableText(value)
    if (valueText) return valueText
  }
  return null
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function integer(value: unknown, fallback = 0) {
  return Math.max(0, Math.trunc(number(value, fallback)))
}

function boolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function normalizeCurrencyTotals(value: unknown): CommissionReviewCurrencyTotal[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const row = object(item)
        const currency = text(first(row, 'currency', 'code', 'payCurrency', 'pay_currency'))
        if (!currency) return null
        return {
          currency: currency.toUpperCase(),
          amount: number(first(row, 'amount', 'total', 'netAmount', 'net_amount')),
        }
      })
      .filter((item): item is CommissionReviewCurrencyTotal => Boolean(item))
  }

  const totals = object(value)
  return Object.entries(totals)
    .filter(([, amount]) => Number.isFinite(Number(amount)))
    .map(([currency, amount]) => ({ currency: currency.toUpperCase(), amount: number(amount) }))
}

export function normalizeCommissionReviewBatch(value: unknown): CommissionReviewBatchSummary {
  const row = object(value)
  const state = text(first(row, 'state', 'status', 'batchState', 'batch_state'), 'unknown')
  const actionable = state === 'submitted_to_accounting'

  return {
    id: text(first(row, 'id', 'batchId', 'batch_id')),
    revision: integer(first(row, 'revision', 'batchRevision', 'batch_revision'), 1),
    state,
    contentHash: nullableText(first(row, 'contentHash', 'content_hash')),
    periodStart: nullableText(first(row, 'periodStart', 'period_start')),
    periodEnd: nullableText(first(row, 'periodEnd', 'period_end')),
    preparedAt: nullableText(first(row, 'preparedAt', 'prepared_at')),
    preparedByEmployeeId: nullableText(first(row, 'preparedBy', 'prepared_by')),
    preparedByName: nullableText(first(row, 'preparedByName', 'prepared_by_name')),
    submittedAt: nullableText(first(row, 'submittedAt', 'submitted_at')),
    submittedByEmployeeId: nullableText(first(row, 'submittedBy', 'submitted_by')),
    submittedByName: nullableText(first(row, 'submittedByName', 'submitted_by_name')),
    returnedAt: nullableText(first(row, 'returnedAt', 'returned_at')),
    returnedByEmployeeId: nullableText(first(row, 'returnedBy', 'returned_by')),
    returnReason: nullableText(
      first(row, 'returnReason', 'return_reason', 'returnedReason', 'returned_reason'),
    ),
    approvedAt: nullableText(first(row, 'approvedAt', 'approved_at')),
    approvedByEmployeeId: nullableText(first(row, 'approvedBy', 'approved_by')),
    approvedByName: nullableText(first(row, 'approvedByName', 'approved_by_name')),
    employeeCount: integer(
      first(row, 'employeeCount', 'employee_count', 'staffCount', 'staff_count'),
    ),
    entryCount: integer(first(row, 'entryCount', 'entry_count')),
    totalGbp: number(first(row, 'totalGbp', 'total_gbp', 'netGbp', 'net_gbp')),
    totalsByCurrency: normalizeCurrencyTotals(
      first(
        row,
        'totalsByCurrency',
        'totals_by_currency',
        'currencyTotals',
        'currency_totals',
        'nativeCurrencyTotals',
        'native_currency_totals',
      ),
    ),
    isStale: boolean(first(row, 'isStale', 'is_stale')),
    canApprove: boolean(first(row, 'canApprove', 'can_approve'), actionable),
    canReturn: boolean(first(row, 'canReturn', 'can_return'), actionable),
  }
}

function normalizeStaffLine(value: unknown): CommissionReviewStaffLine {
  const row = object(value)
  return {
    employeeId: nullableText(first(row, 'employeeId', 'employee_id', 'recipientEmployeeId')),
    employeeName: text(
      first(row, 'employeeName', 'employee_name', 'recipientName', 'staffName', 'staff_name'),
      'Unknown employee',
    ),
    currency: text(first(row, 'currency', 'payCurrency', 'pay_currency'), 'GBP').toUpperCase(),
    salary: number(first(row, 'salary', 'salaryAmount', 'salary_amount')),
    ticketing: number(first(row, 'ticketing', 'ticketingAmount', 'ticketing_amount')),
    applications: number(first(row, 'applications', 'applicationAmount', 'application_amount')),
    packages: number(first(row, 'packages', 'packageAmount', 'package_amount')),
    bonus: number(first(row, 'bonus', 'bonusAmount', 'bonus_amount')),
    penalties: number(first(row, 'penalties', 'penaltyAmount', 'penalty_amount')),
    refunds: number(first(row, 'refunds', 'refundAmount', 'refund_amount')),
    netAmount: number(first(row, 'netAmount', 'net_amount', 'total', 'amount')),
    totalGbp: number(first(row, 'totalGbp', 'total_gbp', 'netGbp', 'net_gbp')),
  }
}

function normalizeEntry(value: unknown): CommissionReviewEntry {
  const row = object(value)
  const snapshot = object(first(row, 'snapshot'))
  const explanation = object(first(snapshot, 'explanation'))
  const evidence = object(first(snapshot, 'evidence'))
  return {
    id: text(first(row, 'id', 'entryId', 'entry_id')),
    employeeId: nullableText(
      first(row, 'employeeId', 'employee_id', 'recipientEmployeeId', 'recipient_employee_id'),
    ),
    employeeName: text(
      first(row, 'employeeName', 'employee_name', 'recipientName', 'recipient_name'),
      'Unknown employee',
    ),
    sourceModule: text(first(row, 'sourceModule', 'source_module'), 'other'),
    serviceCode: text(first(row, 'serviceCode', 'service_code'), 'other'),
    entryKind: text(first(row, 'entryKind', 'entry_kind'), 'ordinary'),
    earningOn: nullableText(first(row, 'earningOn', 'earning_on')),
    currency: text(first(row, 'payCurrency', 'pay_currency', 'currency'), 'GBP').toUpperCase(),
    amount: number(
      first(row, 'amountPayCurrency', 'amount_pay_currency', 'nativeAmount', 'native_amount'),
    ),
    amountGbp: number(first(row, 'amountGbp', 'amount_gbp')),
    detail: firstNonEmptyText(snapshot.reason, snapshot.profileLabel, explanation.reason),
    reference: firstNonEmptyText(
      evidence.reference,
      evidence.referenceNumber,
      evidence.reference_number,
      snapshot.sourceCaseKey,
      snapshot.sourceEventId,
      first(row, 'adjustmentId', 'adjustment_id'),
      first(row, 'sourceEntryId', 'source_entry_id'),
      first(row, 'profileId', 'profile_id'),
    ),
  }
}

function normalizeEvent(value: unknown): CommissionReviewEvent {
  const row = object(value)
  return {
    id: text(first(row, 'id', 'eventId', 'event_id')),
    action: text(first(row, 'action', 'eventType', 'event_type'), 'updated'),
    actorName: nullableText(first(row, 'actorName', 'actor_name', 'employeeName', 'employee_name')),
    reason: nullableText(first(row, 'reason', 'note')),
    createdAt: nullableText(first(row, 'createdAt', 'created_at')),
  }
}

function entryCategory(entry: CommissionReviewEntry) {
  const sourceModule = entry.sourceModule.toLowerCase()
  const serviceCode = entry.serviceCode.toLowerCase()
  const entryKind = entry.entryKind.toLowerCase()

  if (entryKind.includes('adjustment') || sourceModule.includes('adjustment')) return 'penalties'
  if (entryKind.includes('refund') || serviceCode.includes('refund')) return 'refunds'
  if (entryKind.includes('bonus') || serviceCode.includes('bonus')) return 'bonus'
  if (serviceCode.includes('salary') || sourceModule.includes('salary')) return 'salary'
  if (sourceModule.includes('ticket')) return 'ticketing'
  if (sourceModule.includes('application')) return 'applications'
  if (sourceModule.includes('package')) return 'packages'
  return null
}

function aggregateStaffFromEntries(entries: CommissionReviewEntry[]) {
  const staff = new Map<string, CommissionReviewStaffLine>()

  for (const entry of entries) {
    const key = `${entry.employeeId || entry.employeeName}\u0000${entry.currency}`
    const current = staff.get(key) || {
      employeeId: entry.employeeId,
      employeeName: entry.employeeName,
      currency: entry.currency,
      salary: 0,
      ticketing: 0,
      applications: 0,
      packages: 0,
      bonus: 0,
      penalties: 0,
      refunds: 0,
      netAmount: 0,
      totalGbp: 0,
    }
    const category = entryCategory(entry)
    if (category) current[category] += entry.amount
    current.netAmount += entry.amount
    current.totalGbp += entry.amountGbp
    staff.set(key, current)
  }

  return [...staff.values()]
}

function staffFromStatements(values: unknown[]) {
  return values.flatMap((value) => {
    const row = object(value)
    const explicitlyCategorized = [
      'salary',
      'ticketing',
      'applications',
      'packages',
      'bonus',
      'penalties',
      'refunds',
      'netAmount',
      'net_amount',
    ].some((key) => row[key] !== undefined)
    if (explicitlyCategorized) return [normalizeStaffLine(row)]

    const currencyTotals = normalizeCurrencyTotals(
      first(row, 'nativeCurrencyTotals', 'native_currency_totals', 'totalsByCurrency'),
    )
    if (!currencyTotals.length) return [normalizeStaffLine(row)]

    return currencyTotals.map((total, index) => ({
      employeeId: nullableText(first(row, 'employeeId', 'employee_id')),
      employeeName: text(first(row, 'employeeName', 'employee_name'), 'Unknown employee'),
      currency: total.currency,
      salary: 0,
      ticketing: 0,
      applications: 0,
      packages: 0,
      bonus: 0,
      penalties: 0,
      refunds: 0,
      netAmount: total.amount,
      totalGbp:
        currencyTotals.length === 1 || index === 0
          ? number(first(row, 'totalGbp', 'total_gbp'))
          : 0,
    }))
  })
}

export function normalizeCommissionReviewBatchList(
  value: unknown,
  requested: { limit: number; offset: number },
): CommissionReviewBatchList {
  const envelope = object(value)
  const rawItems = Array.isArray(value)
    ? value
    : array(first(envelope, 'items', 'batches', 'rows', 'data'))
  const items = rawItems.map(normalizeCommissionReviewBatch).filter((item) => item.id)
  const pagination = object(first(envelope, 'pagination', 'page'))
  const firstItem = object(rawItems[0])
  const totalValue =
    first(envelope, 'total', 'totalCount', 'total_count') ??
    first(pagination, 'total') ??
    first(firstItem, 'totalCount', 'total_count')
  const hasMoreValue = first(envelope, 'hasMore', 'has_more') ?? first(pagination, 'hasMore')
  const total = totalValue === undefined ? null : integer(totalValue)

  return {
    items,
    total,
    hasMore: boolean(
      hasMoreValue,
      total === null ? items.length === requested.limit : requested.offset + items.length < total,
    ),
    limit: integer(first(envelope, 'limit') ?? first(pagination, 'limit'), requested.limit),
    offset: integer(first(envelope, 'offset') ?? first(pagination, 'offset'), requested.offset),
  }
}

export function normalizeCommissionReviewBatchDetail(
  value: unknown,
): CommissionReviewBatchDetail | null {
  const row = Array.isArray(value) ? object(value[0]) : object(value)
  if (!Object.keys(row).length) return null

  const batchValue = first(row, 'batch', 'reviewBatch', 'review_batch') ?? row
  const batch = normalizeCommissionReviewBatch(batchValue)
  if (!batch.id) return null

  const statementRows = array(
    first(row, 'staff', 'statements', 'employees', 'staffBreakdown', 'staff_breakdown'),
  )
  const entries = array(first(row, 'entries', 'batchEntries', 'batch_entries')).map(normalizeEntry)
  const events = array(first(row, 'events', 'history', 'auditEvents', 'audit_events')).map(
    normalizeEvent,
  )
  const warnings = array(first(row, 'warnings', 'readinessWarnings', 'readiness_warnings'))
    .map((warning) =>
      typeof warning === 'string'
        ? warning.trim()
        : text(first(object(warning), 'message', 'reason', 'label')),
    )
    .filter(Boolean)

  if (!batch.employeeCount) batch.employeeCount = statementRows.length
  if (!batch.entryCount) batch.entryCount = entries.length
  if (!batch.totalGbp && statementRows.length) {
    batch.totalGbp = statementRows.reduce<number>(
      (sum, statement) => sum + number(first(object(statement), 'totalGbp', 'total_gbp')),
      0,
    )
  }
  if (!batch.totalsByCurrency.length && statementRows.length) {
    const totals = new Map<string, number>()
    for (const statement of statementRows) {
      for (const total of normalizeCurrencyTotals(
        first(
          object(statement),
          'nativeCurrencyTotals',
          'native_currency_totals',
          'totalsByCurrency',
        ),
      )) {
        totals.set(total.currency, (totals.get(total.currency) || 0) + total.amount)
      }
    }
    batch.totalsByCurrency = [...totals.entries()].map(([currency, amount]) => ({
      currency,
      amount,
    }))
  }

  return {
    batch,
    staff: entries.length ? aggregateStaffFromEntries(entries) : staffFromStatements(statementRows),
    entries,
    events,
    warnings,
  }
}
