import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { incrementBookingContactPenalty } from '@/lib/bookingFlags'

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

    await supabase
      .from('bookings')
      .update({
        attendance_status: status === 'present' ? 'present' : 'missed',
      })
      .eq('id', event.booking_id)

    if (status === 'missed') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, location_id, customer_phone, customer_email')
        .eq('id', event.booking_id)
        .maybeSingle()

      if (booking) {
        await incrementBookingContactPenalty({
          supabase,
          locationId: booking.location_id,
          bookingId: booking.id,
          customerPhone: booking.customer_phone,
          customerEmail: booking.customer_email,
          notes: 'Auto-generated from attendance missed confirmation',
        })
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
