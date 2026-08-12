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
import { requireStaffSession } from '@/lib/auth/staffSession'
import { findStoredDocumentById } from '@/lib/services/documentServer'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

/**
 * DELETE /api/documents/[documentId]
 * Revokes database access first, then removes the exact resolved storage object.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { documentId } = await params
    const supabase = getSupabaseClient()
    const s3Client = getS3Client()

    const document = await findStoredDocumentById(documentId)
    if (!document) return apiError('Document not found', 404)

    const storedBucket = document.bucket

    if (storedBucket === R2_BUCKET && !isR2Configured()) {
      return apiError('Fallback document storage is unavailable', 503)
    }

    const { error: deleteError } = await supabase
      .from('documents')
      .update({ deleted: true })
      .eq('id', documentId)
      .eq('deleted', false)

    if (deleteError) throw deleteError

    try {
      if (storedBucket === R2_BUCKET && isR2Configured()) {
        const r2Client = getR2Client()
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: document.key,
          }),
        )
      } else {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: storedBucket || MINIO_BUCKET,
            Key: document.key,
          }),
        )

        // Best-effort cleanup in R2 too, if object was already migrated or duplicated
        if (isR2Configured()) {
          try {
            const r2Client = getR2Client()
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: R2_BUCKET,
                Key: document.key,
              }),
            )
          } catch {
            // Ignore cleanup failures
          }
        }
      }
    } catch (storageError) {
      const { error: restoreError } = await supabase
        .from('documents')
        .update({ deleted: false })
        .eq('id', documentId)
        .eq('deleted', true)

      if (restoreError) {
        console.error('[documents.delete] Failed to restore document metadata:', restoreError)
      }
      throw storageError
    }

    // has_documents is kept in sync automatically by the
    // trg_sync_has_documents PostgreSQL trigger on the documents table.
    return apiOk({ deletedDocumentId: documentId })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to delete document'), 500)
  }
}
