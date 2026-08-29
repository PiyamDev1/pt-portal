import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type { TravelPackageFolder, TravelPackageTransportVoucherData } from '@/app/types/packages'
import {
  normalizeTransportVoucherData,
  renderTransportVoucherHtml,
} from '@/lib/packageTransportVoucher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; voucherId: string }> },
) {
  const { id, voucherId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_transport_vouchers')
    .select('rendered_html, voucher_data, version')
    .eq('id', voucherId)
    .eq('package_id', id)
    .single()

  if (error || !data) return apiError('Transport voucher not found', 404)

  const voucher = data as {
    rendered_html?: string | null
    voucher_data?: TravelPackageTransportVoucherData | null
    version?: number | null
  }
  let previewHtml = voucher.rendered_html || ''
  if (voucher.voucher_data) {
    const { data: packageData } = await supabase
      .from('travel_packages')
      .select('package_reference, customer_name, customer_access_last_name, passenger_summary')
      .eq('id', id)
      .single()

    if (packageData) {
      const packageFolder = packageData as unknown as Pick<
        TravelPackageFolder,
        'package_reference' | 'customer_name' | 'customer_access_last_name' | 'passenger_summary'
      >
      const voucherData = normalizeTransportVoucherData(voucher.voucher_data)

      // Always refresh the layout. Logo embedding is an enhancement and must not
      // make an older stored document fall back to stale print geometry.
      previewHtml = renderTransportVoucherHtml(packageFolder, voucherData)
      try {
        const { getTransportVoucherLogoDataUrl } =
          await import('@/lib/packageTransportVoucherServer')
        previewHtml = renderTransportVoucherHtml(packageFolder, voucherData, {
          logoSrc: await getTransportVoucherLogoDataUrl(),
        })
      } catch (renderError) {
        console.error('Transport voucher preview logo embedding failed', renderError)
      }
    }
  }
  if (!previewHtml) return apiError('Transport voucher preview is unavailable', 404)

  return new NextResponse(previewHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="transport-voucher-v${voucher.version || 1}.html"`,
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
