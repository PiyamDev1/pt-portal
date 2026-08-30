import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
} from '@/lib/commissions/api'
import { COMMISSION_PACKAGE_READINESS_CAPABILITY_VERSION } from '@/lib/commissions/contracts'
import { parsePackageCommissionReadiness } from '@/lib/commissions/packageReadiness'

export const dynamic = 'force-dynamic'

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!validUuid(id)) return commissionError('Invalid package.', 400)

  const routeClient = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await routeClient.auth.getUser()
  if (!user) return commissionError('Unauthorized', 401)

  const visiblePackage = await routeClient
    .from('travel_packages')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (visiblePackage.error || !visiblePackage.data) {
    return commissionError('Package not found.', 404)
  }

  if (!(await hasCommissionCapability(COMMISSION_PACKAGE_READINESS_CAPABILITY_VERSION))) {
    return commissionError('Package Commission readiness is not installed.', 503)
  }

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_package_readiness_2026083004',
    { p_package_id: id },
  )
  if (error) {
    return commissionError(
      error.code === 'P0002' ? 'Package not found.' : 'Unable to load Commission readiness.',
      error.code === 'P0002' ? 404 : 500,
    )
  }

  const readiness = parsePackageCommissionReadiness(data)
  if (!readiness) return commissionError('Commission readiness returned an invalid response.', 500)

  return apiOk({ readiness }, COMMISSION_PRIVATE_RESPONSE)
}
