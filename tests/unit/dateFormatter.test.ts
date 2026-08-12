import { describe, expect, it } from 'vitest'
import {
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
