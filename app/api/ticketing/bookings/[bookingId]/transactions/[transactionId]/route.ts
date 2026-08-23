import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingBookingIdSchema } from '@/lib/ticketing/completionContracts'
import {
  TICKET_SERVICE_TRANSACTION_TYPES,
  ticketingMarkServiceTransactionPaidSchema,
} from '@/lib/ticketing/serviceTransactionContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const TICKETING_SERVICE_TRANSACTION_VERSION = 2026082304
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/

type PaymentRpcResult = {
  booking?: { id?: string; version?: number | string }
  transaction?: {
    id?: string
    version?: number | string
    parentTransactionId?: string
    serviceType?: string
    operationalStatus?: string
    paymentStatus?: string
    bookingDate?: string
    issuedOn?: string
    paidAt?: string | null
    paidOn?: string | null
    currency?: string
    passengerTicketCount?: number | string
  }
  changed?: boolean
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
    const transactionVersion = Number(value.transactionVersion)
    if (
      !Number.isSafeInteger(bookingVersion) ||
      bookingVersion < 1 ||
      !Number.isSafeInteger(transactionVersion) ||
      transactionVersion < 1
    ) {
      return undefined
    }
    return { bookingVersion, transactionVersion }
  } catch {
    return undefined
  }
}

function mutationError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')

  if (error.code === 'P0002' || hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket service transaction not found.', 404)
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    const currentVersions = parsedCurrentVersions(error.details)
    return privateError(
      'This ticket changed after you opened it. Refresh and review the payment.',
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
    return privateError('This save key was already used for a different service payment.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (error.code === '55000' || hint === 'TICKETING_CORRECTION_REQUIRED') {
    return privateError('This service payment requires an audited correction.', 409, {
      code: 'CORRECTION_REQUIRED',
    })
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514'].includes(String(error.code || ''))) {
    return privateError('Invalid service payment.', 400)
  }
  return privateError('Unable to mark the service transaction paid right now.', 500)
}

function mappedResult(
  data: unknown,
  bookingId: string,
  transactionId: string,
  expectedBookingVersion: number,
  expectedTransactionVersion: number,
  paidAt: string,
) {
  const result = data as PaymentRpcResult | null
  const bookingVersion = Number(result?.booking?.version)
  const transactionVersion = Number(result?.transaction?.version)
  const passengerCount = Number(result?.transaction?.passengerTicketCount)
  const serviceType = TICKET_SERVICE_TRANSACTION_TYPES.find(
    (type) => type === result?.transaction?.serviceType,
  )
  const changed = result?.changed
  const idempotentReplay = result?.idempotentReplay

  if (
    result?.booking?.id !== bookingId ||
    result?.transaction?.id !== transactionId ||
    !Number.isSafeInteger(bookingVersion) ||
    bookingVersion < expectedBookingVersion ||
    !Number.isSafeInteger(transactionVersion) ||
    transactionVersion < expectedTransactionVersion ||
    !result.transaction.parentTransactionId ||
    !ticketingBookingIdSchema.safeParse(result.transaction.parentTransactionId).success ||
    !serviceType ||
    result.transaction.operationalStatus !== 'issued' ||
    result.transaction.paymentStatus !== 'paid' ||
    !isIsoCalendarDate(result.transaction.bookingDate) ||
    !isIsoCalendarDate(result.transaction.issuedOn) ||
    result.transaction.issuedOn < result.transaction.bookingDate ||
    !isTimestampWithTimezone(result.transaction.paidAt) ||
    result.transaction.paidOn !== paidAt ||
    result.transaction.paidOn < result.transaction.bookingDate ||
    result.transaction.currency !== 'GBP' ||
    !Number.isInteger(passengerCount) ||
    passengerCount < 1 ||
    passengerCount > 99 ||
    typeof changed !== 'boolean' ||
    typeof idempotentReplay !== 'boolean' ||
    (changed &&
      (bookingVersion <= expectedBookingVersion ||
        transactionVersion <= expectedTransactionVersion)) ||
    (!changed &&
      (bookingVersion !== expectedBookingVersion ||
        transactionVersion !== expectedTransactionVersion))
  ) {
    return null
  }

  return {
    bookingId,
    bookingVersion,
    transactionId,
    transactionVersion,
    serviceType,
    operationalStatus: 'issued' as const,
    paymentStatus: 'paid' as const,
    paidAt: result.transaction.paidOn,
    passengerCount,
    changed,
    idempotentReplay,
  }
}

type RouteContext = {
  params: Promise<{ bookingId: string; transactionId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const path = await params
  const parsedBookingId = ticketingBookingIdSchema.safeParse(path.bookingId)
  const parsedTransactionId = ticketingBookingIdSchema.safeParse(path.transactionId)
  if (!parsedBookingId.success || !parsedTransactionId.success) {
    return privateError('Ticket service transaction not found.', 404)
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.mark-service-transaction-paid',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: payment, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingMarkServiceTransactionPaidSchema,
    { maxBytes: 8 * 1024 },
  )
  if (bodyError || !payment) return privateError(bodyError || 'Invalid service payment.', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await hasServiceTransactionCapability(supabase))) {
    return privateError('Ticketing DC/R-ER entry is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_mark_service_transaction_paid', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: parsedBookingId.data,
    p_transaction_id: parsedTransactionId.data,
    p_idempotency_key: idempotencyKey,
    p_payment: payment,
  })
  if (error) return mutationError(error)

  const result = mappedResult(
    data,
    parsedBookingId.data,
    parsedTransactionId.data,
    payment.expectedBookingVersion,
    payment.expectedTransactionVersion,
    payment.paidAt,
  )
  if (!result) return privateError('Ticketing returned an invalid payment result.', 500)

  return apiOk(result, PRIVATE_RESPONSE)
}
