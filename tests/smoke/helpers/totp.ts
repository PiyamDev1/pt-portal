import { createHmac } from 'node:crypto'

function decodeBase32(secret: string) {
  const normalized = secret.toUpperCase().replace(/[\s=-]/g, '')
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error('SMOKE_2FA_TOTP_SECRET must be a valid base32 authenticator secret.')
  }

  let bits = ''
  for (const character of normalized) {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character)
    bits += value.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }
  return Buffer.from(bytes)
}

/** Generate the same six-digit RFC 6238 code as a standard authenticator app. */
export function generateSmokeTotp(secret: string, timestampMs = Date.now()) {
  const counter = BigInt(Math.floor(timestampMs / 30_000))
  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(counter)

  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBytes).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  return String(binary % 1_000_000).padStart(6, '0')
}
