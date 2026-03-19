/**
 * Module: app/api/documents/[documentId]/route.ts
 * API route or server helper for documents/[documentId]/route.ts.
 */

import { NextRequest } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

type DocumentStorageRow = {
  minio_key: string | null
  minio_bucket: string | null
}

/**
 * DELETE /api/documents/[documentId]
 * Deletes the file from MinIO then soft-deletes the Supabase record.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params
    const supabase = getSupabaseClient()
    const s3Client = getS3Client()

    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('minio_key, minio_bucket')
      .eq('id', documentId)
      .single<DocumentStorageRow>()

    if (fetchError || !doc || !doc.minio_key || !doc.minio_bucket) {
      return apiError('Document not found', 404)
    }

    const storedBucket = String(doc.minio_bucket || '')

    if (storedBucket === R2_BUCKET && isR2Configured()) {
      const r2Client = getR2Client()
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: doc.minio_key,
        }),
      )
    } else {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: storedBucket || MINIO_BUCKET,
          Key: doc.minio_key,
        }),
      )

      // Best-effort cleanup in R2 too, if object was already migrated or duplicated
      if (isR2Configured()) {
        try {
          const r2Client = getR2Client()
          await r2Client.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: doc.minio_key,
            }),
          )
        } catch {
          // Ignore cleanup failures
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('documents')
      .update({ deleted: true })
      .eq('id', documentId)

    if (deleteError) throw deleteError

    return apiOk({ deletedDocumentId: documentId })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to delete document'), 500)
  }
}
