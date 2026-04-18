/**
 * /api/hr/leave/requests
 *
 * GET: list caller's leave requests
 * POST: create leave request and enqueue integration outbox event
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { enqueueIntegrationEvent } from '@/lib/integrations/frappe/syncEngine'

export const dynamic = 'force-dynamic'

type LeaveRequestPayload = {
  leaveTypeId: string
  fromDate: string
  toDate: string
  requestedDays: number
  halfDay?: boolean
  halfDayDate?: string | null
}

async function getSessionUser() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { session },
  } = await authClient.auth.getSession()

  return session?.user || null
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return apiError('Unauthorized', 401)
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('leave_requests')
      .select('id, leave_type_id, from_date, to_date, half_day, half_day_date, requested_days, status, created_at, updated_at')
      .eq('employee_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return apiOk({ requests: data || [] })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to load leave requests'), 500)
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('Unauthorized', 401)
  }

  try {
    const body = (await request.json()) as LeaveRequestPayload

    if (!body.leaveTypeId || !body.fromDate || !body.toDate || !body.requestedDays) {
      return apiError('leaveTypeId, fromDate, toDate and requestedDays are required', 400)
    }

    const supabase = getSupabaseClient()
    const { data: inserted, error: insertError } = await supabase
      .from('leave_requests')
      .insert({
        employee_id: user.id,
        leave_type_id: body.leaveTypeId,
        from_date: body.fromDate,
        to_date: body.toDate,
        requested_days: body.requestedDays,
        half_day: body.halfDay === true,
        half_day_date: body.halfDay ? body.halfDayDate || body.fromDate : null,
        status: 'pending',
        source_system: 'pt_portal',
      })
      .select('id, employee_id, leave_type_id, from_date, to_date, half_day, half_day_date, requested_days, status, approver_id, rejection_reason, frappe_docname, sync_version')
      .single()

    if (insertError || !inserted) {
      throw insertError || new Error('Unable to insert leave request')
    }

    await enqueueIntegrationEvent({
      domain: 'leave',
      eventType: 'leave.requested',
      aggregateId: inserted.id,
      dedupeKey: `leave:requested:${inserted.id}:v${inserted.sync_version}`,
      payload: inserted,
    })

    return apiOk({ ok: true, request: inserted })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to create leave request'), 500)
  }
}
