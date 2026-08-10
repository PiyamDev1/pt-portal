import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TravelPackageReservation } from '@/app/types/packages'

const reservation: TravelPackageReservation = {
  id: 'reservation-1',
  package_id: 'package-1',
  quote_id: 'quote-1',
  created_by: 'agent-1',
  updated_by: 'agent-1',
  reservation_type: 'hotel',
  title: 'Hotel reservation',
  status: 'cancelled',
  supplier_name: 'Hotel Supplier',
  supplier_reference: 'SUP-1',
  booking_reference: 'BOOK-1',
  currency: 'GBP',
  booked_cost_total: 1000,
  sold_price_total: 1300,
  discount_total: 100,
  commission_expected_total: 0,
  commission_received_total: 0,
  supplier_refund_total: 0,
  customer_refund_total: 0,
  last_refund_reason: null,
  last_refunded_at: null,
  deposit_required: false,
  deposit_amount: 0,
  deposit_due_at: null,
  payment_due_at: null,
  reserved_at: null,
  confirmed_at: null,
  cancelled_at: '2026-08-10T10:00:00.000Z',
  customer_visible: false,
  public_notes: null,
  internal_notes: null,
  metadata: {},
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: null,
}

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()

  const reservationSingle = vi.fn()
  const reservationPackageEq = vi.fn(() => ({ single: reservationSingle }))
  const reservationIdEq = vi.fn(() => ({ eq: reservationPackageEq }))
  const reservationSelect = vi.fn(() => ({ eq: reservationIdEq }))

  const updateSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updatePackageEq = vi.fn(() => ({ select: updateSelect }))
  const updateIdEq = vi.fn(() => ({ eq: updatePackageEq }))
  const reservationUpdate = vi.fn(() => ({ eq: updateIdEq }))

  const paymentSingle = vi.fn()
  const paymentSelect = vi.fn(() => ({ single: paymentSingle }))
  const paymentInsert = vi.fn(() => ({ select: paymentSelect }))

  const paymentDeletePackageEq = vi.fn()
  const paymentDeleteIdEq = vi.fn(() => ({ eq: paymentDeletePackageEq }))
  const paymentDelete = vi.fn(() => ({ eq: paymentDeleteIdEq }))

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_reservations') {
      return { select: reservationSelect, update: reservationUpdate }
    }
    if (table === 'travel_package_payments') {
      return { insert: paymentInsert, delete: paymentDelete }
    }
    return {}
  })

  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))
  const syncPackagePaymentFinancials = vi.fn()
  const recordPackageAuditEvent = vi.fn()

  return {
    getUser,
    reservationSingle,
    reservationSelect,
    reservationUpdate,
    updateSingle,
    paymentInsert,
    paymentSingle,
    from,
    getRouteSupabaseClient,
    syncPackagePaymentFinancials,
    recordPackageAuditEvent,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/packagePaymentsServer', () => ({
  syncPackagePaymentFinancials: mocks.syncPackagePaymentFinancials,
}))
vi.mock('@/lib/packageAudit', () => ({
  recordPackageAuditEvent: mocks.recordPackageAuditEvent,
}))

import { POST } from '@/app/api/travel-packages/[id]/reservations/[reservationId]/refunds/route'

function request(body: Record<string, unknown>) {
  return new Request(
    'http://localhost/api/travel-packages/package-1/reservations/reservation-1/refunds',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

const params = {
  params: Promise.resolve({ id: 'package-1', reservationId: 'reservation-1' }),
}

describe('travel package reservation refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.reservationSingle.mockResolvedValue({ data: reservation, error: null })
    mocks.paymentSingle.mockResolvedValue({
      data: { id: 'payment-1', reservation_id: reservation.id },
      error: null,
    })
    mocks.updateSingle.mockImplementation(async () => ({
      data: {
        ...reservation,
        supplier_refund_total: 250,
        customer_refund_total: 400,
      },
      error: null,
    }))
    mocks.syncPackagePaymentFinancials.mockResolvedValue({})
    mocks.recordPackageAuditEvent.mockResolvedValue(undefined)
  })

  it('records a supplier credit without creating a customer payment', async () => {
    const response = await POST(
      request({ refundKind: 'supplier', amount: 250, reason: 'Cancellation credit' }) as never,
      params,
    )

    expect(response.status).toBe(201)
    expect(mocks.reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ supplier_refund_total: 250 }),
    )
    expect(mocks.paymentInsert).not.toHaveBeenCalled()
  })

  it('records a customer refund as a positive linked payment movement', async () => {
    const response = await POST(
      request({
        refundKind: 'customer',
        amount: 400,
        paymentMethod: 'bank_transfer',
        reference: 'REF-400',
      }) as never,
      params,
    )

    expect(response.status).toBe(201)
    expect(mocks.paymentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation_id: 'reservation-1',
        amount: 400,
        payment_type: 'refund',
        payment_status: 'completed',
      }),
    )
    expect(mocks.reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ customer_refund_total: 400 }),
    )
    expect(mocks.syncPackagePaymentFinancials).toHaveBeenCalledWith(
      expect.anything(),
      'package-1',
      null,
    )
  })

  it('rejects a refund above the remaining reservation value', async () => {
    const response = await POST(
      request({ refundKind: 'supplier', amount: 1000.01 }) as never,
      params,
    )

    expect(response.status).toBe(400)
    expect(mocks.reservationUpdate).not.toHaveBeenCalled()
  })
})
