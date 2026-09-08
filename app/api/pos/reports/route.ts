import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE, posErrorResponse } from '@/lib/pos/http'
import { loadPosReport } from '@/lib/pos/reportServer'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z
  .object({
    period: z.enum(['day', 'month']).default('day'),
    date: z.string().date(),
  })
  .strict()

export async function GET(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  const params = new URL(request.url).searchParams
  const keys = [...params.keys()]
  const parsed = querySchema.safeParse(Object.fromEntries(params))
  if (keys.length !== new Set(keys).size || !parsed.success)
    return apiError('Invalid report period.', 400, {}, POS_PRIVATE_RESPONSE)
  try {
    return apiOk(
      await loadPosReport(access, parsed.data.period, parsed.data.date),
      POS_PRIVATE_RESPONSE,
    )
  } catch (loadError) {
    return posErrorResponse(loadError)
  }
}
