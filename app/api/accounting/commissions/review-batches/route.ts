import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import { requireAccountingAccess } from '@/lib/accounting/access'
import {
  ACCOUNTING_PRIVATE_RESPONSE,
  accountingError,
  accountingReviewDatabaseError,
} from '@/lib/accounting/api'
import { normalizeCommissionReviewBatchList } from '@/lib/accounting/commissionReviews'

export const dynamic = 'force-dynamic'

const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict()

export async function GET(request: NextRequest) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const search = request.nextUrl.searchParams
  if ([...search.keys()].some((key) => !['limit', 'offset'].includes(key))) {
    return accountingError('Invalid Commission review batch filters.', 400)
  }

  const parsed = listQuerySchema.safeParse({
    limit: search.get('limit') || undefined,
    offset: search.get('offset') || undefined,
  })
  if (!parsed.success) {
    return accountingError('Invalid Commission review batch filters.', 400)
  }

  const { data, error } = await access.supabase.rpc('commission_accounting_batches_2026090201', {
    p_limit: parsed.data.limit,
    p_offset: parsed.data.offset,
  })
  if (error) {
    const failure = accountingReviewDatabaseError(error)
    return accountingError(failure.message, failure.status)
  }

  const batches = normalizeCommissionReviewBatchList(data, parsed.data)
  batches.items = batches.items.map((batch) => ({
    ...batch,
    canApprove: batch.canApprove && batch.submittedByEmployeeId !== access.employee.id,
  }))

  return apiOk(batches, ACCOUNTING_PRIVATE_RESPONSE)
}
