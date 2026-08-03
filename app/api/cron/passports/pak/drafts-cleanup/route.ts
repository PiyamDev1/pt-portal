import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RETENTION_DAYS = 30
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

type DraftCleanupRow = {
  id: string
  draft_id: string
}

type DocumentCleanupRow = {
  id: string
  minio_key: string | null
  minio_bucket: string | null
}

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return true
  }

  const authHeader = request.headers.get('authorization')
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  return authHeader === `Bearer ${cronSecret}` || vercelCronHeader === '1'
}

async function deleteStoredDocument(document: DocumentCleanupRow) {
  if (!document.minio_key) return

  const bucket = document.minio_bucket || MINIO_BUCKET
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: document.minio_key })

  if (bucket === R2_BUCKET && isR2Configured()) {
    await getR2Client().send(command)
    return
  }

  await getS3Client().send(command)

  if (isR2Configured()) {
    try {
      await getR2Client().send(
        new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: document.minio_key }),
      )
    } catch {
      // Best-effort fallback cleanup.
    }
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return apiError('Unauthorized', 401)
  }

  try {
    const supabase = getSupabaseClient()
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: drafts, error: draftError } = await supabase
      .from('pakistani_passport_drafts')
      .select('id, draft_id')
      .eq('status', 'Cancelled')
      .is('converted_application_id', null)
      .in('payment_status', ['unknown', 'not_taken', 'refunded'])
      .lte('cancelled_at', cutoff)
      .limit(100)

    if (draftError) throw draftError

    const eligibleDrafts = (drafts || []) as DraftCleanupRow[]
    if (eligibleDrafts.length === 0) {
      return apiOk({
        deletedDraftCount: 0,
        deletedDocumentCount: 0,
        retentionDays: RETENTION_DAYS,
      })
    }

    const draftRowIds = eligibleDrafts.map((draft) => draft.id)
    const draftDocumentKeys = eligibleDrafts.map((draft) => draft.draft_id)

    const { data: documents, error: documentFetchError } = await supabase
      .from('documents')
      .select('id, minio_key, minio_bucket')
      .in('family_head_id', draftDocumentKeys)
      .eq('deleted', false)

    if (documentFetchError) throw documentFetchError

    const documentRows = (documents || []) as DocumentCleanupRow[]
    let deletedDocumentCount = 0

    for (const document of documentRows) {
      try {
        await deleteStoredDocument(document)
      } catch {
        // Continue cleanup even if object storage already lost the file.
      }

      const { error: softDeleteError } = await supabase
        .from('documents')
        .update({ deleted: true })
        .eq('id', document.id)

      if (!softDeleteError) {
        deletedDocumentCount += 1
      }
    }

    const { error: deleteDraftError } = await supabase
      .from('pakistani_passport_drafts')
      .delete()
      .in('id', draftRowIds)

    if (deleteDraftError) throw deleteDraftError

    return apiOk({
      deletedDraftCount: eligibleDrafts.length,
      deletedDocumentCount,
      retentionDays: RETENTION_DAYS,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Pakistani passport draft cleanup failed'), 500)
  }
}
