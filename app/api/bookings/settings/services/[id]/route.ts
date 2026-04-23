import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

/**
 * PATCH /api/bookings/settings/services/[id]
 * Updates a service (name, duration, buffer, is_active)
 *
 * DELETE /api/bookings/settings/services/[id]
 * Deletes a service (only if no bookings reference it)
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, duration_minutes, buffer_minutes, is_active } = body as {
      name?: string;
      duration_minutes?: number;
      buffer_minutes?: number;
      is_active?: boolean;
    };

    if (duration_minutes !== undefined && duration_minutes < 5) {
      return NextResponse.json(
        { error: 'duration_minutes must be at least 5' },
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
    if (buffer_minutes !== undefined) updates.buffer_minutes = buffer_minutes;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabase
      .from('booking_services')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, service: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getRouteSupabaseClient();

    // Check if any non-cancelled bookings reference this service
    const { count, error: countError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', id)
      .neq('status', 'cancelled');

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} active booking(s) use this service` },
        { status: 409 }
      );
    }

    const { error } = await supabase.from('booking_services').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
