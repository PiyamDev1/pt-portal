/**
 * GET /api/cron/integrations/frappe/outbox
 *
 * Cron-safe outbox dispatcher.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { dispatchOutboxBatch } from '@/lib/integrations/frappe/syncEngine'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authorizationError = requireCronAuthorization(request)
  if (authorizationError) return authorizationError

  try {
    const result = await dispatchOutboxBatch(50)
    return apiOk({ ok: true, ...result })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Outbox dispatch failed'), 500)
  }
}
