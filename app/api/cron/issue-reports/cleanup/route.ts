import { NextResponse } from 'next/server'
import { deleteIssueArtifact } from '@/lib/issueReportStorage'
import { getSupabaseClient } from '@/lib/supabaseClient'

const ARTIFACT_RETENTION_DAYS = 30
const TICKET_RETENTION_DAYS = 60

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return true
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseClient()
  const issueReportArtifactsTable = supabase.from('issue_report_artifacts') as any
  const issueReportsTable = supabase.from('issue_reports') as any
  const now = new Date()
  const artifactPurgeBefore = new Date(now.getTime() - ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const ticketDeleteBefore = new Date(now.getTime() - TICKET_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: artifactReports } = await supabase
    .from('issue_reports')
    .select('id')
    .in('status', ['solved', 'closed'])
    .lte('solved_at', artifactPurgeBefore)

  const artifactReportIds = ((artifactReports || []) as Array<{ id: string }>).map((row) => row.id)
  let deletedArtifactCount = 0

  if (artifactReportIds.length > 0) {
    const { data: artifacts } = await supabase
      .from('issue_report_artifacts')
      .select('*')
      .in('ticket_id', artifactReportIds)
      .is('deleted_at', null)

    for (const artifact of (artifacts || []) as Array<{ id: string; storage_bucket: string; storage_key: string }>) {
      try {
        await deleteIssueArtifact(artifact.storage_bucket, artifact.storage_key)
        await issueReportArtifactsTable
          .update({ deleted_at: now.toISOString() })
          .eq('id', artifact.id)
        deletedArtifactCount += 1
      } catch (error) {
        console.error('Failed to purge issue artifact:', artifact.id, error)
      }
    }
  }

  const { data: ticketsToDelete } = await supabase
    .from('issue_reports')
    .select('id')
    .in('status', ['solved', 'closed'])
    .lte('solved_at', ticketDeleteBefore)

  const ticketIdsToDelete = ((ticketsToDelete || []) as Array<{ id: string }>).map((row) => row.id)
  let deletedTicketCount = 0

  if (ticketIdsToDelete.length > 0) {
    const { data: remainingArtifacts } = await supabase
      .from('issue_report_artifacts')
      .select('*')
      .in('ticket_id', ticketIdsToDelete)
      .is('deleted_at', null)

    for (const artifact of (remainingArtifacts || []) as Array<{ id: string; storage_bucket: string; storage_key: string }>) {
      try {
        await deleteIssueArtifact(artifact.storage_bucket, artifact.storage_key)
      } catch (error) {
        console.error('Failed to delete artifact before ticket cleanup:', artifact.id, error)
      }
    }

    const { error: deleteError } = await issueReportsTable
      .delete()
      .in('id', ticketIdsToDelete)

    if (!deleteError) {
      deletedTicketCount = ticketIdsToDelete.length
    }
  }

  return NextResponse.json({
    ok: true,
    deletedArtifactCount,
    deletedTicketCount,
    retention: {
      artifactDays: ARTIFACT_RETENTION_DAYS,
      ticketDays: TICKET_RETENTION_DAYS,
    },
  })
}