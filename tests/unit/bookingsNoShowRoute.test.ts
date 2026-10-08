import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const bookingSingle = vi.fn()
  const bookingSelectEq = vi.fn(() => ({ single: bookingSingle }))
  const bookingSelect = vi.fn(() => ({ eq: bookingSelectEq }))
  const bookingUpdateSingle = vi.fn()
  const bookingUpdateSelect = vi.fn(() => ({ single: bookingUpdateSingle }))
  const bookingUpdateEq = vi.fn(() => ({ select: bookingUpdateSelect }))
  const bookingUpdate = vi.fn(() => ({ eq: bookingUpdateEq }))
  const bookingAuditInsert = vi.fn()
  const from = vi.fn((table: string) =>
    table === 'bookings'
      ? { select: bookingSelect, update: bookingUpdate }
      : { insert: bookingAuditInsert },
  )
  const getRouteSupabaseClient = vi.fn(async () => ({ from }))
  const incrementBookingContactPenalty = vi.fn()

  return {
    bookingSingle,
    bookingUpdate,
    bookingUpdateSingle,
    bookingAuditInsert,
    from,
    getRouteSupabaseClient,
    incrementBookingContactPenalty,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/bookingFlags', () => ({
  incrementBookingContactPenalty: mocks.incrementBookingContactPenalty,
}))

import { POST } from '@/app/api/bookings/[id]/no-show/route'

const params = { params: Promise.resolve({ id: 'booking-1' }) }

describe('POST /api/bookings/[id]/no-show request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bookingSingle.mockResolvedValue({
      data: {
        id: 'booking-1',
        location_id: 'location-1',
        customer_phone: '+44 7123456789',
        customer_email: 'alex@example.com',
        attendance_status: 'scheduled',
        status: 'pending',
      },
      error: null,
    })
    mocks.bookingUpdateSingle.mockResolvedValue({
      data: { id: 'booking-1', attendance_status: 'manual_no_show', status: 'completed' },
      error: null,
    })
    mocks.bookingAuditInsert.mockResolvedValue({ error: null })
    mocks.incrementBookingContactPenalty.mockResolvedValue(undefined)
  })

  it('rejects malformed JSON before reading or updating a booking', async () => {
    const response = await POST(
      new Request('http://localhost/api/bookings/booking-1/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }) as never,
      params,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.incrementBookingContactPenalty).not.toHaveBeenCalled()
  })

  it('keeps an empty optional body and uses the default no-show reason', async () => {
    const response = await POST(
      new Request('http://localhost/api/bookings/booking-1/no-show', { method: 'POST' }) as never,
      params,
    )

    expect(response.status).toBe(200)
    expect(mocks.bookingUpdate).toHaveBeenCalledWith({
      attendance_status: 'manual_no_show',
      status: 'completed',
    })
    expect(mocks.incrementBookingContactPenalty).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Marked as no-show by staff' }),
    )
    expect(mocks.bookingAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'no_show_flagged' }),
    )
  })
})
