import Link from 'next/link'
import { ArrowRight, ChartNoAxesColumnIncreasing, FileText } from 'lucide-react'

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
        <Link
          href="/dashboard/accounting/applications"
          className="group flex max-w-2xl items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
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
      </section>
    </div>
  )
}
