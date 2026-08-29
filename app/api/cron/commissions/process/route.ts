import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
  publicCommissionDatabaseError,
} from '@/lib/commissions/api'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const employeeIdSchema = z.string().uuid()

export async function GET(request: Request) {
  const authorizationError = requireCronAuthorization(request)
  if (authorizationError) return authorizationError

  const actor = employeeIdSchema.safeParse(process.env.COMMISSION_CRON_ACTOR_EMPLOYEE_ID?.trim())
  if (!actor.success) {
    return commissionError('Commission scheduled processing is not configured.', 503)
  }
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow processing is not installed on this database.', 503)
  }

  const requestKey = `commission-cron:${new Date().toISOString().slice(0, 10)}`
  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_process_shadow_2026082902',
    {
      p_actor_employee_id: actor.data,
      p_limit: 200,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
