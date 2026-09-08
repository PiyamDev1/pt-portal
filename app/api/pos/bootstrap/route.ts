import { apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE, posErrorResponse } from '@/lib/pos/http'
import { loadPosBootstrap } from '@/lib/pos/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  try {
    return apiOk(await loadPosBootstrap(access), POS_PRIVATE_RESPONSE)
  } catch (error) {
    return posErrorResponse(error)
  }
}
