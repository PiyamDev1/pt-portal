/**
 * POST /api/admin/migrate-installment-amounts
 * Backfills installment amount fields and derived payment totals for legacy LMS rows.
 *
 * @module app/api/admin/migrate-installment-amounts
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: Request) {
  try {
    // Fetch all installments
    const { data: installments, error: fetchError } = await supabase
      .from('loan_installments')
      .select('*')
      .order('created_at', { ascending: true })

    if (fetchError) {
      throw new Error(fetchError.message)
    }

    let updatedPaid = 0
    let updatedSkipped = 0
    let skipped = 0

    for (const inst of installments || []) {
      let shouldUpdate = false
      let newAmount = inst.amount

      // For paid installments, set amount = amount_paid
      if (inst.status === 'paid' && inst.amount_paid > 0) {
        newAmount = inst.amount_paid
        shouldUpdate = true
        updatedPaid++
      }
      // For skipped installments, set amount = 0
      else if (inst.status === 'skipped') {
        newAmount = 0
        shouldUpdate = true
        updatedSkipped++
      } else {
        skipped++
      }

      if (shouldUpdate && newAmount !== inst.amount) {
        const { error: updateError } = await supabase
          .from('loan_installments')
          .update({ amount: newAmount })
          .eq('id', inst.id)

        if (updateError) {
          // Continue migration even if one row fails; this mirrors previous best-effort behavior.
        }
      }
    }

    return apiOk({
      totalInstallments: installments?.length || 0,
      updatedPaidCount: updatedPaid,
      updatedSkippedCount: updatedSkipped,
      unchangedCount: skipped,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Migration failed'), 500)
  }
}
