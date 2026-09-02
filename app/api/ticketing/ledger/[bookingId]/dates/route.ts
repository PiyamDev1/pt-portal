import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { canManageTicketingRecords, requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingBookingIdSchema } from '@/lib/ticketing/completionContracts'
import {
  TICKET_DATE_CORRECTION_CAPABILITY_VERSION,
  ticketingCorrectDatesSchema,
  type TicketingCorrectDatesInput,
  type TicketingCorrectDatesResult,
} from '@/lib/ticketing/dateCorrectionContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

type RouteContext = { params: Promise<{ bookingId: string }> }

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

type DateCorrectionRpcResult = {
  bookingId?: unknown
  transactionId?: unknown
  bookingVersion?: unknown
  transactionVersion?: unknown
  bookingDate?: unknown
  timeLimitAt?: unknown
  issuedAt?: unknown
  idempotentReplay?: unknown
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function currentVersions(details: string | null | undefined) {
  try {
    const parsed = JSON.parse(details || '{}') as Record<string, unknown>
    const bookingVersion = Number(parsed.bookingVersion)
    const transactionVersion = Number(parsed.transactionVersion)
    return {
      ...(Number.isSafeInteger(bookingVersion) && bookingVersion > 0 ? { bookingVersion } : {}),
      ...(Number.isSafeInteger(transactionVersion) && transactionVersion > 0
        ? { transactionVersion }
        : {}),
    }
  } catch {
    return {}
  }
}

function mutationError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')
  if (hint === 'TICKETING_RECORD_NOT_FOUND' || error.code === 'P0002') {
    return privateError('Ticket record not found.', 404)
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    return privateError(
      'This ticket changed after you opened it. Refresh the ledger and try again.',
      409,
      { code: 'VERSION_CONFLICT', currentVersions: currentVersions(error.details) },
    )
  }
  if (
    hint === 'TICKETING_IDEMPOTENCY_CONFLICT' ||
    (error.code === '22023' && /idempotency/i.test(message))
  ) {
    return privateError('This save key was already used for a different date correction.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (hint === 'TICKETING_DATE_NO_CHANGE') {
    return privateError(
      'The selected booking and issued/deadline dates are already current.',
      409,
      {
        code: 'DATE_NO_CHANGE',
      },
    )
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23514'].includes(String(error.code || ''))) {
    return privateError('Enter valid booking and issued/deadline dates.', 400)
  }
  return privateError('Unable to correct the ticket dates right now.', 500)
}

function parsedResult(
  data: unknown,
  bookingId: string,
  entry: TicketingCorrectDatesInput,
): TicketingCorrectDatesResult | null {
  const result = data as DateCorrectionRpcResult | null
  const bookingVersion = Number(result?.bookingVersion)
  const transactionVersion = Number(result?.transactionVersion)
  if (
    result?.bookingId !== bookingId ||
    result.transactionId !== entry.transactionId ||
    !Number.isSafeInteger(bookingVersion) ||
    bookingVersion < entry.expectedBookingVersion ||
    !Number.isSafeInteger(transactionVersion) ||
    transactionVersion <= entry.expectedTransactionVersion ||
    result.bookingDate !== entry.bookingDate ||
    result.timeLimitAt !== entry.timeLimitAt ||
    result.issuedAt !== entry.issuedAt ||
    typeof result.idempotentReplay !== 'boolean'
  ) {
    return null
  }
  return {
    bookingId,
    transactionId: entry.transactionId,
    bookingVersion,
    transactionVersion,
    bookingDate: entry.bookingDate,
    timeLimitAt: entry.timeLimitAt,
    issuedAt: entry.issuedAt,
    idempotentReplay: result.idempotentReplay,
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!canManageTicketingRecords(access.employee.role)) return privateError('Forbidden', 403)

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.correct-dates',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingCorrectDatesSchema,
    { maxBytes: 8 * 1024 },
  )
  if (bodyError || !entry) return privateError(bodyError || 'Invalid ticket dates.', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(capability.data, TICKET_DATE_CORRECTION_CAPABILITY_VERSION)
  ) {
    return privateError('Ticket date corrections are not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_correct_transaction_dates_2026090203', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: parsedBookingId.data,
    p_transaction_id: entry.transactionId,
    p_expected_booking_version: entry.expectedBookingVersion,
    p_expected_transaction_version: entry.expectedTransactionVersion,
    p_idempotency_key: idempotencyKey,
    p_correction: {
      operationalStatus: entry.operationalStatus,
      bookingDate: entry.bookingDate,
      timeLimitAt: entry.timeLimitAt,
      issuedAt: entry.issuedAt,
      reason: entry.reason,
    },
  })
  if (error) return mutationError(error)

  const result = parsedResult(data, parsedBookingId.data, entry)
  if (!result) return privateError('Ticketing returned an invalid date correction.', 500)
  return apiOk(result, PRIVATE_RESPONSE)
}
