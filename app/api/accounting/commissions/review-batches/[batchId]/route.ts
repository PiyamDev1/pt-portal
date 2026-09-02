import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import { requireAccountingAccess } from '@/lib/accounting/access'
import {
  ACCOUNTING_PRIVATE_RESPONSE,
  accountingError,
  accountingReviewDatabaseError,
} from '@/lib/accounting/api'
import { normalizeCommissionReviewBatchDetail } from '@/lib/accounting/commissionReviews'

export const dynamic = 'force-dynamic'

const batchIdSchema = z.string().uuid()

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const parsedId = batchIdSchema.safeParse((await context.params).batchId)
  if (!parsedId.success) return accountingError('Invalid Commission review batch ID.', 400)

  const { data, error } = await access.supabase.rpc('commission_review_batch_detail_2026090201', {
    p_batch_id: parsedId.data,
  })
  if (error) {
    const failure = accountingReviewDatabaseError(error)
    return accountingError(failure.message, failure.status)
  }

  const detail = normalizeCommissionReviewBatchDetail(data)
  if (!detail) return accountingError('Commission review batch not found.', 404)
  detail.batch.canApprove =
    detail.batch.canApprove && detail.batch.submittedByEmployeeId !== access.employee.id

  return apiOk(detail, ACCOUNTING_PRIVATE_RESPONSE)
}
