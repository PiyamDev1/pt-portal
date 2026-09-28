export type BookingServiceRuleShape = {
  person_count_excludes_family_head?: boolean
  close_overrun_tolerance_minutes?: number
}

export function getServicePersonUnits(
  service: BookingServiceRuleShape | null | undefined,
  personCount: number,
) {
  if (service?.person_count_excludes_family_head === false) {
    return Math.max(0, personCount - 1)
  }
  return Math.max(0, personCount)
}

export function hasServiceRuleFields(service: unknown): boolean {
  const candidate = service as BookingServiceRuleShape | null
  return (
    typeof candidate?.person_count_excludes_family_head === 'boolean' &&
    typeof candidate?.close_overrun_tolerance_minutes === 'number'
  )
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

export function extractUtcTimeHHMMSS(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`
}

export function overlapsRangeBeyondToleranceMinutes(
  startMinutes: number,
  occupiedUntilMinutes: number,
  rangeStartMinutes: number | null,
  rangeEndMinutes: number | null,
  toleranceMinutes: number,
): boolean {
  if (rangeStartMinutes === null || rangeEndMinutes === null) return false
  if (occupiedUntilMinutes <= rangeStartMinutes || startMinutes >= rangeEndMinutes) return false
  if (startMinutes >= rangeStartMinutes && startMinutes < rangeEndMinutes) return true
  return occupiedUntilMinutes - rangeStartMinutes > toleranceMinutes
}

export function overlapsRangeBeyondTolerance(
  startMinutes: number,
  occupiedUntilMinutes: number,
  rangeStart: string | null,
  rangeEnd: string | null,
  toleranceMinutes: number,
): boolean {
  return overlapsRangeBeyondToleranceMinutes(
    startMinutes,
    occupiedUntilMinutes,
    rangeStart ? timeToMinutes(rangeStart) : null,
    rangeEnd ? timeToMinutes(rangeEnd) : null,
    toleranceMinutes,
  )
}

export function isValidBookingEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidBookingPhone(value: string): boolean {
  return /^\+\d{1,4}\s[\d\s()-]{6,20}$/.test(value.trim())
}
