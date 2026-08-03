import { createHash } from 'crypto'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { createPublicPackageDocument } from '@/lib/packagePortal'
import { getS3Client } from '@/lib/s3Client'
import {
  hashThirdPartyShareCode,
  hashThirdPartyShareToken,
} from '@/lib/packageThirdPartyShares'
import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
} from '@/app/types/packages'

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hashIp(value: string) {
  return value ? createHash('sha256').update(value).digest('hex') : ''
}

function getIpAddress(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  )
}

function isExpired(value: string | null | undefined) {
  if (!value) return true
  const timestamp = Date.parse(value)
  return !Number.isFinite(timestamp) || timestamp <= Date.now()
}

function selectShareColumns() {
  return `
    id,
    package_id,
    label,
    recipient_name,
    purpose,
    status,
    access_code_hash,
    access_code_hint,
    allowed_categories,
    expires_at,
    terms_text,
    terms_accepted_at,
    terms_accepted_by,
    failed_access_count
  `
}

function selectPublicPackageColumns() {
  return `
    id,
    package_reference,
    customer_name,
    package_type,
    destination,
    departure_date,
    return_date,
    current_public_summary
  `
}

function selectPublicDocumentColumns() {
  return `
    id,
    package_id,
    category,
    title,
    file_name,
    file_size,
    file_type,
    storage_provider,
    storage_bucket,
    storage_key,
    status,
    customer_visible,
    released_at,
    public_notes,
    created_at
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

  return createPublicPackageDocument(document, signedUrl)
}

async function recordAccessEvent({
  shareId,
  packageId,
  eventType,
  recipientName,
  ipHash,
  userAgent,
  metadata = {},
}: {
  shareId: string
  packageId: string
  eventType: 'access_granted' | 'access_denied'
  recipientName?: string | null
  ipHash?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}) {
  const supabase = getServiceSupabaseClient()
  await supabase.from('travel_package_third_party_access_events').insert({
    share_id: shareId,
    package_id: packageId,
    event_type: eventType,
    recipient_name: recipientName || null,
    ip_hash: ipHash || null,
    user_agent: userAgent || null,
    metadata,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing third-party document token', 400)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const accessCode = cleanText(body.accessCode || body.access_code).toUpperCase()
  const recipientName = cleanText(body.recipientName || body.recipient_name)
  const acceptedTerms = body.acceptedTerms === true
  if (!accessCode) return apiError('Access code is required', 400)
  if (!recipientName) return apiError('Recipient or company name is required', 400)
  if (!acceptedTerms) return apiError('Data handling terms must be accepted', 400)

  const supabase = getServiceSupabaseClient()
  const ipHash = hashIp(getIpAddress(request))
  const userAgent = request.headers.get('user-agent') || ''
  const tokenHash = hashThirdPartyShareToken(cleanToken)

  const { data: shareData, error: shareError } = await supabase
    .from('travel_package_third_party_document_shares')
    .select(selectShareColumns())
    .eq('token_hash', tokenHash)
    .single()

  if (shareError || !shareData) {
    return apiError('Third-party document access is not available', 404)
  }

  const share = shareData as unknown as {
    id: string
    package_id: string
    label: string
    recipient_name: string | null
    purpose: string | null
    status: string
    access_code_hash: string
    allowed_categories: TravelPackageDocumentCategory[]
    expires_at: string
    terms_text: string
    terms_accepted_at: string | null
    terms_accepted_by: string | null
    failed_access_count: number
  }

  if (share.status !== 'active' || isExpired(share.expires_at)) {
    if (share.status === 'active') {
      await supabase
        .from('travel_package_third_party_document_shares')
        .update({ status: 'expired' })
        .eq('id', share.id)
    }
    return apiError('This third-party document link has expired or been revoked', 410)
  }

  const expectedCodeHash = hashThirdPartyShareCode(cleanToken, accessCode)
  if (expectedCodeHash !== share.access_code_hash) {
    await supabase
      .from('travel_package_third_party_document_shares')
      .update({
        failed_access_count: Number(share.failed_access_count || 0) + 1,
        last_failed_at: new Date().toISOString(),
      })
      .eq('id', share.id)
    await recordAccessEvent({
      shareId: share.id,
      packageId: share.package_id,
      eventType: 'access_denied',
      recipientName,
      ipHash,
      userAgent,
      metadata: { reason: 'invalid_code' },
    })
    return apiError('Access code is incorrect', 401)
  }

  const { data: packageData, error: packageError } = await supabase
    .from('travel_packages')
    .select(selectPublicPackageColumns())
    .eq('id', share.package_id)
    .single()

  if (packageError || !packageData) {
    return apiError('Travel package is not available', 404)
  }

  const allowedCategories = Array.isArray(share.allowed_categories)
    ? share.allowed_categories
    : []
  const { data: documentData, error: documentError } = await supabase
    .from('travel_package_documents')
    .select(selectPublicDocumentColumns())
    .eq('package_id', share.package_id)
    .in('category', allowedCategories)
    .neq('status', 'deleted')
    .neq('status', 'revoked')
    .order('category', { ascending: true })
    .order('created_at', { ascending: false })

  if (documentError) {
    return apiError(documentError.message || 'Failed to load third-party documents', 500)
  }

  await supabase
    .from('travel_package_third_party_document_shares')
    .update({
      terms_accepted_at: share.terms_accepted_at || new Date().toISOString(),
      terms_accepted_by: share.terms_accepted_by || recipientName,
      last_accessed_at: new Date().toISOString(),
      last_access_ip_hash: ipHash || null,
    })
    .eq('id', share.id)

  await recordAccessEvent({
    shareId: share.id,
    packageId: share.package_id,
    eventType: 'access_granted',
    recipientName,
    ipHash,
    userAgent,
    metadata: { allowedCategories },
  })

  const documents = await Promise.all(
    ((documentData || []) as unknown as TravelPackageDocument[]).map(withSignedUrl),
  )

  return apiOk({
    share: {
      id: share.id,
      label: share.label,
      recipient_name: share.recipient_name,
      purpose: share.purpose,
      allowed_categories: allowedCategories,
      expires_at: share.expires_at,
      terms_text: share.terms_text,
    },
    package: packageData as unknown as TravelPackageFolder,
    documents,
    signedUrlExpiresIn: 15 * 60,
  })
}
