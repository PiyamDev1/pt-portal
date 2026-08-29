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

const filtersSchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    periodStart: z.iso.date().optional(),
    periodEnd: z.iso.date().optional(),
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
  const allowed = ['employeeId', 'periodStart', 'periodEnd', 'limit', 'cursor']
  if ([...search.keys()].some((key) => !allowed.includes(key))) {
    return commissionError('Invalid shadow-entry filters.', 400)
  }
  const parsed = filtersSchema.safeParse({
    employeeId: search.get('employeeId') || undefined,
    periodStart: search.get('periodStart') || undefined,
    periodEnd: search.get('periodEnd') || undefined,
    limit: search.get('limit') || undefined,
    cursor: search.get('cursor') || undefined,
  })
  if (!parsed.success) return commissionError('Invalid shadow-entry filters.', 400)
  if (
    parsed.data.periodStart &&
    parsed.data.periodEnd &&
    parsed.data.periodEnd < parsed.data.periodStart
  ) {
    return commissionError('The period end cannot precede the period start.', 400)
  }
  const filters = {
    employeeId: parsed.data.employeeId || null,
    periodStart: parsed.data.periodStart || null,
    periodEnd: parsed.data.periodEnd || null,
  }
  const cursor = decodeCommissionCursor(parsed.data.cursor || null, filters)
  if (cursor === 'invalid') return commissionError('Invalid or mismatched cursor.', 400)

  const service = getServiceSupabaseClient()
  let query = service
    .from('commission_entries')
    .select(
      'id, entry_kind, source_event_id, source_case_key, recipient_employee_id, profit_owner_employee_id, location_id, policy_version_id, component_id, earning_on, period_start, period_end, amount_gbp, explanation, revision, supersedes_entry_id, created_at',
    )
    .eq('entry_mode', 'shadow')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(parsed.data.limit + 1)
  if (parsed.data.employeeId) query = query.eq('recipient_employee_id', parsed.data.employeeId)
  if (parsed.data.periodStart) query = query.gte('earning_on', parsed.data.periodStart)
  if (parsed.data.periodEnd) query = query.lte('earning_on', parsed.data.periodEnd)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }
  const { data: rows, error } = await query
  if (error) return commissionError('Unable to load Commission shadow entries.', 500)

  const pageRows = (rows || []).slice(0, parsed.data.limit)
  const employeeIds = [
    ...new Set(
      pageRows.flatMap((row) => [row.recipient_employee_id, row.profit_owner_employee_id]),
    ),
  ]
  const { data: employees, error: employeeError } = employeeIds.length
    ? await service.from('employees').select('id, full_name').in('id', employeeIds)
    : { data: [], error: null }
  if (employeeError) return commissionError('Unable to resolve Commission employee labels.', 500)

  return apiOk(
    {
      items: pageRows.map((row) => ({
        id: row.id,
        entryKind: row.entry_kind,
        sourceEventId: row.source_event_id,
        sourceCaseKey: row.source_case_key,
        recipientEmployeeId: row.recipient_employee_id,
        recipientName:
          employees?.find((employee) => employee.id === row.recipient_employee_id)?.full_name ||
          'Unknown employee',
        profitOwnerEmployeeId: row.profit_owner_employee_id,
        profitOwnerName:
          employees?.find((employee) => employee.id === row.profit_owner_employee_id)?.full_name ||
          'Unknown employee',
        locationId: row.location_id,
        policyVersionId: row.policy_version_id,
        componentId: row.component_id,
        earningOn: row.earning_on,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        amountGbp: row.amount_gbp,
        explanation: row.explanation,
        revision: row.revision,
        supersedesEntryId: row.supersedes_entry_id,
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
