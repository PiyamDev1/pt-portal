import { NextResponse } from 'next/server'
import { sendBookingEmail } from '@/lib/bookingEmail'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { renderReminderText } from '@/lib/bookingReminders'

export const runtime = 'nodejs'

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/migrations/20260602_add_booking_reminders_and_penalties.sql in Supabase SQL editor.'

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return true
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString)
  return {
    date: d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    time: d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }),
  }
}

function buildBranchAddress(location: {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  postcode?: string | null
  country?: string | null
} | null): string {
  if (!location) return 'Address unavailable'
  const parts = [location.address_line1, location.address_line2, location.city, location.postcode, location.country]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  return parts.length > 0 ? parts.join(', ') : 'Address unavailable'
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()

    const { data: settingsRows, error: settingsError } = await supabase
      .from('booking_reminder_settings')
      .select('*')
      .eq('reminders_enabled', true)

    if (settingsError) {
      if (isSchemaError(settingsError)) {
        return NextResponse.json({ success: true, warning: SCHEMA_HINT, sent: 0, considered: 0 }, { status: 200 })
      }
      return NextResponse.json({ error: settingsError.message }, { status: 500 })
    }

    const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    if (!baseUrl) {
      return NextResponse.json({ error: 'APP_BASE_URL or NEXT_PUBLIC_APP_URL must be configured' }, { status: 500 })
    }

    let sent = 0
    let considered = 0

    for (const setting of settingsRows || []) {
      const hours = Math.min(168, Math.max(1, Number(setting.reminder_hours_before) || 24))
      const now = Date.now()
      const lowerBound = new Date(now + (hours * 60 - 15) * 60 * 1000).toISOString()
      const upperBound = new Date(now + (hours * 60 + 15) * 60 * 1000).toISOString()

      const { data: candidates, error: candidateError } = await supabase
        .from('bookings')
        .select(`
          id,
          location_id,
          customer_name,
          customer_email,
          start_time,
          status,
          booking_services:service_id(name),
          locations:location_id(name,address_line1,address_line2,city,postcode,country,phone)
        `)
        .eq('location_id', setting.location_id)
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', lowerBound)
        .lte('start_time', upperBound)

      if (candidateError) {
        if (isSchemaError(candidateError)) {
          continue
        }
        console.error('Failed to query reminder candidates', candidateError)
        continue
      }

      if (!candidates || candidates.length === 0) {
        continue
      }

      const bookingIds = candidates.map((row) => row.id)
      const { data: eventRows } = await supabase
        .from('booking_reminder_events')
        .select('booking_id, reminder_sent_at, response_token, response_status')
        .in('booking_id', bookingIds)

      const eventMap = new Map((eventRows || []).map((row) => [row.booking_id, row]))

      for (const booking of candidates) {
        considered += 1
        if (!booking.customer_email) {
          continue
        }

        const existing = eventMap.get(booking.id)
        if (existing?.reminder_sent_at) {
          continue
        }

        const token = existing?.response_token || crypto.randomUUID()
        const status = existing?.response_status || 'unknown'
        const { date, time } = formatDateTime(booking.start_time)
        const location = (booking.locations || null) as {
          name?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          postcode?: string | null
          country?: string | null
          phone?: string | null
        } | null

        const presentUrl = `${baseUrl}/api/bookings/attendance/respond?token=${encodeURIComponent(token)}&status=present`
        const missedUrl = `${baseUrl}/api/bookings/attendance/respond?token=${encodeURIComponent(token)}&status=missed`

        const templateCore = setting.reminder_template || ''
        const confirmationBlock = setting.attendance_confirmation_required
          ? `\n\nPlease confirm your attendance:\nPresent: ${presentUrl}\nMissed/Unable: ${missedUrl}`
          : ''

        const emailTemplate = `${templateCore}${confirmationBlock}`.trim()

        const subject = renderReminderText(
          setting.reminder_subject || 'Appointment reminder: [service booked] on [date booked] at [time booked]',
          {
            customerName: booking.customer_name || 'Customer',
            dateBooked: date,
            timeBooked: time,
            serviceBooked: (booking.booking_services as { name?: string } | null)?.name || 'Service',
            branchName: location?.name || 'Branch',
            branchAddress: buildBranchAddress(location),
            branchContactNumber: location?.phone || 'Contact unavailable',
          }
        ).replace(/\s+/g, ' ').trim()

        const result = await sendBookingEmail({
          to: booking.customer_email,
          subject,
          kind: 'confirmation',
          template: emailTemplate,
          customerName: booking.customer_name || 'Customer',
          serviceName: (booking.booking_services as { name?: string } | null)?.name || 'Service',
          startTimeISO: booking.start_time,
          branchName: location?.name || 'Branch',
          branchAddress: buildBranchAddress(location),
          branchContactNumber: location?.phone || 'Contact unavailable',
        })

        const upsertPayload = {
          booking_id: booking.id,
          location_id: booking.location_id,
          reminder_sent_at: result.sent ? new Date().toISOString() : null,
          reminder_hours_before: hours,
          response_token: token,
          response_status: status,
          metadata: {
            mail_status: result.sent ? 'sent' : 'failed',
            mail_reason: result.sent ? null : result.reason || null,
          },
        }

        const { error: upsertError } = await supabase
          .from('booking_reminder_events')
          .upsert(upsertPayload, { onConflict: 'booking_id' })

        if (upsertError) {
          console.error('Failed to upsert reminder event', upsertError)
        }

        if (result.sent) {
          sent += 1
        }
      }
    }

    return NextResponse.json({ success: true, sent, considered })
  } catch (error) {
    console.error('Booking reminders cron failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
