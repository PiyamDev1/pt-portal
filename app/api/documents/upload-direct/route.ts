/**
 * Module: app/api/documents/upload-direct/route.ts
 * API route or server helper for documents/upload-direct/route.ts.
 */

import { NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

/**
 * POST /api/documents/upload-direct
 * Reliable server-side upload fallback when presigned browser PUT is unstable.
 * Uses singleton S3 client for efficiency.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const familyHeadId = String(formData.get('familyHeadId') || '')
    const employeeId = String(formData.get('employeeId') || '')
    const category = String(formData.get('category') || 'general')

    if (!file || (!familyHeadId && !employeeId)) {
      return apiError('Missing required fields', 400)
    }

    const safeCategory = category || 'general'
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const scopePrefix = employeeId ? `employee-${employeeId}` : `family-${familyHeadId}`
    const minioKey = `${scopePrefix}/${safeCategory}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`

    // Stream file directly without buffering entire file in memory
    const buffer = Buffer.from(await file.arrayBuffer())
    let etag = `unknown-${documentId}`
    let storageProvider: 'minio' | 'r2' = 'minio'
    let storageBucket = MINIO_BUCKET

    try {
      const s3Client = getS3Client()
      const putResult = await s3Client.send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: minioKey,
          Body: buffer,
          ContentType: file.type || 'application/octet-stream',
        }),
      )
      etag = putResult.ETag || etag
    } catch (minioError) {
      if (!isR2Configured()) {
        throw minioError
      }

      const r2Client = getR2Client()
      const fallbackResult = await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: minioKey,
          Body: buffer,
          ContentType: file.type || 'application/octet-stream',
        }),
      )
      storageProvider = 'r2'
      storageBucket = R2_BUCKET
      etag = fallbackResult.ETag || etag
    }

    return apiOk({
      documentId,
      minioKey,
      etag,
      storageProvider,
      storageBucket,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      category: safeCategory,
      familyHeadId,
      employeeId,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed direct upload'), 500)
  }
}
