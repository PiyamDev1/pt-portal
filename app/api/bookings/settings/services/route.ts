import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10';
}

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
      if (isSchemaError(error)) {
        return NextResponse.json({ services: [], warning: SCHEMA_HINT }, { status: 200 });
      }
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
    const {
      location_id,
      name,
      duration_minutes,
      buffer_minutes,
      available_days,
      service_start_time,
      service_end_time,
      slot_interval_minutes,
      confirmation_template,
      modification_template,
      cancellation_template,
    } = body as {
      location_id: string;
      name: string;
      duration_minutes: number;
      buffer_minutes: number;
      available_days?: number[] | null;
      service_start_time?: string | null;
      service_end_time?: string | null;
      slot_interval_minutes?: number | null;
      confirmation_template?: string | null;
      modification_template?: string | null;
      cancellation_template?: string | null;
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

    if (slot_interval_minutes !== undefined && slot_interval_minutes !== null && slot_interval_minutes < 5) {
      return NextResponse.json(
        { error: 'slot_interval_minutes must be at least 5 when provided' },
        { status: 400 }
      );
    }

    if (available_days && available_days.some((d) => d < 0 || d > 6)) {
      return NextResponse.json(
        { error: 'available_days values must be between 0 and 6' },
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    const { data, error } = await supabase
      .from('booking_services')
      .insert({
        location_id,
        name,
        confirmation_template: confirmation_template ?? null,
        modification_template: modification_template ?? null,
        cancellation_template: cancellation_template ?? null,
        duration_minutes,
        buffer_minutes: buffer_minutes ?? 15,
        available_days: available_days ?? null,
        service_start_time: service_start_time ?? null,
        service_end_time: service_end_time ?? null,
        slot_interval_minutes: slot_interval_minutes ?? null,
      })
      .select()
      .single();

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, service: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
