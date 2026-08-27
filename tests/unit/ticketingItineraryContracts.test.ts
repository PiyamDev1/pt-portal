import { describe, expect, it } from 'vitest'
import {
  TICKET_ITINERARY_MAX_SECTORS,
  ticketingLocalDateTimeSchema,
  ticketingReplaceItinerarySchema,
  ticketingScheduleChangeMutationSchema,
} from '@/lib/ticketing/itineraryContracts'

const REQUEST_ID = '90000000-0000-4000-8000-000000000001'

function sector(overrides: Record<string, unknown> = {}) {
  return {
    flightNumber: 'tk 199',
    originIata: ' lhr ',
    destinationIata: 'ist',
    departureLocal: '2026-09-01T10:30',
    arrivalLocal: '2026-09-01T16:45:00',
    ...overrides,
  }
}

describe('Ticketing itinerary contracts', () => {
  it('accepts the initial version and normalizes fast-entry flight fields', () => {
    const parsed = ticketingReplaceItinerarySchema.parse({
      requestId: REQUEST_ID,
      expectedVersion: 0,
      sectors: [sector()],
    })

    expect(parsed).toEqual({
      requestId: REQUEST_ID,
      expectedVersion: 0,
      adminReason: null,
      sectors: [
        {
          airlineId: null,
          flightNumber: 'TK 199',
          originIata: 'LHR',
          destinationIata: 'IST',
          departureLocal: '2026-09-01T10:30',
          arrivalLocal: '2026-09-01T16:45:00',
        },
      ],
    })
  })

  it('accepts one through twelve sectors but no empty or oversized replacement', () => {
    expect(
      ticketingReplaceItinerarySchema.safeParse({
        requestId: REQUEST_ID,
        expectedVersion: 0,
        sectors: [sector({ arrivalLocal: null })],
      }).success,
    ).toBe(true)
    expect(
      ticketingReplaceItinerarySchema.safeParse({
        requestId: REQUEST_ID,
        expectedVersion: 0,
        sectors: [],
      }).success,
    ).toBe(false)
    expect(
      ticketingReplaceItinerarySchema.safeParse({
        requestId: REQUEST_ID,
        expectedVersion: 0,
        sectors: Array.from({ length: TICKET_ITINERARY_MAX_SECTORS + 1 }, () => sector()),
      }).success,
    ).toBe(false)
  })

  it('rejects caller-supplied timezone, UTC, sequence, and schedule fields', () => {
    for (const forbidden of [
      { departureTimezone: 'Europe/London' },
      { departureAtUtc: '2026-09-01T09:30:00Z' },
      { arrivalTimezone: 'Europe/Istanbul' },
      { arrivalAtUtc: '2026-09-01T13:45:00Z' },
      { sequenceNumber: 1 },
      { scheduleStatus: 'on_schedule' },
    ]) {
      const parsed = ticketingReplaceItinerarySchema.safeParse({
        requestId: REQUEST_ID,
        expectedVersion: 0,
        sectors: [sector(forbidden)],
      })
      expect(parsed.success, JSON.stringify(forbidden)).toBe(false)
    }
  })

  it('rejects malformed local calendar times, offsets, and UTC suffixes', () => {
    for (const value of [
      '2026-02-29T10:00',
      '2026-01-01T24:00',
      '2026-01-01T10:60',
      '2026-01-01 10:00',
      '2026-01-01T10:00Z',
      '2026-01-01T10:00+01:00',
      '1999-12-31T23:59',
    ]) {
      expect(ticketingLocalDateTimeSchema.safeParse(value).success, value).toBe(false)
    }
    expect(ticketingLocalDateTimeSchema.safeParse('2028-02-29T23:59:59').success).toBe(true)
  })

  it('rejects invalid routes, identifiers, request metadata, and unknown root keys', () => {
    const base = { requestId: REQUEST_ID, expectedVersion: 0, sectors: [sector()] }
    expect(
      ticketingReplaceItinerarySchema.safeParse({
        ...base,
        sectors: [sector({ destinationIata: 'LHR' })],
      }).success,
    ).toBe(false)
    expect(
      ticketingReplaceItinerarySchema.safeParse({
        ...base,
        sectors: [sector({ originIata: 'London' })],
      }).success,
    ).toBe(false)
    expect(
      ticketingReplaceItinerarySchema.safeParse({ ...base, requestId: 'retry-1' }).success,
    ).toBe(false)
    expect(
      ticketingReplaceItinerarySchema.safeParse({ ...base, expectedVersion: -1 }).success,
    ).toBe(false)
    expect(
      ticketingReplaceItinerarySchema.safeParse({ ...base, actorEmployeeId: REQUEST_ID }).success,
    ).toBe(false)
  })

  it('keeps marked schedule proposals separate from later state transitions', () => {
    expect(
      ticketingScheduleChangeMutationSchema.parse({
        requestId: REQUEST_ID,
        action: 'mark',
        expectedItineraryVersion: 2,
        proposal: {
          flightNumber: 'tk 201',
          departureLocal: '2026-09-01T12:30',
          arrivalLocal: null,
        },
        reason: ' Airline notice received ',
      }),
    ).toEqual({
      requestId: REQUEST_ID,
      action: 'mark',
      expectedItineraryVersion: 2,
      changeId: null,
      proposal: {
        flightNumber: 'TK 201',
        departureLocal: '2026-09-01T12:30',
        arrivalLocal: null,
      },
      reason: 'Airline notice received',
    })

    const changeId = '91000000-0000-4000-8000-000000000001'
    expect(
      ticketingScheduleChangeMutationSchema.safeParse({
        requestId: REQUEST_ID,
        action: 'review',
        expectedItineraryVersion: 2,
        changeId,
        proposal: null,
        reason: 'Schedule checked',
      }).success,
    ).toBe(true)
    expect(
      ticketingScheduleChangeMutationSchema.safeParse({
        requestId: REQUEST_ID,
        action: 'review',
        expectedItineraryVersion: 2,
        changeId,
        proposal: {
          flightNumber: 'TK 999',
          departureLocal: '2026-09-01T13:00',
        },
        reason: 'Browser attempted to replace the marked proposal',
      }).success,
    ).toBe(false)
    expect(
      ticketingScheduleChangeMutationSchema.safeParse({
        requestId: REQUEST_ID,
        action: 'mark',
        expectedItineraryVersion: 2,
        changeId,
        proposal: null,
        reason: 'Invalid mark state',
      }).success,
    ).toBe(false)
    expect(
      ticketingScheduleChangeMutationSchema.safeParse({
        requestId: REQUEST_ID,
        action: 'review',
        expectedItineraryVersion: 0,
        changeId,
        proposal: null,
        reason: 'Invalid initial itinerary version',
      }).success,
    ).toBe(false)
  })
})
