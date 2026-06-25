/**
 * GET /api/cron/integrations/frappe/timeclock-attendance
 *
 * Backfills recent clock-in/out punches into daily attendance summaries for Frappe.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { queueRecentTimeclockAttendance } from '@/lib/integrations/frappe/syncEngine'

export const dynamic = 'force-dynamic'

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return true
  }
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return apiError('Unauthorized', 401)
  }

  try {
    const url = new URL(request.url)
    const daysBack = Math.min(Math.max(Number(url.searchParams.get('daysBack') || '3'), 0), 14)
    const result = await queueRecentTimeclockAttendance(daysBack)
    return apiOk({ ok: true, ...result })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Timeclock attendance backfill failed'), 500)
  }
}
