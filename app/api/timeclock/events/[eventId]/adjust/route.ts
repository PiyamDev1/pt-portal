import { NextResponse } from 'next/server'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type RouteContext = {
  params: Promise<{
    eventId: string
  }>
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
      return NextResponse.json({ error: 'Missing event id' }, { status: 400 })
    }

    if (!adjustedTime) {
      return NextResponse.json({ error: 'Adjusted time is required' }, { status: 400 })
    }

    if (!reason || reason.length < 8) {
      return NextResponse.json({ error: 'Provide a short reason for the adjustment' }, { status: 400 })
    }

    const normalizedAdjustedTime = new Date(adjustedTime)
    if (Number.isNaN(normalizedAdjustedTime.getTime())) {
      return NextResponse.json({ error: 'Invalid adjusted time' }, { status: 400 })
    }

    const supabase = getSupabaseClient()
    const { data: existingEvent, error: fetchError } = await (supabase.from('timeclock_events') as any)
      .select('id, adjusted_at, scanned_at, device_ts, employee_id, punch_type')
      .eq('id', eventId)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!existingEvent) {
      return NextResponse.json({ error: 'Timeclock event not found' }, { status: 404 })
    }

    if (existingEvent.adjusted_at) {
      return NextResponse.json({ error: 'This punch has already been adjusted once' }, { status: 409 })
    }

    const adjustedIso = normalizedAdjustedTime.toISOString()
    const nowIso = new Date().toISOString()

    const { data: updatedEvent, error: updateError } = await (supabase.from('timeclock_events') as any)
      .update({
        adjusted_device_ts: adjustedIso,
        adjusted_scanned_at: adjustedIso,
        adjusted_at: nowIso,
        adjusted_by: auth.user.id,
        adjustment_reason: reason,
      })
      .eq('id', eventId)
      .is('adjusted_at', null)
      .select('id, employee_id, punch_type, device_ts, scanned_at, adjusted_device_ts, adjusted_scanned_at, adjusted_at, adjustment_reason')
      .maybeSingle()

    if (updateError) {
      throw updateError
    }

    if (!updatedEvent) {
      return NextResponse.json({ error: 'This punch has already been adjusted once' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      message: 'Recorded time adjusted successfully',
      event: updatedEvent,
    })
  } catch (error: any) {
    console.error('[TIMECLOCK ADJUST] Error:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}