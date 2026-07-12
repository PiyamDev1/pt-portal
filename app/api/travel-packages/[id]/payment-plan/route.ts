import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { createPackageInstallmentSchedule } from '@/lib/packagePaymentPlans'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackageInstallment, TravelPackagePaymentPlan } from '@/app/types/packages'

const FREQUENCIES = new Set(['weekly', 'fortnightly', 'monthly', 'custom'])

async function loadLatestPlan(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
) {
  const { data, error } = await supabase
    .from('travel_package_payment_plans')
    .select('*')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return { plan: null, error }
  const { data: installments, error: installmentError } = await supabase
    .from('travel_package_installments')
    .select('*')
    .eq('plan_id', data.id)
    .order('sequence_number', { ascending: true })
  return {
    plan: {
      ...(data as unknown as TravelPackagePaymentPlan),
      installments: (installments || []) as unknown as TravelPackageInstallment[],
    },
    error: installmentError,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const result = await loadLatestPlan(supabase, id)
  if (result.error) return apiError(result.error.message || 'Failed to load payment plan', 500)
  return apiOk({ plan: result.plan })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const totalAmount = Number(body.totalAmount ?? body.total_amount)
  const depositAmount = Number(body.depositAmount ?? body.deposit_amount ?? 0)
  const installmentCount = Number(body.installmentCount ?? body.installment_count)
  const frequency = String(body.frequency || 'monthly') as
    | 'weekly'
    | 'fortnightly'
    | 'monthly'
    | 'custom'
  const startsOn = String(body.startsOn ?? body.starts_on ?? '')
  if (!Number.isFinite(totalAmount) || totalAmount <= 0)
    return apiError('Plan total must be greater than zero', 400)
  if (!FREQUENCIES.has(frequency)) return apiError('Invalid payment frequency', 400)

  let schedule
  try {
    schedule = createPackageInstallmentSchedule({
      totalAmount,
      depositAmount,
      installmentCount,
      frequency,
      startsOn,
    })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid payment schedule', 400)
  }

  await supabase
    .from('travel_package_payment_plans')
    .update({ status: 'cancelled' })
    .eq('package_id', id)
    .in('status', ['draft', 'active'])
  const { data: planData, error: planError } = await supabase
    .from('travel_package_payment_plans')
    .insert({
      package_id: id,
      invoice_id: typeof body.invoiceId === 'string' ? body.invoiceId || null : null,
      lms_plan_id: typeof body.lmsPlanId === 'string' ? body.lmsPlanId.trim() || null : null,
      status: 'active',
      currency: typeof body.currency === 'string' ? body.currency.toUpperCase() : 'GBP',
      total_amount: Math.round(totalAmount * 100) / 100,
      deposit_amount: Math.round(depositAmount * 100) / 100,
      frequency,
      starts_on: startsOn,
      internal_notes:
        typeof body.internalNotes === 'string' ? body.internalNotes.trim() || null : null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single()
  if (planError || !planData)
    return apiError(planError?.message || 'Failed to create payment plan', 500)

  const { data: installmentData, error: installmentError } = await supabase
    .from('travel_package_installments')
    .insert(schedule.map((item) => ({ ...item, plan_id: planData.id, package_id: id })))
    .select('*')
  if (installmentError)
    return apiError(installmentError.message || 'Failed to create installments', 500)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'payment_plan_created',
      eventSummary: `${schedule.length}-installment payment plan created.`,
      afterData: { plan: planData, installments: installmentData },
    },
  )
  return apiOk(
    {
      plan: {
        ...(planData as unknown as TravelPackagePaymentPlan),
        installments: (installmentData || []) as unknown as TravelPackageInstallment[],
      },
    },
    { status: 201 },
  )
}
