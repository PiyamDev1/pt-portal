import { describe, expect, it } from 'vitest'
import { buildReceiptIdempotencyId } from '@/lib/services/receiptIdentity'

describe('buildReceiptIdempotencyId', () => {
  it('returns the same UUID for retries of one service event', () => {
    const identity = {
      serviceType: 'visa',
      serviceRecordId: 'visa-record-1',
      receiptType: 'submission',
    }

    expect(buildReceiptIdempotencyId(identity)).toBe(buildReceiptIdempotencyId(identity))
    expect(buildReceiptIdempotencyId(identity)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('uses service, record, and receipt type as separate identity fields', () => {
    const base = {
      serviceType: 'visa',
      serviceRecordId: 'record-1',
      receiptType: 'submission',
    }

    expect(buildReceiptIdempotencyId(base)).not.toBe(
      buildReceiptIdempotencyId({ ...base, receiptType: 'refund' }),
    )
    expect(buildReceiptIdempotencyId(base)).not.toBe(
      buildReceiptIdempotencyId({ ...base, serviceType: 'nadra' }),
    )
    expect(buildReceiptIdempotencyId(base)).not.toBe(
      buildReceiptIdempotencyId({ ...base, serviceRecordId: 'record-2' }),
    )
  })
})
