import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

/**
 * GET /api/bookings/settings/services
 * Returns all booking services
 *
 * POST /api/bookings/settings/services
 * Creates a new service
 */

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location_id');

    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 });
    }

    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase
      .from('booking_services')
      .select('*')
      .eq('location_id', locationId)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ services: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { location_id, name, duration_minutes, buffer_minutes } = body as {
      location_id: string;
      name: string;
      duration_minutes: number;
      buffer_minutes: number;
    };

    if (!location_id || !name || !duration_minutes) {
      return NextResponse.json(
        { error: 'location_id, name and duration_minutes are required' },
        { status: 400 }
      );
    }

    if (duration_minutes < 5) {
      return NextResponse.json(
        { error: 'duration_minutes must be at least 5' },
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase
      .from('booking_services')
      .insert({ location_id, name, duration_minutes, buffer_minutes: buffer_minutes ?? 15 })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, service: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
