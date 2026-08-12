import { describe, expect, it } from 'vitest'
import {
  COUNTRY_CODE_OPTIONS,
  formatMinutesLabel,
  getServicePersonUnits,
  isSameUTCDay,
  isValidLocalPhone,
  normalizeLocalPhone,
  startOfCalendarGrid,
  timeHHMMToMins,
} from '@/app/dashboard/bookings/bookingClientModel'

describe('booking client model', () => {
  it('keeps the expected country-code labels and normalizes local phone input', () => {
    expect(COUNTRY_CODE_OPTIONS.find(({ code }) => code === '+44')?.label).toBe(
      'United Kingdom (+44)',
    )
    expect(normalizeLocalPhone('07700 900-123')).toBe('07700900123')
    expect(isValidLocalPhone('07700 900-123')).toBe(true)
    expect(isValidLocalPhone('123')).toBe(false)
  })

  it('uses Monday as the first calendar-grid day', () => {
    const monthStart = new Date('2026-08-01T00:00:00Z')
    const gridStart = startOfCalendarGrid(monthStart)

    expect(gridStart.toISOString()).toBe('2026-07-27T00:00:00.000Z')
    expect(isSameUTCDay(gridStart, new Date('2026-07-27T15:00:00Z'))).toBe(true)
  })

  it('accounts for whether the family head is included in person count', () => {
    const baseService = {
      id: 'service',
      name: 'Service',
      is_active: true,
      duration_minutes: 30,
      buffer_minutes: 0,
      duration_per_additional_person_minutes: 10,
    }

    expect(getServicePersonUnits(baseService, 3)).toBe(3)
    expect(
      getServicePersonUnits({ ...baseService, person_count_excludes_family_head: false }, 3),
    ).toBe(2)
    expect(formatMinutesLabel(90)).toBe('1h 30m')
  })

  it('converts HH:MM values to minutes for booking timelines', () => {
    expect(timeHHMMToMins('08:00')).toBe(480)
    expect(timeHHMMToMins('13:45')).toBe(825)
  })
})
