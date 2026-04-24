import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { getSupabaseClient } from '@/lib/supabaseClient';

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10';
}

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
      if (isSchemaError(error)) {
        return NextResponse.json({ settings: [], warning: SCHEMA_HINT }, { status: 200 });
      }
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

    // Auth check with session client
    const sessionClient = await getRouteSupabaseClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service-role client to bypass RLS
    const supabase = getSupabaseClient();

    const payload = settings.map((row) => ({
      location_id,
      day_of_week: row.day_of_week,
      open_time: row.open_time,
      close_time: row.close_time,
      lunch_start_time: row.lunch_start_time,
      lunch_end_time: row.lunch_end_time,
      prayer_start_time: row.prayer_start_time,
      prayer_end_time: row.prayer_end_time,
      is_closed: row.is_closed,
      concurrent_staff: row.concurrent_staff,
      slot_interval_minutes: row.slot_interval_minutes,
    }));

    const { error } = await supabase
      .from('branch_settings')
      .upsert(payload, { onConflict: 'location_id,day_of_week' });

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
