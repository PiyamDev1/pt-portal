import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TravelPackageReservation } from '@/app/types/packages'

const reservation: TravelPackageReservation = {
  id: 'reservation-1',
  package_id: 'package-1',
  quote_id: 'quote-1',
  created_by: 'agent-1',
  updated_by: 'agent-1',
  reservation_type: 'flight',
  title: 'Etihad flights',
  status: 'reservation_pending',
  supplier_name: 'Etihad Airways',
  supplier_reference: 'PNR123',
  booking_reference: null,
  currency: 'GBP',
  booked_cost_total: 1000,
  sold_price_total: 1250,
  discount_total: 50,
  commission_expected_total: 0,
  commission_received_total: 0,
  deposit_required: true,
  deposit_amount: 300,
  deposit_due_at: null,
  payment_due_at: null,
  reserved_at: null,
  confirmed_at: null,
  cancelled_at: null,
  customer_visible: false,
  public_notes: null,
  internal_notes: 'Hold until deposit is paid',
  metadata: {},
  created_at: '2026-07-11T10:00:00.000Z',
  updated_at: null,
}

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()

  const listOrder = vi.fn()
  const listEq = vi.fn(() => ({ order: listOrder }))
  const listSelect = vi.fn(() => ({ eq: listEq }))

  const insertSingle = vi.fn()
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn(() => ({ select: insertSelect }))

  const updateSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateSecondEq = vi.fn(() => ({ select: updateSelect }))
  const updateFirstEq = vi.fn(() => ({ eq: updateSecondEq }))
  const update = vi.fn(() => ({ eq: updateFirstEq }))

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_reservations') {
      return {
        select: listSelect,
        insert,
        update,
      }
    }
    return {}
  })

  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    listOrder,
    listEq,
    listSelect,
    insertSingle,
    insertSelect,
    insert,
    updateSingle,
    updateSelect,
    updateSecondEq,
    updateFirstEq,
    update,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { GET, POST } from '@/app/api/travel-packages/[id]/reservations/route'
import { PATCH } from '@/app/api/travel-packages/[id]/reservations/[reservationId]/route'

function makeRequest(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/travel-packages/package-1/reservations', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('travel package reservation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.listOrder.mockResolvedValue({ data: [reservation], error: null })
    mocks.insertSingle.mockResolvedValue({ data: reservation, error: null })
    mocks.updateSingle.mockResolvedValue({
      data: { ...reservation, status: 'confirmed' },
      error: null,
    })
  })

  it('requires an authenticated agent to list reservations', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await GET(
      new Request('http://localhost/api/travel-packages/package-1/reservations') as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )

    expect(response.status).toBe(401)
  })

  it('lists reservations for a package folder', async () => {
    const response = await GET(
      new Request('http://localhost/api/travel-packages/package-1/reservations') as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.reservations).toHaveLength(1)
    expect(mocks.listEq).toHaveBeenCalledWith('package_id', 'package-1')
    expect(mocks.listOrder).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('creates a reservation with internal financial fields hidden from customers', async () => {
    const response = await POST(
      makeRequest({
        quoteId: 'quote-1',
        reservationType: 'flight',
        title: 'Etihad flights',
        status: 'reservation_pending',
        supplierName: 'Etihad Airways',
        supplierReference: 'PNR123',
        bookedCostTotal: '1000',
        soldPriceTotal: '1250',
        discountTotal: '50',
        depositRequired: true,
        depositAmount: '300',
        internalNotes: 'Hold until deposit is paid',
      }) as never,
      { params: Promise.resolve({ id: 'package-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.reservation.id).toBe('reservation-1')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_id: 'package-1',
        quote_id: 'quote-1',
        created_by: 'agent-1',
        reservation_type: 'flight',
        customer_visible: false,
        booked_cost_total: 1000,
        sold_price_total: 1250,
        discount_total: 50,
      }),
    )
  })

  it('updates reservation status for an existing package reservation', async () => {
    const response = await PATCH(
      makeRequest({ status: 'confirmed' }, 'PATCH') as never,
      { params: Promise.resolve({ id: 'package-1', reservationId: 'reservation-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.reservation.status).toBe('confirmed')
    expect(mocks.update).toHaveBeenCalledWith({
      updated_by: 'agent-1',
      status: 'confirmed',
    })
    expect(mocks.updateFirstEq).toHaveBeenCalledWith('id', 'reservation-1')
    expect(mocks.updateSecondEq).toHaveBeenCalledWith('package_id', 'package-1')
  })
})
