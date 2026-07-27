import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { authenticateTimeclockDevice } from '@/lib/timeclockDeviceAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ACTIVITY_LIMIT = 50

type ActivityRow = {
  id: string
  punch_type: 'IN' | 'OUT'
  scanned_at: string
  employees: { full_name?: string | null } | { full_name?: string | null }[] | null
}

function employeeName(row: ActivityRow) {
  const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees
  return employee?.full_name?.trim() || 'Unknown employee'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('device_id')?.trim() || ''
  if (!deviceId) return apiError('device_id required', 400)

  const sinceValue = url.searchParams.get('since')
  const since = sinceValue === null ? null : Number(sinceValue)
  const sinceDate = since === null ? null : new Date(since * 1000)
  if (
    sinceValue !== null &&
    (!/^\d+$/.test(sinceValue) ||
      !Number.isSafeInteger(since) ||
      since! < 0 ||
      !Number.isFinite(sinceDate!.getTime()))
  ) {
    return apiError('Invalid since timestamp', 400)
  }

  const auth = await authenticateTimeclockDevice(request, { expectedDeviceId: deviceId })
  if (!auth.authenticated) return auth.response

  let query = getSupabaseClient()
    .from('timeclock_events')
    .select('id, punch_type, scanned_at, employees ( full_name )')
    .eq('device_id', auth.device.id)
    .eq('event_type', 'PUNCH')
    .in('punch_type', ['IN', 'OUT'])

  if (sinceDate !== null) {
    query = query.gt('scanned_at', sinceDate.toISOString())
  }

  const { data, error } = await query
    .order('scanned_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ACTIVITY_LIMIT)

  if (error) return apiError('Failed to load device activity', 500)

  const activity = ((data || []) as ActivityRow[]).reverse().map((row) => ({
    id: row.id,
    user_name: employeeName(row),
    timestamp: Math.floor(new Date(row.scanned_at).getTime() / 1000),
    action: row.punch_type === 'IN' ? 'clocked in' : 'clocked out',
  }))

  return apiOk(activity, { headers: { 'Cache-Control': 'no-store' } })
}
