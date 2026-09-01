import { describe, expect, it } from 'vitest'

import type { DefaultBranchSchedule } from '@/lib/bookingBranchSchedule'
import { buildAvailabilityCandidates } from '@/lib/customerPortal/appointmentAvailability'

const settings: DefaultBranchSchedule = {
  day_of_week: 1,
  open_time: '09:00',
  close_time: '10:00',
  lunch_start_time: null,
  lunch_end_time: null,
  prayer_start_time: null,
  prayer_end_time: null,
  is_closed: false,
  concurrent_staff: 1,
  slot_interval_minutes: 30,
}

const service = {
  id: 'service-1',
  duration_minutes: 30,
  buffer_minutes: 0,
  available_days: [1],
  service_start_time: null,
  service_end_time: null,
  duration_per_additional_person_minutes: 0,
  person_count_excludes_family_head: false,
  close_overrun_tolerance_minutes: 0,
}

describe('customer appointment date availability', () => {
  it('offers future times only on days allowed by the service', () => {
    const monday = buildAvailabilityCandidates({
      service,
      locationId: 'branch-1',
      date: '2026-09-07',
      groupSize: 1,
      settings,
      override: null,
      bookings: [],
      nowMs: Date.parse('2026-09-01T12:00:00.000Z'),
    })
    const tuesday = buildAvailabilityCandidates({
      service,
      locationId: 'branch-1',
      date: '2026-09-08',
      groupSize: 1,
      settings: { ...settings, day_of_week: 2 },
      override: null,
      bookings: [],
      nowMs: Date.parse('2026-09-01T12:00:00.000Z'),
    })

    expect(monday.length).toBeGreaterThan(0)
    expect(monday[0]?.starts_at).toBe('2026-09-07T09:00:00.000Z')
    expect(tuesday).toEqual([])
  })

  it('hides closed and fully booked dates', () => {
    const common = {
      service,
      locationId: 'branch-1',
      date: '2026-09-07',
      groupSize: 1,
      settings,
      nowMs: Date.parse('2026-09-01T12:00:00.000Z'),
    }
    const closed = buildAvailabilityCandidates({
      ...common,
      override: { is_closed: true },
      bookings: [],
    })
    const full = buildAvailabilityCandidates({
      ...common,
      override: null,
      bookings: [
        {
          start_time: '2026-09-07T09:00:00.000Z',
          end_time: '2026-09-07T10:00:00.000Z',
          booking_services: { buffer_minutes: 0 },
        },
      ],
    })

    expect(closed).toEqual([])
    expect(full).toEqual([])
  })
})
