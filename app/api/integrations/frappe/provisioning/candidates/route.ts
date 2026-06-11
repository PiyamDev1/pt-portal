/**
 * GET /api/integrations/frappe/provisioning/candidates
 *
 * Lists IMS employees and their Frappe transfer/link status.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import {
  FRAPPE_DEFAULT_COMPANY,
  getFrappeEmployeeProvisioningReadiness,
  getFrappeProvisioningCandidates,
  getFrappeProvisioningReferenceOptions,
} from '@/lib/integrations/frappe/provisioning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const session = await requireAdminSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const [candidates, options, employeeProvisioning] = await Promise.all([
      getFrappeProvisioningCandidates(),
      getFrappeProvisioningReferenceOptions(),
      getFrappeEmployeeProvisioningReadiness(),
    ])

    return apiOk({
      ok: true,
      candidates,
      options,
      employee_provisioning: employeeProvisioning,
      default_company: FRAPPE_DEFAULT_COMPANY,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Unable to load Frappe provisioning candidates'), 500)
  }
}
