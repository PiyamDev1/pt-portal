import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackageTransportVoucher } from '@/app/types/packages'
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
  const customerVisible = Boolean(body.customerVisible ?? body.customer_visible)
  const now = new Date().toISOString()

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
      status: customerVisible ? 'released_to_customer' : 'revoked',
      customer_visible: customerVisible,
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
      })
      .eq('id', voucher.document_id)
  }
  await supabase
    .from('travel_package_versions')
    .update({
      visibility: customerVisible ? 'released_to_customer' : 'revoked',
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
      eventType: customerVisible ? 'transport_voucher_released' : 'transport_voucher_revoked',
      eventSummary: `Transport voucher ${customerVisible ? 'released to customer' : 'revoked'}.`,
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ voucher: data as unknown as TravelPackageTransportVoucher })
}
