import type {
  LowFareAdjustmentInput,
  LowFareAdjustmentResult,
  LowFareCheckInput,
  LowFareCheckResult,
  LowFareLatestAdjustment,
  LowFareLatestCheck,
  LowFareQueueFilters,
  LowFareQueueItem,
  LowFareQueuePage,
} from './types'

type ApiErrorPayload = {
  error?: string
  code?: string
  fieldErrors?: Record<string, string>
}

export class LowFareApiError extends Error {
  code?: string
  fieldErrors: Record<string, string>

  constructor(message: string, fieldErrors: Record<string, string> = {}, code?: string) {
    super(message)
    this.name = 'LowFareApiError'
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMoney(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) return false
  return Number.isFinite(Number(value))
}

function isPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNullableString(value: unknown) {
  return value === null || typeof value === 'string'
}

function isLatestAdjustment(value: unknown): value is LowFareLatestAdjustment {
  return (
    isRecord(value) &&
    typeof value.adjustmentId === 'string' &&
    isNullableString(value.previousAdjustmentId) &&
    isPositiveInteger(value.sequenceNumber) &&
    isMoney(value.originalSupplierFareGbp) &&
    isMoney(value.newSupplierFareGbp) &&
    isMoney(value.differenceGbp) &&
    typeof value.effectiveDate === 'string' &&
    typeof value.actingEmployeeId === 'string' &&
    typeof value.createdAt === 'string'
  )
}

function isLatestCheck(value: unknown): value is LowFareLatestCheck {
  return (
    isRecord(value) &&
    typeof value.checkId === 'string' &&
    isNullableString(value.currentAdjustmentId) &&
    isMoney(value.observedFareGbp) &&
    typeof value.effectiveDate === 'string' &&
    typeof value.checkedByEmployeeId === 'string' &&
    typeof value.createdAt === 'string'
  )
}

function isQueueItem(value: unknown): value is LowFareQueueItem {
  if (!isRecord(value) || !isRecord(value.airline) || !isRecord(value.owner)) return false
  if (value.latestAdjustment !== null && !isLatestAdjustment(value.latestAdjustment)) return false
  if (value.latestCheck !== null && !isLatestCheck(value.latestCheck)) return false

  return (
    typeof value.bookingId === 'string' &&
    isPositiveInteger(value.bookingVersion) &&
    typeof value.rootTransactionId === 'string' &&
    isPositiveInteger(value.rootTransactionVersion) &&
    typeof value.pnr === 'string' &&
    typeof value.airline.id === 'string' &&
    typeof value.airline.iataCode === 'string' &&
    typeof value.airline.name === 'string' &&
    isNullableString(value.departureDate) &&
    isNullableString(value.returnDate) &&
    isPositiveInteger(value.passengerCount) &&
    typeof value.owner.employeeId === 'string' &&
    typeof value.owner.fullName === 'string' &&
    typeof value.issuedDate === 'string' &&
    isMoney(value.initialSupplierFareGbp) &&
    isMoney(value.currentSupplierFareGbp) &&
    typeof value.packageMatchStatus === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isAdjustmentResult(value: unknown): value is LowFareAdjustmentResult {
  return (
    isRecord(value) &&
    typeof value.bookingId === 'string' &&
    isPositiveInteger(value.bookingVersion) &&
    typeof value.rootTransactionId === 'string' &&
    isPositiveInteger(value.rootTransactionVersion) &&
    typeof value.adjustmentId === 'string' &&
    isNullableString(value.previousAdjustmentId) &&
    isPositiveInteger(value.sequenceNumber) &&
    value.currency === 'GBP' &&
    isMoney(value.originalSupplierFareGbp) &&
    isMoney(value.newSupplierFareGbp) &&
    isMoney(value.differenceGbp) &&
    isPositiveInteger(value.passengerCount) &&
    typeof value.effectiveDate === 'string' &&
    typeof value.packageMatchStatus === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.idempotentReplay === 'boolean'
  )
}

function isCheckResult(value: unknown): value is LowFareCheckResult {
  return (
    isRecord(value) &&
    typeof value.checkId === 'string' &&
    typeof value.bookingId === 'string' &&
    isPositiveInteger(value.bookingVersion) &&
    typeof value.rootTransactionId === 'string' &&
    isPositiveInteger(value.rootTransactionVersion) &&
    isMoney(value.observedFareGbp) &&
    typeof value.effectiveDate === 'string' &&
    typeof value.packageMatchStatus === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.idempotentReplay === 'boolean'
  )
}

export async function loadLowFareQueue(
  filters: LowFareQueueFilters,
  options: { cursor?: string; signal?: AbortSignal; limit?: number } = {},
): Promise<LowFareQueuePage> {
  const search = new URLSearchParams({ limit: String(options.limit || 50) })
  const pnr = filters.pnr.trim().toUpperCase().replace(/\s+/g, '')
  const airline = filters.airline.trim().toUpperCase()

  if (pnr) search.set('pnr', pnr)
  if (airline) search.set('airline', airline)
  if (filters.owner) search.set('owner', filters.owner)
  if (filters.departureFrom) search.set('departureFrom', filters.departureFrom)
  if (filters.departureTo) search.set('departureTo', filters.departureTo)
  if (options.cursor) search.set('cursor', options.cursor)

  const response = await fetch(`/api/ticketing/fare-adjustments?${search.toString()}`, {
    cache: 'no-store',
    signal: options.signal,
  })
  const payload = (await response.json().catch(() => ({}))) as unknown

  if (!response.ok) {
    const error = isRecord(payload) ? (payload as ApiErrorPayload) : {}
    throw new LowFareApiError(
      error.error || 'Unable to load the shared Low Fare queue',
      error.fieldErrors || {},
      error.code,
    )
  }

  if (
    !isRecord(payload) ||
    !Array.isArray(payload.items) ||
    !payload.items.every(isQueueItem) ||
    !isRecord(payload.filterOptions) ||
    !Array.isArray(payload.filterOptions.owners) ||
    !payload.filterOptions.owners.every(
      (owner) =>
        isRecord(owner) &&
        typeof owner.employeeId === 'string' &&
        typeof owner.fullName === 'string',
    ) ||
    typeof payload.hasMore !== 'boolean' ||
    (payload.hasMore && (typeof payload.nextCursor !== 'string' || !payload.nextCursor)) ||
    (!payload.hasMore && payload.nextCursor !== null)
  ) {
    throw new LowFareApiError('Low Fare returned an invalid queue. Refresh and try again.')
  }

  return {
    items: payload.items,
    filterOptions: { owners: payload.filterOptions.owners },
    hasMore: payload.hasMore,
    nextCursor: payload.hasMore ? (payload.nextCursor as string) : null,
  }
}

export async function createLowFareCheck(
  input: LowFareCheckInput,
  idempotencyKey: string,
): Promise<LowFareCheckResult> {
  const response = await fetch('/api/ticketing/fare-checks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as unknown

  if (!response.ok) {
    const error = isRecord(payload) ? (payload as ApiErrorPayload) : {}
    throw new LowFareApiError(
      error.error || 'Unable to record the fare check',
      error.fieldErrors || {},
      error.code,
    )
  }
  if (!isCheckResult(payload)) {
    throw new LowFareApiError('Low Fare returned an invalid fare-check result. Refresh the queue.')
  }
  return payload
}

export async function createLowFareAdjustment(
  input: LowFareAdjustmentInput,
  idempotencyKey: string,
): Promise<LowFareAdjustmentResult> {
  const response = await fetch('/api/ticketing/fare-adjustments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as unknown

  if (!response.ok) {
    const error = isRecord(payload) ? (payload as ApiErrorPayload) : {}
    throw new LowFareApiError(
      error.error || 'Unable to record the supplier fare',
      error.fieldErrors || {},
      error.code,
    )
  }

  if (!isAdjustmentResult(payload)) {
    throw new LowFareApiError('Low Fare returned an invalid save result. Refresh the queue.')
  }

  return payload
}
