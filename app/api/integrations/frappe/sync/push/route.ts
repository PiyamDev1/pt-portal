/**
 * POST /api/integrations/frappe/sync/push
 *
 * Manual or automation-triggered outbox dispatch endpoint.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { dispatchOutboxBatch } from '@/lib/integrations/frappe/syncEngine'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await requireMaintenanceSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number }
    const limit = Math.min(Math.max(body.limit || 25, 1), 250)

    const result = await dispatchOutboxBatch(limit)
    return apiOk({ ok: true, ...result })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Push sync failed'), 500)
  }
}
