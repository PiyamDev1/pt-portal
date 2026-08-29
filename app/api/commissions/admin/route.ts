import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { COMMISSION_PRIVATE_RESPONSE } from '@/lib/commissions/api'
import { loadCommissionAdminData, requireCommissionManager } from '@/lib/commissions/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response

  try {
    return apiOk(
      await loadCommissionAdminData(access.employee.id, access.supabase),
      COMMISSION_PRIVATE_RESPONSE,
    )
  } catch (error) {
    return apiError(
      toErrorMessage(error, 'Unable to load Admin commission'),
      500,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
