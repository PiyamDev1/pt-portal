import { NextRequest } from 'next/server'

import { apiError, apiOk } from '@/lib/api/http'
import { ADMIN_ROLES, requireStaffSession } from '@/lib/auth/staffSession'
import { loyaltySearchSchema } from '@/lib/loyalty/contracts'
import { loadLoyaltyDashboard } from '@/lib/loyalty/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } }

function isAdmin(role: string) {
  const normalized = role.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return ADMIN_ROLES.some((candidate) => candidate.toLowerCase() === normalized)
}

export async function GET(request: NextRequest) {
  const access = await requireStaffSession({ roles: [...ADMIN_ROLES] })
  if (!access.authorized) return access.response
  const parsedSearch = loyaltySearchSchema.safeParse(request.nextUrl.searchParams.get('search') || '')
  if (!parsedSearch.success) return apiError('Search is too long.', 400, {}, PRIVATE_RESPONSE)
  try {
    return apiOk(
      await loadLoyaltyDashboard(parsedSearch.data, isAdmin(access.employee.role)),
      PRIVATE_RESPONSE,
    )
  } catch {
    return apiError('Loyalty data is temporarily unavailable.', 503, {}, PRIVATE_RESPONSE)
  }
}
