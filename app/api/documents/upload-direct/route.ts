/**
 * Module: app/api/documents/upload-direct/route.ts
 * API route or server helper for documents/upload-direct/route.ts.
 */

import { NextRequest } from 'next/server'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError, apiOk } from '@/lib/api/http'
import { parseMultipartFormDataWithLimit } from '@/lib/api/request'
import { toErrorMessage } from '@/lib/api/error'
import { reportOperationalError, responseWithRequestId } from '@/lib/observability/server'
import { documentScopeExists } from '@/lib/documentAccess'
import {
  isValidDocumentScopeId,
  normalizeDocumentUploadCategory,
  validateDocumentUpload,
} from '@/lib/documentSecurity'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import {
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILE_SIZE_LABEL,
} from '@/lib/documentConstraints'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const DOCUMENT_MULTIPART_MAX_BYTES = DOCUMENT_MAX_FILE_SIZE_BYTES + 256 * 1024

/**
 * POST /api/documents/upload-direct
 * Reliable server-side upload fallback when presigned browser PUT is unstable.
 * Uses singleton S3 client for efficiency.
 */
export async function POST(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'staff.document-upload',
    limit: 20,
    windowSeconds: 10 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  try {
    const parsedForm = await parseMultipartFormDataWithLimit(request, DOCUMENT_MULTIPART_MAX_BYTES)
    if (!parsedForm.data) {
      return apiError(
        parsedForm.status === 413
          ? `File size exceeds maximum of ${DOCUMENT_MAX_FILE_SIZE_LABEL}`
          : parsedForm.error,
        parsedForm.status,
      )
    }
    const formData = parsedForm.data
    const fileValue = formData.get('file')
    const file = fileValue && typeof fileValue !== 'string' ? fileValue : null
    const familyHeadId = String(formData.get('familyHeadId') || '')
    const category = normalizeDocumentUploadCategory(formData.get('category'))

    if (!file || !familyHeadId) {
      return apiError('Missing required fields', 400)
    }
    if (!isValidDocumentScopeId(familyHeadId)) {
      return apiError('Invalid document scope', 400)
    }
    if (!category) {
      return apiError('Invalid document category', 400)
    }
    if (!(await documentScopeExists(familyHeadId))) {
      return apiError('Document scope not found', 404)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = validateDocumentUpload(file, buffer)
    if (!validation.valid) {
      return apiError(validation.error, validation.status)
    }
    const { fileName, fileSize, fileType } = validation.value

    const documentId = `doc-${crypto.randomUUID()}`
    const storageFileName = fileName.replace(/\s+/g, '-')
    const minioKey = `family-${familyHeadId}/${category}/${documentId}-${storageFileName}`

    let etag = `unknown-${documentId}`
    let storageProvider: 'minio' | 'r2' = 'minio'
    let storageBucket = MINIO_BUCKET
    let storageClient: ReturnType<typeof getS3Client> = getS3Client()

    try {
      const putResult = await storageClient.send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: minioKey,
          Body: buffer,
          ContentType: fileType,
          Metadata: {
            'document-id': documentId,
            'uploaded-by': access.user.id,
          },
        }),
      )
      etag = putResult.ETag || etag
    } catch (minioError) {
      if (!isR2Configured()) {
        throw minioError
      }

      storageClient = getR2Client()
      const fallbackResult = await storageClient.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: minioKey,
          Body: buffer,
          ContentType: fileType,
          Metadata: {
            'document-id': documentId,
            'uploaded-by': access.user.id,
          },
        }),
      )
      storageProvider = 'r2'
      storageBucket = R2_BUCKET
      etag = fallbackResult.ETag || etag
    }

    const { error: insertError } = await getSupabaseClient().from('documents').insert({
      id: documentId,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      category,
      uploaded_at: new Date().toISOString(),
      uploaded_by: access.user.id,
      family_head_id: familyHeadId,
      minio_bucket: storageBucket,
      minio_key: minioKey,
      minio_etag: etag,
      deleted: false,
    })

    if (insertError) {
      try {
        await storageClient.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: minioKey }))
      } catch {
        // Preserve the database error; orphan cleanup can be retried operationally.
      }
      throw insertError
    }

    return apiOk({
      documentId,
      minioKey,
      etag,
      storageProvider,
      storageBucket,
      fileName,
      fileSize,
      fileType,
      category,
      familyHeadId,
    })
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'documents.upload_failed',
      request,
      error,
      alert: true,
    })
    return responseWithRequestId(
      apiError(toErrorMessage(error, 'Failed direct upload'), 500),
      requestId,
    )
  }
}
