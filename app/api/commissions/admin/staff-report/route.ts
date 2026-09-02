import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiOk } from '@/lib/api/http'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
} from '@/lib/commissions/api'
import { COMMISSION_ACCOUNTING_CAPABILITY_VERSION } from '@/lib/commissions/contracts'
import {
  commissionCalendarMonthBounds,
  commissionWorkflowDatabaseError,
} from '@/lib/commissions/reviewWorkflow'
import { requireCommissionManager } from '@/lib/commissions/server'

export const dynamic = 'force-dynamic'

const querySchema = z
  .object({
    period: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strict()

export async function GET(request: NextRequest) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability(COMMISSION_ACCOUNTING_CAPABILITY_VERSION))) {
    return commissionError('The latest Commission review workflow is not installed.', 503)
  }

  const search = request.nextUrl.searchParams
  if ([...search.keys()].some((key) => key !== 'period')) {
    return commissionError('Invalid Commission staff report filters.', 400)
  }
  const parsed = querySchema.safeParse({ period: search.get('period') || '' })
  const bounds = parsed.success ? commissionCalendarMonthBounds(parsed.data.period) : null
  if (!parsed.success || !bounds) {
    return commissionError('A valid reporting month is required.', 400)
  }

  const { data, error } = await access.supabase.rpc('commission_shadow_staff_report_2026090201', {
    p_actor_employee_id: access.employee.id,
    p_period_start: bounds.periodStart,
    p_period_end: bounds.periodEnd,
  })
  if (error) {
    const failure = commissionWorkflowDatabaseError(error)
    return commissionError(failure.message, failure.status)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return commissionError('Unable to load the Commission staff report.', 500)
  }

  const { data: adjustments, error: adjustmentError } = await access.supabase
    .from('commission_adjustments')
    .select('category, direction, exchange_rate_units_per_gbp, evidence')
    .eq('period_start', bounds.periodStart)
  if (adjustmentError) {
    return commissionError('Unable to load company ADM responsibility.', 500)
  }
  const companyAdmImpactGbp = (adjustments || []).reduce((total, adjustment) => {
    if (adjustment.category !== 'adm') return total
    const evidence =
      adjustment.evidence &&
      typeof adjustment.evidence === 'object' &&
      !Array.isArray(adjustment.evidence)
        ? adjustment.evidence
        : {}
    const companyShare = Number(evidence.companySharePayCurrency || 0)
    const rate = Number(adjustment.exchange_rate_units_per_gbp || 0)
    if (!Number.isFinite(companyShare) || !Number.isFinite(rate) || rate <= 0) return total
    return total + (adjustment.direction === 'debit' ? companyShare / rate : -companyShare / rate)
  }, 0)

  return apiOk(
    { ...data, companyAdmImpactGbp: Math.round(companyAdmImpactGbp * 100) / 100 },
    COMMISSION_PRIVATE_RESPONSE,
  )
}
