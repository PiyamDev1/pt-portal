import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

/**
 * DELETE /api/documents/[documentId]
 * Deletes the file from MinIO then soft-deletes the Supabase record.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params

    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('minio_key, minio_bucket')
      .eq('id', documentId)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: doc.minio_bucket,
        Key: doc.minio_key,
      })
    )

    const { error: deleteError } = await supabase
      .from('documents')
      .update({ deleted: true })
      .eq('id', documentId)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete document' },
      { status: 500 }
    )
  }
}
