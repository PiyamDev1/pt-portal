import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getSupabaseClient } from '@/lib/supabaseClient'

type DocumentRow = {
  id: string
  file_name: string
  file_size: number
  file_type: string
  category: string
  uploaded_at: string
  uploaded_by: string
  family_head_id: string
  minio_bucket: string
  minio_key: string
  minio_etag: string
}

/**
 * GET /api/documents?familyHeadId=ID&page=1&limit=20&category=general
 * Returns paginated non-deleted documents for a family.
 * Optional category filter to reduce response size.
 * Only fetches necessary fields to reduce bandwidth.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const familyHeadId = searchParams.get('familyHeadId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '20')))
    const category = searchParams.get('category')
    const offset = (page - 1) * limit

    if (!familyHeadId) {
      return apiError('familyHeadId is required', 400)
    }

    const supabase = getSupabaseClient()
    let query = supabase
      .from('documents')
      .select(
        'id, file_name, file_size, file_type, category, uploaded_at, uploaded_by, family_head_id, minio_bucket, minio_key, minio_etag',
        { count: 'exact' },
      )
      .eq('family_head_id', familyHeadId)
      .eq('deleted', false)

    // Optional category filter for smaller responses
    if (category) {
      query = query.eq('category', category)
    }

    const { data, error, count } = await query
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const documents = ((data || []) as DocumentRow[]).map((row) => ({
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

    return apiOk({
      documents,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to fetch documents'), 500)
  }
}

/**
 * POST /api/documents
 * Saves document metadata to Supabase after a successful MinIO upload.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      documentId,
      fileName,
      fileSize,
      fileType,
      category,
      familyHeadId,
      minioKey,
      minioEtag,
      storageBucket,
    } = body

    if (!documentId || !fileName || !familyHeadId || !minioKey) {
      return apiError('Missing required fields', 400)
    }

    const bucket = storageBucket || process.env.MINIO_BUCKET_NAME || 'portal-documents'
    const supabase = getSupabaseClient()

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

    return apiOk({ documentId })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to save document'), 500)
  }
}
