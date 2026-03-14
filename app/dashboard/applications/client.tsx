'use client'

import Link from 'next/link'

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
  applications?: { id?: string; tracking_number?: string | null } | { id?: string; tracking_number?: string | null }[] | null
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

const NADRA_ACTIVE = new Set(['Pending Submission', 'Submitted', 'In Progress'])
const NADRA_DONE = new Set(['Completed'])
const NADRA_ATTENTION = new Set(['Pending Submission'])

const PAK_ACTIVE = new Set(['Pending Submission', 'Biometrics Taken', 'Processing', 'Approved', 'Passport Arrived'])
const PAK_DONE = new Set(['Collected'])
const PAK_ATTENTION = new Set(['Passport Arrived'])

const GB_ACTIVE = new Set(['Pending Submission', 'Submitted', 'In Progress'])
const GB_DONE = new Set(['Completed'])
const GB_ATTENTION = new Set(['Pending Submission'])

const VISA_ACTIVE = new Set(['Pending'])
const VISA_DONE = new Set(['Approved'])
const VISA_ATTENTION = new Set(['Pending'])

const SERVICE_TAG: Record<ServiceKey, { label: string; color: string }> = {
  nadra: { label: 'NADRA', color: 'bg-emerald-100 text-emerald-700' },
  'pak-passport': { label: 'PAK', color: 'bg-green-100 text-green-800' },
  'gb-passport': { label: 'GB', color: 'bg-blue-100 text-blue-800' },
  visa: { label: 'VISA', color: 'bg-purple-100 text-purple-700' },
}

const STATUS_BADGE: Record<string, string> = {
  'Pending Submission': 'bg-amber-50 text-amber-700 border-amber-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress': 'bg-violet-50 text-violet-700 border-violet-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
  'Biometrics Taken': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Approved: 'bg-teal-50 text-teal-700 border-teal-200',
  'Passport Arrived': 'bg-orange-50 text-orange-700 border-orange-200',
  Collected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
}

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
    { zeroToTwo: 0, threeToSeven: 0, eightPlus: 0 }
  )
}

function buildNadraRecords(records: NadraJoinRecord[]): NormRecord[] {
  return (records || []).flatMap((item) => {
    const nadra = pickOne(item.nadra_services)
    if (!nadra) return []
    return [{
      id: nadra.id,
      applicantName: applicantName(item.applicants),
      service: 'nadra' as const,
      serviceLabel: nadra.service_type || 'NADRA',
      status: nadra.status || 'Pending Submission',
      createdAt: nadra.created_at || item.created_at || '',
      trackingNumber: nadra.tracking_number || item.tracking_number || '—',
    }]
  })
}

function buildPakRecords(records: PakJoinRecord[]): NormRecord[] {
  return (records || []).flatMap((item) => {
    const passport = pickOne(item.pakistani_passport_applications)
    if (!passport) return []
    return [{
      id: passport.id,
      applicantName: applicantName(item.applicants),
      service: 'pak-passport' as const,
      serviceLabel: `PAK ${passport.application_type || 'Passport'}`,
      status: passport.status || 'Pending Submission',
      createdAt: passport.created_at || item.created_at || '',
      trackingNumber: item.tracking_number || '—',
    }]
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

function Chip({ label, value, accent }: { label: string; value: number; accent?: 'white' | 'green' | 'amber' | 'blue' }) {
  const styles = {
    white: 'bg-white/15 text-white',
    green: 'bg-emerald-500/25 text-emerald-100',
    amber: 'bg-amber-400/25 text-amber-100',
    blue: 'bg-cyan-400/25 text-cyan-100',
  }
  const cls = styles[accent || 'white']
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${cls}`}>
      <span className="text-[15px] font-black">{value}</span>
      <span className="opacity-85">{label}</span>
    </div>
  )
}

function AgingBadge({ aging }: { aging: AgingBreakdown }) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-600">
      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">0-2d: {aging.zeroToTwo}</span>
      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">3-7d: {aging.threeToSeven}</span>
      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">8+d: {aging.eightPlus}</span>
    </div>
  )
}

function ServiceCard({
  flag,
  title,
  href,
  color,
  total,
  active,
  done,
  attentionCount,
  attentionLabel,
  aging,
}: {
  flag: string
  title: string
  href: string
  color: string
  total: number
  active: number
  done: number
  attentionCount: number
  attentionLabel: string
  aging: AgingBreakdown
}) {
  const hasAttention = attentionCount > 0

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full bg-white">
      <div className={`${color} px-4 py-3.5 flex items-center gap-2.5`}>
        <span className="text-3xl drop-shadow-sm">{flag}</span>
        <div>
          <p className="text-white font-bold text-sm leading-tight">{title}</p>
          <p className="text-white/60 text-[10px]">{total} total applications</p>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
          <div className="pr-2">
            <p className="text-[22px] font-black text-slate-800 leading-none">{total}</p>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide mt-0.5">All Time</p>
          </div>
          <div className="px-2">
            <p className="text-[22px] font-black text-slate-800 leading-none">{active}</p>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide mt-0.5">Active</p>
          </div>
          <div className="pl-2">
            <p className="text-[22px] font-black text-slate-800 leading-none">{done}</p>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide mt-0.5">Done</p>
          </div>
        </div>

        <AgingBadge aging={aging} />

        {hasAttention ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700">
            <span>⚠</span>
            <span>{attentionCount} {attentionLabel}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-600">
            <span>✓</span>
            <span>No pending actions</span>
          </div>
        )}

        <div className="flex gap-2 pt-0.5">
          <Link href={href} className="flex-1 text-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors">
            Open Module
          </Link>
          <Link href={`${href}?focus=attention`} className="flex-1 text-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-black transition-colors">
            View Attention
          </Link>
        </div>
      </div>
    </div>
  )
}

function ActivityRow({ item }: { item: NormRecord }) {
  const tag = SERVICE_TAG[item.service]
  const badge = STATUS_BADGE[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">{item.applicantName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${tag.color}`}>{tag.label}</span>
          <span className="text-[11px] text-slate-500 truncate">{item.serviceLabel}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>{item.status}</span>
        <p className="text-[10px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—'}</p>
      </div>
    </div>
  )
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
  const roleVisibility = getRoleVisibility(roleName)

  const nadra = {
    total: nadraStatuses.length,
    active: countBySet(nadraStatuses, NADRA_ACTIVE),
    done: countBySet(nadraStatuses, NADRA_DONE),
    attention: countBySet(nadraStatuses, NADRA_ATTENTION),
    aging: buildAging(nadraStatuses, NADRA_ACTIVE),
    newToday: countCreatedWithinDays(nadraStatuses, 1),
    newWeek: countCreatedWithinDays(nadraStatuses, 7),
    doneWeek: countDoneWithinDays(nadraStatuses, NADRA_DONE, 7),
    stalled: nadraStatuses.filter((record) => NADRA_ACTIVE.has(record.status) && (daysOld(record.created_at) || 0) > 7).length,
  }
  const pak = {
    total: pakStatuses.length,
    active: countBySet(pakStatuses, PAK_ACTIVE),
    done: countBySet(pakStatuses, PAK_DONE),
    attention: countBySet(pakStatuses, PAK_ATTENTION),
    aging: buildAging(pakStatuses, PAK_ACTIVE),
    newToday: countCreatedWithinDays(pakStatuses, 1),
    newWeek: countCreatedWithinDays(pakStatuses, 7),
    doneWeek: countDoneWithinDays(pakStatuses, PAK_DONE, 7),
    stalled: pakStatuses.filter((record) => PAK_ACTIVE.has(record.status) && (daysOld(record.created_at) || 0) > 7).length,
  }
  const gb = {
    total: gbStatuses.length,
    active: countBySet(gbStatuses, GB_ACTIVE),
    done: countBySet(gbStatuses, GB_DONE),
    attention: countBySet(gbStatuses, GB_ATTENTION),
    aging: buildAging(gbStatuses, GB_ACTIVE),
    newToday: countCreatedWithinDays(gbStatuses, 1),
    newWeek: countCreatedWithinDays(gbStatuses, 7),
    doneWeek: countDoneWithinDays(gbStatuses, GB_DONE, 7),
    stalled: gbStatuses.filter((record) => GB_ACTIVE.has(record.status) && (daysOld(record.created_at) || 0) > 7).length,
  }
  const visa = {
    total: visaStatuses.length,
    active: countBySet(visaStatuses, VISA_ACTIVE),
    done: countBySet(visaStatuses, VISA_DONE),
    attention: countBySet(visaStatuses, VISA_ATTENTION),
    aging: buildAging(visaStatuses, VISA_ACTIVE),
    newToday: countCreatedWithinDays(visaStatuses, 1),
    newWeek: countCreatedWithinDays(visaStatuses, 7),
    doneWeek: countDoneWithinDays(visaStatuses, VISA_DONE, 7),
    stalled: visaStatuses.filter((record) => VISA_ACTIVE.has(record.status) && (daysOld(record.created_at) || 0) > 7).length,
  }

  const grandTotal = nadra.total + pak.total + gb.total + visa.total
  const grandActive = nadra.active + pak.active + gb.active + visa.active
  const grandDone = nadra.done + pak.done + gb.done + visa.done
  const grandAttention = nadra.attention + pak.attention + gb.attention + visa.attention
  const newToday = nadra.newToday + pak.newToday + gb.newToday + visa.newToday
  const newWeek = nadra.newWeek + pak.newWeek + gb.newWeek + visa.newWeek
  const doneWeek = nadra.doneWeek + pak.doneWeek + gb.doneWeek + visa.doneWeek
  const stalledTotal = nadra.stalled + pak.stalled + gb.stalled + visa.stalled

  const visibleServices = [
    {
      key: 'pak-passport' as const,
      visible: roleVisibility['pak-passport'],
      card: (
        <ServiceCard
          flag="🇵🇰"
          title="PAK Passports"
          href="/dashboard/applications/passports"
          color="bg-[#014f26]"
          total={pak.total}
          active={pak.active}
          done={pak.done}
          attentionCount={pak.attention}
          attentionLabel={`passport${pak.attention !== 1 ? 's' : ''} arrived, not collected`}
          aging={pak.aging}
        />
      ),
    },
    {
      key: 'gb-passport' as const,
      visible: roleVisibility['gb-passport'],
      card: (
        <ServiceCard
          flag="🇬🇧"
          title="GB Passports"
          href="/dashboard/applications/passports-gb"
          color="bg-[#1e3a5f]"
          total={gb.total}
          active={gb.active}
          done={gb.done}
          attentionCount={gb.attention}
          attentionLabel="pending submission"
          aging={gb.aging}
        />
      ),
    },
    {
      key: 'nadra' as const,
      visible: roleVisibility.nadra,
      card: (
        <ServiceCard
          flag="🆔"
          title="NADRA Services"
          href="/dashboard/applications/nadra"
          color="bg-[#1f5c38]"
          total={nadra.total}
          active={nadra.active}
          done={nadra.done}
          attentionCount={nadra.attention}
          attentionLabel="pending submission"
          aging={nadra.aging}
        />
      ),
    },
    {
      key: 'visa' as const,
      visible: roleVisibility.visa,
      card: (
        <ServiceCard
          flag="🛂"
          title="Visas"
          href="/dashboard/applications/visa"
          color="bg-[#5b21b6]"
          total={visa.total}
          active={visa.active}
          done={visa.done}
          attentionCount={visa.attention}
          attentionLabel="pending"
          aging={visa.aging}
        />
      ),
    },
  ]

  const allRecent = [
    ...buildNadraRecords(nadraRecent),
    ...buildPakRecords(pakRecent),
    ...buildGbRecords(gbRecent),
    ...buildVisaRecords(visaRecent),
  ]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 18)

  const attentionRecords = [
    ...buildNadraRecords(nadraAttention),
    ...buildPakRecords(pakAttention),
    ...buildGbRecords(gbAttention),
    ...buildVisaRecords(visaAttention),
  ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

  return (
    <div className="space-y-5">
      {stalledTotal > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
          <p className="text-sm font-semibold">Stalled Work Alert</p>
          <p className="text-xs mt-0.5">
            {stalledTotal} active applications are older than 7 days.
            {pak.stalled > 0 ? ` PAK: ${pak.stalled}.` : ''}
            {gb.stalled > 0 ? ` GB: ${gb.stalled}.` : ''}
            {nadra.stalled > 0 ? ` NADRA: ${nadra.stalled}.` : ''}
            {visa.stalled > 0 ? ` VISA: ${visa.stalled}.` : ''}
          </p>
        </section>
      )}

      {dataWarnings.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <p className="text-sm font-semibold">Partial Data Warning</p>
          <p className="text-xs mt-0.5">
            Some modules failed to load and are shown as empty. Retry shortly or open the module directly.
          </p>
          <ul className="text-xs mt-2 list-disc list-inside">
            {dataWarnings.slice(0, 5).map((warning, idx) => (
              <li key={`${warning.label}-${idx}`}>{warning.label}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-[#1f5c38] px-6 py-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Applications Hub</h1>
            <p className="text-green-200 text-xs mt-0.5">All services live overview{locationName ? ` • ${locationName}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip label="Total" value={grandTotal} />
            <Chip label="Active" value={grandActive} accent="green" />
            <Chip label="Done" value={grandDone} />
            <Chip label="Attention" value={grandAttention} accent={grandAttention > 0 ? 'amber' : 'white'} />
            <Chip label="New Today" value={newToday} accent="blue" />
            <Chip label="New 7d" value={newWeek} accent="blue" />
            <Chip label="Done 7d" value={doneWeek} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleServices.filter((service) => service.visible).map((service) => (
          <div key={service.key}>{service.card}</div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
            <h2 className="font-bold text-slate-700 text-sm">Recent Activity</h2>
            <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">All Services</span>
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {allRecent.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm italic">No recent activity found</div>
            ) : (
              allRecent.map((item, i) => <ActivityRow key={`recent-${item.service}-${item.id}-${i}`} item={item} />)
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
            <h2 className="font-bold text-slate-700 text-sm">Needs Attention</h2>
            {grandAttention > 0 ? (
              <span className="text-[9px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">{grandAttention} total</span>
            ) : (
              <span className="text-[9px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">All clear</span>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {attentionRecords.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm">
                <p className="text-2xl mb-2">✓</p>
                <p className="italic">Nothing needs attention right now</p>
              </div>
            ) : (
              attentionRecords.map((item, i) => <ActivityRow key={`attn-${item.service}-${item.id}-${i}`} item={item} />)
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
