export interface DefaultBranchSchedule {
  day_of_week: number
  open_time: string
  close_time: string
  lunch_start_time: string | null
  lunch_end_time: string | null
  prayer_start_time: string | null
  prayer_end_time: string | null
  is_closed: boolean
  concurrent_staff: number
  slot_interval_minutes: number
}

export function buildDefaultBranchSchedule(dayOfWeek: number): DefaultBranchSchedule {
  return {
    day_of_week: dayOfWeek,
    open_time: '09:00',
    close_time: '17:00',
    lunch_start_time: '13:00',
    lunch_end_time: '14:00',
    prayer_start_time: dayOfWeek === 5 ? '13:00' : null,
    prayer_end_time: dayOfWeek === 5 ? '14:00' : null,
    is_closed: dayOfWeek === 0,
    concurrent_staff: 1,
    slot_interval_minutes: 30,
  }
}