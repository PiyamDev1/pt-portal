import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireLmsAdmin, verifyLmsDestructiveAction } from '@/lib/lms/apiAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'

const verificationSchema = z.object({
  verificationCode: z.string().trim().max(100).optional(),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
})

type ClearLmsPostOptions = {
  rateLimitScope: string
  successPayload: (data: unknown) => Record<string, unknown>
}

/** Keep the LMS reset safety checks and RPC consistent across legacy admin URLs. */
export function createClearLmsPostHandler({ rateLimitScope, successPayload }: ClearLmsPostOptions) {
  return async function handleClearLmsPost(request: Request): Promise<Response> {
    try {
      const access = await requireLmsAdmin()
      if (!access.authorized) return access.response

      const limit = await enforceRateLimit(request, {
        scope: rateLimitScope,
        limit: 3,
        windowSeconds: 60 * 60,
        identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
      })
      if (!limit.allowed) return limit.response

      const { data: body, error: bodyError } = await parseBodyWithSchema(
        request,
        verificationSchema,
        { maxBytes: 4 * 1024 },
      )
      if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

      const verificationResponse = await verifyLmsDestructiveAction(access, body)
      if (verificationResponse) return verificationResponse

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return apiError('Supabase not configured', 500)
      }

      const { data, error } = await getServiceSupabaseClient().rpc('lms_clear_all_data')
      if (error) return apiError(error.message || 'Failed to clear LMS data', 500)

      return apiOk(successPayload(data))
    } catch (error) {
      return apiError(toErrorMessage(error, 'Failed to clear LMS data'), 500)
    }
  }
}
