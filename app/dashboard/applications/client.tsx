'use client'

import { useMemo } from 'react'

import { ApplicationsHubBody } from './components/ApplicationsHubBody'

interface StatusRecord {
  id: string
  status: string
  created_at: string
}

interface PersonName {
  first_name?: string | null
  last_name?: string | null
}

interface NadraServiceRecord {
  id: string
  status?: string | null
  service_type?: string | null
  created_at?: string | null
  tracking_number?: string | null
}

interface PakPassportRecord {
  id: string
  status?: string | null
  application_type?: string | null
  created_at?: string | null
}

interface BaseAppJoin {
  id: string
  tracking_number?: string | null
  created_at?: string | null
}

interface NadraJoinRecord extends BaseAppJoin {
  applicants?: PersonName | PersonName[] | null
  nadra_services?: NadraServiceRecord | NadraServiceRecord[] | null
}

interface PakJoinRecord extends BaseAppJoin {
  applicants?: PersonName | PersonName[] | null
  pakistani_passport_applications?: PakPassportRecord | PakPassportRecord[] | null
}

interface GbRecord {
  id: string
  status?: string | null
  created_at?: string | null
  applicants?: PersonName | PersonName[] | null
  applications?:
    | { id?: string; tracking_number?: string | null }
    | { id?: string; tracking_number?: string | null }[]
    | null
}

interface VisaCountry {
  name?: string | null
}

interface VisaRecord {
  id: string
  status?: string | null
  created_at?: string | null
  applicants?: PersonName | PersonName[] | null
  visa_countries?: VisaCountry | VisaCountry[] | null
}

interface QueryWarning {
  label: string
  message: string
}

interface Props {
  nadraStatuses: StatusRecord[]
  pakStatuses: StatusRecord[]
  gbStatuses: StatusRecord[]
  visaStatuses: StatusRecord[]
  nadraRecent: NadraJoinRecord[]
  pakRecent: PakJoinRecord[]
  gbRecent: GbRecord[]
  visaRecent: VisaRecord[]
  nadraAttention: NadraJoinRecord[]
  pakAttention: PakJoinRecord[]
  gbAttention: GbRecord[]
  visaAttention: VisaRecord[]
  roleName: string
  locationName: string
  dataWarnings: QueryWarning[]
}

type ServiceKey = 'nadra' | 'pak-passport' | 'gb-passport' | 'visa'

type NormRecord = {
  id: string
  applicantName: string
  service: ServiceKey
  serviceLabel: string
  status: string
  createdAt: string
  trackingNumber: string
}

type AgingBreakdown = {
  zeroToTwo: number
  threeToSeven: number
  eightPlus: number
}

type ServiceMetrics = {
  total: number
  active: number
  done: number
  attention: number
  aging: AgingBreakdown
  newToday: number
  newWeek: number
  doneWeek: number
  stalled: number
}

const NADRA_ACTIVE = new Set(['Pending Submission', 'Submitted', 'In Progress'])
const NADRA_DONE = new Set(['Completed'])
const NADRA_ATTENTION = new Set(['Pending Submission'])

const PAK_ACTIVE = new Set([
  'Pending Submission',
  'Biometrics Taken',
  'Processing',
  'Approved',
  'Passport Arrived',
])
const PAK_DONE = new Set(['Collected'])
const PAK_ATTENTION = new Set(['Passport Arrived'])

const GB_ACTIVE = new Set(['Pending Submission', 'Submitted', 'In Progress'])
const GB_DONE = new Set(['Completed'])
const GB_ATTENTION = new Set(['Pending Submission'])

const VISA_ACTIVE = new Set(['Pending'])
const VISA_DONE = new Set(['Approved'])
const VISA_ATTENTION = new Set(['Pending'])

function countBySet(records: StatusRecord[], set: Set<string>) {
  return records.filter((record) => set.has(record.status)).length
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function applicantName(value: PersonName | PersonName[] | null | undefined) {
  const person = pickOne(value)
  return `${person?.first_name || '?'} ${person?.last_name || ''}`.trim()
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function daysOld(value: string | null | undefined): number | null {
  const date = parseDate(value)
  if (!date) return null
  const ms = Date.now() - date.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function countCreatedWithinDays(records: StatusRecord[], days: number): number {
  const now = Date.now()
  const threshold = now - days * 24 * 60 * 60 * 1000
  return records.filter((record) => {
    const date = parseDate(record.created_at)
    return !!date && date.getTime() >= threshold
  }).length
}

function countDoneWithinDays(records: StatusRecord[], doneSet: Set<string>, days: number): number {
  const now = Date.now()
  const threshold = now - days * 24 * 60 * 60 * 1000
  return records.filter((record) => {
    const date = parseDate(record.created_at)
    if (!date) return false
    return date.getTime() >= threshold && doneSet.has(record.status)
  }).length
}

function buildAging(records: StatusRecord[], activeSet: Set<string>): AgingBreakdown {
  return records.reduce(
    (acc, record) => {
      if (!activeSet.has(record.status)) return acc
      const age = daysOld(record.created_at)
      if (age === null) return acc
      if (age <= 2) acc.zeroToTwo += 1
      else if (age <= 7) acc.threeToSeven += 1
      else acc.eightPlus += 1
      return acc
    },
    { zeroToTwo: 0, threeToSeven: 0, eightPlus: 0 },
  )
}

function summarizeStatusRecords(
  records: StatusRecord[],
  activeSet: Set<string>,
  doneSet: Set<string>,
  attentionSet: Set<string>,
): ServiceMetrics {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const todayThreshold = now - dayMs
  const weekThreshold = now - 7 * dayMs

  const summary: ServiceMetrics = {
    total: records.length,
    active: 0,
    done: 0,
    attention: 0,
    aging: { zeroToTwo: 0, threeToSeven: 0, eightPlus: 0 },
    newToday: 0,
    newWeek: 0,
    doneWeek: 0,
    stalled: 0,
  }

  for (const record of records) {
    if (activeSet.has(record.status)) summary.active += 1
    if (doneSet.has(record.status)) summary.done += 1
    if (attentionSet.has(record.status)) summary.attention += 1

    const date = parseDate(record.created_at)
    if (!date) continue

    const time = date.getTime()
    if (time >= todayThreshold) summary.newToday += 1
    if (time >= weekThreshold) {
      summary.newWeek += 1
      if (doneSet.has(record.status)) summary.doneWeek += 1
    }

    if (activeSet.has(record.status)) {
      const age = Math.floor((now - time) / dayMs)
      if (age <= 2) summary.aging.zeroToTwo += 1
      else if (age <= 7) summary.aging.threeToSeven += 1
      else summary.aging.eightPlus += 1
      if (age > 7) summary.stalled += 1
    }
  }

  return summary
}

function buildNadraRecords(records: NadraJoinRecord[]): NormRecord[] {
  return (records || []).flatMap((item) => {
    const nadra = pickOne(item.nadra_services)
    if (!nadra) return []
    return [
      {
        id: nadra.id,
        applicantName: applicantName(item.applicants),
        service: 'nadra' as const,
        serviceLabel: nadra.service_type || 'NADRA',
        status: nadra.status || 'Pending Submission',
        createdAt: nadra.created_at || item.created_at || '',
        trackingNumber: nadra.tracking_number || item.tracking_number || '—',
      },
    ]
  })
}

function buildPakRecords(records: PakJoinRecord[]): NormRecord[] {
  return (records || []).flatMap((item) => {
    const passport = pickOne(item.pakistani_passport_applications)
    if (!passport) return []
    return [
      {
        id: passport.id,
        applicantName: applicantName(item.applicants),
        service: 'pak-passport' as const,
        serviceLabel: `PAK ${passport.application_type || 'Passport'}`,
        status: passport.status || 'Pending Submission',
        createdAt: passport.created_at || item.created_at || '',
        trackingNumber: item.tracking_number || '—',
      },
    ]
  })
}

function buildGbRecords(records: GbRecord[]): NormRecord[] {
  return (records || []).map((item) => {
    const app = pickOne(item.applications)
    return {
      id: item.id,
      applicantName: applicantName(item.applicants),
      service: 'gb-passport' as const,
      serviceLabel: 'GB Passport',
      status: item.status || 'Pending Submission',
      createdAt: item.created_at || '',
      trackingNumber: app?.tracking_number || '—',
    }
  })
}

function buildVisaRecords(records: VisaRecord[]): NormRecord[] {
  return (records || []).map((item) => {
    const country = pickOne(item.visa_countries)
    return {
      id: item.id,
      applicantName: applicantName(item.applicants),
      service: 'visa' as const,
      serviceLabel: country?.name || 'Visa',
      status: item.status || 'Pending',
      createdAt: item.created_at || '',
      trackingNumber: '—',
    }
  })
}

function getRoleVisibility(roleName: string): Record<ServiceKey, boolean> {
  const role = String(roleName || '').toLowerCase()
  const visibility: Record<ServiceKey, boolean> = {
    nadra: true,
    'pak-passport': true,
    'gb-passport': true,
    visa: true,
  }

  if (!role) return visibility
  if (role.includes('nadra')) {
    return { nadra: true, 'pak-passport': false, 'gb-passport': false, visa: false }
  }
  if (role.includes('visa')) {
    return { nadra: false, 'pak-passport': false, 'gb-passport': false, visa: true }
  }
  if (role.includes('passport')) {
    return { nadra: false, 'pak-passport': true, 'gb-passport': true, visa: false }
  }

  return visibility
}

export default function ApplicationsClient({
  nadraStatuses,
  pakStatuses,
  gbStatuses,
  visaStatuses,
  nadraRecent,
  pakRecent,
  gbRecent,
  visaRecent,
  nadraAttention,
  pakAttention,
  gbAttention,
  visaAttention,
  roleName,
  locationName,
  dataWarnings,
}: Props) {
  const roleVisibility = useMemo(() => getRoleVisibility(roleName), [roleName])

  const nadra = useMemo(
    () => summarizeStatusRecords(nadraStatuses, NADRA_ACTIVE, NADRA_DONE, NADRA_ATTENTION),
    [nadraStatuses],
  )
  const pak = useMemo(
    () => summarizeStatusRecords(pakStatuses, PAK_ACTIVE, PAK_DONE, PAK_ATTENTION),
    [pakStatuses],
  )
  const gb = useMemo(
    () => summarizeStatusRecords(gbStatuses, GB_ACTIVE, GB_DONE, GB_ATTENTION),
    [gbStatuses],
  )
  const visa = useMemo(
    () => summarizeStatusRecords(visaStatuses, VISA_ACTIVE, VISA_DONE, VISA_ATTENTION),
    [visaStatuses],
  )

  const grandTotal = nadra.total + pak.total + gb.total + visa.total
  const grandActive = nadra.active + pak.active + gb.active + visa.active
  const grandDone = nadra.done + pak.done + gb.done + visa.done
  const grandAttention = nadra.attention + pak.attention + gb.attention + visa.attention
  const newToday = nadra.newToday + pak.newToday + gb.newToday + visa.newToday
  const newWeek = nadra.newWeek + pak.newWeek + gb.newWeek + visa.newWeek
  const doneWeek = nadra.doneWeek + pak.doneWeek + gb.doneWeek + visa.doneWeek
  const stalledTotal = nadra.stalled + pak.stalled + gb.stalled + visa.stalled

  const visibleServices = useMemo(
    () => [
      {
        key: 'pak-passport' as const,
        visible: roleVisibility['pak-passport'],
        meta: {
          flag: '🇵🇰',
          title: 'PAK Passports',
          href: '/dashboard/applications/passports',
          color: 'bg-[#014f26]',
          attentionLabel: `passport${pak.attention !== 1 ? 's' : ''} arrived, not collected`,
          metrics: pak,
        },
      },
      {
        key: 'gb-passport' as const,
        visible: roleVisibility['gb-passport'],
        meta: {
          flag: '🇬🇧',
          title: 'GB Passports',
          href: '/dashboard/applications/passports-gb',
          color: 'bg-[#1e3a5f]',
          attentionLabel: 'pending submission',
          metrics: gb,
        },
      },
      {
        key: 'nadra' as const,
        visible: roleVisibility.nadra,
        meta: {
          flag: '🆔',
          title: 'NADRA Services',
          href: '/dashboard/applications/nadra',
          color: 'bg-[#1f5c38]',
          attentionLabel: 'pending submission',
          metrics: nadra,
        },
      },
      {
        key: 'visa' as const,
        visible: roleVisibility.visa,
        meta: {
          flag: '🛂',
          title: 'Visas',
          href: '/dashboard/applications/visa',
          color: 'bg-[#5b21b6]',
          attentionLabel: 'pending',
          metrics: visa,
        },
      },
    ],
    [gb, nadra, pak, roleVisibility, visa],
  )

  const allRecent = useMemo(
    () =>
      [
        ...buildNadraRecords(nadraRecent),
        ...buildPakRecords(pakRecent),
        ...buildGbRecords(gbRecent),
        ...buildVisaRecords(visaRecent),
      ]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 18),
    [gbRecent, nadraRecent, pakRecent, visaRecent],
  )

  const attentionRecords = useMemo(
    () =>
      [
        ...buildNadraRecords(nadraAttention),
        ...buildPakRecords(pakAttention),
        ...buildGbRecords(gbAttention),
        ...buildVisaRecords(visaAttention),
      ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [gbAttention, nadraAttention, pakAttention, visaAttention],
  )

  return (
    <ApplicationsHubBody
      stalledTotal={stalledTotal}
      pakStalled={pak.stalled}
      gbStalled={gb.stalled}
      nadraStalled={nadra.stalled}
      visaStalled={visa.stalled}
      dataWarnings={dataWarnings}
      locationName={locationName}
      grandTotal={grandTotal}
      grandActive={grandActive}
      grandDone={grandDone}
      grandAttention={grandAttention}
      newToday={newToday}
      newWeek={newWeek}
      doneWeek={doneWeek}
      visibleServices={visibleServices}
      allRecent={allRecent}
      attentionRecords={attentionRecords}
    />
  )
}
