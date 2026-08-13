import {
  AlertTriangle,
  BookOpenText,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Construction,
  PlaneTakeoff,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

const PLACEHOLDER_MODULES = [
  {
    title: 'Refund Calculator',
    description:
      'Calculate refundable fare components, airline penalties, service charges and the final customer refund.',
    icon: Calculator,
    tone: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    iconTone: 'bg-amber-100 text-amber-800',
    href: '/dashboard/ticketing/refund-calculator',
  },
  {
    title: 'Ticketing Ledger',
    description:
      'Record issued tickets, passenger sectors, fare details, supplier references and ticketing activity.',
    icon: BookOpenText,
    tone: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50',
    iconTone: 'bg-sky-100 text-sky-800',
    href: '/dashboard/ticketing/ledger',
  },
] as const

const SCHEDULE_WORKFLOW = [
  {
    title: 'On schedule',
    description: 'The latest departure details still match the ticketed itinerary.',
    icon: CheckCircle2,
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  },
  {
    title: 'Change marked',
    description: 'Staff record the revised flight time or routing for review.',
    icon: AlertTriangle,
    tone: 'bg-amber-50 text-amber-800 ring-amber-100',
  },
  {
    title: 'Finalised',
    description: 'The reviewed change replaces the current flight details from the same row.',
    icon: RefreshCw,
    tone: 'bg-sky-50 text-sky-800 ring-sky-100',
  },
] as const

export function TicketingDashboard() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1e2d] to-slate-900 p-5 text-white shadow-xl shadow-red-950/15 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
              Ticketing operations
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Ticketing workspace</h1>
            <p className="mt-2 text-sm leading-6 text-red-50/85 md:text-base">
              The workspace foundation for ticket records, refund calculations and upcoming-flight
              schedule monitoring.
            </p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <PlaneTakeoff className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
      </section>

      <section aria-labelledby="ticketing-tools-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Submodules
            </p>
            <h2 id="ticketing-tools-title" className="mt-1 text-xl font-black text-slate-950">
              Ticketing tools
            </h2>
          </div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Placeholders
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PLACEHOLDER_MODULES.map((moduleItem) => {
            const Icon = moduleItem.icon
            return (
              <Link
                key={moduleItem.title}
                href={moduleItem.href}
                className={`rounded-2xl border p-5 shadow-sm ${moduleItem.tone}`}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${moduleItem.iconTone}`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-slate-950">{moduleItem.title}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                        <Construction className="h-3 w-3" aria-hidden="true" />
                        Coming soon
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {moduleItem.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-slate-700">
                      Open placeholder
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section
        aria-labelledby="upcoming-flights-title"
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                Flight monitoring
              </p>
              <h2 id="upcoming-flights-title" className="mt-1 text-xl font-black text-slate-950">
                Upcoming flights
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review departures and handle schedule changes from the flight row.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 ring-1 ring-amber-200">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Ledger connection pending
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 md:max-w-xl md:gap-3">
            {[
              ['Upcoming', '0'],
              ['Changes marked', '0'],
              ['Awaiting finalisation', '0'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  {label}
                </dt>
                <dd className="mt-1 text-xl font-black text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="hidden grid-cols-[1.1fr_0.8fr_1fr_0.65fr_0.9fr_0.6fr] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 md:grid">
          <span>Departure</span>
          <span>Flight</span>
          <span>Route</span>
          <span>Passengers</span>
          <span>Schedule status</span>
          <span className="text-right">Action</span>
        </div>

        <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <CalendarClock className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-base font-black text-slate-950">No upcoming flights yet</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Flights will appear here after tickets are added through the Ticketing Ledger. No
            ticketing records are currently read from or written to the database.
          </p>
        </div>
      </section>

      <section aria-labelledby="schedule-workflow-title" className="rounded-2xl bg-slate-900 p-5">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">
            Planned workflow
          </p>
          <h2 id="schedule-workflow-title" className="mt-1 text-xl font-black text-white">
            Schedule-change handling
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Once ledger data is enabled, staff will mark a detected change, review the revised
            itinerary, then finalise it to update the active flight details directly from this
            overview.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {SCHEDULE_WORKFLOW.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.title} className={`rounded-2xl p-4 ring-1 ${step.tone}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-sm font-black">
                    {index + 1}
                  </span>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <h3 className="font-black">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-5 opacity-80">{step.description}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
