import { apiError, apiOk } from '@/lib/api/http'
import { z } from 'zod'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE, posErrorResponse } from '@/lib/pos/http'
import { loadPosSupplierLedger } from '@/lib/pos/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  const params = new URL(request.url).searchParams
  const keys = [...params.keys()]
  const parsed = z
    .object({ supplierId: z.string().uuid().optional() })
    .strict()
    .safeParse(Object.fromEntries(params))
  if (keys.length !== new Set(keys).size || !parsed.success) {
    return apiError('Invalid supplier.', 400, {}, POS_PRIVATE_RESPONSE)
  }
  const supplierId = parsed.data.supplierId
  try {
    return apiOk(await loadPosSupplierLedger(access, supplierId), POS_PRIVATE_RESPONSE)
  } catch (loadError) {
    return posErrorResponse(loadError)
  }
}
