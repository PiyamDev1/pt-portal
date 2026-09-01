import type { DefaultBranchSchedule } from '@/lib/bookingBranchSchedule'

export const CUSTOMER_AVAILABLE_DATE_WINDOW_DAYS = 35

export interface AvailabilityService {
  id: string
  duration_minutes: number
  buffer_minutes: number
  available_days: number[] | null
  service_start_time: string | null
  service_end_time: string | null
  duration_per_additional_person_minutes: number
  person_count_excludes_family_head: boolean
  close_overrun_tolerance_minutes: number
}

export type AvailabilityScheduleOverride = Partial<DefaultBranchSchedule> | null

export interface AvailabilityCandidate {
  service_id: string
  location_id: string
  starts_at: string
  ends_at: string
  occupied_until: string
  group_size: number
  capacity: number
  expires_at: string
  available: number
}

function servicePersonUnits(service: AvailabilityService, groupSize: number) {
  return service.person_count_excludes_family_head ? groupSize : Math.max(0, groupSize - 1)
}

export function serviceDurationMinutes(service: AvailabilityService, groupSize: number) {
  return (
    service.duration_minutes +
    servicePersonUnits(service, groupSize) *
      Math.max(0, service.duration_per_additional_person_minutes)
  )
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

function maxTime(left: string | null, right: string | null) {
  if (!left) return right
  if (!right) return left
  return timeToMinutes(left) >= timeToMinutes(right) ? left : right
}

function minTime(left: string | null, right: string | null) {
  if (!left) return right
  if (!right) return left
  return timeToMinutes(left) <= timeToMinutes(right) ? left : right
}

function minutesToIso(date: string, minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return new Date(
    `${date}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00Z`,
  ).toISOString()
}

function overlapsBreak(
  start: number,
  occupiedUntil: number,
  breakStart: string | null,
  breakEnd: string | null,
  tolerance: number,
) {
  if (!breakStart || !breakEnd) return false
  const rangeStart = timeToMinutes(breakStart)
  const rangeEnd = timeToMinutes(breakEnd)
  if (occupiedUntil <= rangeStart || start >= rangeEnd) return false
  if (start >= rangeStart && start < rangeEnd) return true
  return occupiedUntil - rangeStart > tolerance
}

function occupiedUntilMs(booking: Record<string, unknown>) {
  const end = new Date(String(booking.end_time)).getTime()
  const relation = Array.isArray(booking.booking_services)
    ? booking.booking_services[0]
    : booking.booking_services
  const buffer = Number((relation as { buffer_minutes?: number } | null)?.buffer_minutes ?? 0)
  return end + Math.max(0, buffer) * 60_000
}

function countOverlaps(
  bookings: Record<string, unknown>[],
  startIso: string,
  occupiedUntilIso: string,
) {
  const start = Date.parse(startIso)
  const end = Date.parse(occupiedUntilIso)
  return bookings.filter(
    (booking) => Date.parse(String(booking.start_time)) < end && occupiedUntilMs(booking) > start,
  ).length
}

export function buildAvailabilityCandidates(input: {
  service: AvailabilityService
  locationId: string
  date: string
  groupSize: number
  settings: DefaultBranchSchedule
  override: AvailabilityScheduleOverride
  bookings: Record<string, unknown>[]
  nowMs?: number
}): AvailabilityCandidate[] {
  const requestedDate = new Date(`${input.date}T00:00:00.000Z`)
  const day = requestedDate.getUTCDay()
  if (input.service.available_days?.length && !input.service.available_days.includes(day)) {
    return []
  }
  if (input.settings.is_closed || input.override?.is_closed) return []

  const open = maxTime(
    input.override?.open_time ?? input.settings.open_time,
    input.service.service_start_time,
  )
  const close = minTime(
    input.override?.close_time ?? input.settings.close_time,
    input.service.service_end_time,
  )
  if (!open || !close || timeToMinutes(open) >= timeToMinutes(close)) return []

  const lunchStart = input.override?.lunch_start_time ?? input.settings.lunch_start_time
  const lunchEnd = input.override?.lunch_end_time ?? input.settings.lunch_end_time
  const prayerStart = input.override?.prayer_start_time ?? input.settings.prayer_start_time
  const prayerEnd = input.override?.prayer_end_time ?? input.settings.prayer_end_time
  const capacity = Math.max(1, input.override?.concurrent_staff ?? input.settings.concurrent_staff)
  const duration = serviceDurationMinutes(input.service, input.groupSize)
  const occupancy = duration + Math.max(0, input.service.buffer_minutes)
  const tolerance = Math.max(0, input.service.close_overrun_tolerance_minutes)
  const nowMs = input.nowMs ?? Date.now()
  const expiresAt = new Date(nowMs + 15 * 60 * 1000).toISOString()
  const candidates: AvailabilityCandidate[] = []

  let current = timeToMinutes(open)
  const closeMinutes = timeToMinutes(close)
  while (current + duration <= closeMinutes + tolerance) {
    const occupiedUntilMinutes = current + occupancy
    if (occupiedUntilMinutes > closeMinutes + tolerance) break
    if (
      overlapsBreak(current, occupiedUntilMinutes, lunchStart, lunchEnd, tolerance) ||
      overlapsBreak(current, occupiedUntilMinutes, prayerStart, prayerEnd, tolerance)
    ) {
      current += 5
      continue
    }

    const startsAt = minutesToIso(input.date, current)
    const endsAt = minutesToIso(input.date, current + duration)
    const occupiedUntil = minutesToIso(input.date, occupiedUntilMinutes)
    const available = capacity - countOverlaps(input.bookings, startsAt, occupiedUntil)
    if (available > 0 && Date.parse(startsAt) > nowMs) {
      candidates.push({
        service_id: input.service.id,
        location_id: input.locationId,
        starts_at: startsAt,
        ends_at: endsAt,
        occupied_until: occupiedUntil,
        group_size: input.groupSize,
        capacity,
        expires_at: expiresAt,
        available,
      })
    }
    current += 5
  }

  return candidates
}
