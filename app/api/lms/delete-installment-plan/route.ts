/** Delete a service transaction and its installment plan atomically. */
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireLmsStaff, verifyLmsDestructiveAction } from '@/lib/lms/apiAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const schema = z
  .object({
    transactionId: z
      .string({ error: 'Transaction ID is required' })
      .trim()
      .min(1, 'Transaction ID is required')
      .max(200),
    verificationCode: z.string().trim().min(1).max(100),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
  })
  .strict()

export async function POST(request: Request) {
  const access = await requireLmsStaff()
  if (!access.authorized) return access.response

  try {
    const limit = await enforceRateLimit(request, {
      scope: 'lms.delete-installment-plan',
      limit: 10,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, schema, {
      maxBytes: 4 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const verificationResponse = await verifyLmsDestructiveAction(access, body)
    if (verificationResponse) return verificationResponse

    const { data, error } = await getServiceSupabaseClient().rpc('lms_delete_installment_plan', {
      p_transaction_id: body.transactionId,
    })
    if (error) {
      return apiError(
        error.message || 'Failed to delete installment plan',
        error.code === 'P0002' ? 404 : 500,
      )
    }

    return apiOk({ deletedTransactionId: data?.deletedTransactionId || body.transactionId })
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Failed to delete installment plan',
      500,
    )
  }
}
