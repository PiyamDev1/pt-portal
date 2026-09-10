import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authorizationError = requireCronAuthorization(request)
  if (authorizationError) return authorizationError

  const { data, error } = await getServiceSupabaseClient().rpc(
    'customer_loyalty_run_scheduled_bonus_v1',
    { p_as_of: new Date().toISOString() },
  )
  if (error) {
    console.error('Scheduled loyalty bonus processing failed', {
      code: error.code,
    })
    return apiError('Loyalty bonus processing failed.', 500)
  }
  return apiOk(data)
}
