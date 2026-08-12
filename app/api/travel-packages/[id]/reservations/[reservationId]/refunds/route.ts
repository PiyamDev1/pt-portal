import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import { syncPackagePaymentFinancials } from '@/lib/packagePaymentsServer'
import { calculateTravelPackageDiscountAllocations } from '@/lib/packageDiscountAllocations'
import type { TravelPackagePaymentMethod, TravelPackageReservation } from '@/app/types/packages'
import { selectTravelPackagePaymentColumns } from '../../../payments/columns'
import { selectTravelPackageReservationColumns } from '../../columns'

const METHODS = new Set<TravelPackagePaymentMethod>(['cash', 'bank_transfer', 'card', 'other'])

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseMoney(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reservationId: string }> },
) {
  const { id, reservationId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const refundKind = cleanText(body.refundKind || body.refund_kind)
  if (!['supplier', 'customer'].includes(refundKind)) {
    return apiError('Choose a supplier credit or customer refund', 400)
  }

  const amount = parseMoney(body.amount)
  if (amount <= 0) return apiError('Refund amount must be greater than zero', 400)

  const { data: reservationData, error: reservationError } = await supabase
    .from('travel_package_reservations')
    .select(selectTravelPackageReservationColumns())
    .eq('id', reservationId)
    .eq('package_id', id)
    .single()

  if (reservationError || !reservationData) {
    if (isSchemaError(reservationError)) {
      return apiError(
        'Reservation refunds are not installed yet. Run scripts/migrations/20260810_add_travel_package_reservation_refunds.sql.',
        503,
      )
    }
    return apiError('Reservation not found', 404)
  }

  const reservation = reservationData as unknown as TravelPackageReservation
  const [{ data: packageData }, { data: reservationRows }] = await Promise.all([
    supabase.from('travel_packages').select('selected_quote_snapshot').eq('id', id).maybeSingle(),
    supabase
      .from('travel_package_reservations')
      .select(selectTravelPackageReservationColumns())
      .eq('package_id', id),
  ])
  const packageReservations = Array.isArray(reservationRows)
    ? (reservationRows as unknown as TravelPackageReservation[])
    : [reservation]
  const discountAllocation = calculateTravelPackageDiscountAllocations(
    packageReservations,
    (
      packageData as {
        selected_quote_snapshot?: Parameters<typeof calculateTravelPackageDiscountAllocations>[1]
      } | null
    )?.selected_quote_snapshot,
  )[reservation.id]
  const allocatedQuoteDiscount = Number(discountAllocation?.total || 0)
  const existingRefund =
    refundKind === 'supplier'
      ? Number(reservation.supplier_refund_total || 0)
      : Number(reservation.customer_refund_total || 0)
  const refundableTotal =
    refundKind === 'supplier'
      ? Number(reservation.booked_cost_total || 0)
      : Math.max(
          0,
          Number(reservation.sold_price_total || 0) -
            Number(reservation.discount_total || 0) -
            allocatedQuoteDiscount,
        )
  const remainingRefundable = Math.max(0, refundableTotal - existingRefund)

  if (amount > remainingRefundable) {
    return apiError(
      `Refund exceeds the remaining ${reservation.currency} ${remainingRefundable.toFixed(2)} available on this reservation`,
      400,
    )
  }

  const reason = cleanText(body.reason)
  const reference = cleanText(body.reference)
  const invoiceId = cleanText(body.invoiceId || body.invoice_id) || null
  const now = new Date().toISOString()
  let paymentId: string | null = null
  let payment: unknown = null

  if (refundKind === 'customer') {
    const paymentMethod = cleanText(
      body.paymentMethod || body.payment_method,
    ) as TravelPackagePaymentMethod
    if (!METHODS.has(paymentMethod)) return apiError('Choose a valid refund method', 400)

    const { data, error } = await supabase
      .from('travel_package_payments')
      .insert({
        package_id: id,
        invoice_id: invoiceId,
        reservation_id: reservationId,
        amount,
        currency: reservation.currency || 'GBP',
        payment_type: 'refund',
        payment_method: paymentMethod,
        payment_status: 'completed',
        requested_at: now,
        received_at: now,
        received_by: user.id,
        receipt_reference: reference || null,
        notes: reason || `Refund for ${reservation.title}`,
        metadata: {
          source: 'reservation_refund',
          reservationTitle: reservation.title,
          allocatedQuoteDiscount,
          discountAllocation: discountAllocation || null,
        },
        created_by: user.id,
        updated_by: user.id,
      })
      .select(selectTravelPackagePaymentColumns())
      .single()

    if (error || !data) {
      if (isSchemaError(error)) {
        return apiError(
          'Reservation refunds are not installed yet. Run scripts/migrations/20260810_add_travel_package_reservation_refunds.sql.',
          503,
        )
      }
      return apiError(error?.message || 'Failed to create the customer refund payment', 500)
    }
    payment = data
    paymentId = (data as unknown as { id: string }).id
  }

  const refundColumn = refundKind === 'supplier' ? 'supplier_refund_total' : 'customer_refund_total'
  const { data: updatedReservation, error: updateError } = await supabase
    .from('travel_package_reservations')
    .update({
      [refundColumn]: Math.round((existingRefund + amount) * 100) / 100,
      last_refund_reason: reason || null,
      last_refunded_at: now,
      updated_by: user.id,
    })
    .eq('id', reservationId)
    .eq('package_id', id)
    .select(selectTravelPackageReservationColumns())
    .single()

  if (updateError || !updatedReservation) {
    if (paymentId) {
      await supabase
        .from('travel_package_payments')
        .delete()
        .eq('id', paymentId)
        .eq('package_id', id)
    }
    if (isSchemaError(updateError)) {
      return apiError(
        'Reservation refunds are not installed yet. Run scripts/migrations/20260810_add_travel_package_reservation_refunds.sql.',
        503,
      )
    }
    return apiError(updateError?.message || 'Failed to update reservation refund totals', 500)
  }

  if (refundKind === 'customer') {
    await syncPackagePaymentFinancials(supabase, id, invoiceId)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: reservation.quote_id,
      actorId: user.id,
      eventType:
        refundKind === 'supplier' ? 'supplier_refund_recorded' : 'customer_refund_recorded',
      eventSummary: `${refundKind === 'supplier' ? 'Supplier credit' : 'Customer refund'} of ${reservation.currency} ${amount.toFixed(2)} recorded for ${reservation.title}.`,
      beforeData: reservation,
      afterData: updatedReservation,
      metadata: {
        reservationId,
        paymentId,
        reference: reference || null,
        allocatedQuoteDiscount,
        discountAllocation: discountAllocation || null,
      },
    },
  )

  return apiOk(
    {
      reservation: {
        ...(updatedReservation as unknown as TravelPackageReservation),
        discount_allocation: discountAllocation,
      },
      payment,
    },
    { status: 201 },
  )
}
