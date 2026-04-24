import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { BookingStatus } from '@/app/types/bookings';
import { sendBookingEmail } from '@/lib/bookingEmail';

export const runtime = 'nodejs';

const VALID_STATUSES = Object.values(BookingStatus) as string[];
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

/**
 * PATCH /api/bookings/[id]
 * Update a booking's status and/or details.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      status,
      customer_name,
      customer_phone,
      customer_email,
      service_id,
      start_time,
      notes,
    } = body as {
      status?: string;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
      service_id?: string;
      start_time?: string;
      notes?: string | null;
    };

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const hasAnyChange =
      status !== undefined ||
      customer_name !== undefined ||
      customer_phone !== undefined ||
      customer_email !== undefined ||
      service_id !== undefined ||
      start_time !== undefined ||
      notes !== undefined;

    if (!hasAnyChange) {
      return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 });
    }

    if (customer_email !== undefined && !isValidEmail(customer_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const supabase = await getRouteSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      if (isSchemaError(existingError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const nextServiceId = service_id ?? existing.service_id;
    const nextStartISO = start_time ?? existing.start_time;
    const nextStatus = status ?? existing.status;
    const nextCustomerName = customer_name ?? existing.customer_name;
    const nextCustomerPhone = customer_phone ?? existing.customer_phone;
    const nextCustomerEmail = customer_email ?? existing.customer_email;

    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', nextServiceId)
      .eq('location_id', existing.location_id)
      .single();

    if (serviceError || !service) {
      if (isSchemaError(serviceError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const startTimeDate = new Date(nextStartISO);
    if (Number.isNaN(startTimeDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start_time format' }, { status: 400 });
    }

    const endTimeDate = new Date(startTimeDate.getTime() + service.duration_minutes * 60 * 1000);
    const nextEndISO = endTimeDate.toISOString();

    if (nextStatus !== BookingStatus.CANCELLED) {
      const bookingDayOfWeek = startTimeDate.getUTCDay();
      if (
        Array.isArray(service.available_days) &&
        service.available_days.length > 0 &&
        !service.available_days.includes(bookingDayOfWeek)
      ) {
        return NextResponse.json({ error: 'Selected service is not available on this day' }, { status: 400 });
      }

      const { data: branchSettings, error: settingsError } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('location_id', existing.location_id)
        .eq('day_of_week', bookingDayOfWeek)
        .single();

      if (settingsError || !branchSettings) {
        if (isSchemaError(settingsError)) {
          return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
        }
        return NextResponse.json({ error: 'Branch is not available on this day' }, { status: 400 });
      }

      if (branchSettings.is_closed) {
        return NextResponse.json({ error: 'Branch is closed on this day' }, { status: 400 });
      }

      const dateKey = startTimeDate.toISOString().slice(0, 10);
      const { data: override } = await supabase
        .from('branch_schedule_overrides')
        .select('*')
        .eq('location_id', existing.location_id)
        .eq('date', dateKey)
        .single();

      if (override?.is_closed) {
        return NextResponse.json({ error: 'Branch is closed on this date' }, { status: 400 });
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
        return NextResponse.json({ error: 'Selected time is outside service operating hours' }, { status: 400 });
      }

      if (overlapsRange(bookingStartMinutes, bookingEndMinutes, lunchStart, lunchEnd)) {
        return NextResponse.json({ error: 'Selected time overlaps lunch break' }, { status: 400 });
      }

      if (overlapsRange(bookingStartMinutes, bookingEndMinutes, prayerStart, prayerEnd)) {
        return NextResponse.json({ error: 'Selected time overlaps prayer break' }, { status: 400 });
      }

      const { data: overlappingBookings, error: overlapError } = await supabase
        .from('bookings')
        .select('id')
        .eq('location_id', existing.location_id)
        .lt('start_time', nextEndISO)
        .gt('end_time', nextStartISO)
        .neq('status', 'cancelled')
        .neq('id', id);

      if (overlapError) {
        if (isSchemaError(overlapError)) {
          return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
      }

      const concurrentStaff = override?.concurrent_staff ?? branchSettings.concurrent_staff;
      if ((overlappingBookings || []).length >= concurrentStaff) {
        return NextResponse.json({ error: 'No available staff for this time slot' }, { status: 409 });
      }
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      customer_name: nextCustomerName,
      customer_phone: nextCustomerPhone,
      customer_email: nextCustomerEmail,
      service_id: nextServiceId,
      start_time: nextStartISO,
      end_time: nextEndISO,
    };

    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', existing.location_id)
      .single();

    const emailKind =
      nextStatus === BookingStatus.CANCELLED ? 'cancellation' : 'modification';
    const template =
      emailKind === 'cancellation'
        ? service.cancellation_template
        : service.modification_template;

    const emailResult = await sendBookingEmail({
      to: nextCustomerEmail,
      subject:
        emailKind === 'cancellation'
          ? 'Your appointment was cancelled'
          : 'Your appointment was updated',
      kind: emailKind,
      template,
      customerName: nextCustomerName,
      serviceName: service.name,
      startTimeISO: nextStartISO,
      branchName: location?.name,
    });

    return NextResponse.json({
      success: true,
      booking: data,
      email_warning: emailResult.sent ? undefined : emailResult.reason,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
