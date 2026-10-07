/**
 * API Route: Loan Payment Methods
 *
 * GET /api/lms/payment-methods
 *   Returns all active payment methods from the loan_payment_methods table
 *   (e.g. Cash, Bank Transfer, Stripe). Returns an empty array gracefully
 *   if table access fails, so the UI can still render with a fallback list.
 *
 * Authentication: Active LMS staff session; reads use the server-only service client.
 * Response Success (200): { methods: PaymentMethod[] }
 */
import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireLmsStaff } from '@/lib/lms/apiAuth'

export async function GET(_request: Request): Promise<Response> {
  try {
    const access = await requireLmsStaff()
    if (!access.authorized) return access.response

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiOk({
        methods: [],
      })
    }

    const { data: methods, error } = await getServiceSupabaseClient()
      .from('loan_payment_methods')
      .select('*')

    if (error) {
      console.error('Query error:', error)
      return apiOk({
        methods: [],
      })
    }

    return apiOk({
      methods: methods || [],
    })
  } catch (err) {
    console.error('Exception:', err)
    return apiOk({
      methods: [],
    })
  }
}
