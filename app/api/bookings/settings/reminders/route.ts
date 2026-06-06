import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getSupabaseClient } from '@/lib/supabaseClient'
import {
  type BookingReminderSettings,
  defaultReminderSettings,
} from '@/lib/bookingReminders'

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/migrations/20260602_add_booking_reminders_and_penalties.sql in Supabase SQL editor.'

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function sanitizeReminderSettings(input: BookingReminderSettings): BookingReminderSettings {
  const reminderHours = Number.isFinite(input.reminder_hours_before)
    ? Math.min(168, Math.max(1, Math.round(input.reminder_hours_before)))
    : 24
  const sameDayHours = Number.isFinite(input.same_day_reminder_hours_before)
    ? Math.min(12, Math.max(1, Math.round(input.same_day_reminder_hours_before)))
    : 2

  const threshold = Number.isFinite(input.penalty_threshold)
    ? Math.min(20, Math.max(1, Math.round(input.penalty_threshold)))
    : 3

  const penaltyAction = input.penalty_action === 'warn_only'
    ? 'warn_only'
    : 'block_until_manual_review'

  return {
    ...input,
    reminders_enabled: input.reminders_enabled !== false,
    reminder_hours_before: reminderHours,
    same_day_reminder_enabled: input.same_day_reminder_enabled !== false,
    same_day_reminder_hours_before: sameDayHours,
    reminder_subject: (input.reminder_subject || '').trim() || defaultReminderSettings(input.location_id).reminder_subject,
    reminder_template: (input.reminder_template || '').trim() || defaultReminderSettings(input.location_id).reminder_template,
    attendance_confirmation_required: input.attendance_confirmation_required !== false,
    penalty_enabled: input.penalty_enabled !== false,
    penalty_threshold: threshold,
    penalty_action: penaltyAction,
    penalty_note: (input.penalty_note || '').trim() || null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location_id')
    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
    }

    const sessionClient = await getRouteSupabaseClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await sessionClient
      .from('booking_reminder_settings')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle()

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ settings: defaultReminderSettings(locationId), warning: SCHEMA_HINT }, { status: 200 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data ?? defaultReminderSettings(locationId) })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      location_id?: string
      settings?: Partial<BookingReminderSettings>
    }

    const locationId = body.location_id
    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
    }

    const sessionClient = await getRouteSupabaseClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const merged = sanitizeReminderSettings({
      ...defaultReminderSettings(locationId),
      ...(body.settings || {}),
      location_id: locationId,
    })

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('booking_reminder_settings')
      .upsert(merged, { onConflict: 'location_id' })
      .select('*')
      .single()

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, settings: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
