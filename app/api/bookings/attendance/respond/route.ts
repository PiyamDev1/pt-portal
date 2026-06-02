import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabaseClient'
import {
  defaultReminderSettings,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
} from '@/lib/bookingReminders'

export const runtime = 'nodejs'

type ResponseStatus = 'present' | 'missed'

function renderHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fb; margin: 0; padding: 24px; }
      .card { max-width: 640px; margin: 36px auto; background: #fff; border: 1px solid #dbe3ef; border-radius: 14px; padding: 24px; }
      h1 { margin: 0 0 10px; font-size: 22px; color: #0f172a; }
      p { margin: 0; color: #334155; line-height: 1.6; }
    </style>
  </head>
  <body>
    <section class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </section>
  </body>
</html>`
}

async function incrementFlagByField(params: {
  supabase: ReturnType<typeof getSupabaseClient>
  locationId: string
  bookingId: string
  field: 'customer_phone_norm' | 'customer_email_norm'
  value: string
  threshold: number
  penaltyEnabled: boolean
}) {
  const { supabase, locationId, bookingId, field, value, threshold, penaltyEnabled } = params

  const { data: existing } = await supabase
    .from('booking_contact_flags')
    .select('*')
    .eq('location_id', locationId)
    .eq(field, value)
    .maybeSingle()

  const nextMissedCount = Number(existing?.missed_count || 0) + 1
  const penaltyApplied = penaltyEnabled && nextMissedCount >= threshold

  if (existing?.id) {
    await supabase
      .from('booking_contact_flags')
      .update({
        missed_count: nextMissedCount,
        penalty_applied: penaltyApplied,
        penalty_applied_at: penaltyApplied ? new Date().toISOString() : existing.penalty_applied_at,
        last_missed_booking_id: bookingId,
      })
      .eq('id', existing.id)
    return
  }

  await supabase
    .from('booking_contact_flags')
    .insert({
      location_id: locationId,
      customer_phone_norm: field === 'customer_phone_norm' ? value : null,
      customer_email_norm: field === 'customer_email_norm' ? value : null,
      missed_count: nextMissedCount,
      penalty_applied: penaltyApplied,
      penalty_applied_at: penaltyApplied ? new Date().toISOString() : null,
      last_missed_booking_id: bookingId,
      notes: 'Auto-generated from attendance missed confirmation',
    })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const status = request.nextUrl.searchParams.get('status') as ResponseStatus | null

  if (!token || (status !== 'present' && status !== 'missed')) {
    return new NextResponse(
      renderHtml('Invalid Response Link', 'This attendance confirmation link is invalid or incomplete.'),
      {
        status: 400,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }
    )
  }

  try {
    const supabase = getSupabaseClient()

    const { data: event, error: eventError } = await supabase
      .from('booking_reminder_events')
      .select('id, booking_id, location_id, response_status')
      .eq('response_token', token)
      .maybeSingle()

    if (eventError || !event) {
      return new NextResponse(
        renderHtml('Link Expired', 'We could not find this reminder confirmation link. Please contact the branch.'),
        {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }
      )
    }

    await supabase
      .from('booking_reminder_events')
      .update({
        response_status: status,
        responded_at: new Date().toISOString(),
        confirmation_source: 'customer_link',
      })
      .eq('id', event.id)

    if (status === 'missed') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, location_id, customer_phone, customer_email')
        .eq('id', event.booking_id)
        .maybeSingle()

      if (booking) {
        const { data: settings } = await supabase
          .from('booking_reminder_settings')
          .select('*')
          .eq('location_id', booking.location_id)
          .maybeSingle()

        const effectiveSettings = settings || defaultReminderSettings(booking.location_id)
        const phoneNorm = normalizePhoneForMatch(booking.customer_phone)
        const emailNorm = normalizeEmailForMatch(booking.customer_email)

        if (phoneNorm) {
          await incrementFlagByField({
            supabase,
            locationId: booking.location_id,
            bookingId: booking.id,
            field: 'customer_phone_norm',
            value: phoneNorm,
            threshold: effectiveSettings.penalty_threshold,
            penaltyEnabled: effectiveSettings.penalty_enabled,
          })
        }

        if (emailNorm) {
          await incrementFlagByField({
            supabase,
            locationId: booking.location_id,
            bookingId: booking.id,
            field: 'customer_email_norm',
            value: emailNorm,
            threshold: effectiveSettings.penalty_threshold,
            penaltyEnabled: effectiveSettings.penalty_enabled,
          })
        }
      }
    }

    const title = status === 'present' ? 'Thanks for Confirming' : 'Missed Appointment Noted'
    const message = status === 'present'
      ? 'Your attendance has been confirmed. We look forward to seeing you.'
      : 'We have marked this appointment as missed. Please contact the branch to rebook if needed.'

    return new NextResponse(renderHtml(title, message), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  } catch {
    return new NextResponse(
      renderHtml('Error', 'Something went wrong while recording your response. Please contact the branch.'),
      {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }
    )
  }
}
