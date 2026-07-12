import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { DOCUMENT_MAX_FILE_SIZE_BYTES, DOCUMENT_MAX_FILE_SIZE_LABEL } from '@/lib/documentConstraints'
import {
  getPackageBackupStorageClient,
  getPackageBackupStorageConfig,
  getPackageMinioBucketName,
} from '@/lib/packageIntegrations'
import {
  buildPackageDocumentStorageKey,
  normalizePackageDocumentCategory,
} from '@/lib/packageDocuments'
import { getS3Client } from '@/lib/s3Client'
import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
} from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

const SCHEMA_HINT =
  'Travel package document schema is not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql in Supabase SQL editor.'

type PackageLookup = Pick<
  TravelPackageFolder,
  'id' | 'package_reference' | 'source_quote_id' | 'minio_bucket' | 'minio_prefix'
>

function isDocumentSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

export function selectTravelPackageDocumentColumns() {
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
    backup_provider,
    backup_bucket,
    backup_key,
    backup_status,
    backup_error,
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

async function getPackageFolder(supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>, id: string) {
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data: packageFolder, error: packageError } = await getPackageFolder(supabase, id)
  if (packageError || !packageFolder) {
    if (isDocumentSchemaError(packageError)) return apiError(SCHEMA_HINT, 503)
    return apiError('Travel package not found', 404)
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) return apiError('Invalid form data', 400)

  const file = formData.get('file')
  if (!(file instanceof File)) return apiError('Document file is required', 400)
  if (file.size > DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return apiError(`File size exceeds maximum of ${DOCUMENT_MAX_FILE_SIZE_LABEL}`, 413)
  }

  const category = normalizePackageDocumentCategory(formData.get('category'))
  const title = cleanText(formData.get('title')) || file.name
  const customerVisible = formData.get('customerVisible') === 'true'
  const publicNotes = cleanText(formData.get('publicNotes')) || null
  const internalNotes = cleanText(formData.get('internalNotes')) || null
  const reservationId = cleanText(formData.get('reservationId')) || null
  const packageData = packageFolder as PackageLookup
  const bucket = packageData.minio_bucket || getPackageMinioBucketName()
  const prefix = packageData.minio_prefix || `${packageData.package_reference}/`
  const storageKey = buildPackageDocumentStorageKey({
    packagePrefix: prefix,
    category: category as TravelPackageDocumentCategory,
    fileName: file.name,
  })

  const arrayBuffer = await file.arrayBuffer()
  const body = Buffer.from(arrayBuffer)
  let etag = ''
  const metadata: Record<string, unknown> = {}

  try {
    const putResult = await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: body,
        ContentType: file.type || 'application/octet-stream',
        Metadata: {
          package_id: id,
          uploaded_by: user.id,
        },
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
  let backupStatus: 'pending' | 'copied' | 'failed' | 'skipped' = backupConfig ? 'pending' : 'skipped'
  let backupError: string | null = null
  if (backupConfig) {
    try {
      const backupResult = await getPackageBackupStorageClient().send(
        new PutObjectCommand({
          Bucket: backupConfig.bucketName,
          Key: storageKey,
          Body: body,
          ContentType: file.type || 'application/octet-stream',
          Metadata: {
            package_id: id,
            primary_bucket: bucket,
            uploaded_by: user.id,
          },
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
      uploaded_by: user.id,
      updated_by: user.id,
      category,
      title,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
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
      released_by: customerVisible ? user.id : null,
      public_notes: publicNotes,
      internal_notes: internalNotes,
      metadata,
    })
    .select(selectTravelPackageDocumentColumns())
    .single()

  if (error) {
    if (isDocumentSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error.message || 'Failed to save package document metadata', 500)
  }

  await syncDocumentReleaseStatus(supabase, id)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: packageData.source_quote_id,
      actorId: user.id,
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
