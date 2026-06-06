import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sendBookingEmail = vi.fn()
  const bookingEqSingle = vi.fn()
  const bookingEq = vi.fn(() => ({ single: bookingEqSingle }))
  const bookingSelect = vi.fn(() => ({ eq: bookingEq }))

  const serviceSingle = vi.fn()
  const serviceEqLocation = vi.fn(() => ({ single: serviceSingle }))
  const serviceEqId = vi.fn(() => ({ eq: serviceEqLocation }))
  const serviceSelect = vi.fn(() => ({ eq: serviceEqId }))

  const bookingsUpdateSingle = vi.fn()
  const bookingsUpdateEq = vi.fn(() => ({ select: () => ({ single: bookingsUpdateSingle }) }))
  const bookingsUpdate = vi.fn(() => ({ eq: bookingsUpdateEq }))

  const locationSingle = vi.fn()
  const locationEq = vi.fn(() => ({ single: locationSingle }))
  const locationSelect = vi.fn(() => ({ eq: locationEq }))

  const bookingEmailLogsInsert = vi.fn()
  const bookingAuditLogsInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'bookings') {
      return {
        select: bookingSelect,
        update: bookingsUpdate,
      }
    }
    if (table === 'booking_services') {
      return {
        select: serviceSelect,
      }
    }
    if (table === 'locations') {
      return {
        select: locationSelect,
      }
    }
    if (table === 'booking_email_logs') {
      return { insert: bookingEmailLogsInsert }
    }
    if (table === 'booking_audit_logs') {
      return { insert: bookingAuditLogsInsert }
    }
    return {}
  })

  const getRouteSupabaseClient = vi.fn(async () => ({ from }))

  return {
    sendBookingEmail,
    bookingEqSingle,
    bookingEq,
    bookingSelect,
    serviceSingle,
    serviceEqLocation,
    serviceEqId,
    serviceSelect,
    bookingsUpdateSingle,
    bookingsUpdateEq,
    bookingsUpdate,
    locationSingle,
    locationEq,
    locationSelect,
    bookingEmailLogsInsert,
    bookingAuditLogsInsert,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('@/lib/bookingEmail', () => ({
  sendBookingEmail: mocks.sendBookingEmail,
}))

import { PATCH } from '@/app/api/bookings/[id]/route'

describe('PATCH /api/bookings/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.sendBookingEmail.mockResolvedValue({
      sent: true,
      senderEmail: 'noreply.appointments@piyamtravel.com',
    })

    mocks.bookingEqSingle.mockResolvedValue({
      data: {
        id: 'booking-1',
        location_id: 'location-1',
        status: 'pending',
        customer_name: 'Alex Carter',
        customer_phone: '+44 7123456789',
        customer_email: 'old@example.com',
        service_id: 'service-1',
        person_count: 1,
        start_time: '2026-06-06T10:00:00.000Z',
        end_time: '2026-06-06T10:30:00.000Z',
        notes: null,
        updated_at: '2026-06-06T09:00:00.000Z',
      },
      error: null,
    })

    mocks.serviceSingle.mockResolvedValue({
      data: {
        id: 'service-1',
        location_id: 'location-1',
        name: 'Visa Consultation',
        duration_minutes: 30,
        buffer_minutes: 15,
        person_count_excludes_family_head: true,
        close_overrun_tolerance_minutes: 15,
        confirmation_template: 'confirmation',
        modification_template: 'modification',
        cancellation_template: 'cancellation',
      },
      error: null,
    })

    mocks.bookingsUpdateSingle.mockResolvedValue({
      data: {
        id: 'booking-1',
        location_id: 'location-1',
        status: 'pending',
        customer_name: 'Alex Carter',
        customer_phone: '+44 7123456789',
        customer_email: 'new@example.com',
        service_id: 'service-1',
        person_count: 1,
        start_time: '2026-06-06T10:00:00.000Z',
        end_time: '2026-06-06T10:30:00.000Z',
        notes: null,
        updated_at: '2026-06-06T09:05:00.000Z',
      },
      error: null,
    })

    mocks.locationSingle.mockResolvedValue({
      data: {
        name: 'London Branch',
        address_line1: '12 Station Road',
        address_line2: null,
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'United Kingdom',
        phone: '+44 2071234567',
      },
    })

    mocks.bookingEmailLogsInsert.mockResolvedValue({ error: null })
    mocks.bookingAuditLogsInsert.mockResolvedValue({ error: null })
  })

  it('re-sends appointment details when customer email changes', async () => {
    const request = new Request('http://localhost/api/bookings/booking-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Alex Carter',
        customer_phone: '+44 7123456789',
        customer_email: 'new@example.com',
        service_id: 'service-1',
        start_time: '2026-06-06T10:00:00.000Z',
        person_count: 1,
        if_unmodified_since: '2026-06-06T09:00:00.000Z',
      }),
    })

    const response = await PATCH(request as never, { params: Promise.resolve({ id: 'booking-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.email_resent).toBe(true)

    expect(mocks.sendBookingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        subject: 'Your appointment details were re-sent',
        kind: 'confirmation',
        template: 'confirmation',
      }),
    )

    expect(mocks.bookingEmailLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: 'new@example.com',
        email_kind: 'confirmation',
        email_subject: 'Your appointment details were re-sent',
        metadata: expect.objectContaining({
          email_changed: true,
          previous_customer_email: 'old@example.com',
        }),
      }),
    )
  })
})
