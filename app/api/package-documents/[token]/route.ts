import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { getS3Client } from '@/lib/s3Client'
import type {
  TravelPackageDocument,
  TravelPackageFolder,
} from '@/app/types/packages'

function isExpired(value: string | null | undefined) {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function selectPublicPackageColumns() {
  return `
    id,
    package_reference,
    customer_name,
    customer_email,
    package_type,
    destination,
    departure_date,
    return_date,
    document_access_token,
    document_access_enabled,
    document_access_expires_at,
    document_release_status,
    current_public_summary
  `
}

function selectPublicDocumentColumns() {
  return `
    id,
    package_id,
    reservation_id,
    quote_id,
    uploaded_by,
    updated_by,
    category,
    title,
    file_name,
    file_size,
    file_type,
    storage_provider,
    storage_bucket,
    storage_key,
    storage_etag,
    status,
    customer_visible,
    released_at,
    released_by,
    revoked_at,
    revoked_by,
    public_notes,
    internal_notes,
    metadata,
    created_at,
    updated_at,
    deleted_at
  `
}

async function withSignedUrl(document: TravelPackageDocument) {
  const signedUrl = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: document.storage_bucket,
      Key: document.storage_key,
      ResponseContentDisposition: `attachment; filename="${document.file_name.replace(/"/g, '')}"`,
    }),
    { expiresIn: 15 * 60 },
  )

  return {
    ...document,
    signed_url: signedUrl,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing document access token', 400)

  const supabase = getServiceSupabaseClient()
  const { data: packageData, error: packageError } = await supabase
    .from('travel_packages')
    .select(selectPublicPackageColumns())
    .eq('document_access_token', cleanToken)
    .eq('document_access_enabled', true)
    .single()

  if (packageError || !packageData) {
    return apiError('Package documents are not available', 404)
  }

  const packageFolder = packageData as unknown as TravelPackageFolder
  if (isExpired(packageFolder.document_access_expires_at)) {
    return apiError('This document link has expired. Please contact your agent.', 410)
  }

  const { data: documentData, error: documentError } = await supabase
    .from('travel_package_documents')
    .select(selectPublicDocumentColumns())
    .eq('package_id', packageFolder.id)
    .eq('customer_visible', true)
    .eq('status', 'released')
    .order('category', { ascending: true })
    .order('created_at', { ascending: false })

  if (documentError) {
    return apiError(documentError.message || 'Failed to load package documents', 500)
  }

  await supabase
    .from('travel_packages')
    .update({ document_access_last_viewed_at: new Date().toISOString() })
    .eq('id', packageFolder.id)

  const documents = await Promise.all(
    ((documentData || []) as unknown as TravelPackageDocument[]).map(withSignedUrl),
  )

  return apiOk({
    package: packageFolder,
    documents,
    signedUrlExpiresIn: 15 * 60,
  })
}
