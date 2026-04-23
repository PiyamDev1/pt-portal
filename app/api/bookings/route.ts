import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import {
  BookingStatus,
  BookingSource,
  CreateBookingRequest,
  CreateBookingResponse,
} from '@/app/types/bookings';

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
 * Expected JSON body: { customer_name, customer_phone, service_id, start_time, source? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBookingRequest;

    // Step 1: Validate input
    const { location_id, customer_name, customer_phone, service_id, start_time } = body;
    const source = body.source || BookingSource.PORTAL;

    if (!location_id || !customer_name || !customer_phone || !service_id || !start_time) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: location_id, customer_name, customer_phone, service_id, start_time',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    // Validate ISO format for start_time
    try {
      new Date(start_time);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid start_time format. Use ISO 8601 format',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    // Step 2: Fetch service details to get duration
    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', service_id)
      .eq('location_id', location_id)
      .single();

    if (serviceError || !service) {
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

    // Step 3: Calculate end_time
    const startTimeDate = new Date(start_time);
    const endTimeDate = new Date(
      startTimeDate.getTime() + service.duration_minutes * 60 * 1000
    );
    const end_time = endTimeDate.toISOString();

    // Step 4: Get branch settings for concurrency check
    const dayOfWeek = startTimeDate.getUTCDay();
    const { data: branchSettings, error: settingsError } = await supabase
      .from('branch_settings')
      .select('*')
      .eq('location_id', location_id)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (settingsError || !branchSettings) {
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

    // Step 5: Double-booking check - count overlapping bookings
    const { data: overlappingBookings, error: overlapError } = await supabase
      .from('bookings')
      .select('*')
      .eq('location_id', location_id)
      .lt('start_time', end_time)
      .gt('end_time', start_time)
      .neq('status', 'cancelled');

    if (overlapError) {
      console.error('Error checking for overlapping bookings:', overlapError);
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

    // Step 6: Insert the booking
    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        location_id,
        customer_name,
        customer_phone,
        service_id,
        start_time,
        end_time,
        status: BookingStatus.PENDING,
        source,
      })
      .select()
      .single();

    if (insertError || !newBooking) {
      console.error('Error creating booking:', insertError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create booking',
        } as CreateBookingResponse,
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        booking: newBooking,
      } as CreateBookingResponse,
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
