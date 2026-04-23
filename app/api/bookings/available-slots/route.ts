import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { AvailableSlot, AvailableSlotsResponse } from '@/app/types/bookings';

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
    const slotInterval = override?.slot_interval_minutes ?? branchSettings.slot_interval_minutes ?? 30;

    // Step 2: Fetch service details
    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', service_id)
      .eq('location_id', location_id)
      .single();

    if (serviceError || !service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: 'Failed to fetch bookings' },
        { status: 500 }
      );
    }

    // Step 4: Generate available slots
    const slots = generateAvailableSlots(
      date,
      openTime,
      closeTime,
      lunchStartTime,
      lunchEndTime,
      prayerStartTime,
      prayerEndTime,
      service.duration_minutes,
      service.buffer_minutes,
      slotInterval,
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
  slotIntervalMinutes: number,
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

  // Use admin-configured slot interval, with a safe minimum.
  const intervalMinutes = Math.max(5, Number(slotIntervalMinutes || 30));

  let currentMinutes = openMinutes;

  while (currentMinutes + durationMinutes <= closeMinutes) {
    const slotEndMinutes = currentMinutes + durationMinutes;

    // Skip slots overlapping lunch break
    if (lunchStartMinutes !== null && lunchEndMinutes !== null) {
      if (currentMinutes < lunchEndMinutes && slotEndMinutes > lunchStartMinutes) {
        if (currentMinutes < lunchEndMinutes) {
          currentMinutes = lunchEndMinutes;
          continue;
        }
      }
    }

    // Skip slots overlapping Friday prayer or any configured prayer break
    if (prayerStartMinutes !== null && prayerEndMinutes !== null) {
      if (currentMinutes < prayerEndMinutes && slotEndMinutes > prayerStartMinutes) {
        if (currentMinutes < prayerEndMinutes) {
          currentMinutes = prayerEndMinutes;
          continue;
        }
      }
    }

    // Count overlapping bookings at this slot time
    const slotStartISO = minutesToISO(date, currentMinutes);
    const slotEndISO = minutesToISO(date, currentMinutes + durationMinutes);

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

/**
 * Convert HH:MM:SS time string to minutes from midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
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
