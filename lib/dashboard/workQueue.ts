export type DashboardAttentionSeverity = 'critical' | 'warning' | 'info'

export type DashboardAttentionItem = {
  id: string
  moduleId: 'bookings' | 'ticketing' | 'lms' | 'applications'
  moduleLabel: string
  severity: DashboardAttentionSeverity
  title: string
  detail: string
  count: number
  date: string
  dateLabel: string
  reference: string
  href: string
}

export type BookingQueueSnapshot = {
  available: boolean
  pendingCount: number
  earliestStartAt: string | null
  locationName: string
}

export type TicketingQueueSnapshot = {
  available: boolean
  dueTimeLimitCount: number
  earliestTimeLimitAt: string | null
  openScheduleChangeCount: number
  earliestAffectedDepartureAt: string | null
}

export type LmsQueueSnapshot = {
  available: boolean
  overdueAccountCount: number
  dueSoonAccountCount: number
  loadedAt: string
}

export type ApplicationsQueueSnapshot = {
  available: boolean
  partial: boolean
  attentionCount: number
  statusFollowUpCount: number
  missingDocumentsCount: number
  stalledCount: number
  oldestAttentionAt: string | null
}

export type DashboardWorkQueue = {
  generatedAt: string
  items: DashboardAttentionItem[]
  unavailableProviders: string[]
}

type BuildDashboardWorkQueueInput = {
  generatedAt: string
  visibleModuleIds: Iterable<string>
  bookings?: BookingQueueSnapshot
  ticketing?: TicketingQueueSnapshot
  lms?: LmsQueueSnapshot
  applications?: ApplicationsQueueSnapshot
}

const SEVERITY_ORDER: Record<DashboardAttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function safeCount(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function validDate(value: string | null | undefined, fallback: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return fallback
  return value
}

function isWithinHours(value: string, generatedAt: string, hours: number) {
  return new Date(value).getTime() <= new Date(generatedAt).getTime() + hours * 60 * 60 * 1000
}

function isOlderThanDays(value: string, generatedAt: string, days: number) {
  return new Date(value).getTime() < new Date(generatedAt).getTime() - days * 24 * 60 * 60 * 1000
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return count === 1 ? singular : pluralValue
}

/**
 * Converts small, source-owned summaries into one read-only dashboard queue.
 * No source record is copied or changed here; every item links back to its owner.
 */
export function buildDashboardWorkQueue(input: BuildDashboardWorkQueueInput): DashboardWorkQueue {
  const visibleModules = new Set(input.visibleModuleIds)
  const unavailableProviders: string[] = []
  const items: DashboardAttentionItem[] = []

  if (visibleModules.has('bookings')) {
    if (!input.bookings?.available) {
      unavailableProviders.push('Bookings')
    } else {
      const count = safeCount(input.bookings.pendingCount)
      if (count > 0) {
        const date = validDate(input.bookings.earliestStartAt, input.generatedAt)
        items.push({
          id: 'bookings-pending',
          moduleId: 'bookings',
          moduleLabel: 'Bookings',
          severity: isWithinHours(date, input.generatedAt, 24) ? 'critical' : 'warning',
          title: `${count} unconfirmed ${plural(count, 'appointment')}`,
          detail: 'Pending appointments starting within the next seven days.',
          count,
          date,
          dateLabel: 'Next appointment',
          reference: `Bookings · ${input.bookings.locationName}`,
          href: '/dashboard/bookings?status=pending',
        })
      }
    }
  }

  if (visibleModules.has('ticketing')) {
    if (!input.ticketing?.available) {
      unavailableProviders.push('Ticketing')
    } else {
      const timeLimitCount = safeCount(input.ticketing.dueTimeLimitCount)
      if (timeLimitCount > 0) {
        const date = validDate(input.ticketing.earliestTimeLimitAt, input.generatedAt)
        items.push({
          id: 'ticketing-time-limits',
          moduleId: 'ticketing',
          moduleLabel: 'Ticketing',
          severity: isWithinHours(date, input.generatedAt, 6) ? 'critical' : 'warning',
          title: `${timeLimitCount} ${plural(timeLimitCount, 'time limit')} due`,
          detail: 'Your held ticket bookings reaching their airline deadline within 48 hours.',
          count: timeLimitCount,
          date,
          dateLabel: 'Earliest deadline',
          reference: 'Ticketing · my held bookings',
          href: '/dashboard/ticketing/ledger?status=held',
        })
      }

      const scheduleCount = safeCount(input.ticketing.openScheduleChangeCount)
      if (scheduleCount > 0) {
        const date = validDate(input.ticketing.earliestAffectedDepartureAt, input.generatedAt)
        items.push({
          id: 'ticketing-schedule-changes',
          moduleId: 'ticketing',
          moduleLabel: 'Ticketing',
          severity: isWithinHours(date, input.generatedAt, 24) ? 'critical' : 'warning',
          title: `${scheduleCount} open ${plural(scheduleCount, 'schedule change')}`,
          detail: 'Upcoming flight changes still need review or finalisation.',
          count: scheduleCount,
          date,
          dateLabel: 'Earliest departure',
          reference: 'Ticketing · flight monitoring',
          href: '/dashboard/ticketing#flight-monitoring',
        })
      }
    }
  }

  if (visibleModules.has('lms')) {
    if (!input.lms?.available) {
      unavailableProviders.push('LMS')
    } else {
      const overdueCount = safeCount(input.lms.overdueAccountCount)
      if (overdueCount > 0) {
        items.push({
          id: 'lms-overdue',
          moduleId: 'lms',
          moduleLabel: 'LMS',
          severity: 'warning',
          title: `${overdueCount} overdue ${plural(overdueCount, 'account')}`,
          detail: 'Company-wide customer accounts with an overdue instalment.',
          count: overdueCount,
          date: validDate(input.lms.loadedAt, input.generatedAt),
          dateLabel: 'Checked',
          reference: 'LMS · overdue accounts',
          href: '/dashboard/lms?filter=overdue',
        })
      }

      const dueSoonCount = safeCount(input.lms.dueSoonAccountCount)
      if (dueSoonCount > 0) {
        items.push({
          id: 'lms-due-soon',
          moduleId: 'lms',
          moduleLabel: 'LMS',
          severity: 'info',
          title: `${dueSoonCount} ${plural(dueSoonCount, 'account')} due soon`,
          detail: 'Company-wide customer accounts approaching their next instalment date.',
          count: dueSoonCount,
          date: validDate(input.lms.loadedAt, input.generatedAt),
          dateLabel: 'Checked',
          reference: 'LMS · active accounts',
          href: '/dashboard/lms?filter=active',
        })
      }
    }
  }

  if (visibleModules.has('applications')) {
    if (!input.applications?.available) {
      unavailableProviders.push('Applications')
    } else {
      if (input.applications.partial) unavailableProviders.push('Applications (partial)')

      const count = safeCount(input.applications.attentionCount)
      if (count > 0) {
        const date = validDate(input.applications.oldestAttentionAt, input.generatedAt)
        const detailParts = (
          [
            [
              safeCount(input.applications.statusFollowUpCount),
              'status follow-up',
              'status follow-ups',
            ],
            [
              safeCount(input.applications.missingDocumentsCount),
              'record with no linked documents',
              'records with no linked documents',
            ],
            [
              safeCount(input.applications.stalledCount),
              'record over 7 days',
              'records over 7 days',
            ],
          ] as Array<[number, string, string]>
        )
          .filter(([partCount]) => partCount > 0)
          .map(
            ([partCount, singular, pluralValue]) =>
              `${partCount} ${plural(partCount, singular, pluralValue)}`,
          )

        items.push({
          id: 'applications-attention',
          moduleId: 'applications',
          moduleLabel: 'Applications',
          severity: isOlderThanDays(date, input.generatedAt, 14) ? 'critical' : 'warning',
          title: `${count} ${plural(count, 'application')} need review`,
          detail:
            detailParts.length > 0
              ? `${detailParts.join(', ')}.`
              : 'Application records flagged by the shared summary.',
          count,
          date,
          dateLabel: 'Oldest record',
          reference: 'Applications - shared summary',
          href: '/dashboard/applications#attention',
        })
      }
    }
  }

  items.sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      new Date(left.date).getTime() - new Date(right.date).getTime() ||
      left.id.localeCompare(right.id),
  )

  return { generatedAt: input.generatedAt, items, unavailableProviders }
}
