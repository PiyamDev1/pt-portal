import { describe, expect, it } from 'vitest'
import { resolveAppointmentStartTime } from '@/lib/bookingTimeSelection'

describe('resolveAppointmentStartTime', () => {
  it('preserves an explicitly chosen alternative slot when it is still available', () => {
    const originalSlot = '2026-07-02T09:00:00.000Z'
    const alternativeSlot = '2026-07-02T10:30:00.000Z'

    const result = resolveAppointmentStartTime({
      availableSlots: [{ isoString: originalSlot }, { isoString: alternativeSlot }],
      currentStartTime: alternativeSlot,
      editingBookingStartTime: originalSlot,
      isEditing: true,
    })

    expect(result).toBe(alternativeSlot)
  })

  it('keeps the original booking time while editing when no alternative selection has been made', () => {
    const originalSlot = '2026-07-02T09:00:00.000Z'

    const result = resolveAppointmentStartTime({
      availableSlots: [{ isoString: originalSlot }],
      currentStartTime: originalSlot,
      editingBookingStartTime: originalSlot,
      isEditing: true,
    })

    expect(result).toBe(originalSlot)
  })

  it('falls back to the original booking time when a stale alternative selection is no longer available', () => {
    const originalSlot = '2026-07-02T09:00:00.000Z'
    const alternativeSlot = '2026-07-02T10:30:00.000Z'

    const result = resolveAppointmentStartTime({
      availableSlots: [{ isoString: originalSlot }],
      currentStartTime: alternativeSlot,
      editingBookingStartTime: originalSlot,
      isEditing: true,
    })

    expect(result).toBe(originalSlot)
  })
})
