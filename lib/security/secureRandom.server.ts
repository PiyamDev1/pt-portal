import { randomBytes, randomInt } from 'node:crypto'

const MAX_RANDOM_STRING_LENGTH = 128

function assertValidLength(length: number) {
  if (!Number.isInteger(length) || length < 1 || length > MAX_RANDOM_STRING_LENGTH) {
    throw new RangeError(`length must be an integer between 1 and ${MAX_RANDOM_STRING_LENGTH}`)
  }
}

/**
 * Generate a fixed-width numeric code with unbiased cryptographic randomness.
 * The return value is a string so leading zeroes are preserved.
 */
export function generateSecureNumericCode(length: number) {
  assertValidLength(length)

  return Array.from({ length }, () => randomInt(10).toString()).join('')
}

/**
 * Generate a high-entropy temporary password with an explicit upper-case,
 * lower-case, numeric, and special-character suffix for common auth policies.
 */
export function generateTemporaryPassword() {
  return `${randomBytes(12).toString('base64url')}Aa1!`
}
