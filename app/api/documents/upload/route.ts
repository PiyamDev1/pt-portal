/**
 * API Route: Generate Secure Upload Link
 * Endpoint: POST /api/documents/upload
 */

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Initialize the MinIO Client
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents';

export async function POST(request: NextRequest) {
  try {
    // 1. We don't take the file here anymore! Just the metadata.
    const { fileName, fileType, familyHeadId, category } = await request.json();

    if (!fileName || !familyHeadId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const normalizedFileType = fileType || 'application/octet-stream';

    // 2. Generate a secure path in the vault
    const safeCategory = category || 'general';
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const minioKey = `family-${familyHeadId}/${safeCategory}/${Date.now()}-${fileName.replace(/\s+/g, '-')}`;

    // 3. Create the AWS Upload Command
    // We MUST include ContentType so the math expects the browser's header
    const command = new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: minioKey,
      ContentType: fileType || 'application/octet-stream',
    });

    // 4. Sign the URL natively (Do NOT use signableHeaders overrides!)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return NextResponse.json(
      {
        success: true,
        data: {
          uploadUrl: signedUrl,
          documentId,
          minioKey,
          fileName,
          fileType: normalizedFileType,
          category: safeCategory,
          familyHeadId
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error generating secure upload link:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate secure upload link' },
      { status: 500 }
    )
  }
}
