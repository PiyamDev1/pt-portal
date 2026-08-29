import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
  publicCommissionDatabaseError,
  readIdempotencyKey,
} from '@/lib/commissions/api'
import { createCommissionAssignmentSchema } from '@/lib/commissions/contracts'

export async function GET() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }

  const service = getServiceSupabaseClient()
  const { data: assignments, error } = await service
    .from('employee_commission_assignments')
    .select(
      'id, employee_id, rule_id, policy_version_id, source_module, service_code, recipient_role, location_id, start_date, effective_to, created_by, updated_at',
    )
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(200)
  if (error) return commissionError('Unable to load Commission assignments.', 500)

  const employeeIds = [...new Set((assignments || []).map((row) => row.employee_id))]
  const ruleIds = [...new Set((assignments || []).map((row) => row.rule_id))]
  const locationIds = [
    ...new Set(
      (assignments || []).map((row) => row.location_id).filter((id): id is string => !!id),
    ),
  ]
  const [employeesResult, rulesResult, locationsResult] = await Promise.all([
    employeeIds.length
      ? service.from('employees').select('id, full_name').in('id', employeeIds)
      : Promise.resolve({ data: [], error: null }),
    ruleIds.length
      ? service.from('commission_rules').select('id, rule_name').in('id', ruleIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? service.from('locations').select('id, name, branch_code').in('id', locationIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (employeesResult.error || rulesResult.error || locationsResult.error) {
    return commissionError('Unable to resolve Commission assignment labels.', 500)
  }

  return apiOk(
    {
      items: (assignments || []).map((assignment) => ({
        id: assignment.id,
        employeeId: assignment.employee_id,
        employeeName:
          employeesResult.data?.find((employee) => employee.id === assignment.employee_id)
            ?.full_name || 'Unknown employee',
        policyId: assignment.rule_id,
        policyName:
          rulesResult.data?.find((rule) => rule.id === assignment.rule_id)?.rule_name ||
          'Unknown policy',
        policyVersionId: assignment.policy_version_id,
        sourceModule: assignment.source_module,
        serviceCode: assignment.service_code,
        recipientRole: assignment.recipient_role,
        locationId: assignment.location_id,
        locationName: assignment.location_id
          ? locationsResult.data?.find((location) => location.id === assignment.location_id)
              ?.name || 'Unknown location'
          : 'All locations',
        effectiveFrom: assignment.start_date,
        effectiveTo: assignment.effective_to,
        createdBy: assignment.created_by,
        updatedAt: assignment.updated_at,
      })),
    },
    COMMISSION_PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)
  const parsed = createCommissionAssignmentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return commissionError(parsed.error.issues[0]?.message || 'Invalid assignment.', 400)
  }

  const assignment = parsed.data
  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_create_assignment_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_employee_id: assignment.employeeId,
      p_policy_version_id: assignment.policyVersionId,
      p_source_module: assignment.sourceModule,
      p_service_code: assignment.serviceCode,
      p_recipient_role: assignment.recipientRole,
      p_location_id: assignment.locationId || null,
      p_effective_from: assignment.effectiveFrom,
      p_effective_to: assignment.effectiveTo || null,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, { ...COMMISSION_PRIVATE_RESPONSE, status: 201 })
}
