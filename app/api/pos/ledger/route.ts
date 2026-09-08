import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import type { PosLedgerFilters, PosLedgerPeriod } from '@/lib/pos/contracts'
import { POS_PRIVATE_RESPONSE } from '@/lib/pos/http'
import { loadPosLedger, PosLedgerAccessError } from '@/lib/pos/ledgerServer'

export const dynamic = 'force-dynamic'

const querySchema = z
  .object({
    period: z.enum(['day', 'month']).default('day'),
    date: z.string().date(),
    search: z.string().trim().min(1).max(120).optional(),
    paymentMethod: z.enum(['CASH', 'CARD', 'BANK', 'OTHER']).optional(),
    direction: z.enum(['IN', 'OUT']).optional(),
    outgoingType: z.enum(['REFUND', 'EXPENSE', 'SUPPLIER_PAYMENT']).optional(),
    status: z
      .enum(['POSTED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CORRECTED', 'UNRECONCILED'])
      .optional(),
    categoryKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,63}$/)
      .optional(),
    supplierId: z.string().uuid().optional(),
    tillId: z.string().uuid().optional(),
    shiftId: z.string().uuid().optional(),
    agentId: z.string().uuid().optional(),
    sourceType: z
      .enum(['LMS', 'TICKETING', 'APPLICATIONS', 'PACKAGES', 'POS', 'LEGACY'])
      .optional(),
    loyalty: z.enum(['ATTACHED', 'AWARDED', 'REVERSED', 'NONE']).optional(),
    minAmount: z
      .string()
      .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
      .transform(Number)
      .optional(),
    maxAmount: z
      .string()
      .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
      .transform(Number)
      .optional(),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,1024}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minAmount === undefined ||
      value.maxAmount === undefined ||
      value.minAmount <= value.maxAmount,
  )

export async function GET(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const keys = [...request.nextUrl.searchParams.keys()]
  if (keys.length !== new Set(keys).size) {
    return apiError('Invalid POS ledger filters.', 400, {}, POS_PRIVATE_RESPONSE)
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return apiError('Invalid POS ledger filters.', 400, {}, POS_PRIVATE_RESPONSE)

  const { period, date, cursor, ...filterValues } = parsed.data
  const filters = Object.fromEntries(
    Object.entries(filterValues).filter(([, value]) => value !== undefined),
  ) as PosLedgerFilters

  try {
    return apiOk(
      Object.keys(filters).length || cursor
        ? await loadPosLedger(access.employee.id, period as PosLedgerPeriod, date, filters, cursor)
        : await loadPosLedger(access.employee.id, period as PosLedgerPeriod, date),
      POS_PRIVATE_RESPONSE,
    )
  } catch (error) {
    if (error instanceof PosLedgerAccessError) {
      return apiError(error.message, 403, {}, POS_PRIVATE_RESPONSE)
    }
    console.error('[pos] ledger load failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return apiError('Unable to load the POS ledger right now.', 500, {}, POS_PRIVATE_RESPONSE)
  }
}
