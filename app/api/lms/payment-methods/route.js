/**
 * API Route: Loan Payment Methods
 *
 * GET /api/lms/payment-methods
 *   Returns all active payment methods from the loan_payment_methods table
 *   (e.g. Cash, Bank Transfer, Stripe). Returns an empty array gracefully
 *   if table access fails, so the UI can still render with a fallback list.
 *
 * Authentication: Service role key
 * Response Success (200): { methods: PaymentMethod[] }
 */
import { apiOk } from '@/lib/api/http'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiOk({
        methods: [],
      })
    }

    const supabase = createClient(url, key)

    const { data: methods, error } = await supabase.from('loan_payment_methods').select('*')

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
