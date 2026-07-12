import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { createPublicPackageDocument, createPublicTransportVoucher } from '@/lib/packagePortal'
import { getS3Client } from '@/lib/s3Client'
import type { TravelPackageDocument, TravelPackageFolder } from '@/app/types/packages'

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
    ,passport_status
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

  const [{ data: invoiceVersionData }, { data: voucherData }] = await Promise.all([
    supabase
      .from('travel_package_versions')
      .select('version_number, snapshot, released_at')
      .eq('package_id', packageFolder.id)
      .eq('object_type', 'invoice')
      .eq('visibility', 'released_to_customer')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('travel_package_transport_vouchers')
      .select('id, version, status, voucher_data, rendered_html, released_at')
      .eq('package_id', packageFolder.id)
      .eq('customer_visible', true)
      .eq('status', 'released_to_customer')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let releasedInvoice = invoiceVersionData?.snapshot || null
  if (!releasedInvoice) {
    const { data: invoiceData } = await supabase
      .from('travel_package_invoices')
      .select(
        'id, package_id, invoice_number, currency, subtotal_sold, discount_total, total_sold, total_paid, balance_due, customer_terms, due_at, version',
      )
      .eq('package_id', packageFolder.id)
      .eq('released_to_customer', true)
      .order('released_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (invoiceData) {
      const { data: lineData } = await supabase
        .from('travel_package_invoice_lines')
        .select(
          'id, line_type, description, quantity, unit_sold_price, total_sold_price, discount_amount, sort_order',
        )
        .eq('invoice_id', invoiceData.id)
        .eq('customer_visible', true)
        .order('sort_order', { ascending: true })
      releasedInvoice = { ...invoiceData, lines: lineData || [] }
    }
  }

  const publicVoucher = createPublicTransportVoucher(voucherData)

  return apiOk({
    package: packageFolder,
    documents,
    releasedInvoice,
    transportVoucher: publicVoucher,
    signedUrlExpiresIn: 15 * 60,
  })
}
