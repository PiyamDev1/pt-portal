export interface ResolveAppointmentStartTimeOptions {
  availableSlots: Array<{ isoString: string }>
  currentStartTime: string
  editingBookingStartTime?: string
  isEditing?: boolean
}

export function resolveAppointmentStartTime({
  availableSlots,
  currentStartTime,
  editingBookingStartTime,
  isEditing = false,
}: ResolveAppointmentStartTimeOptions): string {
  if (availableSlots.length === 0) {
    return isEditing && currentStartTime === editingBookingStartTime ? currentStartTime : ''
  }

  const hasCurrentSelection = availableSlots.some((slot) => slot.isoString === currentStartTime)
  if (hasCurrentSelection) {
    return currentStartTime
  }

  if (isEditing && editingBookingStartTime) {
    const stillAvailable = availableSlots.find((slot) => slot.isoString === editingBookingStartTime)
    if (stillAvailable) {
      return stillAvailable.isoString
    }
  }

  return availableSlots[0]?.isoString ?? ''
}
