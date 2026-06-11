/**
 * GET/POST /api/integrations/frappe/provisioning/me
 *
 * Self-service Frappe HRMS transfer for the currently signed-in IMS employee.
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import {
  getFrappeProvisioningCandidate,
  getFrappeProvisioningReferenceOptions,
  transferEmployeeToFrappe,
} from '@/lib/integrations/frappe/provisioning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function getSessionUser() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser()

  if (error || !user) return null
  return user
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return apiError('Unauthorized', 401)
  }

  try {
    const [candidate, options] = await Promise.all([
      getFrappeProvisioningCandidate(user.id),
      getFrappeProvisioningReferenceOptions(),
    ])

    if (!candidate) {
      return apiError('Employee profile not found', 404)
    }

    return apiOk({
      ok: true,
      candidate,
      options,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Unable to load your Frappe transfer status'), 500)
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('Unauthorized', 401)
  }

  try {
    const body = await request.json()
    const result = await transferEmployeeToFrappe({
      ...body,
      employee_id: user.id,
      create_user: false,
      send_welcome_email: false,
    })

    return apiOk({
      ok: true,
      ...result,
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Unable to complete your Frappe transfer'), 500)
  }
}
