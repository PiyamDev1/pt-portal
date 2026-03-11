import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'

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
    const category = String(formData.get('category') || 'general')

    if (!file || !familyHeadId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const safeCategory = category || 'general'
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const minioKey = `family-${familyHeadId}/${safeCategory}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`

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
        })
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
        })
      )
      storageProvider = 'r2'
      storageBucket = R2_BUCKET
      etag = fallbackResult.ETag || etag
    }

    return NextResponse.json({
      success: true,
      data: {
        documentId,
        minioKey,
        etag,
        storageProvider,
        storageBucket,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        category: safeCategory,
        familyHeadId,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed direct upload',
      },
      { status: 500 }
    )
  }
}
