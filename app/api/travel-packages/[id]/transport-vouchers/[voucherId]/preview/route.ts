import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

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
    .select('rendered_html, version')
    .eq('id', voucherId)
    .eq('package_id', id)
    .single()

  if (error || !data) return apiError('Transport voucher not found', 404)

  const voucher = data as { rendered_html?: string | null; version?: number | null }
  if (!voucher.rendered_html) return apiError('Transport voucher preview is unavailable', 404)

  return new NextResponse(voucher.rendered_html, {
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
