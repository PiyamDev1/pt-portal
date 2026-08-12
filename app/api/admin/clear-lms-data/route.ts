/**
 * POST /api/admin/clear-lms-data
 * Clears LMS tables in FK-safe order for full environment reset.
 *
 * @module app/api/admin/clear-lms-data
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { requireLmsAdmin, verifyLmsDestructiveAction } from '@/lib/lms/apiAuth'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const verificationSchema = z.object({
  verificationCode: z.string().trim().max(100).optional(),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
})

export async function POST(request: Request) {
  try {
    const access = await requireLmsAdmin()
    if (!access.authorized) return access.response
    const limit = await enforceRateLimit(request, {
      scope: 'admin.clear-lms-data',
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

    const { error } = await supabase.rpc('lms_clear_all_data')
    if (error) return apiError(error.message || 'Failed to clear LMS data', 500)

    const tables = ['loan_installments', 'loan_transactions', 'loans', 'loan_customers']

    return apiOk({
      clearedTables: tables,
      clearedTableCount: tables.length,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to clear LMS data'), 500)
  }
}
