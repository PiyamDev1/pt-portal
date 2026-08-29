import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_FARE_ADJUSTMENT_CAPABILITY_VERSION,
  ticketingRecordFareCheckSchema,
  type TicketingRecordFareCheckInput,
  type TicketingRecordFareCheckResult,
} from '@/lib/ticketing/fareAdjustmentContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

type RpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

type RpcResult = {
  checkId?: unknown
  bookingId?: unknown
  bookingVersion?: unknown
  rootTransactionId?: unknown
  rootTransactionVersion?: unknown
  observedFareGbp?: unknown
  effectiveDate?: unknown
  packageMatchStatus?: unknown
  createdAt?: unknown
  idempotentReplay?: unknown
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function integer(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function money(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) &&
    parsed >= 0 &&
    Math.abs(parsed - Math.round(parsed * 100) / 100) <= 0.000_000_1
    ? parsed
    : null
}

function mapResult(data: unknown, entry: TicketingRecordFareCheckInput) {
  const result = data as RpcResult | null
  const bookingVersion = integer(result?.bookingVersion)
  const rootTransactionVersion = integer(result?.rootTransactionVersion)
  const observedFareGbp = money(result?.observedFareGbp)
  const packageMatchStatus = ['unmatched', 'matched', 'ambiguous', 'manually_resolved'].find(
    (status) => status === result?.packageMatchStatus,
  ) as TicketingRecordFareCheckResult['packageMatchStatus'] | undefined

  if (
    !z.string().uuid().safeParse(result?.checkId).success ||
    result?.bookingId !== entry.bookingId ||
    !bookingVersion ||
    !z.string().uuid().safeParse(result?.rootTransactionId).success ||
    !rootTransactionVersion ||
    observedFareGbp === null ||
    result?.effectiveDate !== entry.effectiveDate ||
    !packageMatchStatus ||
    typeof result?.createdAt !== 'string' ||
    Number.isNaN(Date.parse(result.createdAt)) ||
    typeof result?.idempotentReplay !== 'boolean'
  ) {
    return null
  }

  const mapped: TicketingRecordFareCheckResult = {
    checkId: String(result.checkId),
    bookingId: entry.bookingId,
    bookingVersion,
    rootTransactionId: String(result.rootTransactionId),
    rootTransactionVersion,
    observedFareGbp,
    effectiveDate: entry.effectiveDate,
    packageMatchStatus,
    createdAt: result.createdAt,
    idempotentReplay: result.idempotentReplay,
  }
  return mapped
}

function mutationError(error: RpcError) {
  const hint = String(error.hint || '')
  if (error.code === 'P0002') return privateError('Ticket record not found.', 404)
  if (hint === 'TICKETING_IDEMPOTENCY_CONFLICT') {
    return privateError('This save key was already used for a different fare check.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (error.code === '40001' || hint.includes('CONFLICT')) {
    return privateError('This ticket changed. Refresh the Low Fare queue and try again.', 409, {
      code: 'VERSION_CONFLICT',
    })
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514'].includes(String(error.code || ''))) {
    return privateError('Invalid fare check.', 400)
  }
  return privateError('Unable to record the fare check right now.', 500)
}

export async function POST(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.record-fare-check',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error } = await parseBodyWithSchema(
    request,
    ticketingRecordFareCheckSchema,
    {
      maxBytes: 16 * 1024,
    },
  )
  if (error || !entry) return privateError(error || 'Invalid fare check.', 400)

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || ''
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(capability.data, TICKET_FARE_ADJUSTMENT_CAPABILITY_VERSION)
  ) {
    return privateError('Ticketing fare checks are not installed on this database.', 503)
  }

  const result = await supabase.rpc('ticketing_record_fare_check_2026082904', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: entry.bookingId,
    p_expected_booking_version: entry.expectedBookingVersion,
    p_expected_root_transaction_version: entry.expectedRootTransactionVersion,
    p_expected_previous_adjustment_id: entry.expectedPreviousAdjustmentId,
    p_effective_on: entry.effectiveDate,
    p_notes: entry.notes,
    p_idempotency_key: idempotencyKey,
  })
  if (result.error) return mutationError(result.error)

  const mapped = mapResult(result.data, entry)
  if (!mapped) return privateError('The fare check returned an invalid result.', 500)
  return apiOk(mapped, { status: mapped.idempotentReplay ? 200 : 201, ...PRIVATE_RESPONSE })
}
