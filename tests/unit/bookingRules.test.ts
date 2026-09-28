import { describe, expect, it } from 'vitest'
import {
  extractUtcTimeHHMMSS,
  getServicePersonUnits,
  hasServiceRuleFields,
  isValidBookingEmail,
  isValidBookingPhone,
  overlapsRangeBeyondTolerance,
  overlapsRangeBeyondToleranceMinutes,
  timeToMinutes,
} from '@/lib/bookingRules'

describe('shared booking rules', () => {
  it('uses one family-head rule for staff, customer, and UI calculations', () => {
    expect(getServicePersonUnits({ person_count_excludes_family_head: true }, 4)).toBe(4)
    expect(getServicePersonUnits({ person_count_excludes_family_head: false }, 4)).toBe(3)
    expect(getServicePersonUnits(undefined, 4)).toBe(4)
    expect(
      hasServiceRuleFields({
        person_count_excludes_family_head: false,
        close_overrun_tolerance_minutes: 5,
      }),
    ).toBe(true)
  })

  it('applies the same break-overrun tolerance at exact boundaries', () => {
    expect(overlapsRangeBeyondTolerance(8 * 60 + 50, 9 * 60 + 5, '09:00', '09:30', 5)).toBe(false)
    expect(overlapsRangeBeyondTolerance(8 * 60 + 50, 9 * 60 + 6, '09:00', '09:30', 5)).toBe(true)
    expect(
      overlapsRangeBeyondToleranceMinutes(9 * 60 + 5, 9 * 60 + 20, 9 * 60, 9 * 60 + 30, 5),
    ).toBe(true)
  })

  it('shares time and contact validation helpers', () => {
    expect(timeToMinutes('17:05:00')).toBe(1025)
    expect(extractUtcTimeHHMMSS(new Date('2026-09-28T17:05:06.000Z'))).toBe('17:05:06')
    expect(isValidBookingEmail('customer@example.com')).toBe(true)
    expect(isValidBookingEmail('customer-at-example.com')).toBe(false)
    expect(isValidBookingPhone('+44 7700 900123')).toBe(true)
    expect(isValidBookingPhone('07700900123')).toBe(false)
  })
})
