/**
 * API Route: Loan Installments
 *
 * GET /api/lms/installments?transactionId=<id>
 *   Returns all installment records for a given loan transaction.
 *   Auto-creates the loan_installments table if it does not yet exist.
 *   Falls back to an empty array if the table is missing or the query fails.
 *
 * Authentication: Service role key
 * Response Errors: 400 Missing transactionId | 500 Supabase not configured
 */
import { createClient } from '@supabase/supabase-js'
import { apiOk, apiError } from '@/lib/api/http'
import { ensureInstallmentsTableExists } from '@/lib/installmentsDb'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return apiError('transactionId is required', 400)
    }

    // Ensure table exists (creates it if needed)
    await ensureInstallmentsTableExists()

    // Try to fetch installments from the database
    try {
      const { data: installments, error } = await supabase
        .from('loan_installments')
        .select('*')
        .eq('loan_transaction_id', transactionId)
        .order('installment_number', { ascending: true })

      if (error) {
        console.warn('Error fetching installments:', error.message)
        return apiOk({ installments: [] })
      }

      return apiOk({ installments: installments || [] })
    } catch (error: any) {
      console.warn('Error accessing installments:', error.message)
      return apiOk({ installments: [] })
    }
  } catch (error: any) {
    console.error('Error fetching installments:', error)
    return apiOk({ installments: [] })
  }
}
