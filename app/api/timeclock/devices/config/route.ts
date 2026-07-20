import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authenticateTimeclockDevice } from '@/lib/timeclockDeviceAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get('device_id')?.trim() || ''
  if (!deviceId) return apiError('device_id required', 400)

  const auth = await authenticateTimeclockDevice(request, { expectedDeviceId: deviceId })
  if (!auth.authenticated) return auth.response

  let locationName: string | null = null
  if (auth.device.location_id) {
    const { data: location, error } = await getSupabaseClient()
      .from('locations')
      .select('name')
      .eq('id', auth.device.location_id)
      .maybeSingle()

    if (error) return apiError('Failed to load device configuration', 500)
    locationName = location?.name || null
  }

  return apiOk({
    device_id: auth.device.id,
    location_id: auth.device.location_id,
    location_name: locationName,
    qr_interval_sec: auth.device.qr_interval_sec,
    is_active: auth.device.is_active,
  })
}
