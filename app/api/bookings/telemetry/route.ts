import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { logServerEvent } from '@/lib/observability/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

const BOOKING_TELEMETRY_BODY_LIMIT_BYTES = 8 * 1024

const bookingTelemetrySchema = z
  .object({
    event: z.enum([
      'booking_status_conflict',
      'booking_status_error',
      'booking_status_updated',
      'booking_reschedule_conflict',
      'booking_reschedule_error',
      'booking_rescheduled',
      'booking_amend_conflict',
      'booking_amend_error',
      'booking_amended',
      'booking_create_error',
      'booking_created',
    ]),
    metadata: z
      .object({
        bookingId: z.string().trim().min(1).max(200).optional(),
        nextStatus: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
        statusCode: z.number().int().min(100).max(599).optional(),
        manual_override: z.boolean().optional(),
      })
      .strip()
      .optional()
      .default({}),
  })
  .strip()

/** Bounded, best-effort operational telemetry for booking UX flows. */
export async function POST(request: Request) {
  const limit = await enforceRateLimit(request, {
    scope: 'public.booking-telemetry',
    limit: 120,
    windowSeconds: 60,
    identities: [`ip:${getClientIp(request)}`],
    message: 'Too many booking telemetry events. Please wait before sending more.',
    unavailable: 'allow',
  })
  if (!limit.allowed) return limit.response

  const { data, error } = await parseBodyWithSchema(request, bookingTelemetrySchema, {
    maxBytes: BOOKING_TELEMETRY_BODY_LIMIT_BYTES,
  })
  if (error || !data) {
    return apiError(
      error || 'Invalid booking telemetry payload',
      error === 'Request body is too large' ? 413 : 400,
    )
  }

  logServerEvent({
    event: 'bookings.telemetry',
    request,
    context: { bookingEvent: data.event, ...data.metadata },
  })

  return apiOk({ success: true })
}
