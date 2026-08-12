import { describe, expect, it } from 'vitest'
import { generateSmokeTotp } from '@/tests/smoke/helpers/totp'

describe('smoke TOTP generation', () => {
  it('matches the RFC 6238 SHA-1 vector truncated to six digits', () => {
    expect(generateSmokeTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000)).toBe('287082')
  })

  it('rejects invalid base32 secrets', () => {
    expect(() => generateSmokeTotp('not-a-valid-secret!')).toThrow(/valid base32/i)
  })
})
