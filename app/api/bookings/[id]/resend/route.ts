import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { BookingStatus } from '@/app/types/bookings'
import { sendBookingEmail } from '@/lib/bookingEmail'
import { deriveBookingEmailSubject, getIdempotencyKey } from '@/lib/bookingOperations'
import { findIdempotentBooking, recordIdempotentBooking, storeBookingEmailAttempt } from '@/lib/bookingPersistence'

type ResendableEmailKind = 'confirmation' | 'modification' | 'cancellation'

const SCHEMA_HINT =
  'Booking schema is out of date. Run scripts/bootstrap/create-bookings-schema.sql in Supabase SQL editor.'

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({})) as { kind?: ResendableEmailKind; reason?: string; idempotency_key?: string }
    const supabase = await getRouteSupabaseClient()
    const idempotencyKey = getIdempotencyKey(request, body)

    if (idempotencyKey) {
      const replay = await findIdempotentBooking(supabase, `booking.resend:${id}`, idempotencyKey)
      if (replay?.booking_id) {
        return NextResponse.json({ success: true, booking_id: replay.booking_id, idempotent_replay: true })
      }
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single()

    if (bookingError || !booking) {
      if (isSchemaError(bookingError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 })
      }
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', booking.service_id)
      .eq('location_id', booking.location_id)
      .single()

    if (serviceError || !service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name,address_line1,address_line2,city,postcode,country,phone')
      .eq('id', booking.location_id)
      .single()

    const kind: ResendableEmailKind =
      body.kind ||
      (booking.status === BookingStatus.CANCELLED
        ? 'cancellation'
        : booking.status === BookingStatus.CONFIRMED
        ? 'confirmation'
        : 'modification')

    const template =
      kind === 'cancellation'
        ? service.cancellation_template
        : kind === 'confirmation'
        ? service.confirmation_template
        : service.modification_template

    const subject = deriveBookingEmailSubject({ kind, manualResend: true })
    const result = await sendBookingEmail({
      to: booking.customer_email,
      subject,
      kind,
      template,
      customerName: booking.customer_name,
      serviceName: service.name,
      startTimeISO: booking.start_time,
      branchName: location?.name || 'Branch',
      branchAddress: buildBranchAddress(location),
      branchContactNumber: location?.phone || 'Contact unavailable',
    })

    await storeBookingEmailAttempt(supabase, {
      bookingId: booking.id,
      locationId: booking.location_id,
      customerEmail: booking.customer_email,
      emailKind: kind,
      emailSubject: subject,
      senderEmail: result.senderEmail,
      notificationStatus: result.sent ? 'sent' : 'failed',
      failureReason: result.reason ?? null,
      metadata: {
        resend_reason: body.reason ?? null,
        trigger: 'manual_resend',
      },
    })

    await supabase.from('booking_audit_logs').insert({
      booking_id: booking.id,
      location_id: booking.location_id,
      action_type: 'email_resent',
      actor_identifier: request.headers.get('x-user-email') || request.headers.get('x-user-id'),
      before_data: null,
      after_data: {
        email_kind: kind,
        email_subject: subject,
        customer_email: booking.customer_email,
      },
      metadata: {
        resend_reason: body.reason ?? null,
        sent: result.sent,
        failure_reason: result.sent ? null : result.reason ?? null,
      },
    })

    if (idempotencyKey) {
      await recordIdempotentBooking(supabase, {
        actionName: `booking.resend:${id}`,
        key: idempotencyKey,
        locationId: booking.location_id,
        bookingId: booking.id,
        responseCode: 200,
      })
    }

    return NextResponse.json({
      success: true,
      sent: result.sent,
      email_warning: result.sent ? undefined : result.reason,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
