import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import { syncPackagePaymentFinancials } from '@/lib/packagePaymentsServer'
import type { TravelPackagePayment } from '@/app/types/packages'
import { selectTravelPackagePaymentColumns } from '../route'

const STATUSES = new Set(['pending', 'completed', 'failed', 'cancelled', 'refunded'])
const METHODS = new Set(['cash', 'bank_transfer', 'card', 'other'])

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const { id, paymentId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const { data: before } = await supabase
    .from('travel_package_payments')
    .select(selectTravelPackagePaymentColumns())
    .eq('id', paymentId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Payment not found', 404)

  const current = before as unknown as TravelPackagePayment
  const update: Record<string, unknown> = { updated_by: user.id }
  if ('amount' in body) {
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      return apiError('Payment amount must be greater than zero', 400)
    update.amount = Math.round(amount * 100) / 100
  }
  if ('paymentStatus' in body || 'payment_status' in body) {
    const status = cleanText(body.paymentStatus ?? body.payment_status)
    if (!STATUSES.has(status)) return apiError('Invalid payment status', 400)
    update.payment_status = status
    if (status === 'completed' && !current.received_at) {
      update.received_at = new Date().toISOString()
      update.received_by = user.id
    }
  }
  if ('paymentMethod' in body || 'payment_method' in body) {
    const method = cleanText(body.paymentMethod ?? body.payment_method)
    if (!METHODS.has(method)) return apiError('Invalid payment method', 400)
    update.payment_method = method
  }
  if ('dueAt' in body || 'due_at' in body)
    update.due_at = cleanText(body.dueAt ?? body.due_at) || null
  if ('receivedAt' in body || 'received_at' in body)
    update.received_at = cleanText(body.receivedAt ?? body.received_at) || null
  if ('receiptReference' in body || 'receipt_reference' in body)
    update.receipt_reference = cleanText(body.receiptReference ?? body.receipt_reference) || null
  if ('notes' in body) update.notes = cleanText(body.notes) || null

  const { data, error } = await supabase
    .from('travel_package_payments')
    .update(update)
    .eq('id', paymentId)
    .eq('package_id', id)
    .select(selectTravelPackagePaymentColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to update payment', 500)

  const payment = data as unknown as TravelPackagePayment
  await supabase
    .from('travel_package_installments')
    .update({
      status: payment.payment_status === 'completed' ? 'paid' : 'due',
      paid_at: payment.payment_status === 'completed' ? payment.received_at : null,
    })
    .eq('payment_id', payment.id)
    .eq('package_id', id)
  const sync = await syncPackagePaymentFinancials(supabase, id, payment.invoice_id)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'payment_updated',
      eventSummary: 'Payment record updated.',
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ payment, summary: sync.paymentSummary })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const { id, paymentId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data: before } = await supabase
    .from('travel_package_payments')
    .select(selectTravelPackagePaymentColumns())
    .eq('id', paymentId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Payment not found', 404)
  const payment = before as unknown as TravelPackagePayment
  const { error } = await supabase
    .from('travel_package_payments')
    .delete()
    .eq('id', paymentId)
    .eq('package_id', id)
  if (error) return apiError(error.message || 'Failed to delete payment', 500)

  await supabase
    .from('travel_package_installments')
    .update({ payment_id: null, status: 'due', paid_at: null })
    .eq('payment_id', paymentId)
    .eq('package_id', id)

  const sync = await syncPackagePaymentFinancials(supabase, id, payment.invoice_id)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'payment_deleted',
      eventSummary: 'Payment record deleted.',
      beforeData: before,
    },
  )
  return apiOk({ deleted: true, summary: sync.paymentSummary })
}
