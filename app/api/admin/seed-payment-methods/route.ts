/**
 * POST /api/admin/seed-payment-methods
 * Seeds default loan payment methods for LMS setup environments.
 *
 * @module app/api/admin/seed-payment-methods
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Cash' },
  { name: 'Bank Transfer' },
  { name: 'Card Payment' },
]

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    // Check if methods already exist
    const { data: existing } = await supabase.from('loan_payment_methods').select('id').limit(1)

    if (existing && existing.length > 0) {
      return apiOk({
        message: 'Payment methods already exist',
        skipped: true,
      })
    }

    // Insert default payment methods
    const { data, error } = await supabase
      .from('loan_payment_methods')
      .insert(DEFAULT_PAYMENT_METHODS)
      .select()

    if (error) {
      throw new Error(error.message || 'Failed to seed payment methods')
    }

    return apiOk({
      createdCount: data?.length || 0,
      methods: data,
    })
  } catch (error: any) {
    return apiError(toErrorMessage(error, 'Failed to seed payment methods'), 500)
  }
}
