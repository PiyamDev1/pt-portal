import { describe, expect, it } from 'vitest'
import { ticketingAppendRefundEventSchema } from '@/lib/ticketing/refundContracts'

describe('Ticketing refund confirmation contract', () => {
  it('accepts an amount-free confirmation event', () => {
    expect(
      ticketingAppendRefundEventSchema.parse({
        expectedVersion: 3,
        eventType: 'confirmed_correct',
        amountGbp: null,
        eventDate: '2026-09-02',
        reference: 'Airline credit received',
        notes: null,
        overrideReason: null,
      }),
    ).toMatchObject({ eventType: 'confirmed_correct', amountGbp: null })
  })

  it('rejects a monetary amount on confirmation', () => {
    expect(
      ticketingAppendRefundEventSchema.safeParse({
        expectedVersion: 3,
        eventType: 'confirmed_correct',
        amountGbp: 100,
        eventDate: '2026-09-02',
        reference: null,
        notes: null,
        overrideReason: null,
      }).success,
    ).toBe(false)
  })
})
