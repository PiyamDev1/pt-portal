import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingBookingIdSchema } from '@/lib/ticketing/completionContracts'
import { ticketingRootPaymentStatusSchema } from '@/lib/ticketing/paymentStatusContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

type RpcError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function currentVersions(details: string | null | undefined) {
  try {
    const value = JSON.parse(details || '{}') as Record<string, unknown>
    const bookingVersion = Number(value.bookingVersion)
    const transactionVersion = Number(value.transactionVersion)
    return Number.isSafeInteger(bookingVersion) && Number.isSafeInteger(transactionVersion)
      ? { bookingVersion, transactionVersion }
      : undefined
  } catch {
    return undefined
  }
}

function rpcError(error: RpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')
  if (error.code === 'P0002' || hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket record not found.', 404)
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    return privateError('This ticket changed after you opened it. Refresh and try again.', 409, {
      code: 'VERSION_CONFLICT',
      ...(currentVersions(error.details) ? { currentVersions: currentVersions(error.details) } : {}),
    })
  }
  if (hint === 'TICKETING_IDEMPOTENCY_CONFLICT' || /idempotency/i.test(message)) {
    return privateError('This save key was already used for a different payment update.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514'].includes(String(error.code || ''))) {
    return privateError('Invalid ticket payment.', 400)
  }
  if (error.code === '42883') {
    return privateError('Direct Ticketing payment updates are not installed on this database.', 503)
  }
  return privateError('Unable to update the ticket payment right now.', 500)
}

type RouteContext = { params: Promise<{ bookingId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const bookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!bookingId.success) return privateError('Ticket record not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.update-root-payment-status',
    limit: 90,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: payment, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingRootPaymentStatusSchema,
    { maxBytes: 8 * 1024 },
  )
  if (bodyError || !payment) return privateError(bodyError || 'Invalid ticket payment.', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const { data, error } = await getServiceSupabaseClient().rpc(
    'ticketing_update_root_payment_status',
    {
      p_actor_employee_id: access.employee.id,
      p_booking_id: bookingId.data,
      p_idempotency_key: idempotencyKey,
      p_payment: payment,
    },
  )
  if (error) return rpcError(error)

  const result = data as {
    booking?: { id?: string; version?: number }
    transaction?: { id?: string; version?: number; paymentStatus?: string; paidAt?: string | null }
    changed?: boolean
    idempotentReplay?: boolean
  } | null
  if (
    result?.booking?.id !== bookingId.data ||
    typeof result.booking.version !== 'number' ||
    typeof result.transaction?.id !== 'string' ||
    typeof result.transaction.version !== 'number' ||
    result.transaction.paymentStatus !== payment.paymentStatus ||
    result.transaction.paidAt !== null && typeof result.transaction.paidAt !== 'string' ||
    typeof result.changed !== 'boolean' ||
    typeof result.idempotentReplay !== 'boolean'
  ) {
    return privateError('Ticketing returned an invalid payment result.', 500)
  }

  return apiOk(result, PRIVATE_RESPONSE)
}
