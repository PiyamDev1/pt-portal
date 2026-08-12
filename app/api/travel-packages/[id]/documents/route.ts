import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseMultipartFormDataWithLimit } from '@/lib/api/request'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILE_SIZE_LABEL,
} from '@/lib/documentConstraints'
import {
  getPackageBackupStorageClient,
  getPackageBackupStorageConfig,
  getPackageMinioBucketName,
} from '@/lib/packageIntegrations'
import {
  buildPackageDocumentStorageKey,
  isAgentOnlyPackageDocumentCategory,
  normalizePackageDocumentCategory,
} from '@/lib/packageDocuments'
import { getS3Client } from '@/lib/s3Client'
import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
} from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import {
  isUploadedFile,
  requestContentLengthExceeds,
  validateDocumentUpload,
} from '@/lib/documentSecurity'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { reportOperationalError } from '@/lib/observability/server'
import { selectTravelPackageDocumentColumns } from './columns'

const SCHEMA_HINT =
  'Travel package document schema is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql in Supabase SQL editor.'
const DOCUMENT_MULTIPART_MAX_BYTES = DOCUMENT_MAX_FILE_SIZE_BYTES + 256 * 1024

type PackageLookup = Pick<
  TravelPackageFolder,
  'id' | 'package_reference' | 'source_quote_id' | 'minio_bucket' | 'minio_prefix'
>

function isDocumentSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

async function getPackageFolder(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  id: string,
) {
  return supabase
    .from('travel_packages')
    .select('id, package_reference, source_quote_id, minio_bucket, minio_prefix')
    .eq('id', id)
    .single()
}

async function syncDocumentReleaseStatus(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
) {
  const { count, error } = await supabase
    .from('travel_package_documents')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)
    .eq('customer_visible', true)
    .eq('status', 'released')

  if (error) return

  await supabase
    .from('travel_packages')
    .update({
      document_release_status: count && count > 0 ? 'released' : 'pending',
    })
    .eq('id', packageId)
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseDocumentMetadata(value: unknown) {
  const rawMetadata = cleanText(value)
  if (!rawMetadata) return {}

  try {
    const parsed = JSON.parse(rawMetadata) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const supabase = await getRouteSupabaseClient()

  const { data, error } = await supabase
    .from('travel_package_documents')
    .select(selectTravelPackageDocumentColumns())
    .eq('package_id', id)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  if (error) {
    if (isDocumentSchemaError(error)) {
      return apiOk({ documents: [], setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to load package documents', 500)
  }

  return apiOk({
    documents: (data || []) as unknown as TravelPackageDocument[],
    setupRequired: false,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const supabase = await getRouteSupabaseClient()
  const userId = access.user.id

  const limit = await enforceRateLimit(request, {
    scope: 'travel-packages.document-upload',
    limit: 20,
    windowSeconds: 60 * 60,
    identities: [`user:${userId}`, `ip:${getClientIp(request)}`],
    message: 'Too many document uploads. Please wait before uploading another file.',
  })
  if (!limit.allowed) return limit.response

  if (requestContentLengthExceeds(request, DOCUMENT_MULTIPART_MAX_BYTES)) {
    return apiError(`File size exceeds maximum of ${DOCUMENT_MAX_FILE_SIZE_LABEL}`, 413)
  }

  const { data: packageFolder, error: packageError } = await getPackageFolder(supabase, id)
  if (packageError || !packageFolder) {
    if (isDocumentSchemaError(packageError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Travel package not found', 404)
  }

  const parsedForm = await parseMultipartFormDataWithLimit(request, DOCUMENT_MULTIPART_MAX_BYTES)
  if (!parsedForm.data) {
    return apiError(
      parsedForm.status === 413
        ? `File size exceeds maximum of ${DOCUMENT_MAX_FILE_SIZE_LABEL}`
        : parsedForm.error,
      parsedForm.status,
    )
  }
  const formData = parsedForm.data

  const file = formData.get('file')
  if (!isUploadedFile(file)) return apiError('Document file is required', 400)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const validation = validateDocumentUpload(file, bytes)
  if (!validation.valid) return apiError(validation.error, validation.status)
  const { fileName, fileSize, fileType } = validation.value

  const category = normalizePackageDocumentCategory(formData.get('category'))
  const title = cleanText(formData.get('title')) || fileName
  const customerVisible =
    formData.get('customerVisible') === 'true' && !isAgentOnlyPackageDocumentCategory(category)
  const publicNotes = cleanText(formData.get('publicNotes')) || null
  const internalNotes = cleanText(formData.get('internalNotes')) || null
  const reservationId = cleanText(formData.get('reservationId')) || null
  const documentMetadata = parseDocumentMetadata(formData.get('metadata'))
  const packageData = packageFolder as PackageLookup
  const bucket = packageData.minio_bucket || getPackageMinioBucketName()
  const prefix = packageData.minio_prefix || `${packageData.package_reference}/`
  const storageKey = buildPackageDocumentStorageKey({
    packagePrefix: prefix,
    category: category as TravelPackageDocumentCategory,
    fileName,
  })

  const body = Buffer.from(bytes)
  let etag = ''
  const primaryStorage = getS3Client()
  const metadata: Record<string, unknown> = { ...documentMetadata }

  try {
    const putResult = await primaryStorage.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: body,
        ContentType: fileType,
      }),
    )
    etag = putResult.ETag || ''
  } catch (storageError) {
    return apiError(
      storageError instanceof Error ? storageError.message : 'Failed to upload package document',
      500,
    )
  }

  const backupConfig = getPackageBackupStorageConfig()
  let backupStatus: 'pending' | 'copied' | 'failed' | 'skipped' = backupConfig
    ? 'pending'
    : 'skipped'
  let backupError: string | null = null
  let backupUploaded = false
  if (backupConfig) {
    try {
      const backupResult = await getPackageBackupStorageClient().send(
        new PutObjectCommand({
          Bucket: backupConfig.bucketName,
          Key: storageKey,
          Body: body,
          ContentType: fileType,
        }),
      )
      metadata.backupStorage = {
        provider: 'r3',
        status: 'uploaded',
        bucket: backupConfig.bucketName,
        key: storageKey,
        etag: backupResult.ETag || '',
        uploadedAt: new Date().toISOString(),
      }
      backupStatus = 'copied'
      backupUploaded = true
    } catch (backupFailure) {
      metadata.backupStorage = {
        provider: 'r3',
        status: 'failed',
        bucket: backupConfig.bucketName,
        key: storageKey,
        error: backupFailure instanceof Error ? backupFailure.message : 'Backup upload failed',
        failedAt: new Date().toISOString(),
      }
      backupStatus = 'failed'
      backupError = backupFailure instanceof Error ? backupFailure.message : 'Backup upload failed'
    }
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('travel_package_documents')
    .insert({
      package_id: id,
      reservation_id: reservationId,
      quote_id: packageData.source_quote_id,
      uploaded_by: userId,
      updated_by: userId,
      category,
      title,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      storage_provider: 'minio',
      storage_bucket: bucket,
      storage_key: storageKey,
      storage_etag: etag,
      backup_provider: backupConfig ? 'r3' : null,
      backup_bucket: backupConfig?.bucketName || null,
      backup_key: backupConfig ? storageKey : null,
      backup_status: backupStatus,
      backup_error: backupError,
      status: customerVisible ? 'released' : 'ready_for_review',
      customer_visible: customerVisible,
      released_at: customerVisible ? now : null,
      released_by: customerVisible ? userId : null,
      public_notes: publicNotes,
      internal_notes: internalNotes,
      metadata,
    })
    .select(selectTravelPackageDocumentColumns())
    .single()

  if (error) {
    const cleanupResults = await Promise.allSettled([
      primaryStorage.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey })),
      ...(backupConfig && backupUploaded
        ? [
            getPackageBackupStorageClient().send(
              new DeleteObjectCommand({ Bucket: backupConfig.bucketName, Key: storageKey }),
            ),
          ]
        : []),
    ])
    const cleanupFailed = cleanupResults.some((result) => result.status === 'rejected')
    await reportOperationalError({
      event: 'package_documents.metadata_insert_failed',
      request,
      error,
      alert: cleanupFailed,
      context: { packageId: id, cleanupFailed },
    })
    if (isDocumentSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error.message || 'Failed to save package document metadata', 500)
  }

  await syncDocumentReleaseStatus(supabase, id)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: packageData.source_quote_id,
      actorId: userId,
      eventType: customerVisible ? 'document_uploaded_and_released' : 'document_uploaded',
      eventSummary: `Document "${title}" uploaded${customerVisible ? ' and released to customer' : ''}.`,
      afterData: data,
    },
  )

  return apiOk(
    { document: data as unknown as TravelPackageDocument, setupRequired: false },
    { status: 201 },
  )
}
