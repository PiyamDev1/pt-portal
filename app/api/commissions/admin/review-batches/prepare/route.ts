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

export const dynamic = 'force-dynamic'

const prepareSchema = z
  .object({
    periodStart: z.iso.date().refine((value) => value.endsWith('-01')),
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
  const { data: input, error: bodyError } = await parseBodyWithSchema(request, prepareSchema, {
    maxBytes: 1024,
  })
  if (bodyError || !input) {
    return commissionError(bodyError || 'Invalid Commission review preparation.', 400)
  }

  const { data, error } = await access.supabase.rpc('commission_prepare_review_batch_2026090201', {
    p_actor_employee_id: access.employee.id,
    p_period_start: input.periodStart,
    p_request_key: key,
  })
  if (error) {
    const failure = commissionWorkflowDatabaseError(error)
    return commissionError(failure.message, failure.status)
  }

  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
