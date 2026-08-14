/**
 * Notice board image upload endpoint.
 *
 * Reuses the portal's existing MinIO-first, R2-fallback storage pattern. The returned
 * image URL points at an authenticated IMS proxy route rather than a public bucket URL.
 */

import { NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { apiError, apiOk } from '@/lib/api/http'
import { parseMultipartFormDataWithLimit } from '@/lib/api/request'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { reportOperationalError, responseWithRequestId } from '@/lib/observability/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { isUploadedFile, validateImageUpload } from '@/lib/documentSecurity'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 256 * 1024

export async function POST(request: NextRequest) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.notice-board-upload',
    limit: 10,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  try {
    const parsedForm = await parseMultipartFormDataWithLimit(request, MAX_MULTIPART_BYTES)
    if (!parsedForm.data) {
      return apiError(
        parsedForm.status === 413 ? 'Image must be 5MB or smaller' : parsedForm.error,
        parsedForm.status,
      )
    }
    const formData = parsedForm.data
    const file = formData.get('file')

    if (!isUploadedFile(file)) return apiError('Image file required', 400)
    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = validateImageUpload(file, buffer, {
      maxBytes: MAX_IMAGE_BYTES,
      maxSizeLabel: '5 MB',
    })
    if (!validation.valid) return apiError(validation.error, validation.status)

    const { fileName, fileType } = validation.value
    const extension = fileName.split('.').pop() || 'png'
    const key = `notice-board/${Date.now()}-${crypto.randomUUID()}.${extension}`
    let provider: 'minio' | 'r2' = 'minio'
    let bucket = MINIO_BUCKET

    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: key,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: fileType,
        }),
      )
    } catch (minioError) {
      if (!isR2Configured()) throw minioError
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: fileType,
        }),
      )
      provider = 'r2'
      bucket = R2_BUCKET
    }

    const imageUrl = `/api/dashboard/notice-board/image?key=${encodeURIComponent(key)}`

    return apiOk({
      imageUrl,
      image_storage_provider: provider,
      image_storage_bucket: bucket,
      image_storage_key: key,
      fileName,
      fileType,
    })
  } catch (error) {
    const requestId = await reportOperationalError({
      event: 'notice_board.image_upload_failed',
      request,
      error,
      context: { userId: access.user.id },
    })
    return responseWithRequestId(
      apiError('Notice image storage is temporarily unavailable', 503),
      requestId,
    )
  }
}
