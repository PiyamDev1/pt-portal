import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE } from '@/lib/pos/http'
import { loadPosSourceOptions } from '@/lib/pos/sourceLookup'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const querySchema = z
  .object({
    type: z.enum(['LMS', 'TICKETING', 'APPLICATIONS', 'PACKAGES']),
    q: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-zA-Z0-9@.+_'\-\s/]+$/),
    catalogueKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,63}$/)
      .default('ticketing'),
  })
  .strict()

export async function GET(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.source-options',
    limit: 180,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) {
    return apiError('Enter at least two letters or numbers to find a source record.', 400)
  }

  const service = getServiceSupabaseClient()
  const employeeResult = await service
    .from('employees')
    .select('location_id')
    .eq('id', access.employee.id)
    .maybeSingle()
  if (employeeResult.error) {
    return apiError('Unable to verify your POS branch.', 500, {}, POS_PRIVATE_RESPONSE)
  }
  if (!employeeResult.data?.location_id) {
    return apiError(
      'Your employee profile is not assigned to a branch.',
      403,
      {},
      POS_PRIVATE_RESPONSE,
    )
  }

  try {
    const options = await loadPosSourceOptions(service, {
      sourceType: parsed.data.type,
      query: parsed.data.q,
      catalogueKey: parsed.data.catalogueKey,
      locationId: employeeResult.data.location_id,
    })
    return apiOk({ options }, POS_PRIVATE_RESPONSE)
  } catch {
    return apiError(
      'Source records could not be searched right now.',
      503,
      {},
      POS_PRIVATE_RESPONSE,
    )
  }
}
