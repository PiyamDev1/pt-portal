import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingBookingIdSchema } from '@/lib/ticketing/completionContracts'
import {
  TICKET_SERVICE_TRANSACTION_TYPES,
  ticketingAppendServiceTransactionSchema,
} from '@/lib/ticketing/serviceTransactionContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const TICKETING_SERVICE_TRANSACTION_VERSION = 2026082304
const PACKAGE_MATCH_STATUSES = ['unmatched', 'matched', 'ambiguous', 'manually_resolved'] as const
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/

type ServiceTransactionRpcResult = {
  booking?: { id?: string; version?: number | string }
  rootTransaction?: { id?: string; version?: number | string; serviceType?: string }
  transaction?: {
    id?: string
    version?: number | string
    parentTransactionId?: string
    serviceType?: string
    operationalStatus?: string
    paymentStatus?: string
    bookingDate?: string
    issuedAt?: string
    issuedOn?: string
    paidAt?: string | null
    paidOn?: string | null
    currency?: string
    passengerTicketCount?: number | string
  }
  packageMatch?: { status?: string }
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

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isTimestampWithTimezone(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    TIMESTAMPTZ_PATTERN.test(value) &&
    isIsoCalendarDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value))
  )
}

async function hasServiceTransactionCapability(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return false
  const status = data as Record<string, unknown>
  return (
    status.ready === true && Number(status.version || 0) >= TICKETING_SERVICE_TRANSACTION_VERSION
  )
}

function parsedCurrentVersions(details: string | null | undefined) {
  try {
    const value = JSON.parse(details || '{}') as Record<string, unknown>
    const bookingVersion = Number(value.bookingVersion)
    const rootTransactionVersion = Number(value.rootTransactionVersion)
    if (
      !Number.isSafeInteger(bookingVersion) ||
      bookingVersion < 1 ||
      !Number.isSafeInteger(rootTransactionVersion) ||
      rootTransactionVersion < 1
    ) {
      return undefined
    }
    return { bookingVersion, rootTransactionVersion }
  } catch {
    return undefined
  }
}

function mutationError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')

  if (error.code === 'P0002' || hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket record not found.', 404)
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    const currentVersions = parsedCurrentVersions(error.details)
    return privateError(
      'This ticket changed after you selected it. Refresh the PNR and review your entry.',
      409,
      {
        code: 'VERSION_CONFLICT',
        ...(currentVersions ? { currentVersions } : {}),
      },
    )
  }
  if (
    hint === 'TICKETING_IDEMPOTENCY_CONFLICT' ||
    (error.code === '22023' && /idempotency/i.test(message))
  ) {
    return privateError('This save key was already used for a different service entry.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (hint === 'TICKETING_AFFECTED_QUANTITY_EXCEEDED') {
    return privateError(
      'Affected passenger quantities exceed the original TK passenger mix.',
      400,
      {
        code: 'AFFECTED_QUANTITY_EXCEEDED',
      },
    )
  }
  if (hint === 'TICKETING_SERVICE_DATE_BEFORE_ROOT') {
    return privateError('DC/R-ER dates cannot be before the original TK issue date.', 400, {
      code: 'SERVICE_DATE_BEFORE_ROOT',
    })
  }
  if (hint === 'TICKETING_REISSUE_DATE_BEFORE_PREDECESSOR') {
    return privateError('A reissue cannot be dated before the ticket it supersedes.', 400, {
      code: 'REISSUE_DATE_BEFORE_PREDECESSOR',
    })
  }
  if (hint === 'TICKETING_REISSUE_CHAIN_CONFLICT') {
    return privateError(
      'This ticket already has a later reissue. Refresh the PNR before making a correction.',
      409,
      {
        code: 'CORRECTION_REQUIRED',
      },
    )
  }
  if (error.code === '55000' || hint === 'TICKETING_CORRECTION_REQUIRED') {
    return privateError(
      'This ticket cannot accept a DC/R-ER entry without an audited correction.',
      409,
      {
        code: 'CORRECTION_REQUIRED',
      },
    )
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514'].includes(String(error.code || ''))) {
    return privateError('Invalid DC/R-ER entry.', 400)
  }
  return privateError('Unable to save the DC/R-ER entry right now.', 500)
}

function mappedResult(
  data: unknown,
  bookingId: string,
  expectedBookingVersion: number,
  expectedRootTransactionVersion: number,
  expectedServiceType: (typeof TICKET_SERVICE_TRANSACTION_TYPES)[number],
  expectedPaymentStatus: 'unpaid' | 'paid',
  expectedBookingDate: string,
  expectedIssuedOn: string,
  expectedPaidOn: string | null,
  expectedPassengerCount: number,
) {
  const result = data as ServiceTransactionRpcResult | null
  const bookingVersion = Number(result?.booking?.version)
  const rootTransactionVersion = Number(result?.rootTransaction?.version)
  const transactionVersion = Number(result?.transaction?.version)
  const passengerCount = Number(result?.transaction?.passengerTicketCount)
  const packageMatchStatus = PACKAGE_MATCH_STATUSES.find(
    (status) => status === result?.packageMatch?.status,
  )
  const idempotentReplay = result?.idempotentReplay
  const paymentDatesMatch =
    expectedPaymentStatus === 'paid'
      ? isTimestampWithTimezone(result?.transaction?.paidAt) &&
        result?.transaction?.paidOn === expectedPaidOn
      : result?.transaction?.paidAt === null && result?.transaction?.paidOn === null

  if (
    result?.booking?.id !== bookingId ||
    !Number.isSafeInteger(bookingVersion) ||
    bookingVersion <= expectedBookingVersion ||
    !result.rootTransaction?.id ||
    !ticketingBookingIdSchema.safeParse(result.rootTransaction.id).success ||
    result.rootTransaction.serviceType !== 'TK' ||
    rootTransactionVersion !== expectedRootTransactionVersion ||
    !result.transaction?.id ||
    !ticketingBookingIdSchema.safeParse(result.transaction.id).success ||
    !Number.isSafeInteger(transactionVersion) ||
    transactionVersion < 1 ||
    result.transaction.parentTransactionId !== result.rootTransaction.id ||
    result.transaction.serviceType !== expectedServiceType ||
    result.transaction.operationalStatus !== 'issued' ||
    result.transaction.paymentStatus !== expectedPaymentStatus ||
    result.transaction.bookingDate !== expectedBookingDate ||
    !isTimestampWithTimezone(result.transaction.issuedAt) ||
    result.transaction.issuedOn !== expectedIssuedOn ||
    !paymentDatesMatch ||
    result.transaction.currency !== 'GBP' ||
    !Number.isInteger(passengerCount) ||
    passengerCount !== expectedPassengerCount ||
    !packageMatchStatus ||
    typeof idempotentReplay !== 'boolean'
  ) {
    return null
  }

  return {
    bookingId,
    bookingVersion,
    rootTransactionId: result.rootTransaction.id,
    rootTransactionVersion,
    transactionId: result.transaction.id,
    transactionVersion,
    serviceType: expectedServiceType,
    operationalStatus: 'issued' as const,
    paymentStatus: expectedPaymentStatus,
    passengerCount,
    packageMatchStatus,
    idempotentReplay,
  }
}

type RouteContext = { params: Promise<{ bookingId: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.append-service-transaction',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingAppendServiceTransactionSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !entry) return privateError(bodyError || 'Invalid DC/R-ER entry.', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await hasServiceTransactionCapability(supabase))) {
    return privateError('Ticketing DC/R-ER entry is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_append_service_transaction', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: parsedBookingId.data,
    p_idempotency_key: idempotencyKey,
    p_entry: entry,
  })
  if (error) return mutationError(error)

  const result = mappedResult(
    data,
    parsedBookingId.data,
    entry.expectedBookingVersion,
    entry.expectedRootTransactionVersion,
    entry.serviceType,
    entry.paymentStatus,
    entry.bookingDate,
    entry.issuedAt,
    entry.paidAt,
    entry.fares.reduce((total, fare) => total + fare.quantity, 0),
  )
  if (!result) return privateError('Ticketing returned an invalid service-entry result.', 500)

  return apiOk(result, {
    status: result.idempotentReplay ? 200 : 201,
    ...PRIVATE_RESPONSE,
  })
}
