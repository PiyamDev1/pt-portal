import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TravelPackageReservation,
  TravelPackageReservationItem,
} from '@/app/types/packages'

const reservation: TravelPackageReservation = {
  id: 'reservation-1',
  package_id: 'package-1',
  quote_id: 'quote-1',
  created_by: 'agent-1',
  updated_by: 'agent-1',
  reservation_type: 'hotel',
  title: 'Swissotel Makkah',
  status: 'reservation_pending',
  supplier_name: 'Swissotel',
  supplier_reference: 'HOTEL123',
  booking_reference: null,
  currency: 'GBP',
  booked_cost_total: 1200,
  sold_price_total: 1500,
  discount_total: 50,
  commission_expected_total: 100,
  commission_received_total: 0,
  deposit_required: false,
  deposit_amount: 0,
  deposit_due_at: null,
  payment_due_at: null,
  reserved_at: null,
  confirmed_at: null,
  cancelled_at: null,
  customer_visible: false,
  public_notes: null,
  internal_notes: null,
  metadata: {},
  created_at: '2026-07-11T10:00:00.000Z',
  updated_at: null,
}

const item: TravelPackageReservationItem = {
  id: 'item-1',
  reservation_id: 'reservation-1',
  package_id: 'package-1',
  item_type: 'hotel',
  title: 'Kaaba view room',
  description: 'Breakfast included',
  quantity: 2,
  unit_booked_cost: 600,
  unit_sold_price: 750,
  discount_amount: 50,
  commission_expected_amount: 100,
  commission_received_amount: 0,
  total_booked_cost: 1200,
  total_sold_price: 1500,
  currency: 'GBP',
  supplier_reference: 'ROOM123',
  status: 'draft',
  starts_at: null,
  ends_at: null,
  metadata: {},
  created_at: '2026-07-11T10:05:00.000Z',
  updated_at: null,
}

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()

  const parentSingle = vi.fn()
  const parentPackageEq = vi.fn(() => ({ single: parentSingle }))
  const parentIdEq = vi.fn(() => ({ eq: parentPackageEq }))
  const parentSelect = vi.fn(() => ({ eq: parentIdEq }))

  const itemListOrder = vi.fn()
  const itemListPackageEq = vi.fn(() => ({ order: itemListOrder }))
  const itemListReservationEq = vi.fn(() => ({ eq: itemListPackageEq }))
  const itemSelect = vi.fn(() => ({ eq: itemListReservationEq }))

  const itemInsertSingle = vi.fn()
  const itemInsertSelect = vi.fn(() => ({ single: itemInsertSingle }))
  const itemInsert = vi.fn(() => ({ select: itemInsertSelect }))

  const itemUpdateSingle = vi.fn()
  const itemUpdateSelect = vi.fn(() => ({ single: itemUpdateSingle }))
  const itemUpdatePackageEq = vi.fn(() => ({ select: itemUpdateSelect }))
  const itemUpdateReservationEq = vi.fn(() => ({ eq: itemUpdatePackageEq }))
  const itemUpdateIdEq = vi.fn(() => ({ eq: itemUpdateReservationEq }))
  const itemUpdate = vi.fn(() => ({ eq: itemUpdateIdEq }))

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_reservations') {
      return { select: parentSelect }
    }
    if (table === 'travel_package_reservation_items') {
      return {
        select: itemSelect,
        insert: itemInsert,
        update: itemUpdate,
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
    parentSingle,
    parentPackageEq,
    parentIdEq,
    parentSelect,
    itemListOrder,
    itemListPackageEq,
    itemListReservationEq,
    itemSelect,
    itemInsertSingle,
    itemInsertSelect,
    itemInsert,
    itemUpdateSingle,
    itemUpdateSelect,
    itemUpdatePackageEq,
    itemUpdateReservationEq,
    itemUpdateIdEq,
    itemUpdate,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { GET, POST } from '@/app/api/travel-packages/[id]/reservations/[reservationId]/items/route'
import { PATCH } from '@/app/api/travel-packages/[id]/reservations/[reservationId]/items/[itemId]/route'

function makeRequest(body: unknown, method = 'POST') {
  return new Request(
    'http://localhost/api/travel-packages/package-1/reservations/reservation-1/items',
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

describe('travel package reservation item routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.parentSingle.mockResolvedValue({ data: reservation, error: null })
    mocks.itemListOrder.mockResolvedValue({ data: [item], error: null })
    mocks.itemInsertSingle.mockResolvedValue({ data: item, error: null })
    mocks.itemUpdateSingle.mockResolvedValue({
      data: { ...item, status: 'confirmed' },
      error: null,
    })
  })

  it('requires an authenticated agent to list reservation items', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await GET(
      new Request(
        'http://localhost/api/travel-packages/package-1/reservations/reservation-1/items',
      ) as never,
      { params: Promise.resolve({ id: 'package-1', reservationId: 'reservation-1' }) },
    )

    expect(response.status).toBe(401)
  })

  it('lists items for a package reservation', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/travel-packages/package-1/reservations/reservation-1/items',
      ) as never,
      { params: Promise.resolve({ id: 'package-1', reservationId: 'reservation-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(mocks.itemListReservationEq).toHaveBeenCalledWith('reservation_id', 'reservation-1')
    expect(mocks.itemListPackageEq).toHaveBeenCalledWith('package_id', 'package-1')
  })

  it('creates an item scoped to the package reservation and returns refreshed totals', async () => {
    const response = await POST(
      makeRequest({
        itemType: 'hotel',
        title: 'Kaaba view room',
        description: 'Breakfast included',
        quantity: '2',
        unitBookedCost: '600',
        unitSoldPrice: '750',
        discountAmount: '50',
        commissionExpectedAmount: '100',
        supplierReference: 'ROOM123',
      }) as never,
      { params: Promise.resolve({ id: 'package-1', reservationId: 'reservation-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.item.id).toBe('item-1')
    expect(body.reservation.booked_cost_total).toBe(1200)
    expect(mocks.itemInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation_id: 'reservation-1',
        package_id: 'package-1',
        item_type: 'hotel',
        quantity: 2,
        unit_booked_cost: 600,
        unit_sold_price: 750,
        total_booked_cost: 1200,
        total_sold_price: 1500,
        discount_amount: 50,
        commission_expected_amount: 100,
      }),
    )
  })

  it('updates an existing reservation item inside the package boundary', async () => {
    const response = await PATCH(
      makeRequest({ status: 'confirmed' }, 'PATCH') as never,
      {
        params: Promise.resolve({
          id: 'package-1',
          reservationId: 'reservation-1',
          itemId: 'item-1',
        }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.item.status).toBe('confirmed')
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ status: 'confirmed' })
    expect(mocks.itemUpdateIdEq).toHaveBeenCalledWith('id', 'item-1')
    expect(mocks.itemUpdateReservationEq).toHaveBeenCalledWith('reservation_id', 'reservation-1')
    expect(mocks.itemUpdatePackageEq).toHaveBeenCalledWith('package_id', 'package-1')
  })
})
