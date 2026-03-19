/**
 * Applications Hub Body
 * Renders the normalized overview cards, recent activity, and attention lists for the applications dashboard.
 *
 * @module app/dashboard/applications/components/ApplicationsHubBody
 */

import Link from 'next/link'

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

type ServiceMetric = {
  total: number
  active: number
  done: number
  attention: number
  aging: AgingBreakdown
  stalled: number
}

type ServiceVisibilityCard = {
  key: ServiceKey
  visible: boolean
  meta: {
    flag: string
    title: string
    href: string
    color: string
    attentionLabel: string
    metrics: ServiceMetric
  }
}

type QueryWarning = {
  label: string
  message: string
}

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

function Chip({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'white' | 'green' | 'amber' | 'blue'
}) {
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
      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
        0-2d: {aging.zeroToTwo}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
        3-7d: {aging.threeToSeven}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
        8+d: {aging.eightPlus}
      </span>
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
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide mt-0.5">
              All Time
            </p>
          </div>
          <div className="px-2">
            <p className="text-[22px] font-black text-slate-800 leading-none">{active}</p>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide mt-0.5">
              Active
            </p>
          </div>
          <div className="pl-2">
            <p className="text-[22px] font-black text-slate-800 leading-none">{done}</p>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide mt-0.5">
              Done
            </p>
          </div>
        </div>

        <AgingBadge aging={aging} />

        {hasAttention ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700">
            <span>⚠</span>
            <span>
              {attentionCount} {attentionLabel}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-600">
            <span>✓</span>
            <span>No pending actions</span>
          </div>
        )}

        <div className="flex gap-2 pt-0.5">
          <Link
            href={href}
            className="flex-1 text-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
          >
            Open Module
          </Link>
          <Link
            href={`${href}?focus=attention`}
            className="flex-1 text-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-black transition-colors"
          >
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
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${tag.color}`}
          >
            {tag.label}
          </span>
          <span className="text-[11px] text-slate-500 truncate">{item.serviceLabel}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>
          {item.status}
        </span>
        <p className="text-[10px] text-slate-400">
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—'}
        </p>
      </div>
    </div>
  )
}

type ApplicationsHubBodyProps = {
  stalledTotal: number
  pakStalled: number
  gbStalled: number
  nadraStalled: number
  visaStalled: number
  dataWarnings: QueryWarning[]
  locationName: string
  grandTotal: number
  grandActive: number
  grandDone: number
  grandAttention: number
  newToday: number
  newWeek: number
  doneWeek: number
  visibleServices: ServiceVisibilityCard[]
  allRecent: NormRecord[]
  attentionRecords: NormRecord[]
}

export function ApplicationsHubBody({
  stalledTotal,
  pakStalled,
  gbStalled,
  nadraStalled,
  visaStalled,
  dataWarnings,
  locationName,
  grandTotal,
  grandActive,
  grandDone,
  grandAttention,
  newToday,
  newWeek,
  doneWeek,
  visibleServices,
  allRecent,
  attentionRecords,
}: ApplicationsHubBodyProps) {
  return (
    <div className="space-y-5">
      {stalledTotal > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
          <p className="text-sm font-semibold">Stalled Work Alert</p>
          <p className="text-xs mt-0.5">
            {stalledTotal} active applications are older than 7 days.
            {pakStalled > 0 ? ` PAK: ${pakStalled}.` : ''}
            {gbStalled > 0 ? ` GB: ${gbStalled}.` : ''}
            {nadraStalled > 0 ? ` NADRA: ${nadraStalled}.` : ''}
            {visaStalled > 0 ? ` VISA: ${visaStalled}.` : ''}
          </p>
        </section>
      )}

      {dataWarnings.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <p className="text-sm font-semibold">Partial Data Warning</p>
          <p className="text-xs mt-0.5">
            Some modules failed to load and are shown as empty. Retry shortly or open the module
            directly.
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
            <p className="text-green-200 text-xs mt-0.5">
              All services live overview{locationName ? ` • ${locationName}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip label="Total" value={grandTotal} />
            <Chip label="Active" value={grandActive} accent="green" />
            <Chip label="Done" value={grandDone} />
            <Chip
              label="Attention"
              value={grandAttention}
              accent={grandAttention > 0 ? 'amber' : 'white'}
            />
            <Chip label="New Today" value={newToday} accent="blue" />
            <Chip label="New 7d" value={newWeek} accent="blue" />
            <Chip label="Done 7d" value={doneWeek} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleServices
          .filter((service) => service.visible)
          .map((service) => {
            const { meta } = service
            return (
              <ServiceCard
                key={service.key}
                flag={meta.flag}
                title={meta.title}
                href={meta.href}
                color={meta.color}
                total={meta.metrics.total}
                active={meta.metrics.active}
                done={meta.metrics.done}
                attentionCount={meta.metrics.attention}
                attentionLabel={meta.attentionLabel}
                aging={meta.metrics.aging}
              />
            )
          })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
            <h2 className="font-bold text-slate-700 text-sm">Recent Activity</h2>
            <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
              All Services
            </span>
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {allRecent.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm italic">
                No recent activity found
              </div>
            ) : (
              allRecent.map((item, i) => (
                <ActivityRow key={`recent-${item.service}-${item.id}-${i}`} item={item} />
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
            <h2 className="font-bold text-slate-700 text-sm">Needs Attention</h2>
            {grandAttention > 0 ? (
              <span className="text-[9px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                {grandAttention} total
              </span>
            ) : (
              <span className="text-[9px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                All clear
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {attentionRecords.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm">
                <p className="text-2xl mb-2">✓</p>
                <p className="italic">Nothing needs attention right now</p>
              </div>
            ) : (
              attentionRecords.map((item, i) => (
                <ActivityRow key={`attn-${item.service}-${item.id}-${i}`} item={item} />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
