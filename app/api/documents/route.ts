/**
 * Module: app/api/documents/route.ts
 * API route or server helper for documents/route.ts.
 */

import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { resolveDocumentScope } from '@/lib/documentAccess'
import {
  DOCUMENT_PRIVATE_CACHE_HEADERS,
  isValidDocumentScopeId,
  normalizeDocumentUploadCategory,
} from '@/lib/documentSecurity'
import { requireStaffSession } from '@/lib/auth/staffSession'

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
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { searchParams } = new URL(request.url)
    const familyHeadId = searchParams.get('familyHeadId')
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '20', 10)
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(5, requestedLimit)) : 20
    const categoryInput = searchParams.get('category')
    const category = categoryInput ? normalizeDocumentUploadCategory(categoryInput) : null
    const offset = (page - 1) * limit

    if (!familyHeadId) {
      return apiError('familyHeadId is required', 400)
    }
    if (!isValidDocumentScopeId(familyHeadId)) {
      return apiError('Invalid document scope', 400)
    }
    if (categoryInput && !category) {
      return apiError('Invalid document category', 400)
    }
    const scope = await resolveDocumentScope(familyHeadId)
    if (!scope.exists) {
      return apiError('Document scope not found', 404)
    }

    const supabase = getSupabaseClient()
    let query = supabase
      .from('documents')
      .select(
        'id, file_name, file_size, file_type, category, uploaded_at, uploaded_by, family_head_id, minio_bucket, minio_key, minio_etag',
        { count: 'exact' },
      )
      .in('family_head_id', scope.scopeIds)
      .eq('deleted', false)
      .neq('category', 'zip-archive') // exclude internal ZIP archives from display

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

    return apiOk(
      {
        documents,
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      },
      { headers: DOCUMENT_PRIVATE_CACHE_HEADERS },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to fetch documents'), 500)
  }
}

/**
 * POST /api/documents
 * Saves document metadata to Supabase after a successful MinIO upload.
 */
export async function POST(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  return apiError(
    'Standalone metadata creation is disabled. Use POST /api/documents/upload-direct.',
    410,
  )
}
