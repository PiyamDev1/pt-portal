import { describe, expect, it, vi } from 'vitest'
import { storeBookingAuditEvent } from '@/lib/bookingPersistence'

describe('booking persistence', () => {
  it('stores the shared audit event shape', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ insert }))

    await storeBookingAuditEvent(
      { from },
      {
        booking_id: 'booking-1',
        location_id: 'location-1',
        action_type: 'rescheduled',
        actor_identifier: 'customer-portal',
        before_data: { start_time: 'before' },
        after_data: { start_time: 'after' },
        metadata: { source: 'customer-portal' },
      },
    )

    expect(from).toHaveBeenCalledWith('booking_audit_logs')
    expect(insert).toHaveBeenCalledWith({
      booking_id: 'booking-1',
      location_id: 'location-1',
      action_type: 'rescheduled',
      actor_identifier: 'customer-portal',
      before_data: { start_time: 'before' },
      after_data: { start_time: 'after' },
      metadata: { source: 'customer-portal' },
    })
  })
})
