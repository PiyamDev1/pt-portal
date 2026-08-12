/**
 * POST /api/admin/seed-payment-methods
 * Seeds default loan payment methods for LMS setup environments.
 *
 * @module app/api/admin/seed-payment-methods
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Cash' },
  { name: 'Bank Transfer' },
  { name: 'Card Payment' },
]

export async function POST(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.seed-payment-methods',
    limit: 3,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  try {
    const supabase = getServiceSupabaseClient()

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
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to seed payment methods'), 500)
  }
}
