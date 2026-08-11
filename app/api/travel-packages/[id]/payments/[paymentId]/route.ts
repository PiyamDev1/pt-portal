import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import { syncPackagePaymentFinancials } from '@/lib/packagePaymentsServer'
import type { TravelPackagePayment, TravelPackagePaymentType } from '@/app/types/packages'
import { selectTravelPackagePaymentColumns } from '../route'

const TYPES = new Set<TravelPackagePaymentType>([
  'deposit',
  'payment',
  'account_credit',
  'refund',
  'chargeback',
  'commission',
])
const STATUSES = new Set(['pending', 'completed', 'failed', 'cancelled', 'refunded'])
const METHODS = new Set(['cash', 'bank_transfer', 'card', 'other'])

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function customerRefundContribution(payment: TravelPackagePayment) {
  return payment.reservation_id &&
    payment.payment_type === 'refund' &&
    payment.payment_status === 'completed'
    ? Number(payment.amount || 0)
    : 0
}

async function syncLinkedReservationRefund(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  packageId: string,
  before: TravelPackagePayment,
  after: TravelPackagePayment | null,
) {
  const reservationId = after?.reservation_id || before.reservation_id
  if (!reservationId) return

  const delta =
    customerRefundContribution(after || ({ ...before, amount: 0 } as TravelPackagePayment)) -
    customerRefundContribution(before)
  if (Math.abs(delta) < 0.005) return

  const { data: reservation } = await supabase
    .from('travel_package_reservations')
    .select('customer_refund_total')
    .eq('id', reservationId)
    .eq('package_id', packageId)
    .single()
  if (!reservation) return

  await supabase
    .from('travel_package_reservations')
    .update({
      customer_refund_total: Math.max(
        0,
        Math.round((Number(reservation.customer_refund_total || 0) + delta) * 100) / 100,
      ),
    })
    .eq('id', reservationId)
    .eq('package_id', packageId)
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
  if ('paymentType' in body || 'payment_type' in body) {
    const paymentType = cleanText(body.paymentType ?? body.payment_type) as TravelPackagePaymentType
    if (!TYPES.has(paymentType)) return apiError('Invalid payment type', 400)
    update.payment_type = paymentType
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

  const nextPaymentType = (update.payment_type || current.payment_type) as TravelPackagePaymentType
  const nextReceiptReference =
    'receipt_reference' in update ? update.receipt_reference : current.receipt_reference
  if (nextPaymentType === 'account_credit' && !cleanText(nextReceiptReference)) {
    return apiError('Enter the previous package or refund reference for this account credit', 400)
  }

  const { data, error } = await supabase
    .from('travel_package_payments')
    .update(update)
    .eq('id', paymentId)
    .eq('package_id', id)
    .select(selectTravelPackagePaymentColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to update payment', 500)

  const payment = data as unknown as TravelPackagePayment
  await syncLinkedReservationRefund(supabase, id, current, payment)
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

  await syncLinkedReservationRefund(supabase, id, payment, null)

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
