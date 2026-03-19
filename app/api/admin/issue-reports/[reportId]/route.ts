/**
 * GET/PATCH /api/admin/issue-reports/[reportId]
 * Fetches full issue detail and updates assignment/status lifecycle fields.
 *
 * @module app/api/admin/issue-reports/[reportId]
 */

import { verifyMasterAdminSession } from '@/lib/issueReportAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { normalizeStatus } from '@/lib/issueReportUtils'
import { readIssueArtifact } from '@/lib/issueReportStorage'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const ARTIFACT_RETENTION_DAYS = 30

export async function GET(_: Request, context: { params: Promise<{ reportId: string }> }) {
  const auth = await verifyMasterAdminSession()
  if (!auth.authorized) {
    return apiError(auth.error ?? 'Unauthorized', auth.status)
  }

  const { reportId } = await context.params
  const supabase = getSupabaseClient()

  const [
    { data: report, error: reportError },
    { data: artifacts, error: artifactsError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    supabase.from('issue_reports').select('*').eq('id', reportId).single(),
    supabase
      .from('issue_report_artifacts')
      .select('*')
      .eq('ticket_id', reportId)
      .order('created_at', { ascending: false }),
    supabase
      .from('issue_report_events')
      .select('*')
      .eq('ticket_id', reportId)
      .order('created_at', { ascending: false }),
  ])

  if (reportError || !report) {
    return apiError(reportError?.message || 'Issue report not found', 404)
  }

  if (artifactsError || eventsError) {
    return apiError(
      artifactsError?.message || eventsError?.message || 'Failed to load issue report details',
      500,
    )
  }

  const artifactRows = (artifacts || []) as Array<{
    id: string
    artifact_type: 'screenshot' | 'console_log'
    deleted_at: string | null
    storage_bucket: string
    storage_key: string
  }>

  const screenshotArtifact = artifactRows.find(
    (artifact) => artifact.artifact_type === 'screenshot' && !artifact.deleted_at,
  )
  const consoleArtifact = artifactRows.find(
    (artifact) => artifact.artifact_type === 'console_log' && !artifact.deleted_at,
  )

  let consoleEntries: unknown[] = []
  if (consoleArtifact) {
    try {
      const content = await readIssueArtifact(
        consoleArtifact.storage_bucket,
        consoleArtifact.storage_key,
      )
      consoleEntries = JSON.parse(content.body.toString('utf8'))
    } catch (error) {
      console.error('Failed to load console artifact:', error)
    }
  }

  return apiOk({
    report,
    artifacts: artifactRows,
    events: events || [],
    screenshotUrl: screenshotArtifact
      ? `/api/admin/issue-reports/${reportId}/artifacts/${screenshotArtifact.id}`
      : null,
    consoleEntries,
  })
}

export async function PATCH(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const auth = await verifyMasterAdminSession()
  if (!auth.authorized) {
    return apiError(auth.error ?? 'Unauthorized', auth.status)
  }

  const { reportId } = await context.params
  const body = await request.json()
  const hasStatus = typeof body?.status === 'string' && body.status.trim().length > 0
  const status = hasStatus ? normalizeStatus(body?.status) : null
  const hasAssignment = Object.prototype.hasOwnProperty.call(body || {}, 'assignedToUserId')
  const assignedToUserId = hasAssignment ? body?.assignedToUserId || null : undefined
  const adminNote = String(body?.adminNote || '')
    .trim()
    .slice(0, 2000)

  if (!hasStatus && !hasAssignment) {
    return apiError('No status or assignment update was provided.', 400)
  }

  const now = new Date()
  const solvedAt = status === 'solved' ? now.toISOString() : null
  const artifactPurgeAfter =
    status === 'solved'
      ? new Date(now.getTime() + ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null
  const closedAt = status === 'closed' ? now.toISOString() : null

  const updates: Record<string, unknown> = {
    updated_at: now.toISOString(),
    last_status_changed_by: auth.user?.id || null,
  }

  if (hasAssignment) {
    updates.assigned_to_user_id = assignedToUserId
  }

  if (status) {
    updates.status = status
    if (status === 'solved') {
      updates.solved_at = solvedAt
      updates.artifact_purge_after = artifactPurgeAfter
      updates.closed_at = null
    } else if (status === 'closed') {
      updates.closed_at = closedAt
    } else {
      updates.closed_at = null
      updates.artifact_purge_after = null
      updates.solved_at = null
    }
  }

  const supabase = getSupabaseClient()
  const issueReportsTable = supabase.from('issue_reports')
  const issueReportEventsTable = supabase.from('issue_report_events')

  const { data, error } = await issueReportsTable
    .update(updates)
    .eq('id', reportId)
    .select('*')
    .single()

  if (error || !data) {
    return apiError(error?.message || 'Failed to update ticket status', 500)
  }

  await issueReportEventsTable.insert({
    ticket_id: reportId,
    actor_user_id: auth.user?.id || null,
    action:
      hasStatus && hasAssignment
        ? 'status_and_assignment_changed'
        : hasStatus
          ? 'status_changed'
          : 'assignment_changed',
    details: {
      status,
      assignedToUserId: hasAssignment ? assignedToUserId : undefined,
      adminNote,
      artifactPurgeAfter,
    },
  })

  return apiOk({
    reportId: data.id,
    status: data.status,
    updatedAt: data.updated_at,
  })
}
