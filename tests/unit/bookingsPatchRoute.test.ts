import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sendBookingEmail = vi.fn()
  const bookingEqSingle = vi.fn()
  const bookingEq = vi.fn(() => ({ single: bookingEqSingle }))
  const bookingOverlapNeqId = vi.fn()
  const bookingOverlapNeqStatus = vi.fn(() => ({ neq: bookingOverlapNeqId }))
  const bookingOverlapLte = vi.fn(() => ({ neq: bookingOverlapNeqStatus }))
  const bookingOverlapGte = vi.fn(() => ({ lte: bookingOverlapLte }))
  const bookingOverlapEqLocation = vi.fn(() => ({ gte: bookingOverlapGte }))
  const bookingSelect = vi.fn((columns?: string) => {
    if (typeof columns === 'string' && columns.includes('booking_services:service_id')) {
      return { eq: bookingOverlapEqLocation }
    }
    return { eq: bookingEq }
  })

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

  const branchSettingsMaybeSingle = vi.fn()
  const branchSettingsEqDay = vi.fn(() => ({ maybeSingle: branchSettingsMaybeSingle }))
  const branchSettingsEqLocation = vi.fn(() => ({ eq: branchSettingsEqDay }))
  const branchSettingsSelect = vi.fn(() => ({ eq: branchSettingsEqLocation }))

  const scheduleOverrideMaybeSingle = vi.fn()
  const scheduleOverrideEqDate = vi.fn(() => ({ maybeSingle: scheduleOverrideMaybeSingle }))
  const scheduleOverrideEqLocation = vi.fn(() => ({ eq: scheduleOverrideEqDate }))
  const scheduleOverrideSelect = vi.fn(() => ({ eq: scheduleOverrideEqLocation }))

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
    if (table === 'branch_settings') {
      return {
        select: branchSettingsSelect,
      }
    }
    if (table === 'branch_schedule_overrides') {
      return {
        select: scheduleOverrideSelect,
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
    bookingOverlapNeqId,
    bookingOverlapNeqStatus,
    bookingOverlapLte,
    bookingOverlapGte,
    bookingOverlapEqLocation,
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
    branchSettingsMaybeSingle,
    branchSettingsEqDay,
    branchSettingsEqLocation,
    branchSettingsSelect,
    scheduleOverrideMaybeSingle,
    scheduleOverrideEqDate,
    scheduleOverrideEqLocation,
    scheduleOverrideSelect,
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
        duration_per_additional_person_minutes: 0,
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

    mocks.branchSettingsMaybeSingle.mockResolvedValue({
      data: {
        location_id: 'location-1',
        day_of_week: 6,
        is_closed: false,
        open_time: '09:00:00',
        close_time: '17:00:00',
        lunch_start_time: null,
        lunch_end_time: null,
        prayer_start_time: null,
        prayer_end_time: null,
        concurrent_staff: 1,
      },
      error: null,
    })
    mocks.scheduleOverrideMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    mocks.bookingOverlapNeqId.mockResolvedValue({
      data: [],
      error: null,
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
        kind: 'modification',
        template: 'modification',
      }),
    )

    expect(mocks.bookingEmailLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: 'new@example.com',
        email_kind: 'modification',
        email_subject: 'Your appointment details were re-sent',
        metadata: expect.objectContaining({
          email_changed: true,
          previous_customer_email: 'old@example.com',
        }),
      }),
    )
  })

  it('does not send customer email for notes-only changes', async () => {
    const request = new Request('http://localhost/api/bookings/booking-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: 'Internal follow-up required',
        if_unmodified_since: '2026-06-06T09:00:00.000Z',
      }),
    })

    const response = await PATCH(request as never, { params: Promise.resolve({ id: 'booking-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mocks.sendBookingEmail).not.toHaveBeenCalled()
    expect(mocks.bookingEmailLogsInsert).not.toHaveBeenCalled()
  })

  it('rejects invalid state transitions', async () => {
    mocks.bookingEqSingle.mockResolvedValueOnce({
      data: {
        id: 'booking-1',
        location_id: 'location-1',
        status: 'completed',
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

    const request = new Request('http://localhost/api/bookings/booking-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'cancelled',
        if_unmodified_since: '2026-06-06T09:00:00.000Z',
      }),
    })

    const response = await PATCH(request as never, { params: Promise.resolve({ id: 'booking-1' }) })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Cannot move appointment from completed to cancelled')
  })

  it('re-checks shared staff capacity when person count changes on the same slot', async () => {
    mocks.serviceSingle.mockResolvedValueOnce({
      data: {
        id: 'service-1',
        location_id: 'location-1',
        name: 'Visa Consultation',
        duration_minutes: 30,
        buffer_minutes: 15,
        duration_per_additional_person_minutes: 30,
        person_count_excludes_family_head: true,
        close_overrun_tolerance_minutes: 15,
        confirmation_template: 'confirmation',
        modification_template: 'modification',
        cancellation_template: 'cancellation',
      },
      error: null,
    })

    mocks.bookingOverlapNeqId.mockResolvedValueOnce({
      data: [
        {
          id: 'booking-2',
          service_id: 'service-2',
          person_count: 1,
          start_time: '2026-06-06T10:45:00.000Z',
          end_time: '2026-06-06T11:15:00.000Z',
          booking_services: {
            duration_minutes: 30,
            buffer_minutes: 0,
            duration_per_additional_person_minutes: 0,
            person_count_excludes_family_head: true,
          },
        },
      ],
      error: null,
    })

    const request = new Request('http://localhost/api/bookings/booking-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: 'service-1',
        start_time: '2026-06-06T10:00:00.000Z',
        person_count: 2,
        if_unmodified_since: '2026-06-06T09:00:00.000Z',
      }),
    })

    const response = await PATCH(request as never, { params: Promise.resolve({ id: 'booking-1' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe('No available staff for this time slot')
    expect(mocks.bookingsUpdateSingle).not.toHaveBeenCalled()
  })
})
