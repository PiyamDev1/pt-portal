/**
 * API Route: Generate Secure Upload Link
 * Endpoint: POST /api/documents/upload
 */

import { NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client } from '@/lib/s3Client'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'

export async function POST(request: NextRequest) {
  try {
    // 1. We don't take the file here anymore! Just the metadata.
    const { fileName, fileType, familyHeadId, category } = await request.json()

    if (!fileName || !familyHeadId) {
      return apiError('Missing required fields', 400)
    }

    // 2. Generate a secure path in the vault
    const safeCategory = category || 'general'
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const minioKey = `family-${familyHeadId}/${safeCategory}/${Date.now()}-${fileName.replace(/\s+/g, '-')}`

    // 2. Clean Command (No ContentType hacks, let the browser send it natively)
    const command = new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: minioKey,
    })

    // 4. Sign the URL
    const s3Client = getS3Client()
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 })

    return apiOk({
      uploadUrl: signedUrl,
      documentId,
      minioKey,
      fileName,
      fileType,
      category: safeCategory,
      familyHeadId,
    })
  } catch (error) {
    console.error('Error generating secure upload link:', error)
    return apiError('Failed to generate secure upload link', 500, {
      details: toErrorMessage(error),
    })
  }
}
