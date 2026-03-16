import { NextResponse } from 'next/server'
import { verifyMasterAdminSession } from '@/lib/issueReportAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { readIssueArtifact } from '@/lib/issueReportStorage'

export async function GET(_: Request, context: { params: Promise<{ reportId: string; artifactId: string }> }) {
  const auth = await verifyMasterAdminSession()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { reportId, artifactId } = await context.params
  const supabase = getSupabaseClient()
  const { data: artifact, error } = await supabase
    .from('issue_report_artifacts')
    .select('*')
    .eq('id', artifactId)
    .eq('ticket_id', reportId)
    .is('deleted_at', null)
    .single()

  if (error || !artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
  }

  const artifactRecord = artifact as {
    storage_bucket: string
    storage_key: string
    content_type: string
  }

  const content = await readIssueArtifact(artifactRecord.storage_bucket, artifactRecord.storage_key)
  return new NextResponse(content.body, {
    headers: {
      'Content-Type': artifactRecord.content_type || content.contentType,
      'Cache-Control': 'private, max-age=60',
    },
  })
}
