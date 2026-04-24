import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import {
  BookingStatus,
  BookingSource,
  CreateBookingRequest,
  CreateBookingResponse,
} from '@/app/types/bookings';
import { sendBookingEmail } from '@/lib/bookingEmail';

export const runtime = 'nodejs';

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10';
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function extractUtcTimeHHMMSS(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function overlapsRange(
  startMinutes: number,
  endMinutes: number,
  rangeStart: string | null,
  rangeEnd: string | null
): boolean {
  if (!rangeStart || !rangeEnd) return false;
  const rs = timeToMinutes(rangeStart);
  const re = timeToMinutes(rangeEnd);
  return startMinutes < re && endMinutes > rs;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  return /^\+\d{1,4}\s[\d\s()-]{6,20}$/.test(value.trim());
}

/**
 * GET /api/bookings?from=ISO&to=ISO
 * Fetch all bookings in a date range (for the dashboard week view)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const locationId = searchParams.get('location_id');

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 });
    }

    const supabase = await getRouteSupabaseClient();

    let query = supabase
      .from('bookings')
      .select(`*, booking_services:service_id(name, duration_minutes)`)
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time', { ascending: true });

    if (locationId) {
      query = query.eq('location_id', locationId);
    }

    const { data, error } = await query;

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ bookings: [], warning: SCHEMA_HINT }, { status: 200 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bookings
 * Creates a new booking
 * Expected JSON body: { location_id, customer_name, customer_phone, customer_email, service_id, start_time, source? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBookingRequest;

    const { location_id, customer_name, customer_phone, customer_email, service_id, start_time } = body;
    const source = body.source || BookingSource.PORTAL;

    if (!location_id || !customer_name || !customer_phone || !customer_email || !service_id || !start_time) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: location_id, customer_name, customer_phone, customer_email, service_id, start_time',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (!isValidEmail(customer_email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email address',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (!isValidPhone(customer_phone)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid phone number format. Use country code and number, e.g. +44 7123456789',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const startTimeDate = new Date(start_time);
    if (Number.isNaN(startTimeDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid start_time format. Use ISO 8601 format',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', service_id)
      .eq('location_id', location_id)
      .single();

    if (serviceError || !service) {
      if (isSchemaError(serviceError)) {
        return NextResponse.json(
          {
            success: false,
            error: SCHEMA_HINT,
          } as CreateBookingResponse,
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Service not found',
        } as CreateBookingResponse,
        { status: 404 }
      );
    }

    if (!service.is_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service is not available',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const bookingDayOfWeek = new Date(start_time).getUTCDay();
    if (
      Array.isArray(service.available_days) &&
      service.available_days.length > 0 &&
      !service.available_days.includes(bookingDayOfWeek)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Selected service is not available on this day',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const endTimeDate = new Date(
      startTimeDate.getTime() + service.duration_minutes * 60 * 1000
    );
    const end_time = endTimeDate.toISOString();

    const dayOfWeek = startTimeDate.getUTCDay();
    const { data: branchSettings, error: settingsError } = await supabase
      .from('branch_settings')
      .select('*')
      .eq('location_id', location_id)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (settingsError || !branchSettings) {
      if (isSchemaError(settingsError)) {
        return NextResponse.json(
          {
            success: false,
            error: SCHEMA_HINT,
          } as CreateBookingResponse,
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Branch is not available on this day',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (branchSettings.is_closed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Branch is closed on this day',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const dateKey = startTimeDate.toISOString().slice(0, 10);
    const { data: override } = await supabase
      .from('branch_schedule_overrides')
      .select('*')
      .eq('location_id', location_id)
      .eq('date', dateKey)
      .single();

    if (override?.is_closed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Branch is closed on this date',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const openTime = override?.open_time ?? branchSettings.open_time;
    const closeTime = override?.close_time ?? branchSettings.close_time;
    const lunchStart = override?.lunch_start_time ?? branchSettings.lunch_start_time;
    const lunchEnd = override?.lunch_end_time ?? branchSettings.lunch_end_time;
    const prayerStart = override?.prayer_start_time ?? branchSettings.prayer_start_time;
    const prayerEnd = override?.prayer_end_time ?? branchSettings.prayer_end_time;

    const serviceStartBound = service.service_start_time ?? openTime;
    const serviceEndBound = service.service_end_time ?? closeTime;

    const bookingStartMinutes = timeToMinutes(extractUtcTimeHHMMSS(startTimeDate));
    const bookingEndMinutes = timeToMinutes(extractUtcTimeHHMMSS(endTimeDate));
    const serviceStartMinutes = timeToMinutes(serviceStartBound);
    const serviceEndMinutes = timeToMinutes(serviceEndBound);

    if (bookingStartMinutes < serviceStartMinutes || bookingEndMinutes > serviceEndMinutes) {
      return NextResponse.json(
        {
          success: false,
          error: 'Selected time is outside service operating hours',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (overlapsRange(bookingStartMinutes, bookingEndMinutes, lunchStart, lunchEnd)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Selected time overlaps lunch break',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (overlapsRange(bookingStartMinutes, bookingEndMinutes, prayerStart, prayerEnd)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Selected time overlaps prayer break',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const { data: overlappingBookings, error: overlapError } = await supabase
      .from('bookings')
      .select('*')
      .eq('location_id', location_id)
      .lt('start_time', end_time)
      .gt('end_time', start_time)
      .neq('status', 'cancelled');

    if (overlapError) {
      if (isSchemaError(overlapError)) {
        return NextResponse.json(
          {
            success: false,
            error: SCHEMA_HINT,
          } as CreateBookingResponse,
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to check availability',
        } as CreateBookingResponse,
        { status: 500 }
      );
    }

    if (
      overlappingBookings &&
      overlappingBookings.length >= branchSettings.concurrent_staff
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'No available staff for this time slot',
        } as CreateBookingResponse,
        { status: 409 }
      );
    }

    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        location_id,
        customer_name,
        customer_phone,
        customer_email,
        service_id,
        start_time,
        end_time,
        status: BookingStatus.PENDING,
        source,
      })
      .select()
      .single();

    if (insertError || !newBooking) {
      if (isSchemaError(insertError)) {
        return NextResponse.json(
          {
            success: false,
            error: SCHEMA_HINT,
          } as CreateBookingResponse,
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create booking',
        } as CreateBookingResponse,
        { status: 500 }
      );
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', location_id)
      .single();

    const emailResult = await sendBookingEmail({
      to: customer_email,
      subject: 'Your appointment is booked',
      kind: 'confirmation',
      template: service.confirmation_template,
      customerName: customer_name,
      serviceName: service.name,
      startTimeISO: start_time,
      branchName: location?.name,
    });

    await supabase.from('booking_email_logs').insert({
      booking_id: newBooking.id,
      location_id,
      customer_email,
      email_kind: 'confirmation',
      email_subject: 'Your appointment is booked',
      sender_email: emailResult.senderEmail,
      status: emailResult.sent ? 'sent' : 'failed',
      failure_reason: emailResult.sent ? null : emailResult.reason ?? null,
      metadata: {
        service_id: service.id,
        service_name: service.name,
      },
    });

    return NextResponse.json(
      {
        success: true,
        booking: newBooking,
        email_warning: emailResult.sent ? undefined : emailResult.reason,
      } as CreateBookingResponse & { email_warning?: string },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in booking creation:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      } as CreateBookingResponse,
      { status: 500 }
    );
  }
}
