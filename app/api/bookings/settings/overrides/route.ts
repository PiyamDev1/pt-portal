import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10';
}

/**
 * GET /api/bookings/settings/overrides?location_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 * POST /api/bookings/settings/overrides
 */

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location_id');
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 });
    }

    const supabase = await getRouteSupabaseClient();

    let query = supabase
      .from('branch_schedule_overrides')
      .select('*')
      .eq('location_id', locationId)
      .order('date', { ascending: true });

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);

    const { data, error } = await query;

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ overrides: [], warning: SCHEMA_HINT }, { status: 200 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ overrides: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      location_id,
      date,
      open_time,
      close_time,
      lunch_start_time,
      lunch_end_time,
      prayer_start_time,
      prayer_end_time,
      is_closed,
      concurrent_staff,
      slot_interval_minutes,
      notes,
    } = body as {
      location_id: string;
      date: string;
      open_time: string | null;
      close_time: string | null;
      lunch_start_time: string | null;
      lunch_end_time: string | null;
      prayer_start_time: string | null;
      prayer_end_time: string | null;
      is_closed: boolean;
      concurrent_staff: number;
      slot_interval_minutes: number;
      notes?: string | null;
    };

    if (!location_id || !date) {
      return NextResponse.json({ error: 'location_id and date are required' }, { status: 400 });
    }

    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase
      .from('branch_schedule_overrides')
      .upsert(
        {
          location_id,
          date,
          open_time,
          close_time,
          lunch_start_time,
          lunch_end_time,
          prayer_start_time,
          prayer_end_time,
          is_closed,
          concurrent_staff,
          slot_interval_minutes,
          notes: notes ?? null,
        },
        { onConflict: 'location_id,date' }
      )
      .select()
      .single();

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, override: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
