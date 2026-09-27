import Link from 'next/link'
import {
  ArrowRight,
  BadgePoundSterling,
  ChartNoAxesColumnIncreasing,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Package,
  Settings2,
  Ticket,
  WalletCards,
} from 'lucide-react'

export const metadata = {
  title: 'Accounting - PT Portal',
  description: 'Accounting reports and operational analysis',
}

export default function AccountingPage() {
  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <ChartNoAxesColumnIncreasing className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Accounting</h1>
            <p className="mt-1 text-sm text-slate-500">Reports and analysis</p>
          </div>
        </div>
      </header>

      <section aria-labelledby="accounting-reports-title">
        <h2
          id="accounting-reports-title"
          className="mb-3 text-xs font-black uppercase text-slate-500"
        >
          Reports
        </h2>
        <div className="grid max-w-4xl gap-3 md:grid-cols-2">
          <Link
            href="/dashboard/accounting/ledger"
            className="group flex items-center gap-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm transition hover:border-emerald-400 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900">Branch Ledger</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-800">
                  Live
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Live branch income, expenses, module profit and company balances
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-emerald-600 transition group-hover:translate-x-1 group-hover:text-emerald-800" />
          </Link>

          <Link
            href="/dashboard/accounting/applications"
            className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-slate-900">Applications</h3>
              <p className="mt-1 text-sm text-slate-500">
                Monthly totals by application and category
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" />
          </Link>

          <Link
            href="/dashboard/accounting/pos-configuration"
            className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-slate-900">POS configuration</h3>
              <p className="mt-1 text-sm text-slate-500">
                Categories, services, suppliers and assignments
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" />
          </Link>

          <Link
            href="/dashboard/accounting/commissions"
            className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <BadgePoundSterling className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-slate-900">Commission review</h3>
              <p className="mt-1 text-sm text-slate-500">
                Double-check, return or lock staff Commission statements
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="accounting-sources-title">
        <h2
          id="accounting-sources-title"
          className="mb-3 text-xs font-black uppercase text-slate-500"
        >
          Operational sources
        </h2>
        <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: 'Ticketing',
              description: 'Ticket sales, supplier costs and refunds feed branch reporting.',
              href: '/dashboard/ticketing',
              icon: Ticket,
            },
            {
              title: 'Packages',
              description: 'Package reservations and customer payments remain source-owned.',
              href: '/dashboard/packages',
              icon: Package,
            },
            {
              title: 'POS',
              description: 'Till income, expenses and supplier movements by branch.',
              href: '/dashboard/pos',
              icon: WalletCards,
            },
            {
              title: 'LMS',
              description: 'Company-wide customer and company balances live in Company Ledger.',
              href: '/dashboard/lms',
              icon: GraduationCap,
            },
          ].map((source) => {
            const Icon = source.icon
            return (
              <Link
                key={source.title}
                href={source.href}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <Icon className="h-5 w-5 text-violet-700" />
                <h3 className="mt-3 font-black text-slate-900">{source.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{source.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-black text-violet-700 group-hover:text-violet-900">
                  Open source module <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
