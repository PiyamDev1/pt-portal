import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

/**
 * GET /api/bookings/settings/branch
 * Returns all 7 day rows from branch_settings
 *
 * PATCH /api/bookings/settings/branch
 * Body: Array of branch_settings rows to upsert
 */

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location_id');
    const supabase = await getRouteSupabaseClient();

    let query = supabase
      .from('branch_settings')
      .select('*')
      .order('day_of_week');

    if (locationId) {
      query = query.eq('location_id', locationId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { location_id, settings } = body as {
      location_id: string;
      settings: {
        id: string;
        location_id: string;
        day_of_week: number;
        open_time: string;
        close_time: string;
        lunch_start_time: string | null;
        lunch_end_time: string | null;
        prayer_start_time: string | null;
        prayer_end_time: string | null;
        is_closed: boolean;
        concurrent_staff: number;
        slot_interval_minutes: number;
      }[];
    };

    if (!location_id) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 });
    }

    if (!Array.isArray(settings) || settings.length === 0) {
      return NextResponse.json({ error: 'settings array is required' }, { status: 400 });
    }

    // Basic validation
    for (const row of settings) {
      if (row.concurrent_staff < 1) {
        return NextResponse.json(
          { error: `concurrent_staff must be at least 1 for day ${row.day_of_week}` },
          { status: 400 }
        );
      }
      if (row.slot_interval_minutes < 5) {
        return NextResponse.json(
          { error: `slot_interval_minutes must be at least 5 for day ${row.day_of_week}` },
          { status: 400 }
        );
      }
    }

    const supabase = await getRouteSupabaseClient();

    const payload = settings.map((row) => ({ ...row, location_id }));

    const { error } = await supabase
      .from('branch_settings')
      .upsert(payload, { onConflict: 'location_id,day_of_week' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
