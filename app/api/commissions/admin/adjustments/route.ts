import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
  readIdempotencyKey,
} from '@/lib/commissions/api'
import { COMMISSION_ACCOUNTING_CAPABILITY_VERSION } from '@/lib/commissions/contracts'
import { commissionWorkflowDatabaseError } from '@/lib/commissions/reviewWorkflow'
import { requireCommissionManager } from '@/lib/commissions/server'
import type { Json } from '@/types/supabase'

export const dynamic = 'force-dynamic'

const penaltySchema = z
  .object({
    employeeId: z.string().uuid(),
    category: z.enum(['adm', 'loss', 'other']),
    amount: z.number().finite().positive().max(100_000_000),
    currency: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/)),
    periodStart: z.iso.date().refine((value) => value.endsWith('-01')),
    reason: z.string().trim().min(3).max(500),
    evidence: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict()

export async function POST(request: NextRequest) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability(COMMISSION_ACCOUNTING_CAPABILITY_VERSION))) {
    return commissionError('The latest Commission review workflow is not installed.', 503)
  }

  const key = readIdempotencyKey(request)
  if (!key) return commissionError('A valid Idempotency-Key header is required.', 400)

  const { data: input, error: bodyError } = await parseBodyWithSchema(request, penaltySchema, {
    maxBytes: 16 * 1024,
  })
  if (bodyError || !input) {
    return commissionError(bodyError || 'Invalid Commission penalty request.', 400)
  }

  const evidence = JSON.parse(JSON.stringify(input.evidence)) as Json
  const { data, error } = await access.supabase.rpc('commission_append_adjustment_2026090201', {
    p_actor_employee_id: access.employee.id,
    p_employee_id: input.employeeId,
    p_category: input.category,
    p_direction: 'debit',
    p_amount_pay_currency: input.amount,
    p_pay_currency: input.currency,
    p_period_start: input.periodStart,
    p_reason: input.reason,
    p_evidence: evidence,
    p_reverses_adjustment_id: null,
    p_request_key: key,
  })
  if (error) {
    const failure = commissionWorkflowDatabaseError(error)
    return commissionError(failure.message, failure.status)
  }

  return apiOk(data, { ...COMMISSION_PRIVATE_RESPONSE, status: 201 })
}
