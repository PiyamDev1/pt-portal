import { createHash } from 'node:crypto'

const RECEIPT_ID_NAMESPACE = Buffer.from('6d959f3c8db84e1cbcd0fe36ec1185aa', 'hex')

/** Returns a stable UUIDv5 for one immutable service receipt event. */
export function buildReceiptIdempotencyId(identity: {
  serviceType: string
  serviceRecordId: string
  receiptType: string
}) {
  const name = JSON.stringify([
    identity.serviceType,
    identity.serviceRecordId.trim(),
    identity.receiptType,
  ])
  const digest = createHash('sha1').update(RECEIPT_ID_NAMESPACE).update(name).digest()
  const uuidBytes = Buffer.from(digest.subarray(0, 16))

  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80

  const hex = uuidBytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
