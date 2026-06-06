import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const bookingSingle = vi.fn()
  const bookingEq = vi.fn(() => ({ single: bookingSingle }))
  const bookingSelect = vi.fn(() => ({ eq: bookingEq }))
  const bookingUpdateEq = vi.fn(() => ({}))
  const bookingUpdate = vi.fn(() => ({ eq: bookingUpdateEq }))

  const serviceSingle = vi.fn()
  const serviceEqLocation = vi.fn(() => ({ single: serviceSingle }))
  const serviceEqId = vi.fn(() => ({ eq: serviceEqLocation }))
  const serviceSelect = vi.fn(() => ({ eq: serviceEqId }))

  const locationSingle = vi.fn()
  const locationEq = vi.fn(() => ({ single: locationSingle }))
  const locationSelect = vi.fn(() => ({ eq: locationEq }))

  const emailLogsInsert = vi.fn()
  const auditInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'bookings') return { select: bookingSelect, update: bookingUpdate }
    if (table === 'booking_services') return { select: serviceSelect }
    if (table === 'locations') return { select: locationSelect }
    if (table === 'booking_email_logs') return { insert: emailLogsInsert }
    if (table === 'booking_audit_logs') return { insert: auditInsert }
    if (table === 'booking_idempotency_keys') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) }
    return {}
  })

  const getRouteSupabaseClient = vi.fn(async () => ({ from }))
  const sendBookingEmail = vi.fn()

  return {
    bookingSingle,
    serviceSingle,
    locationSingle,
    emailLogsInsert,
    auditInsert,
    getRouteSupabaseClient,
    sendBookingEmail,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('@/lib/bookingEmail', () => ({
  sendBookingEmail: mocks.sendBookingEmail,
}))

import { POST } from '@/app/api/bookings/[id]/resend/route'

describe('POST /api/bookings/[id]/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bookingSingle.mockResolvedValue({
      data: {
        id: 'booking-1',
        location_id: 'location-1',
        customer_name: 'Alex Carter',
        customer_email: 'alex@example.com',
        service_id: 'service-1',
        start_time: '2026-06-06T10:00:00.000Z',
        status: 'confirmed',
      },
      error: null,
    })
    mocks.serviceSingle.mockResolvedValue({
      data: {
        id: 'service-1',
        location_id: 'location-1',
        name: 'Visa Consultation',
        confirmation_template: 'confirmation',
        modification_template: 'modification',
        cancellation_template: 'cancellation',
      },
      error: null,
    })
    mocks.locationSingle.mockResolvedValue({
      data: {
        name: 'London Branch',
        address_line1: '12 Station Road',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'United Kingdom',
        phone: '+44 2071234567',
      },
    })
    mocks.emailLogsInsert.mockResolvedValue({ error: null })
    mocks.auditInsert.mockResolvedValue({ error: null })
    mocks.sendBookingEmail.mockResolvedValue({
      sent: true,
      senderEmail: 'noreply.appointments@piyamtravel.com',
    })
  })

  it('re-sends a confirmation email for confirmed bookings', async () => {
    const request = new Request('http://localhost/api/bookings/booking-1/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await POST(request as never, { params: Promise.resolve({ id: 'booking-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mocks.sendBookingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alex@example.com',
        kind: 'confirmation',
        subject: 'Your appointment confirmation was re-sent',
      }),
    )
  })
})
