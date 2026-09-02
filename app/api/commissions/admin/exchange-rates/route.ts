import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { COMMISSION_PRIVATE_RESPONSE } from '@/lib/commissions/api'
import {
  commissionExchangeRateAvailability,
  commissionMonthlyExchangeRateSchema,
} from '@/lib/commissions/contracts'
import { requireCommissionManager } from '@/lib/commissions/server'

function requestToken(request: Request) {
  const supplied = request.headers.get('Idempotency-Key')?.trim()
  return supplied && /^[A-Za-z0-9:_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID()
}

function databaseStatus(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '')
  if (code === '42501') return 403
  if (code === '55000') return 409
  if (code === '22023' || code === '23514') return 400
  if (code === '42P01' || code === '42883' || code === 'PGRST202') return 503
  return 500
}

export async function POST(request: Request) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response

  const {
    data: input,
    error: bodyError,
    issues,
  } = await parseBodyWithSchema(request, commissionMonthlyExchangeRateSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !input) {
    return apiError(
      bodyError || 'Invalid monthly exchange rate',
      400,
      {
        issues: (issues || []).map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  const availability = commissionExchangeRateAvailability(input.periodStart)
  if (!availability.available) {
    return apiError(
      `The ${input.periodStart.slice(0, 7)} exchange rate can be entered from ${availability.opensOn}.`,
      400,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  try {
    const token = requestToken(request)
    const { data, error } = await access.supabase.rpc(
      'commission_set_monthly_exchange_rate_2026083001',
      {
        p_actor_employee_id: access.employee.id,
        p_currency: input.currency,
        p_period_start: input.periodStart,
        p_units_per_gbp: input.unitsPerGbp,
        p_request_key: `exchange:${token}`,
      },
    )
    if (error) throw error

    const processResult = await access.supabase.rpc('commission_process_shadow_2026082902', {
      p_actor_employee_id: access.employee.id,
      p_limit: 200,
      p_request_key: `exchange-process:${token}`,
    })

    return apiOk(
      {
        exchangeRate: data,
        calculation: processResult.data,
        calculationWarning: processResult.error
          ? toErrorMessage(processResult.error, 'The rate was saved; calculations remain queued')
          : null,
      },
      COMMISSION_PRIVATE_RESPONSE,
    )
  } catch (error) {
    console.error('[commission] monthly exchange-rate save failed', {
      code: (error as { code?: string } | null)?.code,
      hint: (error as { hint?: string } | null)?.hint,
    })
    return apiError(
      toErrorMessage(error, 'Unable to save the monthly exchange rate'),
      databaseStatus(error),
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
