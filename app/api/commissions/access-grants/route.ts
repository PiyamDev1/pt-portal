import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
  publicCommissionDatabaseError,
  readIdempotencyKey,
} from '@/lib/commissions/api'
import { createCommissionAccessGrantSchema } from '@/lib/commissions/contracts'

export async function GET() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!access.canManageGrants) return commissionError('Forbidden', 403)
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }

  const service = getServiceSupabaseClient()
  const { data: grants, error } = await service
    .from('commission_access_grants')
    .select('id, employee_id, capability, granted_by, granted_at, revoked_by, revoked_at')
    .order('granted_at', { ascending: false })
    .limit(200)
  if (error) return commissionError('Unable to load Commission access grants.', 500)

  const employeeIds = [
    ...new Set(
      (grants || []).flatMap((grant) =>
        [grant.employee_id, grant.granted_by, grant.revoked_by].filter((id): id is string => !!id),
      ),
    ),
  ]
  const { data: employees, error: employeeError } = employeeIds.length
    ? await service
        .from('employees')
        .select('id, full_name, email, is_active')
        .in('id', employeeIds)
    : { data: [], error: null }
  if (employeeError) return commissionError('Unable to resolve Commission access labels.', 500)

  return apiOk(
    {
      items: (grants || []).map((grant) => ({
        id: grant.id,
        employeeId: grant.employee_id,
        employeeName:
          employees?.find((employee) => employee.id === grant.employee_id)?.full_name ||
          'Unknown employee',
        employeeEmail:
          employees?.find((employee) => employee.id === grant.employee_id)?.email || null,
        employeeActive:
          employees?.find((employee) => employee.id === grant.employee_id)?.is_active === true,
        capability: grant.capability,
        grantedByName:
          employees?.find((employee) => employee.id === grant.granted_by)?.full_name ||
          'Unknown employee',
        grantedAt: grant.granted_at,
        revokedAt: grant.revoked_at,
      })),
    },
    COMMISSION_PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!access.canManageGrants) return commissionError('Forbidden', 403)
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)
  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    createCommissionAccessGrantSchema,
    { maxBytes: 1024 },
  )
  if (bodyError || !input) return commissionError('Invalid Commission access grant.', 400)

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_grant_access_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_employee_id: input.employeeId,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, { ...COMMISSION_PRIVATE_RESPONSE, status: 201 })
}
