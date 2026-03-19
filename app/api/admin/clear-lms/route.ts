/**
 * POST /api/admin/clear-lms
 * Clears LMS entities (customers, loans, transactions, installments) for reset scenarios.
 *
 * @module app/api/admin/clear-lms
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { verifyAdminAccess, unauthorizedResponse } from '@/lib/adminAuth'

/**
 * Admin endpoint to clear all LMS data
 * WARNING: This deletes all loans, transactions, customers, and installments
 * SECURITY: Requires Google authentication and admin role
 */
export async function POST(request: Request) {
  try {
    // Verify admin access via Google auth
    const authResult = await verifyAdminAccess(request)
    if (!authResult.authorized) {
      return unauthorizedResponse(authResult.error, authResult.status)
    }

    const user = authResult.user!
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    // Delete in order to respect foreign key constraints
    // 1. Delete installments first (references loan_transactions)
    const { error: installmentsError, count: installmentsCount } = await supabase
      .from('loan_installments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (installmentsError) {
      // Preserve legacy behavior: continue cleanup even if installment delete fails.
    }

    // 2. Delete loan transactions (references loans)
    const { error: txError, count: txCount } = await supabase
      .from('loan_transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (txError) {
      return apiError(txError.message, 500)
    }

    // 3. Delete loans (references loan_customers)
    const { error: loansError, count: loansCount } = await supabase
      .from('loans')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (loansError) {
      return apiError(loansError.message, 500)
    }

    // 4. Delete loan customers
    const { error: customersError, count: customersCount } = await supabase
      .from('loan_customers')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (customersError) {
      return apiError(customersError.message, 500)
    }
    return apiOk({
      deleted: {
        installments: installmentsCount || 0,
        transactions: txCount || 0,
        loans: loansCount || 0,
        customers: customersCount || 0,
      },
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to clear LMS data'), 500)
  }
}
