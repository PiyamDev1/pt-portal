/**
 * GET /api/cron/integrations/frappe/timeclock-attendance
 *
 * Backfills recent clock-in/out punches into daily attendance summaries for Frappe.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { queueRecentTimeclockAttendance } from '@/lib/integrations/frappe/syncEngine'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authorizationError = requireCronAuthorization(request)
  if (authorizationError) return authorizationError

  try {
    const url = new URL(request.url)
    const daysBack = Math.min(Math.max(Number(url.searchParams.get('daysBack') || '3'), 0), 14)
    const result = await queueRecentTimeclockAttendance(daysBack)
    return apiOk({ ok: true, ...result })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Timeclock attendance backfill failed'), 500)
  }
}
