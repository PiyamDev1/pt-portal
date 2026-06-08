import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { incrementBookingContactPenalty } from '@/lib/bookingFlags'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === 'string' ? body.reason.trim() || 'Marked as no-show by staff' : 'Marked as no-show by staff'

  const supabase = await getRouteSupabaseClient()
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, location_id, customer_phone, customer_email, attendance_status, status')
    .eq('id', id)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      attendance_status: 'manual_no_show',
      status: booking.status === 'cancelled' ? booking.status : 'completed',
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await incrementBookingContactPenalty({
    supabase,
    locationId: booking.location_id,
    bookingId: booking.id,
    customerPhone: booking.customer_phone,
    customerEmail: booking.customer_email,
    notes: reason,
  })

  await supabase.from('booking_audit_logs').insert({
    booking_id: booking.id,
    location_id: booking.location_id,
    action_type: 'no_show_flagged',
    metadata: {
      reason,
      previous_attendance_status: booking.attendance_status || 'unknown',
    },
  })

  return NextResponse.json({ success: true, booking: data })
}
