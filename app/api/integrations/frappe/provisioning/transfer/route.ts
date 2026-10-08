/**
 * POST /api/integrations/frappe/provisioning/transfer
 *
 * Creates or links a Frappe Employee for an IMS employee.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { jsonObjectBodySchema, parseBodyWithSchema } from '@/lib/api/request'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import {
  FrappeProvisioningSetupError,
  transferEmployeeToFrappe,
} from '@/lib/integrations/frappe/provisioning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      jsonObjectBodySchema,
      { allowEmptyBody: false },
    )
    if (bodyError) return apiError(bodyError, 400)

    const result = await transferEmployeeToFrappe(
      body as Parameters<typeof transferEmployeeToFrappe>[0],
    )

    return apiOk({
      ok: true,
      ...result,
    })
  } catch (error: unknown) {
    if (error instanceof FrappeProvisioningSetupError) {
      return apiError(error.message, error.statusCode)
    }

    return apiError(toErrorMessage(error, 'Unable to transfer employee to Frappe'), 500)
  }
}
