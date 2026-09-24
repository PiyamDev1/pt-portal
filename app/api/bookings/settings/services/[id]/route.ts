import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { validateBookingTemplate } from '@/lib/bookingEmail'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import type { Database } from '@/types/supabase'

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
type BookingServiceUpdate = Database['public']['Tables']['booking_services']['Update']

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
      if (value === undefined || value === null || value.trim() === '') return null
      const result = validateBookingTemplate(value)
      if (result.valid) return null
      return { field, invalidTokens: result.invalidTokens }
    })
    .filter((item): item is TemplateValidationError => item !== null)
}

/**
 * PATCH /api/bookings/settings/services/[id]
 * Updates a service (name, duration, buffer, is_active)
 *
 * DELETE /api/bookings/settings/services/[id]
 * Deletes a service (only if no bookings reference it)
 */

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireAdminSession()
    if (!access.authorized) return access.response

    const { id } = await params
    const body = await request.json()
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
      person_count_excludes_family_head,
      close_overrun_tolerance_minutes,
      customer_visible,
      customer_description,
      customer_max_group_size,
      customer_modification_cutoff_hours,
    } = body as {
      name?: string
      duration_minutes?: number
      buffer_minutes?: number
      is_active?: boolean
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

    if (duration_minutes !== undefined && duration_minutes < 5) {
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

    const updates: BookingServiceUpdate = {}
    if (name !== undefined) updates.name = name
    if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes
    if (buffer_minutes !== undefined) updates.buffer_minutes = buffer_minutes
    if (is_active !== undefined) updates.is_active = is_active
    if (available_days !== undefined) updates.available_days = available_days
    if (service_start_time !== undefined) updates.service_start_time = service_start_time
    if (service_end_time !== undefined) updates.service_end_time = service_end_time
    if (confirmation_template !== undefined) updates.confirmation_template = confirmation_template
    if (modification_template !== undefined) updates.modification_template = modification_template
    if (cancellation_template !== undefined) updates.cancellation_template = cancellation_template
    if (duration_per_additional_person_minutes !== undefined)
      updates.duration_per_additional_person_minutes = Math.max(
        0,
        duration_per_additional_person_minutes,
      )
    if (person_count_excludes_family_head !== undefined)
      updates.person_count_excludes_family_head = person_count_excludes_family_head
    if (close_overrun_tolerance_minutes !== undefined)
      updates.close_overrun_tolerance_minutes = Math.max(0, close_overrun_tolerance_minutes)
    if (customer_visible !== undefined) updates.customer_visible = customer_visible
    if (customer_description !== undefined)
      updates.customer_description = customer_description?.trim() || null
    if (customer_max_group_size !== undefined)
      updates.customer_max_group_size = customer_max_group_size
    if (customer_modification_cutoff_hours !== undefined)
      updates.customer_modification_cutoff_hours = customer_modification_cutoff_hours

    let { data, error } = await supabase
      .from('booking_services')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    // Backward compatibility while DB migration is pending.
    if (error && isMissingServiceTimingColumns(error)) {
      const fallbackUpdates = { ...updates }
      delete fallbackUpdates.duration_per_additional_person_minutes
      delete fallbackUpdates.person_count_excludes_family_head
      delete fallbackUpdates.close_overrun_tolerance_minutes
      const retry = await supabase
        .from('booking_services')
        .update(fallbackUpdates)
        .eq('id', id)
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

    return NextResponse.json({ success: true, service: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAdminSession()
    if (!access.authorized) return access.response

    const { id } = await params
    const supabase = getSupabaseClient()

    // Check if any non-cancelled bookings reference this service
    const { count, error: countError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', id)
      .neq('status', 'cancelled')

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} active booking(s) use this service` },
        { status: 409 },
      )
    }

    const { error } = await supabase.from('booking_services').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
