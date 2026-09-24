import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { validateBookingTemplate } from '@/lib/bookingEmail'
import { requireAdminSession } from '@/lib/adminSessionAuth'

const SCHEMA_HINT =
  'Booking schema is out of date. Run scripts/bootstrap/create-bookings-schema.sql in Supabase SQL editor.'

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10' || code === 'PGRST204'
}

function isMissingServiceTimingColumns(error: unknown): boolean {
  const payload = error as { message?: string; details?: string; hint?: string } | null
  const haystack =
    `${payload?.message ?? ''} ${payload?.details ?? ''} ${payload?.hint ?? ''}`.toLowerCase()
  if (!haystack.includes('schema cache')) return false
  return (
    haystack.includes('duration_per_additional_person_minutes') ||
    haystack.includes('person_count_excludes_family_head') ||
    haystack.includes('close_overrun_tolerance_minutes')
  )
}

type TemplateValidationError = { field: string; invalidTokens: string[] }

function customerPortalSettingsError(input: {
  customer_visible?: unknown
  customer_description?: unknown
  customer_max_group_size?: unknown
  customer_modification_cutoff_hours?: unknown
}): string | null {
  if (input.customer_visible !== undefined && typeof input.customer_visible !== 'boolean') {
    return 'customer_visible must be true or false'
  }
  if (
    input.customer_description !== undefined &&
    input.customer_description !== null &&
    typeof input.customer_description !== 'string'
  ) {
    return 'customer_description must be text'
  }
  if (
    typeof input.customer_description === 'string' &&
    input.customer_description.trim().length > 1000
  ) {
    return 'customer_description must be 1000 characters or fewer'
  }
  if (input.customer_max_group_size !== undefined) {
    const value = input.customer_max_group_size
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
      return 'customer_max_group_size must be a whole number from 1 to 100'
    }
  }
  if (input.customer_modification_cutoff_hours !== undefined) {
    const value = input.customer_modification_cutoff_hours
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 168) {
      return 'customer_modification_cutoff_hours must be a whole number from 0 to 168'
    }
  }
  return null
}

function validateServiceTemplates(input: {
  confirmation_template?: string | null
  modification_template?: string | null
  cancellation_template?: string | null
}): TemplateValidationError[] {
  const checks: Array<{ field: string; value: string | null | undefined }> = [
    { field: 'confirmation_template', value: input.confirmation_template },
    { field: 'modification_template', value: input.modification_template },
    { field: 'cancellation_template', value: input.cancellation_template },
  ]

  return checks
    .map(({ field, value }) => {
      if (!value?.trim()) return null
      const result = validateBookingTemplate(value)
      if (result.valid) return null
      return { field, invalidTokens: result.invalidTokens }
    })
    .filter((item): item is TemplateValidationError => item !== null)
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
      if (isSchemaError(error)) {
        return NextResponse.json({ services: [], warning: SCHEMA_HINT }, { status: 200 })
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

    const portalSettingsError = customerPortalSettingsError({
      customer_visible,
      customer_description,
      customer_max_group_size,
      customer_modification_cutoff_hours,
    })
    if (portalSettingsError) {
      return NextResponse.json({ error: portalSettingsError }, { status: 400 })
    }

    const templateErrors = validateServiceTemplates({
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
    if (error && isMissingServiceTimingColumns(error)) {
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
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, service: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
