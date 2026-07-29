import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

type SourceKey = 'nadra' | 'pak_passport' | 'gb_passport' | 'visa'

type SourceDefinition = {
  key: SourceKey
  label: string
  active: Set<string>
  completed: Set<string>
  attention: Set<string>
}

type RawApplication = {
  id: string
  status?: string | null
  created_at?: string | null
  application_date?: string | null
  service_type?: string | null
  application_type?: string | null
  category?: string | null
  page_count?: string | number | null
  speed?: string | null
  age_group?: string | null
  pages?: string | number | null
  is_part_of_package?: boolean | null
  visa_countries?: { name?: string | null } | { name?: string | null }[] | null
  visa_types?: { name?: string | null } | { name?: string | null }[] | null
}

type NormalizedApplication = {
  id: string
  serviceKey: SourceKey
  serviceLabel: string
  category: string
  status: string
  appliedAt: string
}

type QueryWarning = {
  label: string
  message: string
}

type SourceQuery = {
  source: SourceDefinition
  query: PromiseLike<{ data: RawApplication[] | null; error: { message?: string } | null }>
}

const SOURCES: Record<SourceKey, SourceDefinition> = {
  nadra: {
    key: 'nadra',
    label: 'NADRA',
    active: new Set(['Pending Submission', 'Submitted', 'In Progress']),
    completed: new Set(['Completed']),
    attention: new Set(['Pending Submission']),
  },
  pak_passport: {
    key: 'pak_passport',
    label: 'Pakistani Passport',
    active: new Set([
      'Pending Submission',
      'Biometrics Taken',
      'Processing',
      'Approved',
      'Passport Arrived',
    ]),
    completed: new Set(['Collected']),
    attention: new Set(['Passport Arrived']),
  },
  gb_passport: {
    key: 'gb_passport',
    label: 'GB Passport',
    active: new Set(['Pending Submission', 'Submitted', 'In Progress']),
    completed: new Set(['Completed']),
    attention: new Set(['Pending Submission']),
  },
  visa: {
    key: 'visa',
    label: 'Visa',
    active: new Set(['Pending', 'Processing']),
    completed: new Set(['Approved']),
    attention: new Set(['Pending']),
  },
}

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function endExclusive(date: Date) {
  const parsed = startOfUtcDay(date)
  const next = new Date(parsed)
  next.setUTCDate(next.getUTCDate() + 1)
  return next
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function compactParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' / ')
}

function categoryFor(source: SourceDefinition, row: RawApplication) {
  if (source.key === 'nadra') {
    return row.service_type || 'NADRA'
  }

  if (source.key === 'pak_passport') {
    return (
      compactParts([row.category, row.application_type, row.page_count, row.speed]) ||
      'Pakistani Passport'
    )
  }

  if (source.key === 'gb_passport') {
    return (
      compactParts([row.age_group, row.pages ? `${row.pages} pages` : null, row.service_type]) ||
      'GB Passport'
    )
  }

  const country = pickOne(row.visa_countries)
  const type = pickOne(row.visa_types)
  const packageLabel = row.is_part_of_package ? 'Package' : null
  return compactParts([country?.name, type?.name, packageLabel]) || 'Visa'
}

function normalizeRows(source: SourceDefinition, rows: RawApplication[]) {
  return rows.map((row) => ({
    id: row.id,
    serviceKey: source.key,
    serviceLabel: source.label,
    category: categoryFor(source, row),
    status: row.status || 'Unknown',
    appliedAt: row.application_date || row.created_at || '',
  }))
}

function countInto<T extends Record<string, unknown>>(
  map: Map<string, T>,
  key: string,
  create: () => T,
  apply: (entry: T) => void,
) {
  const entry = map.get(key) || create()
  apply(entry)
  map.set(key, entry)
}

function summarize(applications: NormalizedApplication[]) {
  const byService = new Map<
    SourceKey,
    {
      serviceKey: SourceKey
      serviceLabel: string
      total: number
      active: number
      completed: number
      attention: number
    }
  >()
  const byCategory = new Map<
    string,
    {
      serviceKey: SourceKey
      serviceLabel: string
      category: string
      count: number
      active: number
      completed: number
      attention: number
      latestAppliedAt: string
    }
  >()
  const byStatus = new Map<
    string,
    {
      serviceKey: SourceKey
      serviceLabel: string
      status: string
      count: number
    }
  >()

  let active = 0
  let completed = 0
  let attention = 0

  for (const app of applications) {
    const source = SOURCES[app.serviceKey]
    const isActive = source.active.has(app.status)
    const isCompleted = source.completed.has(app.status)
    const isAttention = source.attention.has(app.status)

    if (isActive) active += 1
    if (isCompleted) completed += 1
    if (isAttention) attention += 1

    countInto(
      byService,
      app.serviceKey,
      () => ({
        serviceKey: app.serviceKey,
        serviceLabel: app.serviceLabel,
        total: 0,
        active: 0,
        completed: 0,
        attention: 0,
      }),
      (entry) => {
        entry.total += 1
        if (isActive) entry.active += 1
        if (isCompleted) entry.completed += 1
        if (isAttention) entry.attention += 1
      },
    )

    countInto(
      byCategory,
      `${app.serviceKey}:${app.category}`,
      () => ({
        serviceKey: app.serviceKey,
        serviceLabel: app.serviceLabel,
        category: app.category,
        count: 0,
        active: 0,
        completed: 0,
        attention: 0,
        latestAppliedAt: app.appliedAt,
      }),
      (entry) => {
        entry.count += 1
        if (isActive) entry.active += 1
        if (isCompleted) entry.completed += 1
        if (isAttention) entry.attention += 1
        if (app.appliedAt && (!entry.latestAppliedAt || app.appliedAt > entry.latestAppliedAt)) {
          entry.latestAppliedAt = app.appliedAt
        }
      },
    )

    countInto(
      byStatus,
      `${app.serviceKey}:${app.status}`,
      () => ({
        serviceKey: app.serviceKey,
        serviceLabel: app.serviceLabel,
        status: app.status,
        count: 0,
      }),
      (entry) => {
        entry.count += 1
      },
    )
  }

  return {
    totals: {
      applications: applications.length,
      active,
      completed,
      attention,
      categories: byCategory.size,
    },
    byService: Array.from(byService.values()).sort((a, b) => b.total - a.total),
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.count - a.count),
    byStatus: Array.from(byStatus.values()).sort((a, b) => b.count - a.count),
    recentApplications: [...applications]
      .sort((a, b) => new Date(b.appliedAt || 0).getTime() - new Date(a.appliedAt || 0).getTime())
      .slice(0, 12),
    trend: buildTrend(applications),
  }
}

function buildTrend(applications: NormalizedApplication[]) {
  const byDay = new Map<
    string,
    {
      date: string
      total: number
      byService: Partial<Record<SourceKey, number>>
    }
  >()

  for (const app of applications) {
    const date = new Date(app.appliedAt || '')
    if (Number.isNaN(date.getTime())) continue

    const key = date.toISOString().slice(0, 10)
    const entry = byDay.get(key) || { date: key, total: 0, byService: {} }
    entry.total += 1
    entry.byService[app.serviceKey] = (entry.byService[app.serviceKey] || 0) + 1
    byDay.set(key, entry)
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
}

async function runSourceQuery(
  label: string,
  query: PromiseLike<{ data: RawApplication[] | null; error: { message?: string } | null }>,
) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message || 'query failed'}`)
  return { label, data: data || [] }
}

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return apiError(
        'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
        500,
      )
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29)

    const fromDate = startOfUtcDay(parseDateParam(searchParams.get('from'), defaultFrom))
    const toDate = startOfUtcDay(parseDateParam(searchParams.get('to'), now))
    const toExclusive = endExclusive(toDate)
    const serviceParam = searchParams.get('service') || 'all'
    const validServices = new Set(['all', ...Object.keys(SOURCES)])
    if (!validServices.has(serviceParam)) {
      return apiError('service must be all, nadra, pak_passport, gb_passport, or visa', 400)
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return apiError('from must be on or before to', 400)
    }

    const supabase = createClient(url, key)
    const fromIso = fromDate.toISOString()
    const toIso = toExclusive.toISOString()
    const includeSource = (key: SourceKey) => serviceParam === 'all' || serviceParam === key

    const sourceQueries: SourceQuery[] = []
    if (includeSource('nadra')) {
      sourceQueries.push({
        source: SOURCES.nadra,
        query: supabase
          .from('nadra_services')
          .select('id, status, created_at, service_type')
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('created_at', { ascending: false })
          .range(0, 9999),
      })
    }

    if (includeSource('pak_passport')) {
      sourceQueries.push({
        source: SOURCES.pak_passport,
        query: supabase
          .from('pakistani_passport_applications')
          .select('id, status, created_at, category, application_type, page_count, speed')
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('created_at', { ascending: false })
          .range(0, 9999),
      })
    }

    if (includeSource('gb_passport')) {
      sourceQueries.push({
        source: SOURCES.gb_passport,
        query: supabase
          .from('british_passport_applications')
          .select('id, status, created_at, age_group, pages, service_type')
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('created_at', { ascending: false })
          .range(0, 9999),
      })
    }

    if (includeSource('visa')) {
      sourceQueries.push({
        source: SOURCES.visa,
        query: supabase
          .from('visa_applications')
          .select(
            'id, status, created_at, application_date, is_part_of_package, visa_countries(name), visa_types(name)',
          )
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('created_at', { ascending: false })
          .range(0, 9999),
      })
    }

    const settled = await Promise.allSettled(
      sourceQueries.map(({ source, query }) => runSourceQuery(source.key, query)),
    )

    const warnings: QueryWarning[] = []
    const applications = settled.flatMap((entry, index) => {
      const source = sourceQueries[index].source
      if (entry.status === 'fulfilled') {
        return normalizeRows(source, entry.value.data)
      }

      warnings.push({ label: source.key, message: String(entry.reason) })
      return []
    })

    return apiOk({
      range: {
        from: formatInputDate(fromDate),
        to: formatInputDate(toDate),
      },
      service: serviceParam,
      ...summarize(applications),
      warnings,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Application reports failed'), 500)
  }
}
