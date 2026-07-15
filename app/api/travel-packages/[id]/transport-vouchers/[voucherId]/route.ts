import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import {
  getPackageBackupStorageClient,
  getPackageBackupStorageConfig,
} from '@/lib/packageIntegrations'
import {
  normalizeTransportVoucherData,
  renderTransportVoucherHtml,
} from '@/lib/packageTransportVoucher'
import { enrichTransportVoucherPortalData } from '@/lib/packageTransportVoucherAccess'
import { getS3Client } from '@/lib/s3Client'
import type { TravelPackageFolder, TravelPackageTransportVoucher } from '@/app/types/packages'
import { selectTravelPackageVoucherColumns } from '../route'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; voucherId: string }> },
) {
  const { id, voucherId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const { data: before } = await supabase
    .from('travel_package_transport_vouchers')
    .select(selectTravelPackageVoucherColumns())
    .eq('id', voucherId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Transport voucher not found', 404)
  const voucher = before as unknown as TravelPackageTransportVoucher
  const hasVoucherData = body.voucherData !== undefined || body.voucher_data !== undefined
  const customerVisible = Boolean(
    body.customerVisible ?? body.customer_visible ?? voucher.customer_visible,
  )
  const now = new Date().toISOString()
  const { data: packageData } = await supabase
    .from('travel_packages')
    .select(
      `
      id, package_reference, customer_name, passenger_summary,
      document_access_token, document_access_enabled, document_access_expires_at,
      customer_access_last_name
    `,
    )
    .eq('id', id)
    .single()
  if (!packageData) return apiError('Travel package not found', 404)

  const packageFolder = packageData as unknown as TravelPackageFolder
  const voucherData = await enrichTransportVoucherPortalData(
    supabase as unknown as Parameters<typeof enrichTransportVoucherPortalData>[0],
    packageFolder,
    hasVoucherData
      ? normalizeTransportVoucherData(body.voucherData || body.voucher_data, voucher.voucher_data)
      : normalizeTransportVoucherData(voucher.voucher_data),
  )
  const renderedHtml = renderTransportVoucherHtml(packageFolder, voucherData)
  let storageWarning: string | null = null
  const nextStatus = customerVisible
    ? 'released_to_customer'
    : hasVoucherData
      ? voucher.status === 'released_to_customer' || voucher.status === 'revoked'
        ? 'amended'
        : voucher.status
      : 'revoked'

  if (voucher.document_id && renderedHtml) {
    const htmlBody = Buffer.from(renderedHtml, 'utf8')
    const { data: documentData } = await supabase
      .from('travel_package_documents')
      .select('id, storage_bucket, storage_key')
      .eq('id', voucher.document_id)
      .single()
    const document = documentData as
      | { id: string; storage_bucket?: string | null; storage_key?: string | null }
      | null
      | undefined
    if (document?.storage_bucket && document.storage_key) {
      let etag = ''
      try {
        const result = await getS3Client().send(
          new PutObjectCommand({
            Bucket: document.storage_bucket,
            Key: document.storage_key,
            Body: htmlBody,
            ContentType: 'text/html; charset=utf-8',
          }),
        )
        etag = result.ETag || ''

        const backupConfig = getPackageBackupStorageConfig()
        let backupStatus: 'pending' | 'copied' | 'failed' | 'skipped' = backupConfig
          ? 'pending'
          : 'skipped'
        let backupError: string | null = null
        if (backupConfig) {
          try {
            await getPackageBackupStorageClient().send(
              new PutObjectCommand({
                Bucket: backupConfig.bucketName,
                Key: document.storage_key,
                Body: htmlBody,
                ContentType: 'text/html; charset=utf-8',
              }),
            )
            backupStatus = 'copied'
          } catch (error) {
            backupStatus = 'failed'
            backupError = error instanceof Error ? error.message : 'Voucher backup failed'
          }
        }

        await supabase
          .from('travel_package_documents')
          .update({
            file_size: htmlBody.byteLength,
            storage_etag: etag,
            backup_status: backupStatus,
            backup_error: backupError,
            updated_by: user.id,
          })
          .eq('id', voucher.document_id)
      } catch (error) {
        storageWarning =
          error instanceof Error ? error.message : 'Failed to refresh stored voucher document'
      }
    }
  }

  if (customerVisible) {
    const { data: oldVouchers } = await supabase
      .from('travel_package_transport_vouchers')
      .select('id, document_id')
      .eq('package_id', id)
      .eq('customer_visible', true)
      .neq('id', voucherId)
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
            revoked_at: now,
            revoked_by: user.id,
          })
          .eq('id', oldVoucher.document_id)
      }
    }
  }

  const { data, error } = await supabase
    .from('travel_package_transport_vouchers')
    .update({
      status: nextStatus,
      customer_visible: customerVisible,
      voucher_data: voucherData,
      rendered_html: renderedHtml,
      released_at: customerVisible ? voucher.released_at || now : null,
      released_by: customerVisible ? voucher.released_by || user.id : null,
      updated_by: user.id,
    })
    .eq('id', voucherId)
    .eq('package_id', id)
    .select(selectTravelPackageVoucherColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to update transport voucher', 500)

  if (voucher.document_id) {
    await supabase
      .from('travel_package_documents')
      .update({
        status: customerVisible ? 'released' : 'revoked',
        customer_visible: customerVisible,
        released_at: customerVisible ? now : null,
        released_by: customerVisible ? user.id : null,
        revoked_at: customerVisible ? null : now,
        revoked_by: customerVisible ? null : user.id,
        public_notes: voucherData.publicNotes || null,
        internal_notes: voucherData.internalNotes || null,
      })
      .eq('id', voucher.document_id)
  }
  await supabase
    .from('travel_package_versions')
    .update({
      visibility: customerVisible
        ? 'released_to_customer'
        : hasVoucherData
          ? 'ready_for_review'
          : 'revoked',
      snapshot: { voucher: data },
      released_at: customerVisible ? now : null,
      released_by: customerVisible ? user.id : null,
    })
    .eq('object_type', 'transport_voucher')
    .eq('object_id', voucherId)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: hasVoucherData
        ? 'transport_voucher_updated'
        : customerVisible
          ? 'transport_voucher_released'
          : 'transport_voucher_revoked',
      eventSummary: hasVoucherData
        ? `Transport voucher v${voucher.version} updated.`
        : `Transport voucher ${customerVisible ? 'released to customer' : 'revoked'}.`,
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ voucher: data as unknown as TravelPackageTransportVoucher, storageWarning })
}
