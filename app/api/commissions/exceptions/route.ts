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

const exceptionCodes = [
  'needs_policy',
  'ambiguous_assignment',
  'unsupported_contract_version',
  'missing_required_variable',
  'inactive_recipient',
  'invalid_source_lineage',
  'unresolved_package_scope',
  'package_source_not_authoritative',
  'bonus_period_incomplete',
  'calculation_failed',
] as const

const filterSchema = z
  .object({
    status: z.enum(['open', 'resolved', 'dismissed']).default('open'),
    code: z.enum(exceptionCodes).optional(),
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
  const allowed = ['status', 'code', 'limit', 'cursor']
  if ([...search.keys()].some((key) => !allowed.includes(key))) {
    return commissionError('Invalid Commission exception filters.', 400)
  }
  const parsed = filterSchema.safeParse({
    status: search.get('status') || undefined,
    code: search.get('code') || undefined,
    limit: search.get('limit') || undefined,
    cursor: search.get('cursor') || undefined,
  })
  if (!parsed.success) return commissionError('Invalid Commission exception filters.', 400)
  const filters = { status: parsed.data.status, code: parsed.data.code || null }
  const cursor = decodeCommissionCursor(parsed.data.cursor || null, filters)
  if (cursor === 'invalid') return commissionError('Invalid or mismatched cursor.', 400)

  const service = getServiceSupabaseClient()
  let query = service
    .from('commission_exceptions')
    .select(
      'id, run_id, source_event_id, employee_id, exception_code, status, details, retry_count, last_retried_at, resolution_note, created_at',
    )
    .eq('status', parsed.data.status)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(parsed.data.limit + 1)
  if (parsed.data.code) query = query.eq('exception_code', parsed.data.code)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }
  const { data: rows, error } = await query
  if (error) return commissionError('Unable to load Commission exceptions.', 500)

  const pageRows = (rows || []).slice(0, parsed.data.limit)
  const employeeIds = [
    ...new Set(pageRows.map((row) => row.employee_id).filter((id): id is string => !!id)),
  ]
  const { data: employees, error: employeeError } = employeeIds.length
    ? await service.from('employees').select('id, full_name').in('id', employeeIds)
    : { data: [], error: null }
  if (employeeError) return commissionError('Unable to resolve Commission employee labels.', 500)

  return apiOk(
    {
      items: pageRows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        sourceEventId: row.source_event_id,
        employeeId: row.employee_id,
        employeeName: row.employee_id
          ? employees?.find((employee) => employee.id === row.employee_id)?.full_name ||
            'Unknown employee'
          : null,
        code: row.exception_code,
        status: row.status,
        details: row.details,
        retryCount: row.retry_count,
        lastRetriedAt: row.last_retried_at,
        resolutionNote: row.resolution_note,
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
