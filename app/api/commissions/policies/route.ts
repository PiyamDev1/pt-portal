import { NextRequest } from 'next/server'
import { z } from 'zod'
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
import { createCommissionPolicySchema } from '@/lib/commissions/contracts'

const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()

export async function GET(request: NextRequest) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const parsed = listSchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') || undefined,
  })
  if (!parsed.success || [...request.nextUrl.searchParams.keys()].some((key) => key !== 'limit')) {
    return commissionError('Invalid policy filters.', 400)
  }

  const service = getServiceSupabaseClient()
  const { data: rules, error } = await service
    .from('commission_rules')
    .select('id, rule_name, description, created_by, updated_at')
    .order('rule_name')
    .limit(parsed.data.limit)
  if (error) return commissionError('Unable to load Commission policies.', 500)

  const ruleIds = (rules || []).map((rule) => rule.id)
  const { data: versions, error: versionError } = ruleIds.length
    ? await service
        .from('commission_policy_versions')
        .select(
          'id, rule_id, version_number, status, content_hash, created_at, activated_at, retired_at',
        )
        .in('rule_id', ruleIds)
        .order('version_number', { ascending: false })
    : { data: [], error: null }
  if (versionError) return commissionError('Unable to load Commission policy versions.', 500)

  return apiOk(
    {
      items: (rules || []).map((rule) => ({
        id: rule.id,
        name: rule.rule_name,
        description: rule.description,
        createdBy: rule.created_by,
        updatedAt: rule.updated_at,
        versions: (versions || [])
          .filter((version) => version.rule_id === rule.id)
          .map((version) => ({
            id: version.id,
            versionNumber: version.version_number,
            status: version.status,
            contentHash: version.content_hash,
            createdAt: version.created_at,
            activatedAt: version.activated_at,
            retiredAt: version.retired_at,
          })),
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

  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    createCommissionPolicySchema,
    { maxBytes: 4 * 1024 },
  )
  if (bodyError || !input) return commissionError(bodyError || 'Invalid policy.', 400)

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_create_policy_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_rule_name: input.name,
      p_description: input.description || null,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, { ...COMMISSION_PRIVATE_RESPONSE, status: 201 })
}
