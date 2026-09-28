import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import {
  BOOKING_SERVICE_SCHEMA_HINT,
  getBookingServicePortalSettingsError,
  isBookingServiceSchemaError,
  isMissingBookingServiceTimingColumns,
  validateBookingServiceTemplates,
} from '@/lib/bookingServiceSettings'

/**
 * GET /api/bookings/settings/services
 * Returns all booking services
 *
 * POST /api/bookings/settings/services
 * Creates a new service
 */

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location_id')

    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
    }

    const supabase = await getRouteSupabaseClient()

    const { data, error } = await supabase
      .from('booking_services')
      .select('*')
      .eq('location_id', locationId)
      .order('name')

    if (error) {
      if (isBookingServiceSchemaError(error)) {
        return NextResponse.json(
          { services: [], warning: BOOKING_SERVICE_SCHEMA_HINT },
          { status: 200 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ services: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAdminSession()
    if (!access.authorized) return access.response

    const body = await request.json()
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
      person_count_excludes_family_head,
      close_overrun_tolerance_minutes,
      customer_visible,
      customer_description,
      customer_max_group_size,
      customer_modification_cutoff_hours,
    } = body as {
      location_id: string
      name: string
      duration_minutes: number
      buffer_minutes: number
      available_days?: number[] | null
      service_start_time?: string | null
      service_end_time?: string | null
      confirmation_template?: string | null
      modification_template?: string | null
      cancellation_template?: string | null
      duration_per_additional_person_minutes?: number
      person_count_excludes_family_head?: boolean
      close_overrun_tolerance_minutes?: number
      customer_visible?: boolean
      customer_description?: string | null
      customer_max_group_size?: number
      customer_modification_cutoff_hours?: number
    }

    if (!location_id || !name || !duration_minutes) {
      return NextResponse.json(
        { error: 'location_id, name and duration_minutes are required' },
        { status: 400 },
      )
    }

    if (duration_minutes < 5) {
      return NextResponse.json({ error: 'duration_minutes must be at least 5' }, { status: 400 })
    }

    if (available_days && available_days.some((d) => d < 0 || d > 6)) {
      return NextResponse.json(
        { error: 'available_days values must be between 0 and 6' },
        { status: 400 },
      )
    }

    const portalSettingsError = getBookingServicePortalSettingsError({
      customer_visible,
      customer_description,
      customer_max_group_size,
      customer_modification_cutoff_hours,
    })
    if (portalSettingsError) {
      return NextResponse.json({ error: portalSettingsError }, { status: 400 })
    }

    const templateErrors = validateBookingServiceTemplates({
      confirmation_template,
      modification_template,
      cancellation_template,
    })
    if (templateErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Template contains unsupported placeholders',
          template_errors: templateErrors,
        },
        { status: 400 },
      )
    }

    const supabase = getSupabaseClient()

    const insertPayload = {
      location_id,
      name,
      confirmation_template: confirmation_template ?? null,
      modification_template: modification_template ?? null,
      cancellation_template: cancellation_template ?? null,
      duration_per_additional_person_minutes: duration_per_additional_person_minutes ?? 0,
      person_count_excludes_family_head: person_count_excludes_family_head ?? true,
      close_overrun_tolerance_minutes: Math.max(0, close_overrun_tolerance_minutes ?? 15),
      duration_minutes,
      buffer_minutes: buffer_minutes ?? 15,
      available_days: available_days ?? null,
      service_start_time: service_start_time ?? null,
      service_end_time: service_end_time ?? null,
      customer_visible: customer_visible ?? false,
      customer_description: customer_description?.trim() || null,
      customer_max_group_size: customer_max_group_size ?? 20,
      customer_modification_cutoff_hours: customer_modification_cutoff_hours ?? 24,
    }

    let { data, error } = await supabase
      .from('booking_services')
      .insert(insertPayload)
      .select()
      .single()

    // Backward compatibility while DB migration is pending.
    if (error && isMissingBookingServiceTimingColumns(error)) {
      const fallbackPayload = { ...insertPayload } as Record<string, unknown>
      delete fallbackPayload.duration_per_additional_person_minutes
      delete fallbackPayload.person_count_excludes_family_head
      delete fallbackPayload.close_overrun_tolerance_minutes

      const retry = await supabase
        .from('booking_services')
        .insert(fallbackPayload)
        .select()
        .single()

      data = retry.data
      error = retry.error
    }

    if (error) {
      if (isBookingServiceSchemaError(error)) {
        return NextResponse.json({ error: BOOKING_SERVICE_SCHEMA_HINT }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, service: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
