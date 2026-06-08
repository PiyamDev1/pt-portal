/**
 * GET /api/integrations/frappe/health
 *
 * Integration diagnostics for rollout and support.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { getFrappeIntegrationHealth } from '@/lib/integrations/frappe/health'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await requireMaintenanceSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const health = await getFrappeIntegrationHealth()
    return apiOk({
      ok: true,
      ...health,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Frappe health check failed'), 500)
  }
}
