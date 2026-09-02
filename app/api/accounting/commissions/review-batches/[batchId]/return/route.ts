import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireAccountingAccess } from '@/lib/accounting/access'
import {
  ACCOUNTING_PRIVATE_RESPONSE,
  accountingError,
  accountingReviewDatabaseError,
} from '@/lib/accounting/api'
import { normalizeCommissionReviewBatchDetail } from '@/lib/accounting/commissionReviews'

export const dynamic = 'force-dynamic'

const batchIdSchema = z.string().uuid()
const returnSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(3, 'A return reason is required.').max(500),
  })
  .strict()

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const parsedId = batchIdSchema.safeParse((await context.params).batchId)
  if (!parsedId.success) return accountingError('Invalid Commission review batch ID.', 400)

  const { data: input, error: bodyError } = await parseBodyWithSchema(request, returnSchema, {
    maxBytes: 2 * 1024,
  })
  if (bodyError || !input) return accountingError(bodyError || 'Invalid return request.', 400)

  const { data, error } = await access.supabase.rpc('commission_return_review_batch_2026090201', {
    p_batch_id: parsedId.data,
    p_expected_revision: input.expectedRevision,
    p_reason: input.reason,
  })
  if (error) {
    const failure = accountingReviewDatabaseError(error)
    return accountingError(failure.message, failure.status)
  }

  return apiOk(
    normalizeCommissionReviewBatchDetail(data) || { updated: true },
    ACCOUNTING_PRIVATE_RESPONSE,
  )
}
