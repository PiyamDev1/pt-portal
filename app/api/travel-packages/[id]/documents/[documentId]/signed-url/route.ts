import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getS3Client } from '@/lib/s3Client'

const SCHEMA_HINT =
  'Travel package document schema is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql in Supabase SQL editor.'

function isDocumentSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_documents')
    .select('id, package_id, file_name, storage_bucket, storage_key, status')
    .eq('id', documentId)
    .eq('package_id', id)
    .neq('status', 'deleted')
    .single()

  if (error || !data) {
    if (isDocumentSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError('Package document not found', 404)
  }

  const row = data as {
    file_name: string
    storage_bucket: string
    storage_key: string
  }

  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: row.storage_bucket,
      Key: row.storage_key,
      ResponseContentDisposition: `attachment; filename="${row.file_name.replace(/"/g, '')}"`,
    }),
    { expiresIn: 15 * 60 },
  )

  return apiOk({ url, expiresIn: 15 * 60 })
}
