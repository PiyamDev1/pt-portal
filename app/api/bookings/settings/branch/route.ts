import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

/**
 * GET /api/bookings/settings/branch
 * Returns all 7 day rows from branch_settings
 *
 * PATCH /api/bookings/settings/branch
 * Body: Array of branch_settings rows to upsert
 */

export async function GET() {
  try {
    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase
      .from('branch_settings')
      .select('*')
      .order('day_of_week');

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
    const { settings } = body as {
      settings: {
        id: string;
        day_of_week: number;
        open_time: string;
        close_time: string;
        lunch_start_time: string | null;
        lunch_end_time: string | null;
        is_closed: boolean;
        concurrent_staff: number;
        slot_interval_minutes: number;
      }[];
    };

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

    const { error } = await supabase
      .from('branch_settings')
      .upsert(settings, { onConflict: 'day_of_week' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
