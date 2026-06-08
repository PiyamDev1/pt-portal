import { defaultReminderSettings, normalizeEmailForMatch, normalizePhoneForMatch } from '@/lib/bookingReminders'

type SupabaseServiceLike = {
  from: (table: string) => any
}

export async function incrementBookingContactPenalty(params: {
  supabase: SupabaseServiceLike
  locationId: string
  bookingId: string
  customerPhone: string | null | undefined
  customerEmail: string | null | undefined
  notes?: string | null
}) {
  const { supabase, locationId, bookingId, customerPhone, customerEmail, notes } = params

  const { data: settings } = await supabase
    .from('booking_reminder_settings')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle()

  const effectiveSettings = settings || defaultReminderSettings(locationId)
  const phoneNorm = normalizePhoneForMatch(customerPhone)
  const emailNorm = normalizeEmailForMatch(customerEmail)

  if (phoneNorm) {
    await incrementFlagByField({
      supabase,
      locationId,
      bookingId,
      field: 'customer_phone_norm',
      value: phoneNorm,
      threshold: effectiveSettings.penalty_threshold,
      penaltyEnabled: effectiveSettings.penalty_enabled,
      penaltyReason: effectiveSettings.penalty_note || 'Repeat no-show profile',
      notes,
    })
  }

  if (emailNorm) {
    await incrementFlagByField({
      supabase,
      locationId,
      bookingId,
      field: 'customer_email_norm',
      value: emailNorm,
      threshold: effectiveSettings.penalty_threshold,
      penaltyEnabled: effectiveSettings.penalty_enabled,
      penaltyReason: effectiveSettings.penalty_note || 'Repeat no-show profile',
      notes,
    })
  }
}

async function incrementFlagByField(params: {
  supabase: SupabaseServiceLike
  locationId: string
  bookingId: string
  field: 'customer_phone_norm' | 'customer_email_norm'
  value: string
  threshold: number
  penaltyEnabled: boolean
  penaltyReason: string
  notes?: string | null
}) {
  const { supabase, locationId, bookingId, field, value, threshold, penaltyEnabled, penaltyReason, notes } = params

  const { data: existing } = await supabase
    .from('booking_contact_flags')
    .select('*')
    .eq('location_id', locationId)
    .eq(field, value)
    .maybeSingle()

  const nextMissedCount = Number(existing?.missed_count || 0) + 1
  const penaltyApplied = penaltyEnabled && nextMissedCount >= threshold
  const nextPayload = {
    missed_count: nextMissedCount,
    penalty_applied: penaltyApplied,
    penalty_applied_at: penaltyApplied ? new Date().toISOString() : existing?.penalty_applied_at ?? null,
    last_missed_booking_id: bookingId,
    last_no_show_at: new Date().toISOString(),
    manual_review_required: penaltyApplied,
    penalty_reason: penaltyApplied ? penaltyReason : existing?.penalty_reason ?? null,
    blocked_until: penaltyApplied ? null : existing?.blocked_until ?? null,
    notes: notes || existing?.notes || 'Auto-generated from no-show tracking',
  }

  if (existing?.id) {
    await supabase.from('booking_contact_flags').update(nextPayload).eq('id', existing.id)
    return
  }

  await supabase.from('booking_contact_flags').insert({
    location_id: locationId,
    customer_phone_norm: field === 'customer_phone_norm' ? value : null,
    customer_email_norm: field === 'customer_email_norm' ? value : null,
    ...nextPayload,
  })
}
