import { validateBookingTemplate } from '@/lib/bookingEmail'

export const BOOKING_SERVICE_SCHEMA_HINT =
  'Booking schema is out of date. Run scripts/bootstrap/create-bookings-schema.sql in Supabase SQL editor.'

export interface BookingServicePortalSettingsInput {
  customer_visible?: unknown
  customer_description?: unknown
  customer_max_group_size?: unknown
  customer_modification_cutoff_hours?: unknown
}

export interface BookingServiceTemplateInput {
  confirmation_template?: string | null
  modification_template?: string | null
  cancellation_template?: string | null
}

export interface BookingServiceTemplateValidationError {
  field: keyof BookingServiceTemplateInput
  invalidTokens: string[]
}

export function isBookingServiceSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10' || code === 'PGRST204'
}

export function isMissingBookingServiceTimingColumns(error: unknown): boolean {
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

export function getBookingServicePortalSettingsError(
  input: BookingServicePortalSettingsInput,
): string | null {
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

export function validateBookingServiceTemplates(
  input: BookingServiceTemplateInput,
): BookingServiceTemplateValidationError[] {
  const checks = (
    [
      ['confirmation_template', input.confirmation_template],
      ['modification_template', input.modification_template],
      ['cancellation_template', input.cancellation_template],
    ] as const
  ).filter((entry): entry is [keyof BookingServiceTemplateInput, string] => {
    const value = entry[1]
    return typeof value === 'string' && value.trim().length > 0
  })

  return checks.flatMap(([field, value]) => {
    const result = validateBookingTemplate(value)
    return result.valid ? [] : [{ field, invalidTokens: result.invalidTokens }]
  })
}
