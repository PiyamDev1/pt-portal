import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { AvailableSlot, AvailableSlotsResponse } from '@/app/types/bookings';

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';
const BOUNDARY_TOLERANCE_MINUTES = 5;

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10';
}

/**
 * GET /api/bookings/available-slots
 * Query params: date=YYYY-MM-DD&service_id=UUID
 * Returns available booking slots for a given date and service
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const service_id = searchParams.get('service_id');
    const location_id = searchParams.get('location_id');
    const rawPersonCount = searchParams.get('person_count');
    const personCount = Math.max(1, parseInt(rawPersonCount ?? '1', 10) || 1);

    // Validate inputs
    if (!date || !service_id || !location_id) {
      return NextResponse.json(
        { error: 'Missing required parameters: date, service_id and location_id' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    // Parse the date and get day of week (0=Sunday, 1=Monday, etc.)
    const dateObj = new Date(`${date}T00:00:00Z`);
    const dayOfWeek = dateObj.getUTCDay();

    // Step 1: Fetch branch settings for this day and location
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
            date,
            service_id,
            slots: [],
            warning: SCHEMA_HINT,
          },
          { status: 200 }
        );
      }
      // If no settings for this day, return empty slots
      return NextResponse.json({
        date,
        service_id,
        slots: [],
      } as AvailableSlotsResponse);
    }

    // Check if branch is closed
    if (branchSettings.is_closed) {
      return NextResponse.json({
        date,
        service_id,
        slots: [],
      } as AvailableSlotsResponse);
    }

    // Optional one-off override (per location + specific date)
    const { data: override } = await supabase
      .from('branch_schedule_overrides')
      .select('*')
      .eq('location_id', location_id)
      .eq('date', date)
      .single();

    if (override?.is_closed) {
      return NextResponse.json({
        date,
        service_id,
        slots: [],
      } as AvailableSlotsResponse);
    }

    const openTime = override?.open_time ?? branchSettings.open_time;
    const closeTime = override?.close_time ?? branchSettings.close_time;
    const lunchStartTime = override?.lunch_start_time ?? branchSettings.lunch_start_time;
    const lunchEndTime = override?.lunch_end_time ?? branchSettings.lunch_end_time;
    const prayerStartTime = override?.prayer_start_time ?? branchSettings.prayer_start_time;
    const prayerEndTime = override?.prayer_end_time ?? branchSettings.prayer_end_time;
    const concurrentStaff = override?.concurrent_staff ?? branchSettings.concurrent_staff;

    // Step 2: Fetch service details
    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', service_id)
      .eq('location_id', location_id)
      .single();

    if (serviceError || !service) {
      if (isSchemaError(serviceError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }

    if (!service.is_active) {
      return NextResponse.json({
        date,
        service_id,
        slots: [],
      } as AvailableSlotsResponse);
    }

    if (
      Array.isArray(service.available_days) &&
      service.available_days.length > 0 &&
      !service.available_days.includes(dayOfWeek)
    ) {
      return NextResponse.json({
        date,
        service_id,
        slots: [],
      } as AvailableSlotsResponse);
    }

    const effectiveOpenTime = maxTime(openTime, service.service_start_time);
    const effectiveCloseTime = minTime(closeTime, service.service_end_time);

    if (!effectiveOpenTime || !effectiveCloseTime || effectiveOpenTime >= effectiveCloseTime) {
      return NextResponse.json({
        date,
        service_id,
        slots: [],
      } as AvailableSlotsResponse);
    }

    // Step 3: Fetch all non-cancelled bookings for this date
    const startOfDay = new Date(`${date}T00:00:00Z`).toISOString();
    const endOfDay = new Date(`${date}T23:59:59Z`).toISOString();

    const { data: existingBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('location_id', location_id)
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay)
      .neq('status', 'cancelled');

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      if (isSchemaError(bookingsError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json(
        { error: 'Failed to fetch bookings' },
        { status: 500 }
      );
    }

    // Step 4: Generate available slots
    // Compute effective duration for the requested group size.
    const groupDuration =
      service.duration_minutes +
      Math.max(0, personCount - 1) * (service.duration_per_additional_person_minutes ?? 0);

    const slots = generateAvailableSlots(
      date,
      effectiveOpenTime,
      effectiveCloseTime,
      lunchStartTime,
      lunchEndTime,
      prayerStartTime,
      prayerEndTime,
      groupDuration,
      service.buffer_minutes,
      concurrentStaff,
      existingBookings || []
    );

    return NextResponse.json({
      date,
      service_id,
      slots,
    } as AvailableSlotsResponse);
  } catch (error) {
    console.error('Error fetching available slots:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to generate available time slots
 * Accounts for service duration, buffer time, lunch breaks, and concurrent capacity
 */
function generateAvailableSlots(
  date: string,
  openTime: string,
  closeTime: string,
  lunchStartTime: string | null,
  lunchEndTime: string | null,
  prayerStartTime: string | null,
  prayerEndTime: string | null,
  durationMinutes: number,
  bufferMinutes: number,
  concurrentStaff: number,
  existingBookings: any[]
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];

  // Parse times (HH:MM:SS)
  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);

  // Convert everything to minutes from midnight
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;
  const lunchStartMinutes = lunchStartTime ? timeToMinutes(lunchStartTime) : null;
  const lunchEndMinutes = lunchEndTime ? timeToMinutes(lunchEndTime) : null;
  const prayerStartMinutes = prayerStartTime ? timeToMinutes(prayerStartTime) : null;
  const prayerEndMinutes = prayerEndTime ? timeToMinutes(prayerEndTime) : null;

  // Duration + buffer defines when the next appointment can start.
  const occupancyMinutes = Math.max(5, durationMinutes + Math.max(0, bufferMinutes));
  const intervalMinutes = occupancyMinutes;

  let currentMinutes = openMinutes;

  while (currentMinutes + durationMinutes <= closeMinutes + BOUNDARY_TOLERANCE_MINUTES) {
    const occupiedUntilMinutes = currentMinutes + occupancyMinutes;

    // Allow slight overrun (<= 5 min) past breaks and service end; larger overruns are blocked.
    if (occupiedUntilMinutes > closeMinutes + BOUNDARY_TOLERANCE_MINUTES) {
      break;
    }

    if (overlapsBreakBeyondTolerance(currentMinutes, occupiedUntilMinutes, lunchStartMinutes, lunchEndMinutes)) {
      currentMinutes += intervalMinutes;
      continue;
    }

    if (overlapsBreakBeyondTolerance(currentMinutes, occupiedUntilMinutes, prayerStartMinutes, prayerEndMinutes)) {
      currentMinutes += intervalMinutes;
      continue;
    }

    // Count overlapping bookings at this slot time
    const slotStartISO = minutesToISO(date, currentMinutes);
    const slotEndISO = minutesToISO(date, occupiedUntilMinutes);

    const overlappingCount = countOverlappingBookings(
      existingBookings,
      slotStartISO,
      slotEndISO
    );

    // Slot is available if overlap count < concurrent_staff
    if (overlappingCount < concurrentStaff) {
      slots.push({
        time: minutesToHHMM(currentMinutes),
        isoString: slotStartISO,
      });
    }

    // Move to the next candidate start time.
    // Keep the service+buffer rule on availability overlap checks.
    currentMinutes += intervalMinutes;
  }

  return slots;
}

function overlapsBreakBeyondTolerance(
  startMinutes: number,
  occupiedUntilMinutes: number,
  breakStartMinutes: number | null,
  breakEndMinutes: number | null
): boolean {
  if (breakStartMinutes === null || breakEndMinutes === null) {
    return false;
  }

  // No overlap with break window.
  if (occupiedUntilMinutes <= breakStartMinutes || startMinutes >= breakEndMinutes) {
    return false;
  }

  // Starting inside a break is always invalid.
  if (startMinutes >= breakStartMinutes && startMinutes < breakEndMinutes) {
    return true;
  }

  // Crossing into a break is allowed only up to the tolerance.
  const overrunMinutes = occupiedUntilMinutes - breakStartMinutes;
  return overrunMinutes > BOUNDARY_TOLERANCE_MINUTES;
}

/**
 * Convert HH:MM:SS time string to minutes from midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function maxTime(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return timeToMinutes(a) >= timeToMinutes(b) ? a : b;
}

function minTime(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return timeToMinutes(a) <= timeToMinutes(b) ? a : b;
}

/**
 * Convert minutes from midnight to ISO 8601 timestamp for a given date
 */
function minutesToISO(date: string, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const timeString = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00Z`;
  return new Date(`${date}T${timeString}`).toISOString();
}

/**
 * Convert minutes from midnight to HH:MM format
 */
function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Count how many existing bookings overlap with the given time slot
 */
function countOverlappingBookings(
  bookings: any[],
  startISO: string,
  endISO: string
): number {
  const slotStart = new Date(startISO).getTime();
  const slotEnd = new Date(endISO).getTime();

  return bookings.filter((booking) => {
    const bookingStart = new Date(booking.start_time).getTime();
    const bookingEnd = new Date(booking.end_time).getTime();

    // Check if there's any overlap
    return bookingStart < slotEnd && bookingEnd > slotStart;
  }).length;
}
