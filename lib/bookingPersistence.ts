import { type BookingEmailKind, type BookingNotificationStatus } from '@/lib/bookingOperations'
type SupabaseLikeClient = {
  from: (table: string) => any
}

export async function findIdempotentBooking(
  supabase: SupabaseLikeClient,
  actionName: string,
  key: string
): Promise<{ booking_id: string | null; response_code: number; metadata: Record<string, unknown> | null } | null> {
  const { data, error } = await supabase
    .from('booking_idempotency_keys')
    .select('booking_id,response_code,metadata')
    .eq('action_name', actionName)
    .eq('idempotency_key', key)
    .maybeSingle()

  if (error || !data) return null
  return data
}

export async function recordIdempotentBooking(
  supabase: SupabaseLikeClient,
  payload: {
    actionName: string
    key: string
    locationId?: string | null
    bookingId?: string | null
    responseCode?: number
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await supabase.from('booking_idempotency_keys').upsert({
    action_name: payload.actionName,
    idempotency_key: payload.key,
    location_id: payload.locationId ?? null,
    booking_id: payload.bookingId ?? null,
    response_code: payload.responseCode ?? 200,
    metadata: payload.metadata ?? {},
  }, { onConflict: 'action_name,idempotency_key' })
}

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
  }
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
      failure_reason: payload.notificationStatus === 'failed' ? payload.failureReason ?? null : null,
      metadata: payload.metadata ?? {},
    })
  }

  await supabase
    .from('bookings')
    .update({
      last_email_sent_at: payload.notificationStatus === 'sent' ? new Date().toISOString() : null,
      last_email_kind: payload.emailKind,
      last_email_status: payload.notificationStatus,
      last_email_error: payload.notificationStatus === 'failed' ? payload.failureReason ?? null : null,
      last_email_subject: payload.emailSubject,
      last_email_recipient: payload.customerEmail,
    })
    .eq('id', payload.bookingId)
}
