import { describe, expect, it } from 'vitest'
import { ticketingFlightCheckKind } from '@/lib/ticketing/flightMonitorCadence'

const NOW = new Date('2026-08-28T05:30:00.000Z')

function departureIn(hours: number) {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString()
}

function check(
  hoursUntilDeparture: number,
  overrides: Partial<Parameters<typeof ticketingFlightCheckKind>[0]> = {},
) {
  return ticketingFlightCheckKind({
    now: NOW,
    departureAtUtc: departureIn(hoursUntilDeparture),
    weeklyIntervalDays: 7,
    predepartureHours: 72,
    lastWeeklyCheckedAt: null,
    predepartureCheckedAt: null,
    ...overrides,
  })
}

describe('Ticketing flight monitoring cadence', () => {
  it('opens the final-check window one daily cadence before the 72-hour deadline', () => {
    expect(check(96)).toBe('predeparture')
    expect(check(96.1)).toBe('weekly')
  })

  it('does not repeat a completed final check', () => {
    expect(
      check(70, {
        predepartureCheckedAt: '2026-08-27T05:30:00.000Z',
      }),
    ).toBeNull()
  })

  it('checks distant flights weekly and waits until the interval elapses', () => {
    expect(check(240)).toBe('weekly')
    expect(
      check(240, {
        lastWeeklyCheckedAt: '2026-08-24T05:30:00.000Z',
      }),
    ).toBeNull()
    expect(
      check(240, {
        lastWeeklyCheckedAt: '2026-08-21T05:30:00.000Z',
      }),
    ).toBe('weekly')
  })

  it('ignores departed or invalid sectors', () => {
    expect(check(-1)).toBeNull()
    expect(check(24, { departureAtUtc: 'not-a-date' })).toBeNull()
  })
})
