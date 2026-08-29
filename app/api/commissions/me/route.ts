import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { COMMISSION_PRIVATE_RESPONSE } from '@/lib/commissions/api'
import { loadMyCommissionData } from '@/lib/commissions/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    return apiOk(await loadMyCommissionData(access.employee.id), COMMISSION_PRIVATE_RESPONSE)
  } catch (error) {
    return apiError(
      toErrorMessage(error, 'Unable to load your commission'),
      500,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
