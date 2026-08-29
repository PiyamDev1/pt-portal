import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { COMMISSION_PRIVATE_RESPONSE } from '@/lib/commissions/api'
import { requireCommissionManager } from '@/lib/commissions/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response

  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    return apiError('Invalid exception ID', 400, {}, COMMISSION_PRIVATE_RESPONSE)
  }
  const supplied = request.headers.get('Idempotency-Key')?.trim()
  const token = supplied && /^[A-Za-z0-9:_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID()

  try {
    const { data, error } = await access.supabase.rpc('commission_retry_exception_2026082902', {
      p_actor_employee_id: access.employee.id,
      p_exception_id: id,
      p_request_key: `exception-retry:${token}`,
    })
    if (error) throw error
    return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
  } catch (error) {
    return apiError(
      toErrorMessage(error, 'Unable to retry commission exception'),
      500,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
