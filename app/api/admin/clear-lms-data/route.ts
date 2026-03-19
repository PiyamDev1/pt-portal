/**
 * POST /api/admin/clear-lms-data
 * Clears LMS tables in FK-safe order for full environment reset.
 *
 * @module app/api/admin/clear-lms-data
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Clear all LMS data in the correct order (respecting foreign keys)
    const tables = [
      'loan_installments',
      'loan_transactions',
      'loan_payment_methods',
      'loan_terms',
      'loans',
      'loan_accounts',
    ]

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

      if (error) {
        return apiError(`Failed to clear ${table}`, 500)
      }
    }

    return apiOk({
      clearedTables: tables,
      clearedTableCount: tables.length,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to clear LMS data'), 500)
  }
}
