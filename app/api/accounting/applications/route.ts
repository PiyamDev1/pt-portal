import { createServerClient } from '@supabase/auth-helpers-nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import {
  APPLICATION_SOURCE_KEYS,
  APPLICATION_SOURCE_LABELS,
  buildAccountingApplicationsReport,
  type ApplicationSourceKey,
  type NormalizedApplication,
} from '@/lib/accounting/applicationReports'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000
const MAX_PAGES_PER_SOURCE = 100

type RawApplication = {
  id: string
  created_at?: string | null
  status?: string | null
  is_refunded?: boolean | null
  tracking_number?: string | null
  internal_tracking_number?: string | null
  pex_number?: string | null
  service_type?: string | null
  speed?: string | null
  category?: string | null
  age_group?: string | null
  applicants?:
    | { first_name?: string | null; last_name?: string | null }
    | Array<{ first_name?: string | null; last_name?: string | null }>
    | null
  applications?:
    | { tracking_number?: string | null }
    | Array<{ tracking_number?: string | null }>
    | null
  nicop_cnic_details?:
    | { service_option?: string | null }
    | Array<{ service_option?: string | null }>
    | null
  visa_countries?: { name?: string | null } | Array<{ name?: string | null }> | null
  visa_types?: { name?: string | null } | Array<{ name?: string | null }> | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  return (
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ') || fallback
  )
}

function deductionReason(row: RawApplication) {
  const status = cleanLabel(row.status, 'Unknown').toLowerCase()
  if (row.is_refunded || status.includes('refund')) return 'Refunded' as const
  if (status.includes('cancel')) return 'Cancelled' as const
  return null
}

function trackingNumberFor(
  source: ApplicationSourceKey,
  row: RawApplication,
  parentApplication: { tracking_number?: string | null } | null,
) {
  if (source === 'visa') return cleanLabel(row.internal_tracking_number, 'Not recorded')
  if (source === 'nadra') return cleanLabel(row.tracking_number, 'Not recorded')

  if (source === 'gb_passport') {
    const pexNumber = cleanLabel(row.pex_number, '')
    if (pexNumber) return pexNumber.toUpperCase()
  }

  return cleanLabel(parentApplication?.tracking_number, 'Not recorded')
}

function normalizeApplication(source: ApplicationSourceKey, row: RawApplication) {
  const applicant = pickOne(row.applicants)
  const parentApplication = pickOne(row.applications)
  const applicantName = cleanLabel(
    [applicant?.first_name, applicant?.last_name].filter(Boolean).join(' '),
    'Unknown applicant',
  )
  const common = {
    id: row.id,
    source,
    appliedAt: row.created_at || '',
    applicantName,
    trackingNumber: trackingNumberFor(source, row, parentApplication),
    status: cleanLabel(row.status, 'Unknown'),
    deductionReason: deductionReason(row),
  }

  if (source === 'nadra') {
    const details = pickOne(row.nicop_cnic_details)
    return {
      ...common,
      application: cleanLabel(row.service_type, 'NADRA'),
      category: cleanLabel(details?.service_option, 'Unspecified'),
    }
  }

  if (source === 'pak_passport') {
    const passportCategory = cleanLabel(row.category, '')
    return {
      ...common,
      application: passportCategory ? `PK Passport - ${passportCategory}` : 'PK Passport',
      category: cleanLabel(row.speed, 'Unspecified'),
    }
  }

  if (source === 'gb_passport') {
    const ageGroup = cleanLabel(row.age_group, '')
    return {
      ...common,
      application: ageGroup ? `GB Passport - ${ageGroup}` : 'GB Passport',
      category: cleanLabel(row.service_type, 'Unspecified'),
    }
  }

  const country = pickOne(row.visa_countries)
  const visaType = pickOne(row.visa_types)
  const countryName = cleanLabel(country?.name, '')

  return {
    ...common,
    application: countryName ? `${countryName} Visa` : 'Visa',
    category: cleanLabel(visaType?.name, 'Unspecified'),
  }
}

function createSourceQuery(
  supabase: SupabaseClient,
  source: ApplicationSourceKey,
  fromIso: string,
  toIso: string,
) {
  if (source === 'nadra') {
    return supabase
      .from('nadra_services')
      .select(
        'id, created_at, status, is_refunded, tracking_number, service_type, applicants(first_name, last_name), nicop_cnic_details(service_option)',
      )
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
  }

  if (source === 'pak_passport') {
    return supabase
      .from('pakistani_passport_applications')
      .select(
        'id, created_at, status, is_refunded, category, speed, applicants(first_name, last_name), applications(tracking_number)',
      )
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
  }

  if (source === 'gb_passport') {
    return supabase
      .from('british_passport_applications')
      .select(
        'id, created_at, status, pex_number, age_group, service_type, applicants(first_name, last_name), applications(tracking_number)',
      )
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
  }

  return supabase
    .from('visa_applications')
    .select(
      'id, created_at, status, internal_tracking_number, applicants(first_name, last_name), visa_countries(name), visa_types(name)',
    )
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: true })
}

async function fetchSourceApplications(
  supabase: SupabaseClient,
  source: ApplicationSourceKey,
  fromIso: string,
  toIso: string,
) {
  const rows: RawApplication[] = []

  for (let page = 0; page < MAX_PAGES_PER_SOURCE; page += 1) {
    const start = page * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    const { data, error } = await createSourceQuery(supabase, source, fromIso, toIso).range(
      start,
      end,
    )

    if (error) {
      throw new Error(`${APPLICATION_SOURCE_LABELS[source]}: ${error.message}`)
    }

    const pageRows = (data || []) as unknown as RawApplication[]
    rows.push(...pageRows)

    if (pageRows.length < PAGE_SIZE) {
      return rows.map((row) => normalizeApplication(source, row))
    }
  }

  throw new Error(
    `${APPLICATION_SOURCE_LABELS[source]}: report exceeds ${PAGE_SIZE * MAX_PAGES_PER_SOURCE} records`,
  )
}

function parseYear(value: string | null, currentYear: number) {
  if (!value) return currentYear
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) return null
  return year
}

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      return apiError('Supabase is not configured', 500)
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const currentYear = new Date().getUTCFullYear()
    const year = parseYear(searchParams.get('year'), currentYear)
    if (!year) {
      return apiError(`year must be between 2000 and ${currentYear + 1}`, 400)
    }

    const serviceParam = searchParams.get('service') || 'all'
    const validServices = new Set<string>(['all', ...APPLICATION_SOURCE_KEYS])
    if (!validServices.has(serviceParam)) {
      return apiError('service must be all, nadra, pak_passport, gb_passport, or visa', 400)
    }
    const service = serviceParam as ApplicationSourceKey | 'all'

    const fromIso = new Date(Date.UTC(year, 0, 1)).toISOString()
    const toIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString()
    const sources =
      service === 'all'
        ? APPLICATION_SOURCE_KEYS
        : APPLICATION_SOURCE_KEYS.filter((key) => key === service)

    const settled = await Promise.allSettled(
      sources.map((source) => fetchSourceApplications(supabase, source, fromIso, toIso)),
    )

    const warnings: Array<{ label: string; message: string }> = []
    const applications: NormalizedApplication[] = []

    settled.forEach((result, index) => {
      const source = sources[index]
      if (result.status === 'fulfilled') {
        applications.push(...result.value)
        return
      }

      warnings.push({
        label: APPLICATION_SOURCE_LABELS[source],
        message: String(result.reason),
      })
    })

    return apiOk(
      buildAccountingApplicationsReport({
        applications,
        year,
        service,
        warnings,
      }),
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Application accounting report failed'), 500)
  }
}
