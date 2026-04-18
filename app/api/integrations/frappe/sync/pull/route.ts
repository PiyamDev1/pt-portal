/**
 * POST /api/integrations/frappe/sync/pull
 *
 * Placeholder pull endpoint for staged rollout.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { frappePing } from '@/lib/integrations/frappe/client'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await requireMaintenanceSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const ping = await frappePing()

    return apiOk({
      ok: true,
      mode: 'staged',
      message: 'Frappe reachable. Pull reconciliation implementation pending next slice.',
      ping,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Pull sync failed'), 500)
  }
}
