export const APPLICATION_SOURCE_KEYS = ['nadra', 'pak-passport', 'gb-passport', 'visa'] as const

export type ApplicationSourceKey = (typeof APPLICATION_SOURCE_KEYS)[number]

export type ApplicationAttentionReason = 'status_follow_up' | 'missing_documents' | 'stalled'

export type ApplicationSummaryRecordSeed = {
  id: string
  applicantName: string
  serviceLabel: string
  status: string
  createdAt: string
  trackingNumber: string
  hasDocuments: boolean | null
}

export type ApplicationSummaryRecord = ApplicationSummaryRecordSeed & {
  service: ApplicationSourceKey
  attentionReasons: ApplicationAttentionReason[]
}

export type ApplicationAgingBreakdown = {
  zeroToTwo: number
  threeToSeven: number
  eightPlus: number
}

export type ApplicationSourceMetrics = {
  total: number
  active: number
  done: number
  attention: number
  statusFollowUp: number
  missingDocuments: number
  stalled: number
  aging: ApplicationAgingBreakdown
  newToday: number
  newWeek: number
  doneWeek: number
}

export type ApplicationSourceSummary = {
  key: ApplicationSourceKey
  label: string
  title: string
  href: string
  available: boolean
  metrics: ApplicationSourceMetrics
}

export type ApplicationSummaryWarning = {
  source: ApplicationSourceKey
  label: string
  message: string
}

export type ApplicationSummaryTotals = ApplicationSourceMetrics

export type ApplicationSummary = {
  generatedAt: string
  ageBasis: 'created_at'
  totals: ApplicationSummaryTotals
  sources: Record<ApplicationSourceKey, ApplicationSourceSummary>
  recent: ApplicationSummaryRecord[]
  attentionItems: ApplicationSummaryRecord[]
  warnings: ApplicationSummaryWarning[]
}

export type ApplicationSourceLoad = {
  available: boolean
  records: ApplicationSummaryRecordSeed[]
}

type BuildApplicationSummaryInput = {
  generatedAt: string
  sources: Record<ApplicationSourceKey, ApplicationSourceLoad>
  recentLimit?: number
  attentionLimit?: number
}

type SourceDefinition = {
  label: string
  title: string
  href: string
  activeStatuses: ReadonlySet<string>
  doneStatuses: ReadonlySet<string>
  followUpStatuses: ReadonlySet<string>
  supportsDocumentMarker: boolean
}

const SOURCE_DEFINITIONS: Record<ApplicationSourceKey, SourceDefinition> = {
  nadra: {
    label: 'NADRA',
    title: 'NADRA Services',
    href: '/dashboard/applications/nadra',
    activeStatuses: new Set(['Pending Submission', 'Submitted', 'In Progress']),
    doneStatuses: new Set(['Completed']),
    followUpStatuses: new Set(['Pending Submission']),
    supportsDocumentMarker: false,
  },
  'pak-passport': {
    label: 'Pakistani Passport',
    title: 'PAK Passports',
    href: '/dashboard/applications/passports',
    activeStatuses: new Set([
      'Pending Submission',
      'Biometrics Taken',
      'Processing',
      'Approved',
      'Passport Arrived',
    ]),
    doneStatuses: new Set(['Collected']),
    followUpStatuses: new Set(['Passport Arrived']),
    supportsDocumentMarker: true,
  },
  'gb-passport': {
    label: 'British Passport',
    title: 'GB Passports',
    href: '/dashboard/applications/passports-gb',
    activeStatuses: new Set(['Pending Submission', 'Submitted', 'In Progress']),
    doneStatuses: new Set(['Completed']),
    followUpStatuses: new Set(['Pending Submission']),
    supportsDocumentMarker: false,
  },
  visa: {
    label: 'Visa',
    title: 'Visas',
    href: '/dashboard/applications/visa',
    activeStatuses: new Set(['Pending']),
    doneStatuses: new Set(['Approved']),
    followUpStatuses: new Set(['Pending']),
    supportsDocumentMarker: false,
  },
}

const DAY_MS = 24 * 60 * 60 * 1000

function emptyMetrics(): ApplicationSourceMetrics {
  return {
    total: 0,
    active: 0,
    done: 0,
    attention: 0,
    statusFollowUp: 0,
    missingDocuments: 0,
    stalled: 0,
    aging: { zeroToTwo: 0, threeToSeven: 0, eightPlus: 0 },
    newToday: 0,
    newWeek: 0,
    doneWeek: 0,
  }
}

function cleanText(value: string, fallback: string) {
  return value.trim().replace(/\s+/g, ' ') || fallback
}

function dateTime(value: string) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function addMetrics(target: ApplicationSourceMetrics, source: ApplicationSourceMetrics) {
  target.total += source.total
  target.active += source.active
  target.done += source.done
  target.attention += source.attention
  target.statusFollowUp += source.statusFollowUp
  target.missingDocuments += source.missingDocuments
  target.stalled += source.stalled
  target.aging.zeroToTwo += source.aging.zeroToTwo
  target.aging.threeToSeven += source.aging.threeToSeven
  target.aging.eightPlus += source.aging.eightPlus
  target.newToday += source.newToday
  target.newWeek += source.newWeek
  target.doneWeek += source.doneWeek
}

export function getApplicationSourceVisibility(
  roleName: string,
): Record<ApplicationSourceKey, boolean> {
  const role = String(roleName || '').toLowerCase()
  const allVisible: Record<ApplicationSourceKey, boolean> = {
    nadra: true,
    'pak-passport': true,
    'gb-passport': true,
    visa: true,
  }

  if (!role) return allVisible
  if (role.includes('nadra')) {
    return { nadra: true, 'pak-passport': false, 'gb-passport': false, visa: false }
  }
  if (role.includes('visa')) {
    return { nadra: false, 'pak-passport': false, 'gb-passport': false, visa: true }
  }
  if (role.includes('passport')) {
    return { nadra: false, 'pak-passport': true, 'gb-passport': true, visa: false }
  }

  return allVisible
}

export function totalVisibleApplicationMetrics(
  summary: ApplicationSummary,
  visibility: Record<ApplicationSourceKey, boolean>,
) {
  const totals = emptyMetrics()
  for (const source of APPLICATION_SOURCE_KEYS) {
    if (visibility[source]) addMetrics(totals, summary.sources[source].metrics)
  }
  return totals
}

function summarizeSource(
  source: ApplicationSourceKey,
  records: ApplicationSummaryRecordSeed[],
  now: number,
) {
  const definition = SOURCE_DEFINITIONS[source]
  const metrics = emptyMetrics()
  const normalizedRecords: ApplicationSummaryRecord[] = []

  for (const seed of records) {
    const status = cleanText(seed.status, 'Unknown')
    const createdAt = seed.createdAt || ''
    const createdTime = dateTime(createdAt)
    const active = definition.activeStatuses.has(status)
    const done = definition.doneStatuses.has(status)
    const attentionReasons: ApplicationAttentionReason[] = []

    metrics.total += 1
    if (active) metrics.active += 1
    if (done) metrics.done += 1

    if (definition.followUpStatuses.has(status)) {
      metrics.statusFollowUp += 1
      attentionReasons.push('status_follow_up')
    }

    if (definition.supportsDocumentMarker && active && seed.hasDocuments === false) {
      metrics.missingDocuments += 1
      attentionReasons.push('missing_documents')
    }

    if (createdTime !== null && createdTime <= now) {
      const age = Math.floor((now - createdTime) / DAY_MS)
      if (now - createdTime <= DAY_MS) metrics.newToday += 1
      if (now - createdTime <= 7 * DAY_MS) {
        metrics.newWeek += 1
        if (done) metrics.doneWeek += 1
      }

      if (active) {
        if (age <= 2) metrics.aging.zeroToTwo += 1
        else if (age <= 7) metrics.aging.threeToSeven += 1
        else metrics.aging.eightPlus += 1

        if (age > 7) {
          metrics.stalled += 1
          attentionReasons.push('stalled')
        }
      }
    }

    if (attentionReasons.length > 0) metrics.attention += 1

    normalizedRecords.push({
      ...seed,
      applicantName: cleanText(seed.applicantName, 'Unknown applicant'),
      serviceLabel: cleanText(seed.serviceLabel, definition.label),
      status,
      trackingNumber: cleanText(seed.trackingNumber, 'Not recorded'),
      createdAt,
      service: source,
      attentionReasons,
    })
  }

  return { metrics, records: normalizedRecords }
}

/**
 * Builds one read-only Applications view model from records owned by each
 * source module. Attention reasons are de-duplicated per record.
 */
export function buildApplicationSummary(input: BuildApplicationSummaryInput): ApplicationSummary {
  const now = dateTime(input.generatedAt)
  if (now === null) throw new Error('generatedAt must be a valid date')

  const totals = emptyMetrics()
  const warnings: ApplicationSummaryWarning[] = []
  const allRecords: ApplicationSummaryRecord[] = []
  const sources = {} as Record<ApplicationSourceKey, ApplicationSourceSummary>

  for (const source of APPLICATION_SOURCE_KEYS) {
    const definition = SOURCE_DEFINITIONS[source]
    const load = input.sources[source]
    const summary = summarizeSource(source, load.available ? load.records : [], now)

    sources[source] = {
      key: source,
      label: definition.label,
      title: definition.title,
      href: definition.href,
      available: load.available,
      metrics: summary.metrics,
    }

    if (load.available) {
      addMetrics(totals, summary.metrics)
      allRecords.push(...summary.records)
    } else {
      warnings.push({
        source,
        label: definition.label,
        message: `${definition.label} applications could not be loaded.`,
      })
    }
  }

  const recentLimit = Math.max(0, input.recentLimit ?? 18)
  const attentionLimit = Math.max(0, input.attentionLimit ?? 32)
  const recent = [...allRecords]
    .sort((left, right) => {
      const leftTime = dateTime(left.createdAt) ?? Number.NEGATIVE_INFINITY
      const rightTime = dateTime(right.createdAt) ?? Number.NEGATIVE_INFINITY
      return rightTime - leftTime || left.id.localeCompare(right.id)
    })
    .slice(0, recentLimit)
  const attentionItems = allRecords
    .filter((record) => record.attentionReasons.length > 0)
    .sort((left, right) => {
      const leftTime = dateTime(left.createdAt) ?? Number.POSITIVE_INFINITY
      const rightTime = dateTime(right.createdAt) ?? Number.POSITIVE_INFINITY
      return leftTime - rightTime || left.id.localeCompare(right.id)
    })
    .slice(0, attentionLimit)

  return {
    generatedAt: input.generatedAt,
    ageBasis: 'created_at',
    totals,
    sources,
    recent,
    attentionItems,
    warnings,
  }
}
