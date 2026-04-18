/**
 * /api/hr/leave/requests/[id]
 *
 * PATCH: approve/reject/cancel leave request and enqueue outbox event.
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { enqueueIntegrationEvent } from '@/lib/integrations/frappe/syncEngine'

export const dynamic = 'force-dynamic'

type PatchPayload = {
  action: 'approve' | 'reject' | 'cancel'
  rejectionReason?: string
}

type EmployeeRoleRow = {
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null
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

async function isAdminUser(userId: string) {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from('employees')
    .select('roles(name)')
    .eq('id', userId)
    .maybeSingle<EmployeeRoleRow>()

  const role = Array.isArray(data?.roles) ? data?.roles[0]?.name : data?.roles?.name
  const normalized = String(role || '')
    .trim()
    .toLowerCase()

  return ['admin', 'master admin', 'maintenance admin', 'super admin'].includes(normalized)
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('Unauthorized', 401)
  }

  const { id } = await context.params

  if (!id) {
    return apiError('Missing leave request id', 400)
  }

  try {
    const body = (await request.json()) as PatchPayload
    if (!body.action) {
      return apiError('action is required', 400)
    }

    const supabase = getSupabaseClient()
    const { data: existing, error: existingError } = await supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type_id, from_date, to_date, half_day, half_day_date, requested_days, status, approver_id, rejection_reason, frappe_docname, sync_version')
      .eq('id', id)
      .single()

    if (existingError || !existing) {
      return apiError('Leave request not found', 404)
    }

    const isOwner = existing.employee_id === user.id
    const isAdmin = await isAdminUser(user.id)

    let nextStatus: 'approved' | 'rejected' | 'cancelled'
    if (body.action === 'approve') {
      nextStatus = 'approved'
    } else if (body.action === 'reject') {
      nextStatus = 'rejected'
    } else {
      nextStatus = 'cancelled'
    }

    // Owner can only cancel own request; approval paths require admin/approver authority.
    if (!isAdmin) {
      if (!isOwner || nextStatus !== 'cancelled') {
        return apiError('Forbidden', 403)
      }
    }

    const patch: Record<string, unknown> = {
      status: nextStatus,
      sync_version: Number(existing.sync_version || 1) + 1,
    }

    if (nextStatus === 'approved') {
      patch.approver_id = user.id
      patch.approved_at = new Date().toISOString()
      patch.rejection_reason = null
    }

    if (nextStatus === 'rejected') {
      patch.approver_id = user.id
      patch.approved_at = null
      patch.rejection_reason = body.rejectionReason || 'Rejected'
    }

    if (nextStatus === 'cancelled') {
      patch.approved_at = null
      patch.rejection_reason = null
    }

    const { data: updated, error: updateError } = await supabase
      .from('leave_requests')
      .update(patch)
      .eq('id', id)
      .select('id, employee_id, leave_type_id, from_date, to_date, half_day, half_day_date, requested_days, status, approver_id, rejection_reason, frappe_docname, sync_version')
      .single()

    if (updateError || !updated) {
      throw updateError || new Error('Unable to update leave request')
    }

    await enqueueIntegrationEvent({
      domain: 'leave',
      eventType: `leave.${body.action}`,
      aggregateId: updated.id,
      dedupeKey: `leave:${body.action}:${updated.id}:v${updated.sync_version}`,
      payload: updated,
    })

    return apiOk({ ok: true, request: updated })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to update leave request'), 500)
  }
}
