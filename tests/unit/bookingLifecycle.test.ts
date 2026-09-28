import { describe, expect, it, vi } from 'vitest'

import {
  closeBookingWithCapacity,
  createBookingWithCapacity,
  rescheduleBookingWithCapacity,
} from '@/lib/bookingLifecycle'

const nextCapacity = {
  bookingId: 'booking-1',
  locationId: 'location-1',
  startTime: '2026-10-01T11:00:00.000Z',
  occupiedUntil: '2026-10-01T11:45:00.000Z',
  capacity: 2,
}

function lifecycleClient(
  rpc: ReturnType<typeof vi.fn>,
  previous: Record<string, unknown> | null = {
    location_id: 'location-1',
    seat_number: 2,
    start_time: '2026-10-01T10:00:00.000Z',
    occupied_until: '2026-10-01T10:45:00.000Z',
  },
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: previous, error: null })
  const is = vi.fn(() => ({ maybeSingle }))
  const eq = vi.fn(() => ({ is }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))

  return { client: { rpc, from }, from, select, eq, is, maybeSingle }
}

describe('booking lifecycle orchestration', () => {
  it('removes a newly inserted booking when its capacity reservation loses the race', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ success: false, seat_number: null, error: 'No available staff' }],
      error: null,
    })
    const rollbackBooking = vi.fn().mockResolvedValue({ error: null })

    const result = await createBookingWithCapacity(
      { rpc },
      {
        createBooking: async () => ({ data: { id: 'booking-1' }, error: null }),
        capacityFor: () => nextCapacity,
        rollbackBooking,
      },
    )

    expect(result).toEqual({
      success: false,
      stage: 'capacity',
      error: 'No available staff',
      rollbackError: null,
    })
    expect(rollbackBooking).toHaveBeenCalledWith({ id: 'booking-1' })
  })

  it('restores the previous reservation window when a new slot is unavailable', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ success: false, seat_number: null, error: 'No available staff' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ success: true, seat_number: 2, error: null }],
        error: null,
      })
    const { client } = lifecycleClient(rpc)
    const updateBooking = vi.fn()

    const result = await rescheduleBookingWithCapacity(client, {
      nextCapacity,
      updateBooking,
    })

    expect(result).toMatchObject({
      success: false,
      stage: 'capacity',
      error: 'No available staff',
      rollbackError: null,
    })
    expect(updateBooking).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenNthCalledWith(2, 'reserve_booking_capacity', {
      p_booking_id: 'booking-1',
      p_location_id: 'location-1',
      p_start_time: '2026-10-01T10:00:00.000Z',
      p_occupied_until: '2026-10-01T10:45:00.000Z',
      p_capacity: 2,
    })
  })

  it('restores the previous reservation when the booking update conflicts', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ success: true, seat_number: 1, error: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ success: true, seat_number: 2, error: null }],
        error: null,
      })
    const { client } = lifecycleClient(rpc)

    const result = await rescheduleBookingWithCapacity(client, {
      nextCapacity,
      updateBooking: async () => ({ data: null, error: { message: 'Update conflict' } }),
    })

    expect(result).toMatchObject({
      success: false,
      stage: 'update',
      error: { message: 'Update conflict' },
      rollbackError: null,
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('releases capacity only after a cancellation update succeeds', async () => {
    const sequence: string[] = []
    const rpc = vi.fn(async () => {
      sequence.push('release')
      return { data: null, error: null }
    })

    const result = await closeBookingWithCapacity(
      { rpc },
      {
        bookingId: 'booking-1',
        updateBooking: async () => {
          sequence.push('update')
          return { data: { id: 'booking-1' }, error: null }
        },
      },
    )

    expect(result).toEqual({
      success: true,
      data: { id: 'booking-1' },
      capacityWarning: null,
    })
    expect(sequence).toEqual(['update', 'release'])
  })
})
