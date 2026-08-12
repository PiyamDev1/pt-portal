/** Atomically skip an installment and redistribute the remaining plan. */
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireLmsStaff, verifyLmsDestructiveAction } from '@/lib/lms/apiAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const schema = z
  .object({
    installmentId: z
      .string({ error: 'installmentId is required' })
      .trim()
      .min(1, 'installmentId is required')
      .max(200),
    verificationCode: z.string().trim().min(1).max(100),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
  })
  .strict()

export async function POST(request: Request) {
  const access = await requireLmsStaff()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'lms.skip-installment',
    limit: 20,
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

  try {
    const { data, error } = await getServiceSupabaseClient().rpc('lms_skip_installment', {
      p_installment_id: body.installmentId,
    })
    if (error) {
      return apiError(
        error.message || 'Failed to skip installment',
        error.code === 'P0002' ? 404 : 500,
      )
    }
    return apiOk(data)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Failed to skip installment', 500)
  }
}
