import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/documents?familyHeadId=ID&page=1&limit=20
 * Returns paginated non-deleted documents for a family.
 * Only fetches necessary fields to reduce bandwidth.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const familyHeadId = searchParams.get('familyHeadId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '20')))
    const offset = (page - 1) * limit

    if (!familyHeadId) {
      return NextResponse.json({ success: false, error: 'familyHeadId is required' }, { status: 400 })
    }

    const { data, error, count } = await supabase
      .from('documents')
      .select('id, file_name, file_size, file_type, category, uploaded_at, uploaded_by, family_head_id, minio_bucket, minio_key, minio_etag', { count: 'exact' })
      .eq('family_head_id', familyHeadId)
      .eq('deleted', false)
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const documents = (data || []).map((row: any) => ({
      id: row.id,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileType: row.file_type,
      category: row.category,
      uploadedAt: row.uploaded_at,
      uploadedBy: row.uploaded_by,
      familyHeadId: row.family_head_id,
      minio: {
        bucket: row.minio_bucket,
        key: row.minio_key,
        etag: row.minio_etag,
      },
    }))

    return NextResponse.json({ 
      success: true, 
      data: documents,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      }
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/documents
 * Saves document metadata to Supabase after a successful MinIO upload.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { documentId, fileName, fileSize, fileType, category, familyHeadId, minioKey, minioEtag } = body

    if (!documentId || !fileName || !familyHeadId || !minioKey) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const bucket = process.env.MINIO_BUCKET_NAME || 'portal-documents'

    const { error } = await supabase.from('documents').insert({
      id: documentId,
      file_name: fileName,
      file_size: fileSize || 0,
      file_type: fileType || 'application/octet-stream',
      category: category || 'general',
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'staff',
      family_head_id: familyHeadId,
      minio_bucket: bucket,
      minio_key: minioKey,
      minio_etag: minioEtag || '',
      deleted: false,
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    )
  }
}
