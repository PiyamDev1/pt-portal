/**
 * API Route: Batch Update Installments
 *
 * POST /api/lms/update-installments
 *
 * Atomically updates the due date and amount of one or more installments.
 * Used by the LMS staff panel to reschedule or modify a payment plan.
 *
 * Request Body: { installments: Array<{ id, due_date, amount }> }
 * Response Success (200): { updatedInstallmentIds, updatedCount }
 * Response Errors: 400 invalid batch | 404 installment missing |
 *                  429/503 rate limit | 500 DB update failed
 *
 * Authentication: Active LMS staff session. The server invokes the
 * service-role-only RPC after authorization and rate limiting.
 */
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireLmsStaff } from '@/lib/lms/apiAuth'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

const updateInstallmentsSchema = z.object({
  installments: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        due_date: z.iso.date(),
        amount: z.coerce.number().positive().max(10_000_000),
      }),
    )
    .min(1)
    .max(240),
})

export async function POST(request: Request) {
  try {
    const access = await requireLmsStaff()
    if (!access.authorized) return access.response

    const limit = await enforceRateLimit(request, {
      scope: 'lms.update-installments',
      limit: 30,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      updateInstallmentsSchema,
      { maxBytes: 256 * 1024 },
    )
    if (bodyError || !body) return apiError('Invalid installments data', 400)
    const { installments } = body

    const { data, error } = await getServiceSupabaseClient().rpc('lms_update_installments', {
      p_installments: installments,
    })
    if (error) {
      if (error.code === 'P0002') return apiError(error.message || 'Installment not found', 404)
      if (error.code === '22023') return apiError(error.message || 'Invalid installments data', 400)
      throw error
    }

    const updatedInstallmentIds = Array.isArray(data?.updatedInstallmentIds)
      ? data.updatedInstallmentIds
      : installments.map((installment) => installment.id)

    return apiOk({
      updatedInstallmentIds,
      updatedCount: Number(data?.updatedCount ?? updatedInstallmentIds.length),
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update installments'), 500)
  }
}
