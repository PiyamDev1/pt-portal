import { describe, expect, it } from 'vitest'
import {
  generateSecureNumericCode,
  generateTemporaryPassword,
} from '@/lib/security/secureRandom.server'

describe('secure random helpers', () => {
  it('generates fixed-width numeric codes in the requested range', () => {
    const receiptPins = Array.from({ length: 32 }, () => generateSecureNumericCode(6))
    const timeclockCodes = Array.from({ length: 32 }, () => generateSecureNumericCode(8))

    for (const pin of receiptPins) {
      expect(pin).toMatch(/^\d{6}$/)
      expect(Number(pin)).toBeGreaterThanOrEqual(0)
      expect(Number(pin)).toBeLessThan(1_000_000)
    }

    for (const code of timeclockCodes) {
      expect(code).toMatch(/^\d{8}$/)
      expect(Number(code)).toBeGreaterThanOrEqual(0)
      expect(Number(code)).toBeLessThan(100_000_000)
    }
  })

  it('generates policy-compliant temporary passwords with a fixed shape', () => {
    const passwords = Array.from({ length: 32 }, () => generateTemporaryPassword())

    for (const password of passwords) {
      expect(password).toMatch(/^[A-Za-z0-9_-]{16}Aa1!$/)
      expect(password).toHaveLength(20)
    }
  })

  it.each([0, -1, 1.5, 129])('rejects an invalid numeric-code length of %s', (length) => {
    expect(() => generateSecureNumericCode(length)).toThrow(RangeError)
  })
})
