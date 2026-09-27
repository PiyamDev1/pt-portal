import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  APPLICATION_SOURCE_KEYS,
  buildApplicationSummary,
  type ApplicationSourceKey,
  type ApplicationSourceLoad,
  type ApplicationSummary,
  type ApplicationSummaryRecordSeed,
} from '@/lib/applications/summary'

const PAGE_SIZE = 1000
const MAX_PAGES_PER_SOURCE = 100

type PersonName = {
  first_name?: string | null
  last_name?: string | null
}

type ParentApplication = {
  tracking_number?: string | null
  has_documents?: boolean | null
}

type RawApplication = {
  id: string
  status?: string | null
  created_at?: string | null
  tracking_number?: string | null
  internal_tracking_number?: string | null
  pex_number?: string | null
  service_type?: string | null
  application_type?: string | null
  applicants?: PersonName | PersonName[] | null
  applications?: ParentApplication | ParentApplication[] | null
  visa_countries?: { name?: string | null } | Array<{ name?: string | null }> | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function cleanText(value: string | null | undefined, fallback: string) {
  return (
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ') || fallback
  )
}

function applicantName(row: RawApplication) {
  const applicant = pickOne(row.applicants)
  return cleanText(
    [applicant?.first_name, applicant?.last_name].filter(Boolean).join(' '),
    'Unknown applicant',
  )
}

function normalizeApplication(
  source: ApplicationSourceKey,
  row: RawApplication,
): ApplicationSummaryRecordSeed {
  const parent = pickOne(row.applications)
  const common = {
    id: row.id,
    applicantName: applicantName(row),
    status: cleanText(row.status, 'Unknown'),
    createdAt: row.created_at || '',
    hasDocuments: source === 'pak-passport' ? (parent?.has_documents ?? null) : null,
  }

  if (source === 'nadra') {
    return {
      ...common,
      serviceLabel: cleanText(row.service_type, 'NADRA'),
      trackingNumber: cleanText(row.tracking_number || parent?.tracking_number, 'Not recorded'),
    }
  }

  if (source === 'pak-passport') {
    const applicationType = cleanText(row.application_type, 'Passport')
    return {
      ...common,
      serviceLabel: `PAK ${applicationType}`,
      trackingNumber: cleanText(row.tracking_number || parent?.tracking_number, 'Not recorded'),
    }
  }

  if (source === 'gb-passport') {
    const trackingNumber = cleanText(row.pex_number || parent?.tracking_number, 'Not recorded')
    return {
      ...common,
      serviceLabel: cleanText(row.service_type, 'GB Passport'),
      trackingNumber: row.pex_number ? trackingNumber.toUpperCase() : trackingNumber,
    }
  }

  const country = pickOne(row.visa_countries)
  return {
    ...common,
    serviceLabel: cleanText(country?.name, 'Visa'),
    trackingNumber: cleanText(row.internal_tracking_number, 'Not recorded'),
    hasDocuments: null,
  }
}

function createSourceQuery(supabase: SupabaseClient, source: ApplicationSourceKey) {
  if (source === 'nadra') {
    return supabase
      .from('nadra_services')
      .select(
        'id, status, created_at, tracking_number, service_type, applicants(first_name, last_name), applications(tracking_number)',
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  }

  if (source === 'pak-passport') {
    return supabase
      .from('pakistani_passport_applications')
      .select(
        'id, status, created_at, tracking_number, application_type, applicants(first_name, last_name), applications(tracking_number, has_documents)',
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  }

  if (source === 'gb-passport') {
    return supabase
      .from('british_passport_applications')
      .select(
        'id, status, created_at, pex_number, service_type, applicants(first_name, last_name), applications(tracking_number)',
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  }

  return supabase
    .from('visa_applications')
    .select(
      'id, status, created_at, internal_tracking_number, applicants(first_name, last_name), visa_countries(name)',
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
}

async function fetchSourceApplications(supabase: SupabaseClient, source: ApplicationSourceKey) {
  const records: ApplicationSummaryRecordSeed[] = []

  for (let page = 0; page < MAX_PAGES_PER_SOURCE; page += 1) {
    const start = page * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    const { data, error } = await createSourceQuery(supabase, source).range(start, end)

    if (error) throw new Error(error.message)

    const rows = (data || []) as unknown as RawApplication[]
    records.push(...rows.map((row) => normalizeApplication(source, row)))
    if (rows.length < PAGE_SIZE) return records
  }

  throw new Error(`Source exceeds ${PAGE_SIZE * MAX_PAGES_PER_SOURCE} records`)
}

/**
 * Loads all application sources through the caller's authenticated Supabase
 * client so existing row-level security remains authoritative.
 */
export async function loadApplicationSummary(
  supabase: SupabaseClient,
  generatedAt = new Date().toISOString(),
): Promise<ApplicationSummary> {
  const settled = await Promise.allSettled(
    APPLICATION_SOURCE_KEYS.map((source) => fetchSourceApplications(supabase, source)),
  )
  const sources = {} as Record<ApplicationSourceKey, ApplicationSourceLoad>

  APPLICATION_SOURCE_KEYS.forEach((source, index) => {
    const result = settled[index]
    sources[source] =
      result.status === 'fulfilled'
        ? { available: true, records: result.value }
        : { available: false, records: [] }
  })

  return buildApplicationSummary({ generatedAt, sources })
}
