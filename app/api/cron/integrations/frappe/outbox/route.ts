/**
 * GET /api/cron/integrations/frappe/outbox
 *
 * Cron-safe outbox dispatcher.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { dispatchOutboxBatch } from '@/lib/integrations/frappe/syncEngine'

export const dynamic = 'force-dynamic'

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return true
  }
  const authHeader = request.headers.get('authorization')
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  return authHeader === `Bearer ${cronSecret}` || vercelCronHeader === '1'
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return apiError('Unauthorized', 401)
  }

  try {
    const result = await dispatchOutboxBatch(50)
    return apiOk({ ok: true, ...result })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Outbox dispatch failed'), 500)
  }
}
