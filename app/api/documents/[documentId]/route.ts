import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { getS3Client } from '@/lib/s3Client'

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
    const supabase = getSupabaseClient()
    const s3Client = getS3Client()

     const { data: doc, error: fetchError } = await (supabase
       .from('documents') as any)
       .select('minio_key, minio_bucket')
       .eq('id', documentId)
       .single()

    if (fetchError || !doc || !doc.minio_key || !doc.minio_bucket) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: doc.minio_bucket,
        Key: doc.minio_key,
      })
    )

     const { error: deleteError } = await (supabase
       .from('documents') as any)
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
