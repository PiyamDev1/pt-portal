export type PerformanceSourceFact = {
  id: string
  sourceModule: string
  sourceFactKey: string
  sourceRecordId: string
  eventType: string
  eventVersion: number
  employeeId: string
  ownerEmployeeId: string | null
  effectiveOn: string
  sourcePath: string
  variables: Record<string, unknown>
  createdAt: string
}

export type PerformanceTimeclockEvent = {
  id: string
  eventType: string
  punchType: string
  scannedAt: string | null
  adjustedScannedAt: string | null
  deviceTimestamp: string | null
  adjustedDeviceTimestamp: string | null
}

export type PerformanceMetricSet = {
  ticketsIssued: number
  ticketServices: number
  ticketPassengers: number
  ticketAssists: number
  applications: number
  packages: number
  packagePassengers: number
}

export type PerformanceMonthPoint = PerformanceMetricSet & {
  key: string
  label: string
}

export type PerformanceAttendancePoint = {
  key: string
  label: string
  workedMinutes: number
  daysPresent: number
  completedShifts: number
}

export type PerformanceActivityItem = {
  id: string
  kind: 'ticket' | 'assistance' | 'application' | 'package'
  title: string
  description: string
  effectiveOn: string
  sourcePath: string
}

export type PerformanceApplicationBreakdown = {
  kind: string
  label: string
  count: number
}

export type PerformanceAnalytics = {
  reportingDate: string
  currentMonthKey: string
  currentMonthLabel: string
  current: PerformanceMetricSet
  previous: PerformanceMetricSet
  monthly: PerformanceMonthPoint[]
  applicationBreakdown: PerformanceApplicationBreakdown[]
  recent: PerformanceActivityItem[]
  attendance: {
    current: PerformanceAttendancePoint
    previous: PerformanceAttendancePoint
    monthly: PerformanceAttendancePoint[]
    hasOpenShift: boolean
    incompletePunchCount: number
  }
  lastRecordedAt: string | null
}

const EMPTY_METRICS: PerformanceMetricSet = {
  ticketsIssued: 0,
  ticketServices: 0,
  ticketPassengers: 0,
  ticketAssists: 0,
  applications: 0,
  packages: 0,
  packagePassengers: 0,
}

const APPLICATION_LABELS: Record<string, string> = {
  nadra: 'NADRA',
  passport_pk: 'Pakistani passport',
  passport_gb: 'GB passport',
  visa: 'Visa',
}

const FOLLOW_ON_TICKET_EVENTS = new Set(['ticket_date_changed', 'ticket_reissued'])

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function safeDate(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function monthKey(value: string) {
  return value.slice(0, 7)
}

function monthSeries(reportingDate: string, count = 6) {
  const parsed = safeDate(reportingDate) || new Date()
  return Array.from({ length: count }, (_, index) => {
    const point = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() - (count - 1 - index), 1),
    )
    return {
      key: `${point.getUTCFullYear()}-${String(point.getUTCMonth() + 1).padStart(2, '0')}`,
      label: point.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    }
  })
}

function latestFacts(facts: PerformanceSourceFact[]) {
  const current = new Map<string, PerformanceSourceFact>()
  for (const fact of facts) {
    const key = `${fact.sourceModule}:${fact.sourceFactKey}`
    const existing = current.get(key)
    if (
      !existing ||
      fact.eventVersion > existing.eventVersion ||
      (fact.eventVersion === existing.eventVersion && fact.createdAt > existing.createdAt)
    ) {
      current.set(key, fact)
    }
  }
  return Array.from(current.values())
}

function metricBucket(points: Map<string, PerformanceMonthPoint>, key: string) {
  return points.get(key)
}

function primaryTicketEmployee(fact: PerformanceSourceFact) {
  return (
    stringValue(fact.variables.primary_responsible_employee_id) ||
    fact.ownerEmployeeId ||
    fact.employeeId
  )
}

function applicationEmployee(fact: PerformanceSourceFact) {
  return (
    stringValue(fact.variables.responsible_employee_id) || fact.ownerEmployeeId || fact.employeeId
  )
}

function packageEmployee(fact: PerformanceSourceFact) {
  return stringValue(fact.variables.sales_employee_id) || fact.ownerEmployeeId || fact.employeeId
}

function normalizedSourcePath(fact: PerformanceSourceFact) {
  if (fact.sourceModule === 'ticketing') return '/dashboard/ticketing/ledger'
  return fact.sourcePath
}

function latestTimestamp(current: string | null, candidate: string) {
  return current === null || candidate.localeCompare(current) > 0 ? candidate : current
}

function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function localDateTimeNumbers(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value || 0)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

function londonWallTimeUtc(year: number, monthIndex: number, day: number) {
  const targetWallTime = Date.UTC(year, monthIndex, day)
  let candidate = targetWallTime
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = localDateTimeNumbers(new Date(candidate), 'Europe/London')
    const representedWallTime = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    )
    candidate += targetWallTime - representedWallTime
  }
  return new Date(candidate)
}

function nextLondonMonthStart(value: Date) {
  const local = localDateTimeNumbers(value, 'Europe/London')
  return londonWallTimeUtc(local.year, local.month, 1)
}

export function londonDateStartUtc(value: string) {
  const parsed = safeDate(value)
  if (!parsed) throw new Error('A valid London reporting date is required')
  return londonWallTimeUtc(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
}

function effectivePunchTime(event: PerformanceTimeclockEvent) {
  const value =
    event.adjustedScannedAt ||
    event.scannedAt ||
    event.adjustedDeviceTimestamp ||
    event.deviceTimestamp
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizedPunchType(event: PerformanceTimeclockEvent) {
  const value = (event.punchType || event.eventType || '').trim().toUpperCase()
  if (['IN', 'CLOCK_IN', 'PUNCH_IN'].includes(value)) return 'in'
  if (['OUT', 'CLOCK_OUT', 'PUNCH_OUT'].includes(value)) return 'out'
  return null
}

export function performanceReportingWindow(reportingDate: string, monthCount = 6) {
  const series = monthSeries(reportingDate, monthCount)
  const first = series[0]?.key || reportingDate.slice(0, 7)
  const parsed = safeDate(reportingDate) || new Date()
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0))
  return {
    effectiveFrom: `${first}-01`,
    effectiveTo: end.toISOString().slice(0, 10),
  }
}

export function formatLondonReportingDate(now = new Date()) {
  return localDateParts(now, 'Europe/London')
}

export function buildPerformanceAnalytics(
  rawFacts: PerformanceSourceFact[],
  timeclockEvents: PerformanceTimeclockEvent[],
  employeeId: string,
  reportingDate = formatLondonReportingDate(),
  now = new Date(),
): PerformanceAnalytics {
  const series = monthSeries(reportingDate)
  const points = new Map<string, PerformanceMonthPoint>(
    series.map(({ key, label }) => [key, { key, label, ...EMPTY_METRICS }]),
  )
  const currentMonthKey = reportingDate.slice(0, 7)
  const previousMonthKey = series.at(-2)?.key || ''
  const currentFacts = latestFacts(rawFacts)
  const recent: PerformanceActivityItem[] = []
  const currentApplicationBreakdown = new Map<string, number>()
  let lastRecordedAt: string | null = null

  type TicketRecord = {
    id: string
    effectiveOn: string
    createdAt: string
    sourcePath: string
    primaryEmployeeId: string | null
    assistantEmployeeIds: Set<string>
    passengerCount: number
  }
  const tickets = new Map<string, TicketRecord>()

  for (const fact of currentFacts) {
    if (fact.sourceModule !== 'ticketing') continue
    if (fact.eventType !== 'ticket_issued') continue
    if (stringValue(fact.variables.service_type)?.toUpperCase() !== 'TK') continue
    if (booleanValue(fact.variables.archived) || booleanValue(fact.variables.deleted)) {
      continue
    }

    const existing = tickets.get(fact.sourceRecordId)
    if (existing && existing.createdAt >= fact.createdAt) continue
    tickets.set(fact.sourceRecordId, {
      id: fact.sourceRecordId,
      effectiveOn: fact.effectiveOn,
      createdAt: fact.createdAt,
      sourcePath: normalizedSourcePath(fact),
      primaryEmployeeId: primaryTicketEmployee(fact),
      assistantEmployeeIds: new Set(stringArray(fact.variables.assistant_employee_ids)),
      passengerCount: Math.max(
        numeric(fact.variables.issued_ticket_target_units),
        numeric(fact.variables.passenger_ticket_count),
      ),
    })
  }

  for (const ticket of tickets.values()) {
    const bucket = metricBucket(points, monthKey(ticket.effectiveOn))
    const isPrimary = ticket.primaryEmployeeId === employeeId
    const isAssistant = ticket.assistantEmployeeIds.has(employeeId)
    if (isPrimary && bucket) {
      bucket.ticketsIssued += 1
      bucket.ticketPassengers += Math.max(1, ticket.passengerCount)
      recent.push({
        id: `ticket:${ticket.id}`,
        kind: 'ticket',
        title: 'Ticket issued',
        description: `${Math.max(1, ticket.passengerCount)} passenger ticket${Math.max(1, ticket.passengerCount) === 1 ? '' : 's'}`,
        effectiveOn: ticket.effectiveOn,
        sourcePath: ticket.sourcePath,
      })
      lastRecordedAt = latestTimestamp(lastRecordedAt, ticket.createdAt)
    }
    if (isAssistant && bucket) {
      bucket.ticketAssists += 1
      recent.push({
        id: `assistance:${ticket.id}`,
        kind: 'assistance',
        title: 'Ticket assistance recorded',
        description: `${Math.max(1, ticket.passengerCount)} passenger ticket${Math.max(1, ticket.passengerCount) === 1 ? '' : 's'}`,
        effectiveOn: ticket.effectiveOn,
        sourcePath: ticket.sourcePath,
      })
      lastRecordedAt = latestTimestamp(lastRecordedAt, ticket.createdAt)
    }
  }

  for (const fact of currentFacts) {
    if (fact.sourceModule !== 'ticketing' || !FOLLOW_ON_TICKET_EVENTS.has(fact.eventType)) continue
    const performerId = stringValue(fact.variables.acting_employee_id) || fact.employeeId
    if (performerId !== employeeId) continue
    if (booleanValue(fact.variables.archived) || booleanValue(fact.variables.deleted)) continue
    const bucket = metricBucket(points, monthKey(fact.effectiveOn))
    if (!bucket) continue
    bucket.ticketServices += 1
    recent.push({
      id: `ticket-service:${fact.sourceFactKey}`,
      kind: 'ticket',
      title:
        fact.eventType === 'ticket_reissued' ? 'Ticket reissue completed' : 'Date change completed',
      description: 'After-sales ticket service',
      effectiveOn: fact.effectiveOn,
      sourcePath: normalizedSourcePath(fact),
    })
    lastRecordedAt = latestTimestamp(lastRecordedAt, fact.createdAt)
  }

  for (const fact of currentFacts) {
    if (fact.sourceModule !== 'applications' || fact.eventType !== 'application_completed') continue
    if (applicationEmployee(fact) !== employeeId) continue
    if (
      fact.variables.eligible === false ||
      booleanValue(fact.variables.deleted) ||
      booleanValue(fact.variables.refunded)
    ) {
      continue
    }
    const bucket = metricBucket(points, monthKey(fact.effectiveOn))
    if (!bucket) continue
    const count = Math.max(1, numeric(fact.variables.application_count))
    const kind = stringValue(fact.variables.application_kind) || 'application'
    bucket.applications += count
    if (monthKey(fact.effectiveOn) === currentMonthKey) {
      currentApplicationBreakdown.set(kind, (currentApplicationBreakdown.get(kind) || 0) + count)
    }
    recent.push({
      id: `application:${fact.sourceFactKey}`,
      kind: 'application',
      title: `${APPLICATION_LABELS[kind] || 'Application'} completed`,
      description: 'Completed application record',
      effectiveOn: fact.effectiveOn,
      sourcePath: fact.sourcePath,
    })
    lastRecordedAt = latestTimestamp(lastRecordedAt, fact.createdAt)
  }

  type PackageGroup = {
    id: string
    effectiveOn: string
    createdAt: string
    passengerCount: number
    sourcePath: string
    linked: boolean
  }
  const packages = new Map<string, PackageGroup>()
  for (const fact of currentFacts) {
    if (fact.sourceModule !== 'packages' || fact.eventType !== 'package_closed') continue
    if (packageEmployee(fact) !== employeeId) continue
    if (fact.variables.authoritative !== true) continue
    const groupId = stringValue(fact.variables.group_id)
    const key = groupId ? `group:${groupId}` : `package:${fact.sourceRecordId}`
    const existing = packages.get(key)
    const passengerCount = Math.max(0, numeric(fact.variables.passenger_count))
    if (!existing) {
      packages.set(key, {
        id: key,
        effectiveOn: fact.effectiveOn,
        createdAt: fact.createdAt,
        passengerCount,
        sourcePath: fact.sourcePath,
        linked: Boolean(groupId),
      })
      continue
    }
    existing.passengerCount += passengerCount
    if (fact.effectiveOn >= existing.effectiveOn) {
      existing.effectiveOn = fact.effectiveOn
      existing.sourcePath = fact.sourcePath
    }
    if (fact.createdAt > existing.createdAt) existing.createdAt = fact.createdAt
  }

  for (const packageItem of packages.values()) {
    const bucket = metricBucket(points, monthKey(packageItem.effectiveOn))
    if (!bucket) continue
    bucket.packages += 1
    bucket.packagePassengers += packageItem.passengerCount
    recent.push({
      id: packageItem.id,
      kind: 'package',
      title: packageItem.linked ? 'Linked package group closed' : 'Package closed',
      description: `${packageItem.passengerCount} passenger${packageItem.passengerCount === 1 ? '' : 's'}`,
      effectiveOn: packageItem.effectiveOn,
      sourcePath: packageItem.sourcePath,
    })
    lastRecordedAt = latestTimestamp(lastRecordedAt, packageItem.createdAt)
  }

  const attendancePoints = new Map<string, PerformanceAttendancePoint>(
    series.map(({ key, label }) => [
      key,
      { key, label, workedMinutes: 0, daysPresent: 0, completedShifts: 0 },
    ]),
  )
  const attendanceDays = new Map<string, Set<string>>()
  const punches = timeclockEvents
    .map((event) => ({ event, type: normalizedPunchType(event), at: effectivePunchTime(event) }))
    .filter((item): item is { event: PerformanceTimeclockEvent; type: 'in' | 'out'; at: Date } =>
      Boolean(item.type && item.at),
    )
    .filter((item) => item.at <= now)
    .sort((left, right) => left.at.getTime() - right.at.getTime())

  let openPunch: (typeof punches)[number] | null = null
  let incompletePunchCount = 0
  const isInReportingWindow = (punch: (typeof punches)[number]) =>
    attendancePoints.has(localDateParts(punch.at, 'Europe/London').slice(0, 7))
  for (const punch of punches) {
    if (punch.type === 'in') {
      if (openPunch && isInReportingWindow(openPunch)) incompletePunchCount += 1
      openPunch = punch
      const day = localDateParts(punch.at, 'Europe/London')
      const key = day.slice(0, 7)
      if (attendancePoints.has(key)) {
        if (!attendanceDays.has(key)) attendanceDays.set(key, new Set())
        attendanceDays.get(key)?.add(day)
      }
      continue
    }
    if (!openPunch) {
      if (isInReportingWindow(punch)) incompletePunchCount += 1
      continue
    }
    const duration = Math.round((punch.at.getTime() - openPunch.at.getTime()) / 60_000)
    const startDay = localDateParts(openPunch.at, 'Europe/London')
    const startBucket = attendancePoints.get(startDay.slice(0, 7))
    if (duration > 0 && duration <= 20 * 60) {
      if (startBucket) startBucket.completedShifts += 1

      let segmentStart = openPunch.at
      while (segmentStart < punch.at) {
        const segmentKey = localDateParts(segmentStart, 'Europe/London').slice(0, 7)
        const boundary = nextLondonMonthStart(segmentStart)
        const segmentEnd = boundary < punch.at ? boundary : punch.at
        const segmentMinutes = (segmentEnd.getTime() - segmentStart.getTime()) / 60_000
        const segmentBucket = attendancePoints.get(segmentKey)
        if (segmentBucket) segmentBucket.workedMinutes += segmentMinutes
        if (segmentEnd <= segmentStart) break
        segmentStart = segmentEnd
      }
    } else {
      if (isInReportingWindow(openPunch)) incompletePunchCount += 1
      if (isInReportingWindow(punch)) incompletePunchCount += 1
    }
    openPunch = null
  }
  const openPunchAge = openPunch ? now.getTime() - openPunch.at.getTime() : Number.POSITIVE_INFINITY
  const hasOpenShift = Boolean(openPunch && openPunchAge >= 0 && openPunchAge <= 20 * 60 * 60_000)
  if (openPunch && !hasOpenShift && isInReportingWindow(openPunch)) incompletePunchCount += 1
  for (const [key, days] of attendanceDays) {
    const bucket = attendancePoints.get(key)
    if (bucket) bucket.daysPresent = days.size
  }

  const monthly = Array.from(points.values())
  const attendanceMonthly = Array.from(attendancePoints.values())
  const emptyAttendance = (key: string): PerformanceAttendancePoint => ({
    key,
    label: '',
    workedMinutes: 0,
    daysPresent: 0,
    completedShifts: 0,
  })

  return {
    reportingDate,
    currentMonthKey,
    currentMonthLabel:
      safeDate(`${currentMonthKey}-01`)?.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }) || currentMonthKey,
    current: points.get(currentMonthKey) || { ...EMPTY_METRICS },
    previous: points.get(previousMonthKey) || { ...EMPTY_METRICS },
    monthly,
    applicationBreakdown: Array.from(currentApplicationBreakdown.entries())
      .map(([kind, count]) => ({ kind, label: APPLICATION_LABELS[kind] || 'Other', count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    recent: recent
      .sort(
        (left, right) =>
          right.effectiveOn.localeCompare(left.effectiveOn) || right.id.localeCompare(left.id),
      )
      .slice(0, 12),
    attendance: {
      current: attendancePoints.get(currentMonthKey) || emptyAttendance(currentMonthKey),
      previous: attendancePoints.get(previousMonthKey) || emptyAttendance(previousMonthKey),
      monthly: attendanceMonthly,
      hasOpenShift,
      incompletePunchCount,
    },
    lastRecordedAt,
  }
}
