import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { GetObjectCommand } from '@aws-sdk/client-s3'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  documentContentDisposition,
  isSafeInlineDocumentMimeType,
  safeStoredDocumentMimeType,
} from '@/lib/documentSecurity'
import { normalizePackagePortalReference } from '@/lib/packagePortal'
import { getS3Client } from '@/lib/s3Client'
import { getOrCreateResourceAlias, resolveResourceAlias, verifyCustomerAccessGrant } from './grants'
import { CustomerIntegrationError } from './http'

const PACKAGE_SELECT = [
  'id',
  'package_reference',
  'customer_name',
  'customer_email',
  'customer_access_last_name',
  'package_type',
  'destination',
  'departure_date',
  'return_date',
  'document_access_token',
  'document_access_enabled',
  'document_access_expires_at',
  'current_public_summary',
  'created_at',
  'updated_at',
].join(',')

const DOCUMENT_SELECT = [
  'id',
  'package_id',
  'category',
  'title',
  'file_name',
  'file_size',
  'file_type',
  'storage_bucket',
  'storage_key',
  'released_at',
  'created_at',
].join(',')

export type CustomerTripPackageRow = {
  id: string
  package_reference: string
  customer_name: string | null
  customer_email: string | null
  customer_access_last_name: string | null
  package_type: string | null
  destination: string | null
  departure_date: string | null
  return_date: string | null
  document_access_token: string | null
  document_access_enabled: boolean | null
  document_access_expires_at: string | null
  current_public_summary: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
}

type DocumentRow = {
  id: string
  package_id: string
  category: string
  title: string | null
  file_name: string
  file_size: number | null
  file_type: string | null
  storage_bucket: string
  storage_key: string
  released_at: string | null
  created_at: string
}

function isoOrNow(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString()
}

function dateOnly(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function cleanText(value: unknown, fallback: string, max: number) {
  if (typeof value !== 'string') return fallback
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean ? clean.slice(0, max) : fallback
}

function normalizedName(value: unknown) {
  return typeof value === 'string'
    ? value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[‘’‚‛`´]/g, "'")
        .replace(/[‐‑‒–—―−]/g, '-')
        .replace(/\s*([-'])\s*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en-GB')
    : ''
}

function equalName(left: unknown, right: unknown) {
  const leftBytes = Buffer.from(normalizedName(left))
  const rightBytes = Buffer.from(normalizedName(right))
  return (
    leftBytes.length > 0 &&
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  )
}

function leadSurname(row: CustomerTripPackageRow) {
  return (
    row.customer_access_last_name ||
    String(row.customer_name ?? '')
      .trim()
      .split(/\s+/)
      .at(-1) ||
    ''
  )
}

function packageLinkAvailable(row: CustomerTripPackageRow) {
  if (!row.document_access_enabled) return false
  if (!row.document_access_expires_at) return true
  return Date.parse(row.document_access_expires_at) > Date.now()
}

export async function packageByInternalId(internalId: string) {
  const { data, error } = await getServiceSupabaseClient()
    .from('travel_packages')
    .select(PACKAGE_SELECT)
    .eq('id', internalId)
    .maybeSingle()
  if (error || !data) throw new CustomerIntegrationError('not_found', 'Trip not found.', 404)
  return data as unknown as CustomerTripPackageRow
}

export async function lookupCustomerTrip(packageReference: string, requestedSurname: string) {
  const reference = normalizePackagePortalReference(packageReference)
  const { data, error } = await getServiceSupabaseClient()
    .from('travel_packages')
    .select(PACKAGE_SELECT)
    .ilike('package_reference', reference)
    .maybeSingle()
  if (error || !data) {
    throw new CustomerIntegrationError('lookup_not_matched', 'Package details do not match.', 404)
  }
  const row = data as unknown as CustomerTripPackageRow
  if (!packageLinkAvailable(row) || !equalName(leadSurname(row), requestedSurname)) {
    throw new CustomerIntegrationError('lookup_not_matched', 'Package details do not match.', 404)
  }
  return row
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mapInvoice(invoice: Record<string, unknown>, releasedAt: unknown) {
  const rawLines = Array.isArray(invoice.lines) ? invoice.lines : []
  const lines = rawLines.slice(0, 200).flatMap((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return []
    const item = line as Record<string, unknown>
    const description = cleanText(item.description, '', 180)
    if (!description) return []
    return [
      {
        description,
        quantity: Math.max(0.01, numberValue(item.quantity, 1)),
        unitPrice: numberValue(item.unit_sold_price ?? item.unitPrice),
        total: numberValue(item.total_sold_price ?? item.total),
      },
    ]
  })
  const currency = cleanText(invoice.currency, 'GBP', 3).toUpperCase()
  return {
    invoiceNumber: cleanText(invoice.invoice_number ?? invoice.invoiceNumber, 'Invoice', 80),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'GBP',
    total: Math.max(0, numberValue(invoice.total_sold ?? invoice.total)),
    paid: Math.max(0, numberValue(invoice.total_paid ?? invoice.paid)),
    balance: numberValue(invoice.balance_due ?? invoice.balance),
    releasedAt: isoOrNow(releasedAt ?? invoice.released_at ?? invoice.releasedAt),
    lines,
  }
}

function invoiceFromSnapshot(snapshot: unknown, releasedAt: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  return mapInvoice(snapshot as Record<string, unknown>, releasedAt)
}

function transportText(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const voucher = value as Record<string, unknown>
  const parts: string[] = []
  const arrivalAirport = cleanText(voucher.arrivalAirport, '', 100)
  const arrivalAt = cleanText(voucher.arrivalAt, '', 80)
  const departureAirport = cleanText(voucher.departureAirport, '', 100)
  const departureAt = cleanText(voucher.departureAt, '', 80)
  const vehicle = cleanText(voucher.vehicleType ?? voucher.vehicle, '', 100)
  if (arrivalAirport || arrivalAt)
    parts.push(`Arrival: ${[arrivalAirport, arrivalAt].filter(Boolean).join(' — ')}`)
  if (departureAirport || departureAt)
    parts.push(`Departure: ${[departureAirport, departureAt].filter(Boolean).join(' — ')}`)
  if (vehicle) parts.push(`Vehicle: ${vehicle}`)
  const routes = Array.isArray(voucher.routes)
    ? voucher.routes
        .map((route) => cleanText(route, '', 120))
        .filter(Boolean)
        .slice(0, 8)
    : []
  if (routes.length) parts.push(`Routes: ${routes.join('; ')}`)
  const notes = cleanText(voucher.publicNotes, '', 400)
  if (notes) parts.push(notes)
  const result = parts.join('\n').slice(0, 1000)
  return result || null
}

async function releasedInvoice(packageId: string) {
  const service = getServiceSupabaseClient()
  const { data: version } = await service
    .from('travel_package_versions')
    .select('snapshot,released_at')
    .eq('package_id', packageId)
    .eq('object_type', 'invoice')
    .eq('visibility', 'released_to_customer')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const snapshot = invoiceFromSnapshot(version?.snapshot, version?.released_at)
  if (snapshot) return snapshot

  const { data: invoice } = await service
    .from('travel_package_invoices')
    .select('id,invoice_number,currency,total_sold,total_paid,balance_due,released_at')
    .eq('package_id', packageId)
    .eq('released_to_customer', true)
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!invoice) return null
  const { data: lines } = await service
    .from('travel_package_invoice_lines')
    .select('description,quantity,unit_sold_price,total_sold_price')
    .eq('invoice_id', invoice.id)
    .eq('customer_visible', true)
    .order('sort_order', { ascending: true })
  return mapInvoice({ ...invoice, lines: lines ?? [] }, invoice.released_at)
}

async function releasedTransport(packageId: string) {
  const { data } = await getServiceSupabaseClient()
    .from('travel_package_transport_vouchers')
    .select('voucher_data')
    .eq('package_id', packageId)
    .eq('customer_visible', true)
    .eq('status', 'released_to_customer')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return transportText(data?.voucher_data)
}

async function releasedDocuments(packageId: string, publicTripId: string) {
  const { data, error } = await getServiceSupabaseClient()
    .from('travel_package_documents')
    .select(DOCUMENT_SELECT)
    .eq('package_id', packageId)
    .eq('customer_visible', true)
    .eq('status', 'released')
    .neq('category', 'travel_documents')
    .order('created_at', { ascending: false })
  if (error) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Trip documents are unavailable.',
      503,
    )
  }
  return Promise.all(
    ((data ?? []) as unknown as DocumentRow[]).map(async (document) => {
      const alias = await getOrCreateResourceAlias('document', document.id, { tripId: packageId })
      const publicId = alias.publicId
      return {
        documentId: publicId,
        name: cleanText(document.title || document.file_name, 'Document', 180),
        category: cleanText(document.category, 'general', 80),
        mimeType: safeStoredDocumentMimeType(document.file_type),
        sizeBytes: Math.max(0, Math.trunc(numberValue(document.file_size))),
        releasedAt: isoOrNow(document.released_at ?? document.created_at),
        previewUrl: `/api/v1/trips/${publicTripId}/documents/${publicId}`,
        downloadUrl: `/api/v1/trips/${publicTripId}/documents/${publicId}?disposition=attachment`,
      }
    }),
  )
}

export async function customerTripSummary(input: {
  internalId: string
  publicId: string
  scopes: string[]
  grantedAt?: string
}) {
  const row = await packageByInternalId(input.internalId)
  const [documents, invoice, transportSummary] = await Promise.all([
    releasedDocuments(row.id, input.publicId),
    input.scopes.includes('financials') ? releasedInvoice(row.id) : Promise.resolve(null),
    releasedTransport(row.id),
  ])
  const summaryTitle = row.current_public_summary?.title
  const title = cleanText(
    summaryTitle,
    row.destination
      ? `${cleanText(row.package_type, 'Travel', 60)} — ${cleanText(row.destination, '', 80)}`
      : `${cleanText(row.package_type, 'Travel', 60)} package`,
    160,
  )
  return {
    tripId: input.publicId,
    packageReference: cleanText(row.package_reference, 'Package', 80),
    title,
    destination: row.destination ? cleanText(row.destination, '', 160) || null : null,
    startsOn: dateOnly(row.departure_date),
    endsOn: dateOnly(row.return_date),
    membership: {
      role: input.scopes.includes('lead') ? ('lead' as const) : ('traveller' as const),
      canViewFinancials: input.scopes.includes('financials'),
      grantedAt: isoOrNow(input.grantedAt),
    },
    documents,
    invoice,
    transportSummary,
    lastUpdatedAt: isoOrNow(row.updated_at ?? row.created_at),
  }
}

export async function customerTripFromGrant(input: {
  publicId: string
  token: string
  requiredScope: 'read' | 'documents' | 'invite'
  customerSubject?: string
}) {
  const grant = await verifyCustomerAccessGrant({
    token: input.token,
    resourceType: 'trip',
    publicId: input.publicId,
    requiredScope: input.requiredScope,
    customerSubject: input.customerSubject,
  })
  return {
    grant,
    trip: await customerTripSummary({
      internalId: grant.internalId,
      publicId: grant.publicId,
      scopes: grant.scopes,
      grantedAt:
        typeof grant.metadata.grantedAt === 'string' ? grant.metadata.grantedAt : undefined,
    }),
  }
}

export async function documentForTrip(input: { tripInternalId: string; documentPublicId: string }) {
  const alias = await resolveResourceAlias('document', input.documentPublicId)
  const { data, error } = await getServiceSupabaseClient()
    .from('travel_package_documents')
    .select(DOCUMENT_SELECT)
    .eq('id', alias.internalId)
    .eq('package_id', input.tripInternalId)
    .eq('customer_visible', true)
    .eq('status', 'released')
    .neq('category', 'travel_documents')
    .maybeSingle()
  if (error || !data) throw new CustomerIntegrationError('not_found', 'Document not found.', 404)
  return data as unknown as DocumentRow
}

export async function streamTripDocument(input: {
  document: DocumentRow
  disposition: 'inline' | 'attachment'
  range?: string | null
}) {
  const range = input.range?.trim()
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    throw new CustomerIntegrationError(
      'validation_failed',
      'Requested document range is invalid.',
      416,
    )
  }
  const mimeType = safeStoredDocumentMimeType(input.document.file_type)
  const disposition =
    input.disposition === 'inline' && isSafeInlineDocumentMimeType(mimeType)
      ? 'inline'
      : 'attachment'
  const object = await getS3Client().send(
    new GetObjectCommand({
      Bucket: input.document.storage_bucket,
      Key: input.document.storage_key,
      Range: range || undefined,
      ResponseCacheControl: 'private, no-store, max-age=0',
      ResponseContentType: mimeType,
      ResponseContentDisposition: documentContentDisposition(input.document.file_name, disposition),
    }),
  )
  if (!object.Body) {
    throw new CustomerIntegrationError('not_found', 'Document content was not found.', 404)
  }
  const body = object.Body as typeof object.Body & {
    transformToWebStream?: () => ReadableStream<Uint8Array>
  }
  if (typeof body.transformToWebStream !== 'function') {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Document streaming is unavailable.',
      503,
    )
  }
  return {
    body: body.transformToWebStream(),
    status: object.ContentRange ? 206 : 200,
    headers: {
      'Accept-Ranges': object.AcceptRanges ?? 'bytes',
      'Content-Type': mimeType,
      ...(object.ContentLength != null ? { 'Content-Length': String(object.ContentLength) } : {}),
      ...(object.ContentRange ? { 'Content-Range': object.ContentRange } : {}),
      ...(object.ETag ? { ETag: object.ETag } : {}),
      ...(object.LastModified ? { 'Last-Modified': object.LastModified.toUTCString() } : {}),
      'Content-Disposition': documentContentDisposition(input.document.file_name, disposition),
      'x-piyam-download-name': cleanText(input.document.file_name, 'document', 180),
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  }
}

export function invitationTokenHash(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

export function createTripInvitationToken() {
  return `pti_${randomBytes(32).toString('base64url')}`
}

export async function packageForTripPublicId(publicId: string) {
  const alias = await resolveResourceAlias('trip', publicId)
  return packageByInternalId(alias.internalId)
}
