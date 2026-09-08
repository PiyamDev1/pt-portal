import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import type { PosLedgerPeriod } from '@/lib/pos/contracts'
import { loadPosLedger, PosLedgerAccessError } from '@/lib/pos/ledgerServer'

export const dynamic = 'force-dynamic'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const querySchema = z
  .object({
    period: z.enum(['day', 'month']).default('day'),
    date: z.string().date(),
  })
  .strict()

export async function GET(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const parsed = querySchema.safeParse({
    period: request.nextUrl.searchParams.get('period') || 'day',
    date: request.nextUrl.searchParams.get('date'),
  })
  if (!parsed.success) return apiError('Invalid POS ledger period or date.', 400)

  try {
    return apiOk(
      await loadPosLedger(
        access.employee.id,
        parsed.data.period as PosLedgerPeriod,
        parsed.data.date,
      ),
      PRIVATE_RESPONSE,
    )
  } catch (error) {
    if (error instanceof PosLedgerAccessError) {
      return apiError(error.message, 403, {}, PRIVATE_RESPONSE)
    }
    console.error('[pos] ledger load failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return apiError('Unable to load the POS ledger right now.', 500, {}, PRIVATE_RESPONSE)
  }
}
