import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { validateBookingTemplate } from '@/lib/bookingEmail';

type TemplateValidationError = { field: string; invalidTokens: string[] };

function validateServiceTemplates(input: {
  confirmation_template?: string | null;
  modification_template?: string | null;
  cancellation_template?: string | null;
}): TemplateValidationError[] {
  const checks: Array<{ field: string; value: string | null | undefined }> = [
    { field: 'confirmation_template', value: input.confirmation_template },
    { field: 'modification_template', value: input.modification_template },
    { field: 'cancellation_template', value: input.cancellation_template },
  ];

  return checks
    .map(({ field, value }) => {
      if (value === undefined || value === null || value.trim() === '') return null;
      const result = validateBookingTemplate(value);
      if (result.valid) return null;
      return { field, invalidTokens: result.invalidTokens };
    })
    .filter((item): item is TemplateValidationError => item !== null);
}

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
    const {
      name,
      duration_minutes,
      buffer_minutes,
      is_active,
      available_days,
      service_start_time,
      service_end_time,
      confirmation_template,
      modification_template,
      cancellation_template,
      duration_per_additional_person_minutes,
    } = body as {
      name?: string;
      duration_minutes?: number;
      buffer_minutes?: number;
      is_active?: boolean;
      available_days?: number[] | null;
      service_start_time?: string | null;
      service_end_time?: string | null;
      confirmation_template?: string | null;
      modification_template?: string | null;
      cancellation_template?: string | null;
      duration_per_additional_person_minutes?: number;
    };

    if (duration_minutes !== undefined && duration_minutes < 5) {
      return NextResponse.json(
        { error: 'duration_minutes must be at least 5' },
        { status: 400 }
      );
    }

    if (available_days && available_days.some((d) => d < 0 || d > 6)) {
      return NextResponse.json(
        { error: 'available_days values must be between 0 and 6' },
        { status: 400 }
      );
    }

    const templateErrors = validateServiceTemplates({
      confirmation_template,
      modification_template,
      cancellation_template,
    });
    if (templateErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Template contains unsupported placeholders',
          template_errors: templateErrors,
        },
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
    if (buffer_minutes !== undefined) updates.buffer_minutes = buffer_minutes;
    if (is_active !== undefined) updates.is_active = is_active;
    if (available_days !== undefined) updates.available_days = available_days;
    if (service_start_time !== undefined) updates.service_start_time = service_start_time;
    if (service_end_time !== undefined) updates.service_end_time = service_end_time;
    if (confirmation_template !== undefined) updates.confirmation_template = confirmation_template;
    if (modification_template !== undefined) updates.modification_template = modification_template;
    if (cancellation_template !== undefined) updates.cancellation_template = cancellation_template;
    if (duration_per_additional_person_minutes !== undefined) updates.duration_per_additional_person_minutes = Math.max(0, duration_per_additional_person_minutes);

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
