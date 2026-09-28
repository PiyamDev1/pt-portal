import { describe, expect, it } from 'vitest'
import {
  formatIsoDateInTimezone,
  formatToDisplayDate,
  formatToISODate,
  handleDateInput,
  isValidDateFormat,
} from '@/lib/dateFormatter'

describe('dateFormatter', () => {
  it('converts between the LMS display and ISO formats', () => {
    expect(formatToDisplayDate('2026-08-12')).toBe('12/08/2026')
    expect(formatToISODate('12/08/2026')).toBe('2026-08-12')
  })

  it('returns the calendar date in the requested timezone with a UTC fallback', () => {
    const value = '2026-09-28T00:30:00.000Z'
    expect(formatIsoDateInTimezone(value, 'America/Los_Angeles')).toBe('2026-09-27')
    expect(formatIsoDateInTimezone(value, 'Europe/London')).toBe('2026-09-28')
    expect(formatIsoDateInTimezone(value, 'Not/A_Timezone')).toBe('2026-09-28')
  })

  it('formats date input incrementally and ignores non-digits', () => {
    expect(handleDateInput('1')).toBe('1')
    expect(handleDateInput('12-08')).toBe('12/08')
    expect(handleDateInput('12/08/2026 extra digits 99')).toBe('12/08/2026')
  })

  it('accepts only bounded DD/MM/YYYY values', () => {
    expect(isValidDateFormat('12/08/2026')).toBe(true)
    expect(isValidDateFormat('2026-08-12')).toBe(false)
    expect(isValidDateFormat('12/13/2026')).toBe(false)
    expect(isValidDateFormat('12/08/1899')).toBe(false)
  })
})
