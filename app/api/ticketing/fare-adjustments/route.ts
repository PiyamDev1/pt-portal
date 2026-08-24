import { Buffer } from 'node:buffer'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_FARE_ADJUSTMENT_CAPABILITY_VERSION,
  TICKET_FARE_ADJUSTMENT_MAX_FARE_GBP,
  ticketingAppendFareAdjustmentSchema,
  ticketingFareAdjustmentDateSchema,
  type TicketingAppendFareAdjustmentInput,
  type TicketingAppendFareAdjustmentResult,
  type TicketingFareAdjustmentLatest,
  type TicketingFareAdjustmentQueueItem,
} from '@/lib/ticketing/fareAdjustmentContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const PACKAGE_MATCH_STATUSES = ['unmatched', 'matched', 'ambiguous', 'manually_resolved'] as const
const COMMISSION_SCOPES = ['ticket', 'package', 'unresolved'] as const
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/

const queueQuerySchema = z
  .object({
    pnr: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
      .refine((value) => value.length >= 1 && value.length <= 20)
      .optional(),
    airline: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2}$/)
      .optional(),
    owner: z.string().uuid().optional(),
    departureFrom: ticketingFareAdjustmentDateSchema.optional(),
    departureTo: ticketingFareAdjustmentDateSchema.optional(),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,1024}$/)
      .optional(),
    limit: z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .transform(Number)
      .refine((value) => value <= MAX_PAGE_SIZE)
      .optional(),
  })
  .strict()
  .superRefine((filters, context) => {
    if (
      filters.departureFrom &&
      filters.departureTo &&
      filters.departureFrom > filters.departureTo
    ) {
      context.addIssue({
        code: 'custom',
        path: ['departureTo'],
        message: 'Departure end date cannot be before the start date',
      })
    }
  })

const queueCursorSchema = z
  .object({
    updatedAt: z
      .string()
      .max(64)
      .regex(TIMESTAMPTZ_PATTERN)
      .refine((value) => !Number.isNaN(Date.parse(value))),
    bookingId: z.string().uuid(),
    queryKey: z.string().min(1).max(512),
  })
  .strict()

type QueueFilters = Omit<z.output<typeof queueQuerySchema>, 'cursor' | 'limit'>
type Related<T> = T | T[] | null

type AirlineRow = {
  id: string
  iata_code: string
  name: string
}

type OwnerRow = {
  id: string
  full_name: string | null
}

type LocationRow = {
  timezone: string
}

type RootTransactionRow = {
  id: string
  version: number | string
  owner_employee_id: string
  service_type: string
  operational_status: string
  parent_transaction_id: string | null
  issued_at: string | null
  passenger_ticket_count: number | string
  currency: string
  supplier_cost_source: number | string | null
  supplier_cost_gbp: number | string | null
}

type BookingRow = {
  id: string
  version: number | string
  owner_employee_id: string
  pnr: string
  normalized_pnr: string | null
  departure_date: string | null
  return_date: string | null
  operational_status: string
  package_match_status: string
  commission_scope: string
  updated_at: string
  archived_at: string | null
  airlines: Related<AirlineRow>
  owner: Related<OwnerRow>
  locations: Related<LocationRow>
  root_transaction: Related<RootTransactionRow>
}

type CurrentAdjustmentRow = {
  id: string
  booking_id: string
  root_transaction_id: string
  previous_adjustment_id: string | null
  sequence_number: number | string
  acting_employee_id: string
  owner_employee_id: string
  currency: string
  original_fare_source: number | string
  original_fare_gbp: number | string
  new_fare_source: number | string
  new_fare_gbp: number | string
  difference_source: number | string
  difference_gbp: number | string
  passenger_ticket_count: number | string
  effective_on: string
  package_match_status: string
  commission_scope: string
  created_at: string
}

type FareAdjustmentRpcResult = {
  booking?: {
    id?: string
    version?: number | string
    ownerEmployeeId?: string
    locationId?: string
  }
  rootTransaction?: {
    id?: string
    version?: number | string
    passengerTicketCount?: number | string
    supplierCostSource?: number | string
    supplierCostGbp?: number | string
  }
  adjustment?: {
    id?: string
    bookingId?: string
    rootTransactionId?: string
    previousAdjustmentId?: string | null
    sequenceNumber?: number | string
    actingEmployeeId?: string
    ownerEmployeeId?: string
    actorLocationId?: string
    bookingLocationId?: string
    currency?: string
    originalFareSource?: number | string
    originalFareGbp?: number | string
    newFareSource?: number | string
    newFareGbp?: number | string
    differenceSource?: number | string
    differenceGbp?: number | string
    passengerTicketCount?: number | string
    effectiveOn?: string
    notes?: string | null
    packageMatchStatus?: string
    commissionScope?: string
    packageLinkIds?: unknown
    packageId?: string | null
    reservationId?: string | null
    groupId?: string | null
    packageType?: string | null
    createdAt?: string
  }
  sourceEvent?: {
    sourceEventId?: string
    eventType?: string
    eventVersion?: number | string
  }
  auditEventId?: string
  idempotentReplay?: boolean
}

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function exactlyOneRelated<T>(value: Related<T>) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null
  return value || null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && z.string().uuid().safeParse(value).success
}

function integer(value: unknown, minimum = 1) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null
}

function money(value: unknown, options: { signed?: boolean; allowZero?: boolean } = {}) {
  const parsed = Number(value)
  const minimum = options.allowZero ? 0 : Number.MIN_VALUE
  if (
    !Number.isFinite(parsed) ||
    (!options.signed && parsed < minimum) ||
    Math.abs(parsed) > TICKET_FARE_ADJUSTMENT_MAX_FARE_GBP ||
    Math.abs(parsed - Math.round(parsed * 100) / 100) > 0.000_000_1
  ) {
    return null
  }
  return parsed
}

function moneyCents(value: number) {
  return Math.round(value * 100)
}

function packageSnapshot(packageMatchStatus: unknown, commissionScope: unknown) {
  const matchedStatus = PACKAGE_MATCH_STATUSES.find((status) => status === packageMatchStatus)
  const matchedScope = COMMISSION_SCOPES.find((scope) => scope === commissionScope)
  const validPair =
    (matchedStatus === 'unmatched' && matchedScope === 'ticket') ||
    ((matchedStatus === 'matched' || matchedStatus === 'manually_resolved') &&
      matchedScope === 'package') ||
    (matchedStatus === 'ambiguous' && matchedScope === 'unresolved')
  return validPair && matchedStatus && matchedScope
    ? { packageMatchStatus: matchedStatus, commissionScope: matchedScope }
    : null
}

function isTimestampWithTimezone(value: unknown): value is string {
  return (
    typeof value === 'string' && TIMESTAMPTZ_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  )
}

function branchDate(value: string, timezone: string) {
  if (!isTimestampWithTimezone(value)) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(value))
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value || ''
    const result = `${part('year')}-${part('month')}-${part('day')}`
    return ticketingFareAdjustmentDateSchema.safeParse(result).success ? result : null
  } catch {
    return null
  }
}

function optionalDate(value: unknown) {
  if (value === null) return null
  return ticketingFareAdjustmentDateSchema.safeParse(value).success ? String(value) : undefined
}

function queryKey(filters: QueueFilters) {
  return JSON.stringify({
    pnr: filters.pnr || null,
    airline: filters.airline || null,
    owner: filters.owner || null,
    departureFrom: filters.departureFrom || null,
    departureTo: filters.departureTo || null,
  })
}

function parseQueueCursor(value: string, expectedQueryKey: string) {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    const parsed = queueCursorSchema.safeParse(decoded)
    return parsed.success && parsed.data.queryKey === expectedQueryKey ? parsed.data : null
  } catch {
    return null
  }
}

function createQueueCursor(row: BookingRow, filters: QueueFilters) {
  return Buffer.from(
    JSON.stringify({ updatedAt: row.updated_at, bookingId: row.id, queryKey: queryKey(filters) }),
    'utf8',
  ).toString('base64url')
}

function parseQueueQuery(request: NextRequest) {
  const supportedKeys = new Set([
    'pnr',
    'airline',
    'owner',
    'departureFrom',
    'departureTo',
    'cursor',
    'limit',
  ])
  const suppliedKeys = [...request.nextUrl.searchParams.keys()]
  if (
    suppliedKeys.some((key) => !supportedKeys.has(key)) ||
    [...supportedKeys].some((key) => request.nextUrl.searchParams.getAll(key).length > 1)
  ) {
    return null
  }

  const raw = Object.fromEntries(
    [...supportedKeys]
      .filter((key) => request.nextUrl.searchParams.has(key))
      .map((key) => [key, request.nextUrl.searchParams.get(key)]),
  )
  const parsed = queueQuerySchema.safeParse(raw)
  if (!parsed.success) return null

  const { cursor: encodedCursor, limit = DEFAULT_PAGE_SIZE, ...filters } = parsed.data
  const cursor = encodedCursor ? parseQueueCursor(encodedCursor, queryKey(filters)) : undefined
  if (encodedCursor && !cursor) return null
  return { filters, cursor, limit }
}

async function hasFareAdjustmentCapability(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return false
  const status = data as Record<string, unknown>
  return (
    status.ready === true &&
    Number(status.version || 0) >= TICKET_FARE_ADJUSTMENT_CAPABILITY_VERSION
  )
}

function latestAdjustment(
  row: CurrentAdjustmentRow,
  booking: BookingRow,
  root: RootTransactionRow,
) {
  const sequenceNumber = integer(row.sequence_number)
  const passengerCount = integer(row.passenger_ticket_count)
  const originalSupplierFareSource = money(row.original_fare_source, { allowZero: true })
  const originalSupplierFareGbp = money(row.original_fare_gbp, { allowZero: true })
  const newSupplierFareSource = money(row.new_fare_source)
  const newSupplierFareGbp = money(row.new_fare_gbp)
  const differenceSource = money(row.difference_source, { signed: true, allowZero: true })
  const differenceGbp = money(row.difference_gbp, { signed: true, allowZero: true })
  const rootSupplierFareGbp = money(root.supplier_cost_gbp, { allowZero: true })
  const adjustmentSnapshot = packageSnapshot(row.package_match_status, row.commission_scope)
  const previousIdValid =
    sequenceNumber === 1
      ? row.previous_adjustment_id === null
      : sequenceNumber !== null && isUuid(row.previous_adjustment_id)

  if (
    !isUuid(row.id) ||
    row.booking_id !== booking.id ||
    row.root_transaction_id !== root.id ||
    !previousIdValid ||
    !sequenceNumber ||
    !isUuid(row.acting_employee_id) ||
    !isUuid(row.owner_employee_id) ||
    row.currency !== 'GBP' ||
    originalSupplierFareSource === null ||
    originalSupplierFareGbp === null ||
    moneyCents(originalSupplierFareSource) !== moneyCents(originalSupplierFareGbp) ||
    rootSupplierFareGbp === null ||
    (sequenceNumber === 1 &&
      moneyCents(originalSupplierFareGbp) !== moneyCents(rootSupplierFareGbp)) ||
    newSupplierFareSource === null ||
    newSupplierFareGbp === null ||
    moneyCents(newSupplierFareSource) !== moneyCents(newSupplierFareGbp) ||
    differenceSource === null ||
    differenceGbp === null ||
    moneyCents(differenceSource) !== moneyCents(differenceGbp) ||
    differenceGbp === 0 ||
    moneyCents(differenceGbp) !==
      moneyCents(originalSupplierFareGbp) - moneyCents(newSupplierFareGbp) ||
    passengerCount !== integer(root.passenger_ticket_count) ||
    !ticketingFareAdjustmentDateSchema.safeParse(row.effective_on).success ||
    !adjustmentSnapshot ||
    !isTimestampWithTimezone(row.created_at)
  ) {
    return null
  }

  const adjustment: TicketingFareAdjustmentLatest = {
    adjustmentId: row.id,
    previousAdjustmentId: row.previous_adjustment_id,
    sequenceNumber,
    originalSupplierFareGbp,
    newSupplierFareGbp,
    differenceGbp,
    effectiveDate: row.effective_on,
    actingEmployeeId: row.acting_employee_id,
    createdAt: row.created_at,
  }
  return adjustment
}

function queueItem(row: BookingRow, adjustmentRow: CurrentAdjustmentRow | undefined) {
  const airline = exactlyOneRelated(row.airlines)
  const owner = exactlyOneRelated(row.owner)
  const location = exactlyOneRelated(row.locations)
  const root = exactlyOneRelated(row.root_transaction)
  const bookingVersion = integer(row.version)
  const rootTransactionVersion = integer(root?.version)
  const passengerCount = integer(root?.passenger_ticket_count)
  const departureDate = optionalDate(row.departure_date)
  const returnDate = optionalDate(row.return_date)
  const initialSourceFareGbp = money(root?.supplier_cost_source, { allowZero: true })
  const initialSupplierFareGbp = money(root?.supplier_cost_gbp, { allowZero: true })
  const snapshot = packageSnapshot(row.package_match_status, row.commission_scope)
  const issuedDate =
    root?.issued_at && location ? branchDate(root.issued_at, location.timezone) : null

  if (
    row.archived_at !== null ||
    row.operational_status !== 'issued' ||
    !isUuid(row.id) ||
    !bookingVersion ||
    !isTimestampWithTimezone(row.updated_at) ||
    !row.normalized_pnr ||
    row.normalized_pnr !== row.pnr.trim().toUpperCase().replace(/\s+/g, '') ||
    row.normalized_pnr.length > 20 ||
    !airline ||
    !isUuid(airline.id) ||
    !/^[A-Z0-9]{2}$/.test(airline.iata_code) ||
    typeof airline.name !== 'string' ||
    !airline.name.trim() ||
    !owner ||
    owner.id !== row.owner_employee_id ||
    !isUuid(owner.id) ||
    !location ||
    !root ||
    !isUuid(root.id) ||
    root.owner_employee_id !== row.owner_employee_id ||
    !rootTransactionVersion ||
    root.service_type !== 'TK' ||
    root.parent_transaction_id !== null ||
    root.operational_status !== 'issued' ||
    root.currency !== 'GBP' ||
    !passengerCount ||
    initialSourceFareGbp === null ||
    initialSupplierFareGbp === null ||
    moneyCents(initialSourceFareGbp) !== moneyCents(initialSupplierFareGbp) ||
    departureDate === undefined ||
    returnDate === undefined ||
    (departureDate && returnDate && returnDate < departureDate) ||
    !snapshot ||
    !issuedDate
  ) {
    return null
  }

  const latest = adjustmentRow ? latestAdjustment(adjustmentRow, row, root) : null
  if (adjustmentRow && !latest) return null

  const item: TicketingFareAdjustmentQueueItem = {
    bookingId: row.id,
    bookingVersion,
    rootTransactionId: root.id,
    rootTransactionVersion,
    pnr: row.normalized_pnr,
    airline: {
      id: airline.id,
      iataCode: airline.iata_code,
      name: airline.name,
    },
    departureDate,
    returnDate,
    passengerCount,
    owner: {
      employeeId: owner.id,
      fullName: owner.full_name?.trim() || 'Unnamed agent',
    },
    issuedDate,
    initialSupplierFareGbp,
    currentSupplierFareGbp: latest?.newSupplierFareGbp ?? initialSupplierFareGbp,
    latestAdjustment: latest,
    packageMatchStatus: snapshot.packageMatchStatus,
    updatedAt: row.updated_at,
  }
  return item
}

function parsedConflictDetails(details: string | null | undefined) {
  try {
    const value = JSON.parse(details || '{}') as Record<string, unknown>
    const bookingVersion = integer(value.bookingVersion)
    const rootTransactionVersion = integer(value.rootTransactionVersion)
    const previousAdjustmentValue =
      value.currentPreviousAdjustmentId !== undefined
        ? value.currentPreviousAdjustmentId
        : value.previousAdjustmentId
    const previousAdjustmentId =
      previousAdjustmentValue === null
        ? null
        : isUuid(previousAdjustmentValue)
          ? previousAdjustmentValue
          : undefined
    const currentSequenceNumber = integer(value.currentSequenceNumber)
    return {
      ...(bookingVersion ? { bookingVersion } : {}),
      ...(rootTransactionVersion ? { rootTransactionVersion } : {}),
      ...(previousAdjustmentId !== undefined ? { previousAdjustmentId } : {}),
      ...(currentSequenceNumber ? { sequenceNumber: currentSequenceNumber } : {}),
    }
  } catch {
    return {}
  }
}

function mutationError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')

  if (error.code === 'P0002' || hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket record not found.', 404)
  }
  if (hint === 'TICKETING_FARE_ADJUSTMENT_LINEAGE_CONFLICT') {
    const current = parsedConflictDetails(error.details)
    return privateError(
      'A newer fare adjustment already exists. Refresh the Low Fare queue before saving.',
      409,
      { code: 'LINEAGE_CONFLICT', ...(Object.keys(current).length ? { current } : {}) },
    )
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    const current = parsedConflictDetails(error.details)
    return privateError(
      'This ticket changed after you loaded it. Refresh the Low Fare queue and try again.',
      409,
      { code: 'VERSION_CONFLICT', ...(Object.keys(current).length ? { current } : {}) },
    )
  }
  if (
    hint === 'TICKETING_IDEMPOTENCY_CONFLICT' ||
    (error.code === '22023' && /idempotency/i.test(message))
  ) {
    return privateError('This save key was already used for a different fare adjustment.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (error.code === '55000' || hint === 'TICKETING_CORRECTION_REQUIRED') {
    return privateError(
      'This ticket cannot accept a fare adjustment without an audited correction.',
      409,
      { code: 'CORRECTION_REQUIRED' },
    )
  }
  if (hint === 'TICKETING_DATE_CONFLICT') {
    return privateError('The adjustment date cannot be before the ticket issue date.', 400, {
      code: 'DATE_CONFLICT',
      fieldErrors: {
        effectiveDate: 'Use the ticket issue date or a later date.',
      },
    })
  }
  if (hint === 'TICKETING_ZERO_FARE_DIFFERENCE') {
    return privateError('The new supplier fare must be different from the current fare.', 400, {
      code: 'ZERO_FARE_DIFFERENCE',
      fieldErrors: {
        newSupplierFareGbp: 'Enter a different supplier fare.',
      },
    })
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514'].includes(String(error.code || ''))) {
    return privateError('Invalid Low Fare adjustment.', 400)
  }
  return privateError('Unable to save the fare adjustment right now.', 500)
}

function nullableUuid(value: unknown) {
  return value === null || isUuid(value)
}

function mappedMutationResult(
  data: unknown,
  actorEmployeeId: string,
  entry: TicketingAppendFareAdjustmentInput,
) {
  const result = data as FareAdjustmentRpcResult | null
  const bookingVersion = integer(result?.booking?.version)
  const rootTransactionVersion = integer(result?.rootTransaction?.version)
  const rootPassengerCount = integer(result?.rootTransaction?.passengerTicketCount)
  const rootSupplierCostSource = money(result?.rootTransaction?.supplierCostSource, {
    allowZero: true,
  })
  const rootSupplierCost = money(result?.rootTransaction?.supplierCostGbp, { allowZero: true })
  const sequenceNumber = integer(result?.adjustment?.sequenceNumber)
  const originalSupplierFareSource = money(result?.adjustment?.originalFareSource, {
    allowZero: true,
  })
  const originalSupplierFareGbp = money(result?.adjustment?.originalFareGbp, { allowZero: true })
  const newSupplierFareSource = money(result?.adjustment?.newFareSource)
  const newSupplierFareGbp = money(result?.adjustment?.newFareGbp)
  const differenceSource = money(result?.adjustment?.differenceSource, {
    signed: true,
    allowZero: true,
  })
  const differenceGbp = money(result?.adjustment?.differenceGbp, {
    signed: true,
    allowZero: true,
  })
  const adjustmentPassengerCount = integer(result?.adjustment?.passengerTicketCount)
  const snapshot = packageSnapshot(
    result?.adjustment?.packageMatchStatus,
    result?.adjustment?.commissionScope,
  )
  const expectedEventType =
    differenceGbp !== null && differenceGbp > 0
      ? 'ticket_low_fare_adjusted'
      : 'ticket_higher_fare_adjusted'
  const packageLinkIdsValid =
    Array.isArray(result?.adjustment?.packageLinkIds) &&
    result.adjustment.packageLinkIds.every(isUuid)
  const packageIdsValid = [
    result?.adjustment?.packageId,
    result?.adjustment?.reservationId,
    result?.adjustment?.groupId,
  ].every(nullableUuid)
  const packageLinkCount = Array.isArray(result?.adjustment?.packageLinkIds)
    ? result.adjustment.packageLinkIds.length
    : -1
  const packageSnapshotCoherent =
    (snapshot?.packageMatchStatus === 'unmatched' &&
      snapshot.commissionScope === 'ticket' &&
      packageLinkCount === 0 &&
      result?.adjustment?.packageId === null &&
      result.adjustment.reservationId === null &&
      result.adjustment.groupId === null &&
      result.adjustment.packageType === null) ||
    (snapshot?.packageMatchStatus === 'ambiguous' &&
      snapshot.commissionScope === 'unresolved' &&
      packageLinkCount >= 2 &&
      result?.adjustment?.packageId === null &&
      result.adjustment.reservationId === null &&
      result.adjustment.groupId === null &&
      result.adjustment.packageType === null) ||
    ((snapshot?.packageMatchStatus === 'matched' ||
      snapshot?.packageMatchStatus === 'manually_resolved') &&
      snapshot.commissionScope === 'package' &&
      packageLinkCount === 1 &&
      isUuid(result?.adjustment?.packageId) &&
      isUuid(result.adjustment.reservationId) &&
      nullableUuid(result.adjustment.groupId) &&
      ['umrah', 'holiday', 'ziyarat'].includes(String(result.adjustment.packageType || '')))
  const previousAdjustmentMatches =
    result?.adjustment?.previousAdjustmentId === entry.expectedPreviousAdjustmentId &&
    ((sequenceNumber === 1 && entry.expectedPreviousAdjustmentId === null) ||
      (sequenceNumber !== null &&
        sequenceNumber > 1 &&
        entry.expectedPreviousAdjustmentId !== null))

  if (
    result?.booking?.id !== entry.bookingId ||
    !bookingVersion ||
    bookingVersion !== entry.expectedBookingVersion + 1 ||
    !isUuid(result.booking.ownerEmployeeId) ||
    !isUuid(result.booking.locationId) ||
    !isUuid(result.rootTransaction?.id) ||
    rootTransactionVersion !== entry.expectedRootTransactionVersion ||
    !rootPassengerCount ||
    rootSupplierCostSource === null ||
    rootSupplierCost === null ||
    moneyCents(rootSupplierCostSource) !== moneyCents(rootSupplierCost) ||
    !isUuid(result.adjustment?.id) ||
    result.adjustment.bookingId !== entry.bookingId ||
    result.adjustment.rootTransactionId !== result.rootTransaction.id ||
    !previousAdjustmentMatches ||
    !sequenceNumber ||
    result.adjustment.actingEmployeeId !== actorEmployeeId ||
    result.adjustment.ownerEmployeeId !== result.booking.ownerEmployeeId ||
    !isUuid(result.adjustment.actorLocationId) ||
    result.adjustment.bookingLocationId !== result.booking.locationId ||
    result.adjustment.currency !== 'GBP' ||
    originalSupplierFareSource === null ||
    originalSupplierFareGbp === null ||
    moneyCents(originalSupplierFareSource) !== moneyCents(originalSupplierFareGbp) ||
    (sequenceNumber === 1 &&
      moneyCents(originalSupplierFareGbp) !== moneyCents(rootSupplierCost)) ||
    newSupplierFareSource === null ||
    newSupplierFareGbp === null ||
    moneyCents(newSupplierFareSource) !== moneyCents(newSupplierFareGbp) ||
    moneyCents(newSupplierFareGbp) !== moneyCents(entry.newSupplierFareGbp) ||
    differenceSource === null ||
    differenceGbp === null ||
    moneyCents(differenceSource) !== moneyCents(differenceGbp) ||
    differenceGbp === 0 ||
    moneyCents(differenceGbp) !==
      moneyCents(originalSupplierFareGbp) - moneyCents(newSupplierFareGbp) ||
    adjustmentPassengerCount !== rootPassengerCount ||
    result.adjustment.effectiveOn !== entry.effectiveDate ||
    result.adjustment.notes !== entry.notes ||
    !snapshot ||
    !packageLinkIdsValid ||
    !packageIdsValid ||
    !packageSnapshotCoherent ||
    !isTimestampWithTimezone(result.adjustment.createdAt) ||
    !isUuid(result.sourceEvent?.sourceEventId) ||
    result.sourceEvent.eventType !== expectedEventType ||
    integer(result.sourceEvent.eventVersion) !== 1 ||
    !isUuid(result.auditEventId) ||
    typeof result.idempotentReplay !== 'boolean'
  ) {
    return null
  }

  const mapped: TicketingAppendFareAdjustmentResult = {
    bookingId: entry.bookingId,
    bookingVersion,
    rootTransactionId: result.rootTransaction.id,
    rootTransactionVersion,
    adjustmentId: result.adjustment.id,
    previousAdjustmentId: entry.expectedPreviousAdjustmentId,
    sequenceNumber,
    currency: 'GBP',
    originalSupplierFareGbp,
    newSupplierFareGbp,
    differenceGbp,
    passengerCount: rootPassengerCount,
    effectiveDate: entry.effectiveDate,
    packageMatchStatus: snapshot.packageMatchStatus,
    createdAt: result.adjustment.createdAt,
    idempotentReplay: result.idempotentReplay,
  }
  return mapped
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedQuery = parseQueueQuery(request)
  if (!parsedQuery) return privateError('Invalid Low Fare queue filters.', 400)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.low-fare-queue',
    limit: 120,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const supabase = getServiceSupabaseClient()
  if (!(await hasFareAdjustmentCapability(supabase))) {
    return privateError('Ticketing Low Fare is not installed on this database.', 503)
  }

  let query = supabase
    .from('ticket_bookings')
    .select(
      `
        id,
        version,
        owner_employee_id,
        pnr,
        normalized_pnr,
        departure_date,
        return_date,
        operational_status,
        package_match_status,
        commission_scope,
        updated_at,
        archived_at,
        airlines!inner(id, iata_code, name),
        owner:employees!ticket_bookings_owner_employee_id_fkey(id, full_name),
        locations!inner(timezone),
        root_transaction:ticket_transactions!inner(
          id,
          version,
          owner_employee_id,
          service_type,
          operational_status,
          parent_transaction_id,
          issued_at,
          passenger_ticket_count,
          currency,
          supplier_cost_source,
          supplier_cost_gbp
        )
      `,
    )
    .eq('operational_status', 'issued')
    .is('archived_at', null)
    .eq('root_transaction.service_type', 'TK')
    .is('root_transaction.parent_transaction_id', null)
    .eq('root_transaction.operational_status', 'issued')
    .eq('root_transaction.currency', 'GBP')
    .not('root_transaction.supplier_cost_source', 'is', null)
    .not('root_transaction.supplier_cost_gbp', 'is', null)
    .gt('root_transaction.passenger_ticket_count', 0)

  if (parsedQuery.filters.pnr) query = query.eq('normalized_pnr', parsedQuery.filters.pnr)
  if (parsedQuery.filters.airline) {
    query = query.eq('airlines.iata_code', parsedQuery.filters.airline)
  }
  if (parsedQuery.filters.owner) {
    query = query.eq('owner_employee_id', parsedQuery.filters.owner)
  }
  if (parsedQuery.filters.departureFrom) {
    query = query.gte('departure_date', parsedQuery.filters.departureFrom)
  }
  if (parsedQuery.filters.departureTo) {
    query = query.lte('departure_date', parsedQuery.filters.departureTo)
  }
  if (parsedQuery.cursor) {
    query = query.or(
      `updated_at.lt.${parsedQuery.cursor.updatedAt},and(updated_at.eq.${parsedQuery.cursor.updatedAt},id.lt.${parsedQuery.cursor.bookingId})`,
    )
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(parsedQuery.limit + 1)
  if (error) return privateError('Unable to load the Low Fare queue right now.', 500)

  const rows = (data || []) as unknown as BookingRow[]
  const hasMore = rows.length > parsedQuery.limit
  const pageRows = rows.slice(0, parsedQuery.limit)
  let adjustmentRows: CurrentAdjustmentRow[] = []

  if (pageRows.length > 0) {
    const currentResult = await supabase
      .from('ticket_fare_adjustment_current')
      .select(
        `
          id,
          booking_id,
          root_transaction_id,
          previous_adjustment_id,
          sequence_number,
          acting_employee_id,
          owner_employee_id,
          currency,
          original_fare_source,
          original_fare_gbp,
          new_fare_source,
          new_fare_gbp,
          difference_source,
          difference_gbp,
          passenger_ticket_count,
          effective_on,
          package_match_status,
          commission_scope,
          created_at
        `,
      )
      .in(
        'booking_id',
        pageRows.map((row) => row.id),
      )
    if (currentResult.error) {
      return privateError('Unable to load the latest fare adjustments right now.', 500)
    }
    adjustmentRows = (currentResult.data || []) as unknown as CurrentAdjustmentRow[]
  }

  const pageIds = new Set(pageRows.map((row) => row.id))
  const adjustmentByBookingId = new Map<string, CurrentAdjustmentRow>()
  for (const adjustment of adjustmentRows) {
    if (!pageIds.has(adjustment.booking_id) || adjustmentByBookingId.has(adjustment.booking_id)) {
      return privateError('Unable to load the Low Fare queue safely.', 500)
    }
    adjustmentByBookingId.set(adjustment.booking_id, adjustment)
  }

  const items = pageRows.map((row) => queueItem(row, adjustmentByBookingId.get(row.id)))
  if (items.some((item) => item === null)) {
    return privateError('Unable to load the Low Fare queue safely.', 500)
  }

  return apiOk(
    {
      items,
      hasMore,
      nextCursor:
        hasMore && pageRows.length > 0
          ? createQueueCursor(pageRows[pageRows.length - 1], parsedQuery.filters)
          : null,
    },
    PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.append-fare-adjustment',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingAppendFareAdjustmentSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !entry) {
    return privateError(bodyError || 'Invalid Low Fare adjustment.', 400)
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (
    !idempotencyKey ||
    idempotencyKey.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(idempotencyKey)
  ) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await hasFareAdjustmentCapability(supabase))) {
    return privateError('Ticketing Low Fare is not installed on this database.', 503)
  }

  const { bookingId, newSupplierFareGbp, effectiveDate, ...publicEntry } = entry
  const rpcEntry = {
    ...publicEntry,
    newFareGbp: newSupplierFareGbp,
    effectiveOn: effectiveDate,
  }
  const { data, error } = await supabase.rpc('ticketing_append_fare_adjustment', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: bookingId,
    p_idempotency_key: idempotencyKey,
    p_entry: rpcEntry,
  })
  if (error) return mutationError(error)

  const result = mappedMutationResult(data, access.employee.id, entry)
  if (!result) return privateError('Ticketing returned an invalid fare-adjustment result.', 500)

  return apiOk(result, {
    status: result.idempotentReplay ? 200 : 201,
    ...PRIVATE_RESPONSE,
  })
}
