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
import {
  commissionPolicyParamSchema,
  createCommissionPolicyVersionSchema,
} from '@/lib/commissions/contracts'

type RouteContext = { params: Promise<{ policyId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const params = commissionPolicyParamSchema.safeParse(await context.params)
  if (!params.success) return commissionError('Invalid Commission policy.', 400)

  const service = getServiceSupabaseClient()
  const { data: versions, error } = await service
    .from('commission_policy_versions')
    .select(
      'id, rule_id, version_number, status, content_hash, created_at, activated_at, retired_at',
    )
    .eq('rule_id', params.data.policyId)
    .order('version_number', { ascending: false })
    .limit(100)
  if (error) return commissionError('Unable to load Commission policy versions.', 500)

  const versionIds = (versions || []).map((version) => version.id)
  const { data: components, error: componentError } = versionIds.length
    ? await service
        .from('commission_policy_components')
        .select(
          'id, policy_version_id, sequence, component_type, source_variable, recipient_role, rate_value, minimum_amount_gbp, maximum_amount_gbp, threshold_gbp, reward_kind, reward_value, eligible_services, config',
        )
        .in('policy_version_id', versionIds)
        .order('sequence')
    : { data: [], error: null }
  if (componentError) return commissionError('Unable to load Commission components.', 500)

  const componentIds = (components || []).map((component) => component.id)
  const { data: tiers, error: tierError } = componentIds.length
    ? await service
        .from('commission_policy_tiers')
        .select('id, component_id, min_unit, rate_gbp')
        .in('component_id', componentIds)
        .order('min_unit')
    : { data: [], error: null }
  if (tierError) return commissionError('Unable to load Commission tiers.', 500)

  return apiOk(
    {
      items: (versions || []).map((version) => ({
        id: version.id,
        policyId: version.rule_id,
        versionNumber: version.version_number,
        status: version.status,
        contentHash: version.content_hash,
        createdAt: version.created_at,
        activatedAt: version.activated_at,
        retiredAt: version.retired_at,
        components: (components || [])
          .filter((component) => component.policy_version_id === version.id)
          .map((component) => ({
            id: component.id,
            sequence: component.sequence,
            componentType: component.component_type,
            sourceVariable: component.source_variable,
            recipientRole: component.recipient_role,
            rateValue: component.rate_value,
            minimumAmountGbp: component.minimum_amount_gbp,
            maximumAmountGbp: component.maximum_amount_gbp,
            thresholdGbp: component.threshold_gbp,
            rewardKind: component.reward_kind,
            rewardValue: component.reward_value,
            eligibleServices: component.eligible_services,
            config: component.config,
            tiers: (tiers || [])
              .filter((tier) => tier.component_id === component.id)
              .map((tier) => ({ id: tier.id, minUnit: tier.min_unit, rateGbp: tier.rate_gbp })),
          })),
      })),
    },
    COMMISSION_PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const params = commissionPolicyParamSchema.safeParse(await context.params)
  if (!params.success) return commissionError('Invalid Commission policy.', 400)
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)
  const parsed = createCommissionPolicyVersionSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return commissionError(parsed.error.issues[0]?.message || 'Invalid policy version.', 400)
  }

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_create_policy_version_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_rule_id: params.data.policyId,
      p_components: parsed.data.components,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, { ...COMMISSION_PRIVATE_RESPONSE, status: 201 })
}
