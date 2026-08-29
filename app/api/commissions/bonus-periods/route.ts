import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
} from '@/lib/commissions/api'
import { decodeCommissionCursor, encodeCommissionCursor } from '@/lib/commissions/pagination'

const filterSchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    achieved: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(1000).optional(),
  })
  .strict()

export async function GET(request: NextRequest) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const search = request.nextUrl.searchParams
  const allowed = ['employeeId', 'achieved', 'limit', 'cursor']
  if ([...search.keys()].some((key) => !allowed.includes(key))) {
    return commissionError('Invalid bonus-period filters.', 400)
  }
  const parsed = filterSchema.safeParse({
    employeeId: search.get('employeeId') || undefined,
    achieved: search.get('achieved') || undefined,
    limit: search.get('limit') || undefined,
    cursor: search.get('cursor') || undefined,
  })
  if (!parsed.success) return commissionError('Invalid bonus-period filters.', 400)
  const filters = {
    employeeId: parsed.data.employeeId || null,
    achieved: parsed.data.achieved || null,
  }
  const cursor = decodeCommissionCursor(parsed.data.cursor || null, filters)
  if (cursor === 'invalid') return commissionError('Invalid or mismatched cursor.', 400)

  const service = getServiceSupabaseClient()
  let query = service
    .from('commission_period_results')
    .select(
      'id, employee_id, location_id, bonus_component_id, period_start, period_end, gross_contributed_profit_gbp, ordinary_commission_cost_gbp, qualifying_profit_gbp, threshold_gbp, achieved, reward_gbp, incomplete_input_count, revision, supersedes_result_id, created_at',
    )
    .eq('result_mode', 'shadow')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(parsed.data.limit + 1)
  if (parsed.data.employeeId) query = query.eq('employee_id', parsed.data.employeeId)
  if (parsed.data.achieved) query = query.eq('achieved', parsed.data.achieved === 'true')
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }
  const { data: rows, error } = await query
  if (error) return commissionError('Unable to load Commission bonus periods.', 500)

  const pageRows = (rows || []).slice(0, parsed.data.limit)
  const employeeIds = [...new Set(pageRows.map((row) => row.employee_id))]
  const { data: employees, error: employeeError } = employeeIds.length
    ? await service.from('employees').select('id, full_name').in('id', employeeIds)
    : { data: [], error: null }
  if (employeeError) return commissionError('Unable to resolve Commission employee labels.', 500)

  return apiOk(
    {
      items: pageRows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        employeeName:
          employees?.find((employee) => employee.id === row.employee_id)?.full_name ||
          'Unknown employee',
        locationId: row.location_id,
        bonusComponentId: row.bonus_component_id,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        grossContributedProfitGbp: row.gross_contributed_profit_gbp,
        ordinaryCommissionCostGbp: row.ordinary_commission_cost_gbp,
        qualifyingProfitGbp: row.qualifying_profit_gbp,
        thresholdGbp: row.threshold_gbp,
        achieved: row.achieved,
        rewardGbp: row.reward_gbp,
        incompleteInputCount: row.incomplete_input_count,
        revision: row.revision,
        supersedesResultId: row.supersedes_result_id,
        createdAt: row.created_at,
      })),
      nextCursor:
        (rows || []).length > parsed.data.limit && pageRows.length
          ? encodeCommissionCursor(pageRows[pageRows.length - 1], filters)
          : null,
    },
    COMMISSION_PRIVATE_RESPONSE,
  )
}
