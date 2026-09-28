import { type BookingEmailKind, type BookingNotificationStatus } from '@/lib/bookingOperations'

/**
 * Thin persistence helpers for booking side effects.
 *
 * These helpers keep route handlers from duplicating the same idempotency and
 * email-log write patterns in multiple endpoints.
 */

type SupabaseLikeClient = {
  from: (table: string) => any
}

type BookingAuditPayload = {
  booking_id: string
  location_id: string
  action_type: string
  actor_identifier?: string | null
  before_data?: unknown
  after_data?: unknown
  metadata?: Record<string, unknown>
}

function isBookingSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

/** Store a best-effort booking audit event without blocking the source mutation. */
export async function storeBookingAuditEvent(
  supabase: SupabaseLikeClient,
  payload: BookingAuditPayload,
): Promise<void> {
  const { error } = await supabase.from('booking_audit_logs').insert({
    booking_id: payload.booking_id,
    location_id: payload.location_id,
    action_type: payload.action_type,
    actor_identifier: payload.actor_identifier ?? null,
    before_data: payload.before_data ?? null,
    after_data: payload.after_data ?? null,
    metadata: payload.metadata ?? null,
  })

  if (error && !isBookingSchemaError(error)) {
    console.error('Failed to write booking audit log', error)
  }
}

export async function findIdempotentBooking(
  supabase: SupabaseLikeClient,
  actionName: string,
  key: string,
): Promise<{
  booking_id: string | null
  response_code: number
  metadata: Record<string, unknown> | null
} | null> {
  const { data, error } = await supabase
    .from('booking_idempotency_keys')
    .select('booking_id,response_code,metadata')
    .eq('action_name', actionName)
    .eq('idempotency_key', key)
    .maybeSingle()

  if (error || !data) return null
  return data
}

/**
 * Record the result of a booking action under a caller-provided idempotency key.
 *
 * This protects booking mutations from duplicate submissions caused by retries,
 * double-clicks, or flaky network behavior.
 */
export async function recordIdempotentBooking(
  supabase: SupabaseLikeClient,
  payload: {
    actionName: string
    key: string
    locationId?: string | null
    bookingId?: string | null
    responseCode?: number
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await supabase.from('booking_idempotency_keys').upsert(
    {
      action_name: payload.actionName,
      idempotency_key: payload.key,
      location_id: payload.locationId ?? null,
      booking_id: payload.bookingId ?? null,
      response_code: payload.responseCode ?? 200,
      metadata: payload.metadata ?? {},
    },
    { onConflict: 'action_name,idempotency_key' },
  )
}

/**
 * Persist both the email attempt log and the latest summary state on the booking.
 *
 * The log is the audit trail, while the columns on `bookings` make it cheap for
 * the UI to show the latest outbound email state without another join.
 */
export async function storeBookingEmailAttempt(
  supabase: SupabaseLikeClient,
  payload: {
    bookingId: string
    locationId: string
    customerEmail: string
    emailKind: BookingEmailKind
    emailSubject: string
    senderEmail: string
    notificationStatus: BookingNotificationStatus
    failureReason?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  if (payload.notificationStatus !== 'skipped') {
    await supabase.from('booking_email_logs').insert({
      booking_id: payload.bookingId,
      location_id: payload.locationId,
      customer_email: payload.customerEmail,
      email_kind: payload.emailKind,
      email_subject: payload.emailSubject,
      sender_email: payload.senderEmail,
      status: payload.notificationStatus,
      failure_reason:
        payload.notificationStatus === 'failed' ? (payload.failureReason ?? null) : null,
      metadata: payload.metadata ?? {},
    })
  }

  await supabase
    .from('bookings')
    .update({
      last_email_sent_at: payload.notificationStatus === 'sent' ? new Date().toISOString() : null,
      last_email_kind: payload.emailKind,
      last_email_status: payload.notificationStatus,
      last_email_error:
        payload.notificationStatus === 'failed' ? (payload.failureReason ?? null) : null,
      last_email_subject: payload.emailSubject,
      last_email_recipient: payload.customerEmail,
    })
    .eq('id', payload.bookingId)
}
