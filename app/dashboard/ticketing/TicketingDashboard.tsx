import {
  BookOpenText,
  BadgePoundSterling,
  Calculator,
  CheckCircle2,
  Construction,
  PlaneTakeoff,
  TicketX,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { FlightMonitoringPanel } from './FlightMonitoringPanel'

const TICKETING_MODULES = [
  {
    title: 'Refund Calculator',
    description:
      'Calculate a safe customer refund or apply its value to a replacement ticket without hiding company costs.',
    icon: Calculator,
    tone: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    iconTone: 'bg-amber-100 text-amber-800',
    href: '/dashboard/ticketing/refund-calculator',
    available: true,
    actionLabel: 'Open calculator',
  },
  {
    title: 'My Sales Ledger',
    description: 'Enter held or issued TK tickets quickly and review your own ticket records.',
    icon: BookOpenText,
    tone: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50',
    iconTone: 'bg-sky-100 text-sky-800',
    href: '/dashboard/ticketing/ledger',
    available: true,
    actionLabel: 'Open ledger',
  },
  {
    title: 'Low Fare',
    description:
      'Review issued tickets from all agents and record changed whole-PNR supplier fares.',
    icon: BadgePoundSterling,
    tone: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50',
    iconTone: 'bg-emerald-100 text-emerald-800',
    href: '/dashboard/ticketing/low-fare',
    available: true,
    actionLabel: 'Open Low Fare',
  },
  {
    title: 'Ticket Vouchers',
    description:
      'Track cancelled passenger tickets until their airline claim, refund or same-airline reuse is completed.',
    icon: TicketX,
    tone: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50',
    iconTone: 'bg-violet-100 text-violet-800',
    href: '/dashboard/ticketing/vouchers',
    available: true,
    actionLabel: 'Open vouchers',
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
              Record ticket activity quickly, review Low Fare and monitor every agent&apos;s
              upcoming flights from one workspace.
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
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
            4 tools available
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TICKETING_MODULES.map((moduleItem) => {
            const Icon = moduleItem.icon
            return (
              <Link
                key={moduleItem.title}
                href={moduleItem.href}
                className={`rounded-2xl border p-4 shadow-sm ${moduleItem.tone}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${moduleItem.iconTone}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-col items-start gap-1.5">
                      <h3 className="text-base font-black leading-tight text-slate-950">
                        {moduleItem.title}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${
                          moduleItem.available
                            ? 'text-emerald-700 ring-emerald-200'
                            : 'text-slate-500 ring-slate-200'
                        }`}
                      >
                        {moduleItem.available ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Construction className="h-3 w-3" aria-hidden="true" />
                        )}
                        {moduleItem.available ? 'Available' : 'Coming soon'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-600">
                      {moduleItem.description}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-slate-700">
                      {moduleItem.actionLabel}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <FlightMonitoringPanel />
    </div>
  )
}
