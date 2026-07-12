import { createSign } from 'node:crypto'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getS3Client } from '@/lib/s3Client'
import {
  getLegacyBookingsFirebaseConfig,
  getPackageBackupStorageClient,
  getPackageBackupStorageConfig,
  getPackageMinioBucketName,
} from '@/lib/packageIntegrations'
import {
  createPackageDocumentAccessToken,
  normalizePackageDocumentCategory,
  sanitizePackageDocumentFileName,
} from '@/lib/packageDocuments'
import { createTravelPackageReference } from '@/lib/packageQuote'

type FirestoreValue = Record<string, unknown>

export type LegacyBookingDocument = {
  name: string
  category: string
  url: string
  fileKey: string
  contentType: string
  size: number
  source: Record<string, unknown>
}

export type LegacyBookingCustomer = {
  id: string
  referenceNumber: string
  firstName: string
  lastName: string
  customerName: string
  packageType: 'umrah' | 'ziyarat' | 'holiday'
  destination: string
  status: string
  archived: boolean
  accessExpiresAt: string | null
  createdAt: string | null
  updatedAt: string | null
  documents: LegacyBookingDocument[]
  notes: unknown[]
  checklist: unknown[]
  keyInformation: Record<string, unknown>
  source: Record<string, unknown>
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

async function getFirebaseAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }
  const config = getLegacyBookingsFirebaseConfig()
  if (!config) throw new Error('Legacy Firebase credentials are not configured')
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const unsigned = `${header}.${claims}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${signer.sign(config.privateKey).toString('base64url')}`
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  })
  const data = (await response.json()) as {
    access_token?: string
    expires_in?: number
    error_description?: string
  }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'Firebase service account authentication failed')
  }
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  }
  return data.access_token
}

export function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null
  if ('stringValue' in value) return String(value.stringValue)
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('timestampValue' in value) return String(value.timestampValue)
  if ('referenceValue' in value) return String(value.referenceValue)
  if ('bytesValue' in value) return String(value.bytesValue)
  if ('geoPointValue' in value) return value.geoPointValue
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] } | undefined)?.values || []
    return values.map(decodeFirestoreValue)
  }
  if ('mapValue' in value) {
    return decodeFirestoreFields(
      (value.mapValue as { fields?: Record<string, FirestoreValue> } | undefined)?.fields || {},
    )
  }
  return null
}

export function decodeFirestoreFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  )
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function array(value: unknown) {
  return Array.isArray(value) ? value : []
}

function timestamp(value: unknown) {
  const raw = text(value)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizePackageType(value: unknown): LegacyBookingCustomer['packageType'] {
  const normalized = text(value).toLowerCase()
  if (normalized.includes('ziyar')) return 'ziyarat'
  if (normalized.includes('holiday')) return 'holiday'
  return 'umrah'
}

function normalizeLegacyDocument(value: unknown): LegacyBookingDocument | null {
  const source = object(value)
  const name = text(source.name || source.fileName || source.title)
  const fileKey = text(source.fileKey || source.key || source.storageKey)
  const url = text(source.url || source.downloadUrl || source.fileUrl)
  if (!name && !fileKey && !url) return null
  return {
    name: name || fileKey.split('/').at(-1) || 'Legacy document',
    category: text(source.category || source.type || 'other'),
    url,
    fileKey,
    contentType: text(source.contentType || source.fileType) || 'application/octet-stream',
    size: Number(source.size || source.fileSize || 0),
    source,
  }
}

export function normalizeLegacyBookingCustomer(input: {
  id: string
  fields: Record<string, unknown>
  createTime?: string
  updateTime?: string
}): LegacyBookingCustomer {
  const source = input.fields
  const firstName = text(source.firstName || source.firstname || source.givenName)
  const lastName = text(source.lastName || source.lastname || source.surname)
  const customerName =
    text(source.customerName || source.fullName || source.name) ||
    [firstName, lastName].filter(Boolean).join(' ')
  const rawDocuments = array(source.documents || source.files || source.uploadedDocuments)
  return {
    id: input.id,
    referenceNumber: text(source.referenceNumber || source.reference || source.bookingReference),
    firstName,
    lastName: lastName || customerName.split(/\s+/).at(-1) || '',
    customerName,
    packageType: normalizePackageType(source.packageType || source.type),
    destination: text(source.destination || source.location),
    status: text(source.status),
    archived: Boolean(source.isArchived || source.archived),
    accessExpiresAt: timestamp(source.accessExpiresAt || source.accessExpiry || source.expiresAt),
    createdAt: timestamp(source.createdAt || source.created_at || input.createTime),
    updatedAt: timestamp(
      source.lastUpdatedAt || source.updatedAt || source.updated_at || input.updateTime,
    ),
    documents: rawDocuments
      .map(normalizeLegacyDocument)
      .filter((item): item is LegacyBookingDocument => Boolean(item)),
    notes: array(source.notes),
    checklist: array(source.checklist),
    keyInformation: object(source.keyInformation || source.keyInfo),
    source,
  }
}

export async function listLegacyBookingCustomers(input?: {
  pageSize?: number
  pageToken?: string
}) {
  const config = getLegacyBookingsFirebaseConfig()
  if (!config) throw new Error('Legacy Firebase credentials are not configured')
  const token = await getFirebaseAccessToken()
  const pageSize = Math.max(1, Math.min(100, Number(input?.pageSize || 50)))
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/customers`,
  )
  url.searchParams.set('pageSize', String(pageSize))
  if (input?.pageToken) url.searchParams.set('pageToken', input.pageToken)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = (await response.json()) as {
    documents?: Array<{
      name: string
      fields?: Record<string, FirestoreValue>
      createTime?: string
      updateTime?: string
    }>
    nextPageToken?: string
    error?: { message?: string }
  }
  if (!response.ok)
    throw new Error(data.error?.message || 'Failed to read legacy Firestore customers')
  return {
    customers: (data.documents || []).map((document) =>
      normalizeLegacyBookingCustomer({
        id: document.name.split('/').at(-1) || document.name,
        fields: decodeFirestoreFields(document.fields || {}),
        createTime: document.createTime,
        updateTime: document.updateTime,
      }),
    ),
    nextPageToken: data.nextPageToken || null,
  }
}

export async function testLegacyBookingsConnections() {
  const firebaseConfigured = Boolean(getLegacyBookingsFirebaseConfig())
  const storageConfigured = Boolean(getPackageBackupStorageConfig())
  let firebaseStatus: 'not_configured' | 'connected' | 'failed' = firebaseConfigured
    ? 'failed'
    : 'not_configured'
  let firebaseError: string | null = null
  if (firebaseConfigured) {
    try {
      await listLegacyBookingCustomers({ pageSize: 1 })
      firebaseStatus = 'connected'
    } catch (error) {
      firebaseError = error instanceof Error ? error.message : 'Firebase connection failed'
    }
  }
  let storageStatus: 'not_configured' | 'connected' | 'failed' = storageConfigured
    ? 'connected'
    : 'not_configured'
  let storageError: string | null = null
  if (storageConfigured) {
    try {
      const config = getPackageBackupStorageConfig()!
      await getPackageBackupStorageClient().send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          MaxKeys: 1,
        }),
      )
    } catch (error) {
      storageStatus = 'failed'
      storageError = error instanceof Error ? error.message : 'Storage configuration failed'
    }
  }
  return { firebaseStatus, firebaseError, storageStatus, storageError }
}

function mappedStatus(customer: LegacyBookingCustomer) {
  if (customer.archived) return 'archived'
  if (customer.status.toLowerCase().includes('complete')) return 'closed'
  return 'documents_pending'
}

async function availableReference(supabase: SupabaseClient, requested: string) {
  const reference = requested.trim().toUpperCase()
  if (reference) {
    const { count } = await supabase
      .from('travel_packages')
      .select('id', { count: 'exact', head: true })
      .eq('package_reference', reference)
    if (!count) return reference
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = createTravelPackageReference()
    const { count } = await supabase
      .from('travel_packages')
      .select('id', { count: 'exact', head: true })
      .eq('package_reference', generated)
    if (!count) return generated
  }
  throw new Error('Could not allocate a unique package reference')
}

async function readLegacyObject(document: LegacyBookingDocument) {
  const config = getPackageBackupStorageConfig()
  if (!config || !document.fileKey) return null
  const response = await getPackageBackupStorageClient().send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: document.fileKey,
    }),
  )
  if (!response.Body) return null
  return Buffer.from(await response.Body.transformToByteArray())
}

export async function importLegacyBookingCustomer(input: {
  supabase: SupabaseClient
  customer: LegacyBookingCustomer
  runId: string
  actorId: string
  dryRun?: boolean
}) {
  const { supabase, customer, runId, actorId, dryRun = false } = input
  const { data: existingMap } = await supabase
    .from('travel_package_legacy_migration_map')
    .select('*')
    .eq('legacy_customer_id', customer.id)
    .maybeSingle()
  if (existingMap?.migration_status === 'imported' && existingMap.package_id) {
    return {
      status: 'skipped' as const,
      packageId: existingMap.package_id,
      copiedDocuments: 0,
      failedDocuments: 0,
    }
  }

  const reference = await availableReference(supabase, customer.referenceNumber)
  if (dryRun) {
    return {
      status: 'dry_run' as const,
      packageId: null,
      reference,
      copiedDocuments: 0,
      failedDocuments: 0,
      documentCount: customer.documents.length,
    }
  }

  const status = mappedStatus(customer)
  const bucket = getPackageMinioBucketName()
  const prefix = `${reference}/`
  const now = new Date().toISOString()
  const { data: packageData, error: packageError } = await supabase
    .from('travel_packages')
    .insert({
      package_reference: reference,
      created_by: actorId,
      assigned_agent_id: actorId,
      customer_name: customer.customerName || null,
      customer_access_last_name: customer.lastName.toLowerCase() || null,
      package_type: customer.packageType,
      destination: customer.destination || null,
      status,
      current_public_summary: {
        legacyKeyInformation: customer.keyInformation,
        checklist: customer.checklist,
      },
      passport_status: 'not_requested',
      payment_status: 'not_requested',
      invoice_status: 'not_started',
      document_release_status: 'pending',
      next_action: status === 'closed' ? 'Imported historical package' : 'Review imported package',
      risk_level: status === 'closed' || status === 'archived' ? 'none' : 'medium',
      minio_bucket: bucket,
      minio_prefix: prefix,
      document_access_token: createPackageDocumentAccessToken(),
      document_access_enabled: false,
      document_access_expires_at: customer.accessExpiresAt,
      created_at: customer.createdAt || now,
      updated_at: customer.updatedAt || now,
      archived_at: status === 'archived' ? customer.updatedAt || now : null,
      closed_at: status === 'closed' ? customer.updatedAt || now : null,
      earned_at: status === 'closed' ? customer.updatedAt || now : null,
      metadata: {
        legacyCustomerId: customer.id,
        legacyReference: customer.referenceNumber,
        legacyStatus: customer.status,
      },
    })
    .select('id')
    .single()
  if (packageError || !packageData)
    throw new Error(packageError?.message || 'Failed to create migrated package')

  let copiedDocuments = 0
  let failedDocuments = 0
  for (const [index, document] of customer.documents.entries()) {
    const fileName = sanitizePackageDocumentFileName(document.name)
    const category = normalizePackageDocumentCategory(
      document.category.toLowerCase().replace(/s$/, ''),
    )
    const storageKey = `${prefix}migrated/${category}/${String(index + 1).padStart(3, '0')}-${fileName}`
    try {
      const body = await readLegacyObject(document)
      if (!body) throw new Error('Source file key is missing or could not be read')
      const result = await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          Body: body,
          ContentType: document.contentType,
          Metadata: { package_id: packageData.id, legacy_customer_id: customer.id },
        }),
      )
      const backupConfig = getPackageBackupStorageConfig()
      const { error: documentError } = await supabase.from('travel_package_documents').insert({
        package_id: packageData.id,
        uploaded_by: actorId,
        updated_by: actorId,
        category,
        title: document.name,
        file_name: fileName,
        file_size: body.byteLength || document.size,
        file_type: document.contentType,
        storage_provider: 'minio',
        storage_bucket: bucket,
        storage_key: storageKey,
        storage_etag: result.ETag || '',
        backup_provider: backupConfig ? 'r3' : null,
        backup_bucket: backupConfig?.bucketName || null,
        backup_key: document.fileKey || null,
        backup_status: document.fileKey ? 'copied' : 'skipped',
        status: 'ready_for_review',
        customer_visible: false,
        metadata: {
          legacy: true,
          legacyUrl: document.url,
          legacyFileKey: document.fileKey,
          source: document.source,
        },
      })
      if (documentError) throw new Error(documentError.message)
      copiedDocuments += 1
    } catch (error) {
      failedDocuments += 1
      await supabase.from('travel_package_documents').insert({
        package_id: packageData.id,
        uploaded_by: actorId,
        updated_by: actorId,
        category,
        title: document.name,
        file_name: fileName,
        file_size: document.size,
        file_type: document.contentType,
        storage_provider: 'external',
        storage_bucket: 'legacy',
        storage_key: document.fileKey || document.url || `${customer.id}/${index}`,
        storage_etag: '',
        backup_provider: 'r3',
        backup_bucket: getPackageBackupStorageConfig()?.bucketName || null,
        backup_key: document.fileKey || null,
        backup_status: 'failed',
        backup_error: error instanceof Error ? error.message : 'Legacy copy failed',
        status: 'ready_for_review',
        customer_visible: false,
        metadata: {
          legacy: true,
          sourceOnly: true,
          legacyUrl: document.url,
          source: document.source,
        },
      })
    }
  }

  for (const note of customer.notes) {
    const noteObject = object(note)
    const summary = text(noteObject.text || noteObject.note || noteObject.content || note)
    if (summary) {
      await supabase.from('travel_package_communications').insert({
        package_id: packageData.id,
        channel: 'internal',
        direction: 'internal',
        summary,
        created_by: actorId,
        metadata: { legacy: true, source: note },
      })
    }
  }

  await supabase.from('travel_package_legacy_migration_map').upsert(
    {
      migration_run_id: runId,
      legacy_customer_id: customer.id,
      legacy_reference_number: customer.referenceNumber || null,
      package_id: packageData.id,
      migration_status: failedDocuments > 0 ? 'partial' : 'imported',
      migrated_documents_count: copiedDocuments,
      failed_documents_count: failedDocuments,
      source_payload: customer.source,
      error_message:
        failedDocuments > 0 ? `${failedDocuments} document(s) could not be copied` : null,
      migrated_at: now,
    },
    { onConflict: 'legacy_customer_id' },
  )
  await supabase.from('travel_package_audit_events').insert({
    package_id: packageData.id,
    actor_id: actorId,
    event_type: 'legacy_package_imported',
    event_summary: `Legacy package imported from customer ${customer.id}.`,
    metadata: {
      runId,
      copiedDocuments,
      failedDocuments,
      legacyReference: customer.referenceNumber,
    },
  })

  return {
    status: failedDocuments > 0 ? ('partial' as const) : ('imported' as const),
    packageId: packageData.id,
    reference,
    copiedDocuments,
    failedDocuments,
  }
}
