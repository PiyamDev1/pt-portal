import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authenticateTimeclockDevice } from '@/lib/timeclockDeviceAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('device_id')?.trim() || ''
  if (!deviceId) return apiError('device_id required', 400)

  const sinceValue = url.searchParams.get('since')
  const since = sinceValue === null ? null : Number(sinceValue)
  if (sinceValue !== null && (!Number.isFinite(since) || since! < 0)) {
    return apiError('Invalid since timestamp', 400)
  }

  const auth = await authenticateTimeclockDevice(request, { expectedDeviceId: deviceId })
  if (!auth.authenticated) return auth.response

  let query = getSupabaseClient()
    .from('notice_board_slides')
    .select('id, title, body, image_url, hyperlink_url, display_seconds, sort_order, updated_at')
    .eq('is_active', true)
    .is('target_role', null)
    .is('target_department_id', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  query = auth.device.location_id
    ? query.or(`target_location_id.is.null,target_location_id.eq.${auth.device.location_id}`)
    : query.is('target_location_id', null)

  if (since !== null) {
    query = query.gt('updated_at', new Date(since * 1000).toISOString())
  }

  const { data, error } = await query
  if (error) return apiError('Failed to load notices', 500)

  return apiOk({ notices: data || [] })
}
