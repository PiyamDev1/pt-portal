import Link from 'next/link'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Info } from 'lucide-react'
import type {
  DashboardAttentionItem,
  DashboardAttentionSeverity,
  DashboardWorkQueue,
} from '@/lib/dashboard/workQueue'

const SEVERITY_STYLE: Record<
  DashboardAttentionSeverity,
  { label: string; badge: string; icon: typeof AlertCircle }
> = {
  critical: {
    label: 'Urgent',
    badge: 'bg-red-100 text-red-800 ring-red-200',
    icon: AlertCircle,
  },
  warning: {
    label: 'Attention',
    badge: 'bg-amber-100 text-amber-800 ring-amber-200',
    icon: CalendarClock,
  },
  info: {
    label: 'Upcoming',
    badge: 'bg-sky-100 text-sky-800 ring-sky-200',
    icon: Info,
  },
}

function formatQueueDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function AttentionItem({ item }: { item: DashboardAttentionItem }) {
  const style = SEVERITY_STYLE[item.severity]
  const Icon = style.icon

  return (
    <Link
      href={item.href}
      prefetch={false}
      className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${style.badge}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${style.badge}`}
            >
              {style.label}
            </span>
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
              {item.moduleLabel}
            </span>
          </div>
          <h3 className="mt-1.5 text-sm font-black text-slate-950 group-hover:text-[#8b1e2d]">
            {item.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">{item.reference}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 pt-3 sm:block sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:text-right">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            {item.dateLabel}
          </p>
          <time dateTime={item.date} className="mt-1 block text-xs font-bold text-slate-700">
            {formatQueueDate(item.date)}
          </time>
        </div>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[#8b1e2d]">
          Open
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

export function DashboardAttentionQueue({ queue }: { queue: DashboardWorkQueue }) {
  return (
    <section
      aria-labelledby="dashboard-attention-title"
      className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-800 to-[#4b0f16] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-100">
            Read-only · linked to source
          </p>
          <h2 id="dashboard-attention-title" className="mt-1 text-base font-black">
            Attention centre
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            Urgent work from the modules you can access, without copying their records.
          </p>
        </div>
        <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white ring-1 ring-white/20">
          {queue.items.length} open
        </span>
      </div>

      <div className="space-y-3 p-4">
        {queue.items.length > 0 ? (
          queue.items.map((item) => <AttentionItem key={item.id} item={item} />)
        ) : queue.unavailableProviders.length > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-black">
                No attention items loaded from available sources.
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                One or more providers could not be checked, so this is not an all-clear result.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-black">No linked items need attention right now.</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                This checks the connected providers shown below; source modules remain
                authoritative.
              </p>
            </div>
          </div>
        )}

        {queue.unavailableProviders.length > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Not checked: {queue.unavailableProviders.join(', ')}. Open those modules directly if you
            need their latest status.
          </p>
        )}
      </div>
    </section>
  )
}
