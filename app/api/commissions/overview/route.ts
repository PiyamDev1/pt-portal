import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
} from '@/lib/commissions/api'

export async function GET() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_shadow_overview_2026082901',
    { p_actor_employee_id: access.employee.id },
  )
  if (error) return commissionError('Unable to load the Commission overview.', 500)
  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
