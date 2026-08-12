/**
 * POST /api/admin/wipe-installments
 * Maintenance endpoint to clear all rows from loan_installments.
 *
 * @module app/api/admin/wipe-installments
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { requireLmsMaintenance, verifyLmsDestructiveAction } from '@/lib/lms/apiAuth'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const verificationSchema = z.object({
  verificationCode: z.string().trim().max(100).optional(),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
})

export async function POST(request: Request) {
  try {
    const access = await requireLmsMaintenance()
    if (!access.authorized) return access.response
    const limit = await enforceRateLimit(request, {
      scope: 'admin.wipe-installments',
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data, error } = await supabase.rpc('lms_wipe_installments')

    if (error) {
      return apiError(error.message, 500)
    }

    return apiOk({
      deletedInstallmentCount: data?.deletedInstallmentCount || 0,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to wipe installments'), 500)
  }
}
