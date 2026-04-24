import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { validateBookingTemplate } from '@/lib/bookingEmail';

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10' || code === 'PGRST204';
}

function isMissingAdditionalPersonColumn(error: unknown): boolean {
  const payload = error as { message?: string; details?: string; hint?: string } | null;
  const haystack = `${payload?.message ?? ''} ${payload?.details ?? ''} ${payload?.hint ?? ''}`.toLowerCase();
  return haystack.includes('duration_per_additional_person_minutes') && haystack.includes('schema cache');
}

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
      if (!value?.trim()) return null;
      const result = validateBookingTemplate(value);
      if (result.valid) return null;
      return { field, invalidTokens: result.invalidTokens };
    })
    .filter((item): item is TemplateValidationError => item !== null);
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
    const routeSupabase = await getRouteSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await routeSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      location_id,
      name,
      duration_minutes,
      buffer_minutes,
      available_days,
      service_start_time,
      service_end_time,
      confirmation_template,
      modification_template,
      cancellation_template,
      duration_per_additional_person_minutes,
    } = body as {
      location_id: string;
      name: string;
      duration_minutes: number;
      buffer_minutes: number;
      available_days?: number[] | null;
      service_start_time?: string | null;
      service_end_time?: string | null;
      confirmation_template?: string | null;
      modification_template?: string | null;
      cancellation_template?: string | null;
      duration_per_additional_person_minutes?: number;
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

    const supabase = getSupabaseClient();

    const insertPayload = {
      location_id,
      name,
      confirmation_template: confirmation_template ?? null,
      modification_template: modification_template ?? null,
      cancellation_template: cancellation_template ?? null,
      duration_per_additional_person_minutes: duration_per_additional_person_minutes ?? 0,
      duration_minutes,
      buffer_minutes: buffer_minutes ?? 15,
      available_days: available_days ?? null,
      service_start_time: service_start_time ?? null,
      service_end_time: service_end_time ?? null,
    };

    let { data, error } = await supabase
      .from('booking_services')
      .insert(insertPayload)
      .select()
      .single();

    // Backward compatibility while DB migration is pending.
    if (error && isMissingAdditionalPersonColumn(error)) {
      const fallbackPayload = { ...insertPayload } as Record<string, unknown>;
      delete fallbackPayload.duration_per_additional_person_minutes;

      const retry = await supabase
        .from('booking_services')
        .insert(fallbackPayload)
        .select()
        .single();

      data = retry.data;
      error = retry.error;
    }

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
