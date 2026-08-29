import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { COMMISSION_PRIVATE_RESPONSE } from '@/lib/commissions/api'
import { requireCommissionManager } from '@/lib/commissions/server'

export async function POST(request: Request) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response

  const supplied = request.headers.get('Idempotency-Key')?.trim()
  const token = supplied && /^[A-Za-z0-9:_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID()

  try {
    const { data, error } = await access.supabase.rpc('commission_process_shadow_2026082902', {
      p_actor_employee_id: access.employee.id,
      p_limit: 200,
      p_request_key: `manual-process:${token}`,
    })
    if (error) throw error
    return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
  } catch (error) {
    return apiError(
      toErrorMessage(error, 'Unable to process commission events'),
      500,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
