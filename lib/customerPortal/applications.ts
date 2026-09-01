import 'server-only'

import { timingSafeEqual } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { getOrCreateResourceAlias, resolveResourceAlias } from './grants'
import { CustomerIntegrationError } from './http'

export type CustomerApplicationSource = 'nadra' | 'pak_passport' | 'gb_passport' | 'visa'

interface ApplicantRelation {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

interface ApplicationCandidate {
  source: CustomerApplicationSource
  internalId: string
  reference: string
  serviceType: string
  status: string
  createdAt: string
  applicant: ApplicantRelation
}

interface ApplicationRecord {
  applicants?: ApplicantRelation | ApplicantRelation[] | null
  applications?:
    | { tracking_number?: string | null }
    | Array<{ tracking_number?: string | null }>
    | null
  tracking_number?: string | null
  application_id?: string | null
  internal_tracking_number?: string | null
  pex_number?: string | null
  status?: string | null
  service_type?: string | null
  category?: string | null
  age_group?: string | null
  created_at?: string | null
  visa_countries?: { name?: string | null } | Array<{ name?: string | null }> | null
  visa_types?: { name?: string | null } | Array<{ name?: string | null }> | null
}

export function normalizeCustomerLookup(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s*([-'])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-GB')
}

function normalizeReference(value: string) {
  return normalizeCustomerLookup(value).replace(/\s+/g, '').toUpperCase()
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function surnameMatches(candidate: string | null | undefined, requested: string) {
  const left = Buffer.from(normalizeCustomerLookup(candidate ?? ''))
  const right = Buffer.from(normalizeCustomerLookup(requested))
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}

function customerStage(status: string) {
  const value = normalizeCustomerLookup(status)
  if (/cancel|withdraw|void|declin|refus/.test(value)) return 'cancelled' as const
  if (/collect|ready|dispatch|print/.test(value)) return 'ready' as const
  if (/complete|issued|returned|delivered|closed/.test(value)) return 'completed' as const
  if (/action|required|missing|query|hold|additional|interview/.test(value))
    return 'action_required' as const
  if (/submitted|embassy|consulate|home office|nadra/.test(value)) return 'submitted' as const
  if (/prepar|document check|quality check/.test(value)) return 'preparing' as const
  if (/received|new|booked|created|open/.test(value)) return 'received' as const
  return 'processing' as const
}

function stageLabel(stage: ReturnType<typeof customerStage>) {
  return {
    received: 'Received',
    preparing: 'Preparing your application',
    submitted: 'Submitted to the issuing authority',
    processing: 'In progress',
    action_required: 'Action required',
    ready: 'Ready for collection or dispatch',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[stage]
}

function stageNextStep(stage: ReturnType<typeof customerStage>) {
  return {
    received: 'We have your application and will prepare the next stage.',
    preparing: 'No action is needed unless we contact you.',
    submitted: 'The issuing authority is processing your application.',
    processing: 'No action is needed unless we contact you.',
    action_required: 'Please contact Piyam Travel or follow the request sent to you.',
    ready: 'Follow the collection or delivery instructions sent to you.',
    completed: null,
    cancelled: 'Contact Piyam Travel if you believe this is incorrect.',
  }[stage]
}

function publicSummary(candidate: ApplicationCandidate, publicId: string) {
  const stage = customerStage(candidate.status)
  const updated = new Date(candidate.createdAt).toISOString()
  const reference = candidate.reference.trim()
  return {
    applicationId: publicId,
    serviceType: candidate.serviceType,
    maskedReference: `${'•'.repeat(Math.max(4, Math.min(8, reference.length - 4)))}${reference.slice(-4)}`,
    stage,
    statusLabel: stageLabel(stage),
    lastUpdatedAt: updated,
    timeline: [
      {
        stage,
        label: stageLabel(stage),
        occurredAt: updated,
        detail:
          stage === 'action_required'
            ? 'Piyam Travel needs information or action before this can continue.'
            : null,
      },
    ],
    nextStep: stageNextStep(stage),
    saved: false,
  }
}

function safeReferenceCandidates(input: string) {
  const raw = input.trim()
  const compact = normalizeReference(input)
  return [...new Set([raw, raw.toUpperCase(), compact])].filter(Boolean)
}

async function findNadra(
  service: SupabaseClient,
  references: string[],
): Promise<ApplicationCandidate[]> {
  const rows: Record<string, unknown>[] = []
  for (const reference of references) {
    const { data } = await service
      .from('nadra_services')
      .select(
        'id,tracking_number,status,service_type,created_at,applicants(first_name,last_name,email)',
      )
      .ilike('tracking_number', reference)
      .limit(10)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
  }
  return rows.map((row) => ({
    source: 'nadra',
    internalId: String(row.id),
    reference: String(row.tracking_number ?? ''),
    serviceType: String(row.service_type ?? 'NADRA service'),
    status: String(row.status ?? ''),
    createdAt: String(row.created_at),
    applicant: relationOne(row.applicants as ApplicantRelation | ApplicantRelation[]) ?? {},
  }))
}

async function findParentApplications(service: SupabaseClient, references: string[]) {
  const rows: Record<string, unknown>[] = []
  for (const reference of references) {
    const { data } = await service
      .from('applications')
      .select(
        'id,tracking_number,created_at,applicants!applications_applicant_id_fkey(first_name,last_name,email)',
      )
      .ilike('tracking_number', reference)
      .limit(10)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
  }
  return [...new Map(rows.map((row) => [String(row.id), row])).values()]
}

async function findPakPassports(
  service: SupabaseClient,
  parents: Record<string, unknown>[],
): Promise<ApplicationCandidate[]> {
  if (!parents.length) return []
  const byId = new Map(parents.map((parent) => [String(parent.id), parent]))
  const { data } = await service
    .from('pakistani_passport_applications')
    .select(
      'id,application_id,status,category,speed,created_at,applicants(first_name,last_name,email)',
    )
    .in('application_id', [...byId.keys()])
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const parent = byId.get(String(row.application_id)) ?? {}
    const applicant =
      relationOne(row.applicants as ApplicantRelation | ApplicantRelation[]) ??
      relationOne(parent.applicants as ApplicantRelation | ApplicantRelation[]) ??
      {}
    return {
      source: 'pak_passport',
      internalId: String(row.id),
      reference: String(parent.tracking_number ?? ''),
      serviceType: `Pakistani passport${row.category ? ` - ${String(row.category)}` : ''}`,
      status: String(row.status ?? ''),
      createdAt: String(row.created_at ?? parent.created_at),
      applicant,
    }
  })
}

async function findGbPassports(
  service: SupabaseClient,
  references: string[],
  parents: Record<string, unknown>[],
): Promise<ApplicationCandidate[]> {
  const rows: Record<string, unknown>[] = []
  for (const reference of references) {
    const { data } = await service
      .from('british_passport_applications')
      .select(
        'id,application_id,pex_number,status,age_group,service_type,created_at,applicants(first_name,last_name,email),applications(tracking_number)',
      )
      .ilike('pex_number', reference)
      .limit(10)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
  }
  const parentIds = parents.map((parent) => String(parent.id))
  if (parentIds.length) {
    const { data } = await service
      .from('british_passport_applications')
      .select(
        'id,application_id,pex_number,status,age_group,service_type,created_at,applicants(first_name,last_name,email),applications(tracking_number)',
      )
      .in('application_id', parentIds)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
  }
  return [...new Map(rows.map((row) => [String(row.id), row])).values()].map((row) => {
    const parent = relationOne(
      row.applications as { tracking_number?: string } | Array<{ tracking_number?: string }>,
    )
    return {
      source: 'gb_passport' as const,
      internalId: String(row.id),
      reference: String(row.pex_number || parent?.tracking_number || ''),
      serviceType: `GB passport${row.age_group ? ` - ${String(row.age_group)}` : ''}`,
      status: String(row.status ?? ''),
      createdAt: String(row.created_at),
      applicant: relationOne(row.applicants as ApplicantRelation | ApplicantRelation[]) ?? {},
    }
  })
}

async function findVisas(
  service: SupabaseClient,
  references: string[],
): Promise<ApplicationCandidate[]> {
  const rows: Record<string, unknown>[] = []
  for (const reference of references) {
    const { data } = await service
      .from('visa_applications')
      .select(
        'id,internal_tracking_number,status,created_at,applicants(first_name,last_name,email),visa_countries(name),visa_types(name)',
      )
      .ilike('internal_tracking_number', reference)
      .limit(10)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
  }
  return rows.map((row) => {
    const country = relationOne(row.visa_countries as { name?: string } | Array<{ name?: string }>)
    const visaType = relationOne(row.visa_types as { name?: string } | Array<{ name?: string }>)
    return {
      source: 'visa',
      internalId: String(row.id),
      reference: String(row.internal_tracking_number ?? ''),
      serviceType: `${country?.name ?? ''}${country?.name ? ' ' : ''}${visaType?.name ?? 'Visa'}`,
      status: String(row.status ?? ''),
      createdAt: String(row.created_at),
      applicant: relationOne(row.applicants as ApplicantRelation | ApplicantRelation[]) ?? {},
    }
  })
}

export async function lookupCustomerApplication(trackingNumber: string, surname: string) {
  const service = getServiceSupabaseClient()
  const references = safeReferenceCandidates(trackingNumber)
  const parents = await findParentApplications(service, references)
  const candidates = (
    await Promise.all([
      findNadra(service, references),
      findPakPassports(service, parents),
      findGbPassports(service, references, parents),
      findVisas(service, references),
    ])
  )
    .flat()
    .filter(
      (candidate) =>
        normalizeReference(candidate.reference) === normalizeReference(trackingNumber) &&
        surnameMatches(candidate.applicant.last_name, surname),
    )
  const unique = [
    ...new Map(
      candidates.map((candidate) => [`${candidate.source}:${candidate.internalId}`, candidate]),
    ).values(),
  ]
  if (unique.length !== 1) {
    throw new CustomerIntegrationError(
      'lookup_not_matched',
      'We could not match those details.',
      404,
    )
  }
  const candidate = unique[0]!
  const alias = await getOrCreateResourceAlias('application', candidate.internalId, {
    source: candidate.source,
  })
  return {
    candidate,
    publicId: alias.publicId,
    summary: publicSummary(candidate, alias.publicId),
  }
}

async function applicationByInternalId(source: CustomerApplicationSource, internalId: string) {
  const service = getServiceSupabaseClient()
  let query
  if (source === 'nadra') {
    query = service
      .from('nadra_services')
      .select(
        'id,tracking_number,status,service_type,created_at,applicants(first_name,last_name,email)',
      )
      .eq('id', internalId)
  } else if (source === 'pak_passport') {
    query = service
      .from('pakistani_passport_applications')
      .select(
        'id,application_id,status,category,speed,created_at,applicants(first_name,last_name,email),applications(tracking_number)',
      )
      .eq('id', internalId)
  } else if (source === 'gb_passport') {
    query = service
      .from('british_passport_applications')
      .select(
        'id,application_id,pex_number,status,age_group,service_type,created_at,applicants(first_name,last_name,email),applications(tracking_number)',
      )
      .eq('id', internalId)
  } else {
    query = service
      .from('visa_applications')
      .select(
        'id,internal_tracking_number,status,created_at,applicants(first_name,last_name,email),visa_countries(name),visa_types(name)',
      )
      .eq('id', internalId)
  }
  const { data: rawData, error } = await query.maybeSingle()
  if (error || !rawData)
    throw new CustomerIntegrationError('not_found', 'Application not found.', 404)
  const data = rawData as unknown as ApplicationRecord
  const applicant = relationOne(data.applicants) ?? {}
  if (source === 'nadra')
    return {
      source,
      internalId,
      reference: data.tracking_number ?? '',
      serviceType: data.service_type ?? 'NADRA service',
      status: data.status ?? 'processing',
      createdAt: data.created_at ?? new Date().toISOString(),
      applicant,
    } satisfies ApplicationCandidate
  const parent = relationOne(data.applications)
  if (source === 'pak_passport')
    return {
      source,
      internalId,
      reference: parent?.tracking_number ?? '',
      serviceType: `Pakistani passport${data.category ? ` - ${data.category}` : ''}`,
      status: data.status ?? 'processing',
      createdAt: data.created_at ?? new Date().toISOString(),
      applicant,
    } satisfies ApplicationCandidate
  if (source === 'gb_passport')
    return {
      source,
      internalId,
      reference: data.pex_number || parent?.tracking_number || '',
      serviceType: `GB passport${data.age_group ? ` - ${data.age_group}` : ''}`,
      status: data.status ?? 'processing',
      createdAt: data.created_at ?? new Date().toISOString(),
      applicant,
    } satisfies ApplicationCandidate
  const country = relationOne(data.visa_countries)
  const visaType = relationOne(data.visa_types)
  return {
    source,
    internalId,
    reference: data.internal_tracking_number ?? '',
    serviceType: `${country?.name ?? ''}${country?.name ? ' ' : ''}${visaType?.name ?? 'Visa'}`,
    status: data.status ?? 'processing',
    createdAt: data.created_at ?? new Date().toISOString(),
    applicant,
  } satisfies ApplicationCandidate
}

export async function customerApplicationFromPublicId(publicId: string) {
  const alias = await resolveResourceAlias('application', publicId)
  const source = alias.metadata.source as CustomerApplicationSource
  if (!['nadra', 'pak_passport', 'gb_passport', 'visa'].includes(source)) {
    throw new CustomerIntegrationError('not_found', 'Application not found.', 404)
  }
  const candidate = await applicationByInternalId(source, alias.internalId)
  return {
    candidate,
    publicId,
    summary: publicSummary(candidate, publicId),
    contactEmail: candidate.applicant.email?.trim() ?? null,
  }
}
