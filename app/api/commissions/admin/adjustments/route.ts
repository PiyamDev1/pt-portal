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
    employeeId: z.string().uuid().optional(),
    category: z.enum(['adm', 'loss', 'other']),
    amount: z.number().finite().positive().max(100_000_000),
    companyShare: z.number().finite().min(0).max(100_000_000).optional().default(0),
    pnr: z.string().trim().min(3).max(12).optional(),
    admReference: z.string().trim().min(2).max(80).optional(),
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
  .superRefine((value, context) => {
    if (value.category === 'adm') {
      if (!value.pnr)
        context.addIssue({ code: 'custom', path: ['pnr'], message: 'PNR is required' })
      if (!value.admReference)
        context.addIssue({
          code: 'custom',
          path: ['admReference'],
          message: 'ADM reference is required',
        })
    } else if (!value.employeeId) {
      context.addIssue({ code: 'custom', path: ['employeeId'], message: 'Employee is required' })
    }
  })

function currentLondonPeriodStart() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const value = (type: 'year' | 'month') => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-01`
}

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

  let employeeId = input.employeeId
  let evidence = JSON.parse(JSON.stringify(input.evidence)) as Json
  if (input.category === 'adm') {
    if (input.periodStart !== currentLondonPeriodStart()) {
      return commissionError(
        'An ADM must be posted to the current month when it is received, not backdated to the original ticket month.',
        400,
      )
    }
    const normalizedPnr = input.pnr!.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const { data: bookings, error: bookingError } = await access.supabase
      .from('ticket_bookings')
      .select('id, pnr, owner_employee_id')
      .eq('normalized_pnr', normalizedPnr)
      .is('archived_at', null)
      .limit(2)
    if (bookingError) return commissionError('Unable to resolve the ADM ticket PNR.', 500)
    if (!bookings?.length) return commissionError('No active ticket was found for that PNR.', 404)
    if (bookings.length > 1)
      return commissionError('That PNR matches more than one active ticket.', 409)
    const booking = bookings[0]!
    employeeId = booking.owner_employee_id
    evidence = {
      ...(input.evidence || {}),
      admReference: input.admReference,
      pnr: booking.pnr,
      bookingId: booking.id,
      responsibleEmployeeId: booking.owner_employee_id,
      employeeSharePayCurrency: input.amount,
      companySharePayCurrency: input.companyShare,
      totalAdmPayCurrency: input.amount + input.companyShare,
      accountingTreatment:
        'Employee share reduces current commission; company share reduces current company profit.',
    } as Json
  }
  const { data, error } = await access.supabase.rpc('commission_append_adjustment_2026090201', {
    p_actor_employee_id: access.employee.id,
    p_employee_id: employeeId!,
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
