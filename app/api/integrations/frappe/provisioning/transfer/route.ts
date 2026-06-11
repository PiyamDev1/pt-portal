/**
 * POST /api/integrations/frappe/provisioning/transfer
 *
 * Creates or links a Frappe Employee for an IMS employee.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { transferEmployeeToFrappe } from '@/lib/integrations/frappe/provisioning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const body = await request.json()
    const result = await transferEmployeeToFrappe(body)

    return apiOk({
      ok: true,
      ...result,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Unable to transfer employee to Frappe'), 500)
  }
}
