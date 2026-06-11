/**
 * GET /api/integrations/frappe/provisioning/candidates
 *
 * Lists IMS employees and their Frappe transfer/link status.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import {
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
    const [candidates, options] = await Promise.all([
      getFrappeProvisioningCandidates(),
      getFrappeProvisioningReferenceOptions(),
    ])

    return apiOk({
      ok: true,
      candidates,
      options,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Unable to load Frappe provisioning candidates'), 500)
  }
}
