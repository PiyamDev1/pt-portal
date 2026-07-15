import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getS3Client } from '@/lib/s3Client'
import {
  getPackageBackupStorageClient,
  getPackageBackupStorageConfig,
  getPackageMinioBucketName,
} from '@/lib/packageIntegrations'
import {
  normalizeTransportVoucherData,
  renderTransportVoucherHtml,
} from '@/lib/packageTransportVoucher'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackageFolder, TravelPackageTransportVoucher } from '@/app/types/packages'

const SCHEMA_HINT =
  'Transport vouchers are not installed yet. Run scripts/migrations/20260712_create_travel_package_documents.sql, scripts/migrations/20260712_create_travel_package_invoices.sql, then scripts/migrations/20260712_finalize_travel_package_workflow.sql.'

export function selectTravelPackageVoucherColumns() {
  return `
    id, package_id, reservation_id, document_id, version, status,
    customer_visible, voucher_data, rendered_html, generated_at, released_at,
    released_by, created_by, updated_by, created_at, updated_at
  `
}

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42P10' ||
    code === '42501' ||
    code === 'PGRST106' ||
    code === 'PGRST204' ||
    code === 'PGRST205'
  )
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_transport_vouchers')
    .select(selectTravelPackageVoucherColumns())
    .eq('package_id', id)
    .order('version', { ascending: false })
  if (error) {
    if (isSchemaError(error))
      return apiOk({ vouchers: [], setupRequired: true, message: SCHEMA_HINT })
    return apiError(error.message || 'Failed to load transport vouchers', 500)
  }
  return apiOk({ vouchers: (data || []) as unknown as TravelPackageTransportVoucher[] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const { data: packageData, error: packageError } = await supabase
    .from('travel_packages')
    .select('id, package_reference, customer_name, passenger_summary, minio_bucket, minio_prefix')
    .eq('id', id)
    .single()
  if (packageError || !packageData) return apiError('Travel package not found', 404)

  const { data: latestData, error: latestError } = await supabase
    .from('travel_package_transport_vouchers')
    .select('version')
    .eq('package_id', id)
    .order('version', { ascending: false })
    .limit(1)
  if (latestError && !isSchemaError(latestError)) {
    return apiError(latestError.message || 'Failed to prepare transport voucher', 500)
  }

  const latestVersion = Number((latestData?.[0] as { version?: number } | undefined)?.version || 0)
  const version = latestVersion + 1
  const packageFolder = packageData as unknown as TravelPackageFolder
  const voucherData = normalizeTransportVoucherData(body.voucherData || body.voucher_data)
  const renderedHtml = renderTransportVoucherHtml(packageFolder, voucherData)
  const customerVisible = Boolean(body.customerVisible || body.customer_visible)
  const generatedAt = new Date().toISOString()
  const bucket = packageFolder.minio_bucket || getPackageMinioBucketName()
  const prefix = packageFolder.minio_prefix || `${packageFolder.package_reference}/`
  const storageKey = `${prefix.replace(/\/?$/, '/')}vouchers/transport-v${version}.html`
  const htmlBody = Buffer.from(renderedHtml, 'utf8')
  let etag = ''
  let storageWarning: string | null = null

  try {
    const result = await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: htmlBody,
        ContentType: 'text/html; charset=utf-8',
      }),
    )
    etag = result.ETag || ''
  } catch (error) {
    storageWarning = error instanceof Error ? error.message : 'Failed to store transport voucher'
  }

  const backupConfig = getPackageBackupStorageConfig()
  let backupStatus: 'pending' | 'copied' | 'failed' | 'skipped' = backupConfig
    ? 'pending'
    : 'skipped'
  let backupError: string | null = null
  if (backupConfig && !storageWarning) {
    try {
      await getPackageBackupStorageClient().send(
        new PutObjectCommand({
          Bucket: backupConfig.bucketName,
          Key: storageKey,
          Body: htmlBody,
          ContentType: 'text/html; charset=utf-8',
        }),
      )
      backupStatus = 'copied'
    } catch (error) {
      backupStatus = 'failed'
      backupError = error instanceof Error ? error.message : 'Voucher backup failed'
    }
  } else if (storageWarning) {
    backupStatus = 'skipped'
  }

  if (customerVisible) {
    const { data: oldVouchers } = await supabase
      .from('travel_package_transport_vouchers')
      .select('id, document_id')
      .eq('package_id', id)
      .eq('customer_visible', true)
    for (const oldVoucher of oldVouchers || []) {
      await supabase
        .from('travel_package_transport_vouchers')
        .update({
          status: 'amended',
          customer_visible: false,
        })
        .eq('id', oldVoucher.id)
      if (oldVoucher.document_id) {
        await supabase
          .from('travel_package_documents')
          .update({
            status: 'revoked',
            customer_visible: false,
            revoked_at: generatedAt,
            revoked_by: user.id,
          })
          .eq('id', oldVoucher.document_id)
      }
    }
  }

  let documentId: string | null = null
  if (!storageWarning) {
    const { data: documentData, error: documentError } = await supabase
      .from('travel_package_documents')
      .insert({
        package_id: id,
        uploaded_by: user.id,
        updated_by: user.id,
        category: 'transport',
        title: `Transport Voucher v${version}`,
        file_name: `transport-voucher-${packageFolder.package_reference}-v${version}.html`,
        file_size: htmlBody.byteLength,
        file_type: 'text/html',
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
        released_at: customerVisible ? generatedAt : null,
        released_by: customerVisible ? user.id : null,
        public_notes: voucherData.publicNotes || null,
        internal_notes: voucherData.internalNotes || null,
        metadata: { generated: true, voucherVersion: version },
      })
      .select('id')
      .single()
    if (documentError || !documentData) {
      if (isSchemaError(documentError)) return apiError(SCHEMA_HINT, 503)
      return apiError(documentError?.message || 'Failed to save transport voucher document', 500)
    }
    documentId = (documentData as unknown as { id: string }).id
  }

  const { data, error } = await supabase
    .from('travel_package_transport_vouchers')
    .insert({
      package_id: id,
      reservation_id: cleanText(body.reservationId || body.reservation_id) || null,
      document_id: documentId,
      version,
      status: customerVisible ? 'released_to_customer' : 'generated',
      customer_visible: customerVisible,
      voucher_data: voucherData,
      rendered_html: renderedHtml,
      generated_at: generatedAt,
      released_at: customerVisible ? generatedAt : null,
      released_by: customerVisible ? user.id : null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select(selectTravelPackageVoucherColumns())
    .single()
  if (error || !data) {
    if (isSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || 'Failed to create transport voucher', 500)
  }

  await supabase.from('travel_package_versions').insert({
    package_id: id,
    object_type: 'transport_voucher',
    object_id: (data as unknown as { id: string }).id,
    version_number: version,
    visibility: customerVisible ? 'released_to_customer' : 'internal_only',
    snapshot: {
      voucher: data,
      storage: storageWarning ? null : { bucket, key: storageKey },
      storageWarning,
    },
    internal_change_summary: storageWarning
      ? `Transport voucher version ${version} generated without stored HTML document.`
      : `Transport voucher version ${version} generated.`,
    created_by: user.id,
    released_at: customerVisible ? generatedAt : null,
    released_by: customerVisible ? user.id : null,
  })
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: customerVisible ? 'transport_voucher_released' : 'transport_voucher_generated',
      eventSummary: `Transport voucher version ${version} ${customerVisible ? 'generated and released' : 'generated'}.`,
      afterData: data,
    },
  )
  return apiOk(
    { voucher: data as unknown as TravelPackageTransportVoucher, storageWarning },
    { status: 201 },
  )
}
