/**
 * API Route: Batch Update Installments
 *
 * POST /api/lms/update-installments
 *
 * Updates one or more installment records in bulk (due dates, amounts,
 * or status). Used by the admin panel to reschedule or modify a payment plan.
 *
 * Request Body: { installments: Array<{ id, due_date?, amount?, status? }> }
 * Response Success (200): { updatedCount }
 * Response Errors: 400 Missing/empty installments | 500 DB update failed
 *
 * Authentication: Service role key
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireLmsStaff } from '@/lib/lms/apiAuth'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

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

    // Update each installment
    const updates = []
    for (const installment of installments) {
      const { id, due_date, amount } = installment

      const { error } = await supabase
        .from('loan_installments')
        .update({
          due_date,
          amount,
        })
        .eq('id', id)

      if (error) {
        throw new Error(error.message || 'Failed to update installment')
      }

      updates.push(id)
    }

    return apiOk({
      updatedInstallmentIds: updates,
      updatedCount: updates.length,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update installments'), 500)
  }
}
