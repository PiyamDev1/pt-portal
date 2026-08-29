const DAY_MS = 24 * 60 * 60 * 1000

export type TicketFlightCheckKind = 'weekly' | 'predeparture'

export function ticketingFlightCheckKind(input: {
  now: Date
  departureAtUtc: string
  weeklyIntervalDays: number
  predepartureHours: number
  lastWeeklyCheckedAt: string | null
  predepartureCheckedAt: string | null
}): TicketFlightCheckKind | null {
  const departureAt = new Date(input.departureAtUtc).getTime()
  if (!Number.isFinite(departureAt)) return null

  const untilDeparture = departureAt - input.now.getTime()
  if (untilDeparture <= 0) return null

  // The production scheduler runs once daily. Opening the final-check window
  // one cadence early means an on-time run completes it by the configured
  // deadline instead of up to 24 hours afterwards.
  const predepartureDueMs = (input.predepartureHours * 60 * 60 + 24 * 60 * 60) * 1000
  if (untilDeparture <= predepartureDueMs) {
    return input.predepartureCheckedAt ? null : 'predeparture'
  }

  const lastWeeklyCheckedAt = input.lastWeeklyCheckedAt
    ? new Date(input.lastWeeklyCheckedAt).getTime()
    : 0
  const weeklyIntervalMs = input.weeklyIntervalDays * DAY_MS
  return input.now.getTime() - lastWeeklyCheckedAt >= weeklyIntervalMs ? 'weekly' : null
}
