import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { COMMISSION_PRIVATE_RESPONSE } from '@/lib/commissions/api'
import { requireCommissionManager } from '@/lib/commissions/server'

const cancellationSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict()

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response

  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    return apiError('Invalid profile ID', 400, {}, COMMISSION_PRIVATE_RESPONSE)
  }

  const { data: cancellation, error: bodyError } = await parseBodyWithSchema(
    request,
    cancellationSchema,
    { maxBytes: 4 * 1024 },
  )
  if (bodyError || !cancellation) {
    return apiError(
      bodyError || 'Enter a cancellation reason',
      400,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  const supplied = request.headers.get('Idempotency-Key')?.trim()
  const token = supplied && /^[A-Za-z0-9:_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID()

  try {
    const { data, error } = await access.supabase.rpc(
      'commission_cancel_employee_profile_2026082904',
      {
        p_actor_employee_id: access.employee.id,
        p_profile_id: id,
        p_reason: cancellation.reason,
        p_request_key: `profile-cancel:${token}`,
      },
    )
    if (error) throw error
    return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
  } catch (error) {
    const code = String((error as { code?: string } | null)?.code || '')
    const status =
      code === 'P0002'
        ? 404
        : code === '42501'
          ? 403
          : code === '22023'
            ? 400
            : code === '55000'
              ? 409
              : 500
    return apiError(
      toErrorMessage(error, 'Unable to cancel scheduled commission profile'),
      status,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
