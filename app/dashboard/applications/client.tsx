'use client'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusRecord { id: string; status: string; created_at: string }

interface Props {
  nadraStatuses: StatusRecord[]
  pakStatuses: StatusRecord[]
  gbStatuses: StatusRecord[]
  visaStatuses: StatusRecord[]
  nadraRecent: any[]
  pakRecent: any[]
  gbRecent: any[]
  visaRecent: any[]
}

type NormRecord = {
  id: string
  applicantName: string
  service: 'nadra' | 'pak-passport' | 'gb-passport' | 'visa'
  serviceLabel: string
  status: string
  createdAt: string
  trackingNumber: string
}

// ─── Status definitions ───────────────────────────────────────────────────────

const NADRA_ACTIVE    = new Set(['Pending Submission', 'Submitted', 'In Progress'])
const NADRA_DONE      = new Set(['Completed'])
const NADRA_ATTENTION = new Set(['Pending Submission'])

// PAK passports: Collected = customer has received passport (fully done)
const PAK_ACTIVE      = new Set(['Pending Submission', 'Biometrics Taken', 'Processing', 'Approved', 'Passport Arrived'])
const PAK_DONE        = new Set(['Collected'])
const PAK_ATTENTION   = new Set(['Passport Arrived']) // arrived but not yet collected

const GB_ACTIVE       = new Set(['Pending Submission', 'Submitted', 'In Progress'])
const GB_DONE         = new Set(['Completed'])
const GB_ATTENTION    = new Set(['Pending Submission'])

const VISA_ACTIVE     = new Set(['Pending'])
const VISA_DONE       = new Set(['Approved'])
const VISA_ATTENTION  = new Set(['Pending'])

function countBySet(records: StatusRecord[], set: Set<string>) {
  return records.filter(r => set.has(r.status)).length
}

// ─── Record builders ──────────────────────────────────────────────────────────

function buildNadraRecent(records: any[]): NormRecord[] {
  return (records || []).flatMap((item: any) => {
    const nadra = Array.isArray(item.nadra_services) ? item.nadra_services[0] : item.nadra_services
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    if (!nadra) return []
    return [{
      id: nadra.id,
      applicantName: `${applicant?.first_name || '?'} ${applicant?.last_name || ''}`.trim(),
      service: 'nadra' as const,
      serviceLabel: nadra.service_type || 'NADRA',
      status: nadra.status || 'Pending Submission',
      createdAt: nadra.created_at || item.created_at || '',
      trackingNumber: nadra.tracking_number || item.tracking_number || '—',
    }]
  })
}

function buildPakRecent(records: any[]): NormRecord[] {
  return (records || []).flatMap((item: any) => {
    const passport = Array.isArray(item.pakistani_passport_applications)
      ? item.pakistani_passport_applications[0]
      : item.pakistani_passport_applications
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    if (!passport) return []
    return [{
      id: passport.id,
      applicantName: `${applicant?.first_name || '?'} ${applicant?.last_name || ''}`.trim(),
      service: 'pak-passport' as const,
      serviceLabel: `PAK ${passport.application_type || 'Passport'}`,
      status: passport.status || 'Pending Submission',
      createdAt: passport.created_at || item.created_at || '',
      trackingNumber: item.tracking_number || '—',
    }]
  })
}

function buildGbRecent(records: any[]): NormRecord[] {
  return (records || []).map((item: any) => {
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    return {
      id: item.id,
      applicantName: `${applicant?.first_name || '?'} ${applicant?.last_name || ''}`.trim(),
      service: 'gb-passport' as const,
      serviceLabel: 'GB Passport',
      status: item.status || 'Pending Submission',
      createdAt: item.created_at || '',
      trackingNumber: '—',
    }
  })
}

function buildVisaRecent(records: any[]): NormRecord[] {
  return (records || []).map((item: any) => {
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    const country = Array.isArray(item.visa_countries) ? item.visa_countries[0] : item.visa_countries
    return {
      id: item.id,
      applicantName: `${applicant?.first_name || '?'} ${applicant?.last_name || ''}`.trim(),
      service: 'visa' as const,
      serviceLabel: country?.name || 'Visa',
      status: item.status || 'Pending',
      createdAt: item.created_at || '',
      trackingNumber: '—',
    }
  })
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const SERVICE_TAG: Record<string, { label: string; color: string }> = {
  'nadra':        { label: 'NADRA', color: 'bg-emerald-100 text-emerald-700' },
  'pak-passport': { label: 'PAK',   color: 'bg-green-100 text-green-800'     },
  'gb-passport':  { label: 'GB',    color: 'bg-blue-100 text-blue-800'       },
  'visa':         { label: 'VISA',  color: 'bg-purple-100 text-purple-700'   },
}

const STATUS_BADGE: Record<string, string> = {
  'Pending Submission': 'bg-amber-50 text-amber-700 border-amber-200',
  'Submitted':          'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress':        'bg-violet-50 text-violet-700 border-violet-200',
  'Completed':          'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Cancelled':          'bg-red-50 text-red-700 border-red-200',
  'Biometrics Taken':   'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Processing':         'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Approved':           'bg-teal-50 text-teal-700 border-teal-200',
  'Passport Arrived':   'bg-orange-50 text-orange-700 border-orange-200',
  'Collected':          'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Pending':            'bg-amber-50 text-amber-700 border-amber-200',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ label, value, accent }: { label: string; value: number; accent?: 'white' | 'green' | 'amber' }) {
  const styles = {
    white:  'bg-white/15 text-white',
    green:  'bg-emerald-500/25 text-emerald-100',
    amber:  'bg-amber-400/25 text-amber-100',
  }
  const cls = styles[accent ?? 'white']
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${cls}`}>
      <span className="text-[15px] font-black">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  )
}

function ServiceCard({
  flag, title, href, color,
  total, active, done, attentionCount, attentionLabel,
}: {
  flag: string; title: string; href: string; color: string
  total: number; active: number; done: number
  attentionCount: number; attentionLabel: string
}) {
  const hasAttention = attentionCount > 0
  return (
    <Link href={href} className="group block">
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full">
        <div className={`${color} px-4 py-3.5 flex items-center gap-2.5`}>
          <span className="text-3xl drop-shadow-sm">{flag}</span>
          <div>
            <p className="text-white font-bold text-sm leading-tight">{title}</p>
            <p className="text-white/60 text-[10px]">{total} total applications</p>
          </div>
        </div>
        <div className="bg-white p-4 flex flex-col gap-3">
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
          <div className="flex items-center justify-end text-[11px] font-bold text-slate-400 group-hover:text-slate-600 transition-colors">
            Open module →
          </div>
        </div>
      </div>
    </Link>
  )
}

function ActivityRow({ item }: { item: NormRecord }) {
  const tag  = SERVICE_TAG[item.service]
  const badge = STATUS_BADGE[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">{item.applicantName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${tag?.color}`}>{tag?.label}</span>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ApplicationsClient({
  nadraStatuses, pakStatuses, gbStatuses, visaStatuses,
  nadraRecent, pakRecent, gbRecent, visaRecent,
}: Props) {

  // Per-service count objects
  const nadra = {
    total:     nadraStatuses.length,
    active:    countBySet(nadraStatuses, NADRA_ACTIVE),
    done:      countBySet(nadraStatuses, NADRA_DONE),
    attention: countBySet(nadraStatuses, NADRA_ATTENTION),
  }
  const pak = {
    total:     pakStatuses.length,
    active:    countBySet(pakStatuses, PAK_ACTIVE),
    done:      countBySet(pakStatuses, PAK_DONE),
    attention: countBySet(pakStatuses, PAK_ATTENTION),
  }
  const gb = {
    total:     gbStatuses.length,
    active:    countBySet(gbStatuses, GB_ACTIVE),
    done:      countBySet(gbStatuses, GB_DONE),
    attention: countBySet(gbStatuses, GB_ATTENTION),
  }
  const visa = {
    total:     visaStatuses.length,
    active:    countBySet(visaStatuses, VISA_ACTIVE),
    done:      countBySet(visaStatuses, VISA_DONE),
    attention: countBySet(visaStatuses, VISA_ATTENTION),
  }

  const grandTotal     = nadra.total  + pak.total  + gb.total  + visa.total
  const grandActive    = nadra.active + pak.active + gb.active + visa.active
  const grandDone      = nadra.done   + pak.done   + gb.done   + visa.done
  const grandAttention = nadra.attention + pak.attention + gb.attention + visa.attention

  // Build unified, sorted recent activity list
  const allRecent = [
    ...buildNadraRecent(nadraRecent),
    ...buildPakRecent(pakRecent),
    ...buildGbRecent(gbRecent),
    ...buildVisaRecent(visaRecent),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 16)

  // Needs-attention queue: from recent records that match attention statuses
  const attentionRecords = allRecent.filter(r => {
    if (r.service === 'nadra')        return NADRA_ATTENTION.has(r.status)
    if (r.service === 'pak-passport') return PAK_ATTENTION.has(r.status)
    if (r.service === 'gb-passport')  return GB_ATTENTION.has(r.status)
    if (r.service === 'visa')         return VISA_ATTENTION.has(r.status)
    return false
  })

  return (
    <div className="space-y-5">

      {/* ── COMMAND DECK ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-[#1f5c38] px-6 py-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Applications Hub</h1>
            <p className="text-green-200 text-xs mt-0.5">All services — live overview</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip label="Total"           value={grandTotal}     />
            <Chip label="Active"          value={grandActive}    accent="green" />
            <Chip label="Completed"       value={grandDone}      />
            <Chip label="Needs Attention" value={grandAttention} accent={grandAttention > 0 ? 'amber' : 'white'} />
          </div>
        </div>
      </section>

      {/* ── SERVICE CARDS ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ServiceCard
          flag="🇵🇰" title="PAK Passports"
          href="/dashboard/applications/passports"
          color="bg-[#014f26]"
          total={pak.total} active={pak.active} done={pak.done}
          attentionCount={pak.attention}
          attentionLabel={`passport${pak.attention !== 1 ? 's' : ''} arrived, not collected`}
        />
        <ServiceCard
          flag="🇬🇧" title="GB Passports"
          href="/dashboard/applications/passports-gb"
          color="bg-[#1e3a5f]"
          total={gb.total} active={gb.active} done={gb.done}
          attentionCount={gb.attention}
          attentionLabel={`pending submission`}
        />
        <ServiceCard
          flag="🆔" title="NADRA Services"
          href="/dashboard/applications/nadra"
          color="bg-[#1f5c38]"
          total={nadra.total} active={nadra.active} done={nadra.done}
          attentionCount={nadra.attention}
          attentionLabel={`pending submission`}
        />
        <ServiceCard
          flag="🛂" title="Visas"
          href="/dashboard/applications/visa"
          color="bg-[#5b21b6]"
          total={visa.total} active={visa.active} done={visa.done}
          attentionCount={visa.attention}
          attentionLabel={`pending`}
        />
      </section>

      {/* ── BOTTOM TWO-COLUMN ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
            <h2 className="font-bold text-slate-700 text-sm">Recent Activity</h2>
            <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">All Services</span>
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {allRecent.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm italic">No recent activity found</div>
            ) : (
              allRecent.map((item, i) => (
                <ActivityRow key={`recent-${item.service}-${item.id}-${i}`} item={item} />
              ))
            )}
          </div>
        </div>

        {/* Needs Attention */}
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
            {attentionRecords.length === 0 && grandAttention === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm">
                <p className="text-2xl mb-2">✓</p>
                <p className="italic">Nothing needs attention right now</p>
              </div>
            ) : attentionRecords.length === 0 && grandAttention > 0 ? (
              <div className="py-10 text-center px-6">
                <p className="text-amber-500 text-2xl mb-2">⚠</p>
                <p className="text-sm font-semibold text-slate-700">{grandAttention} items need attention</p>
                <p className="text-xs text-slate-400 mt-1">Open the individual service modules to review them.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {pak.attention > 0 && <Link href="/dashboard/applications/passports" className="text-xs px-3 py-1.5 rounded-lg bg-[#014f26] text-white font-semibold hover:opacity-90">PAK Passports →</Link>}
                  {nadra.attention > 0 && <Link href="/dashboard/applications/nadra" className="text-xs px-3 py-1.5 rounded-lg bg-[#1f5c38] text-white font-semibold hover:opacity-90">NADRA →</Link>}
                  {gb.attention > 0 && <Link href="/dashboard/applications/passports-gb" className="text-xs px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white font-semibold hover:opacity-90">GB Passports →</Link>}
                  {visa.attention > 0 && <Link href="/dashboard/applications/visa" className="text-xs px-3 py-1.5 rounded-lg bg-[#5b21b6] text-white font-semibold hover:opacity-90">Visas →</Link>}
                </div>
              </div>
            ) : (
              attentionRecords.map((item, i) => (
                <ActivityRow key={`attn-${item.service}-${item.id}-${i}`} item={item} />
              ))
            )}
            {attentionRecords.length > 0 && grandAttention > attentionRecords.length && (
              <div className="px-5 py-3 text-center">
                <p className="text-xs text-slate-400">
                  +{grandAttention - attentionRecords.length} more — open individual modules to view all
                </p>
              </div>
            )}
          </div>
        </div>

      </section>
    </div>
  )
}
