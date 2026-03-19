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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

type InstallmentUpdateInput = {
  id?: string
  due_date?: string
  amount?: number | string
}

export async function POST(request: Request) {
  try {
    const { installments } = (await request.json()) as {
      installments?: InstallmentUpdateInput[]
    }

    if (!installments || !Array.isArray(installments)) {
      return apiError('Invalid installments data', 400)
    }

    // Update each installment
    const updates = []
    for (const installment of installments) {
      const { id, due_date, amount } = installment

      if (!id || !due_date || !amount) {
        continue
      }

      const { error } = await supabase
        .from('loan_installments')
        .update({
          due_date,
          amount: parseFloat(String(amount)),
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
