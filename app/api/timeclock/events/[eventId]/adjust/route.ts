import { NextResponse } from 'next/server'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

type RouteContext = {
  params: Promise<{
    eventId: string
  }>
}

type TimeclockAdjustRow = {
  id: string
  adjusted_at: string | null
  adjusted_device_ts: string | null
  adjusted_scanned_at: string | null
  scanned_at: string | null
  device_ts: string | null
  employee_id: string | null
  punch_type: string | null
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireMaintenanceSession()
  if (!auth.authorized) {
    return auth.response
  }

  try {
    const { eventId } = await context.params
    const body = await request.json()
    const adjustedTime = typeof body?.adjustedTime === 'string' ? body.adjustedTime.trim() : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    if (!eventId) {
      return apiError('Missing event id', 400)
    }

    if (!adjustedTime) {
      return apiError('Adjusted time is required', 400)
    }

    if (!reason || reason.length < 8) {
      return apiError('Provide a short reason for the adjustment', 400)
    }

    const normalizedAdjustedTime = new Date(adjustedTime)
    if (Number.isNaN(normalizedAdjustedTime.getTime())) {
      return apiError('Invalid adjusted time', 400)
    }

    const supabase = getSupabaseClient()
    const { data: existingEvent, error: fetchError } = await supabase
      .from('timeclock_events')
      .select('id, adjusted_at, scanned_at, device_ts, employee_id, punch_type')
      .eq('id', eventId)
      .maybeSingle<TimeclockAdjustRow>()

    if (fetchError) {
      throw new Error(fetchError.message || 'Failed to fetch event')
    }

    if (!existingEvent) {
      return apiError('Timeclock event not found', 404)
    }

    if (existingEvent.adjusted_at) {
      return apiError('This punch has already been adjusted once', 409)
    }

    const adjustedIso = normalizedAdjustedTime.toISOString()
    const nowIso = new Date().toISOString()

    const { data: updatedEvent, error: updateError } = await supabase
      .from('timeclock_events')
      .update({
        adjusted_device_ts: adjustedIso,
        adjusted_scanned_at: adjustedIso,
        adjusted_at: nowIso,
        adjusted_by: auth.user.id,
        adjustment_reason: reason,
      })
      .eq('id', eventId)
      .is('adjusted_at', null)
      .select(
        'id, employee_id, punch_type, device_ts, scanned_at, adjusted_device_ts, adjusted_scanned_at, adjusted_at, adjustment_reason',
      )
      .maybeSingle<TimeclockAdjustRow>()

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update event')
    }

    if (!updatedEvent) {
      return apiError('This punch has already been adjusted once', 409)
    }

    return apiOk({
      adjustedEventId: updatedEvent.id,
      punchType: updatedEvent.punch_type,
      adjustedTime: updatedEvent.adjusted_device_ts,
      reason,
    })
  } catch (error: unknown) {
    const errorMessage = toErrorMessage(error, 'Failed to adjust time')
    return apiError(errorMessage, 500)
  }
}
