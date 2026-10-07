import { ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react'
import { SectionHeader } from './SectionHeader'

export type PosConfigurationOverviewMetric = {
  label: string
  value: number
  icon: LucideIcon
}

type PosConfigurationOverviewProps = {
  overviewCards: PosConfigurationOverviewMetric[]
  integrityIssues: string[]
}

export default function PosConfigurationOverview({
  overviewCards,
  integrityIssues,
}: PosConfigurationOverviewProps) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map(({ label, value, icon: Icon }) => (
          <article
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                {label}
              </p>
              <Icon className="h-4 w-4 text-emerald-700" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Configuration health"
            description="Checks active records for confusing duplicates."
          />
          <div className="p-4">
            {integrityIssues.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-black">No duplicates detected</p>
                  <p className="mt-0.5 text-xs">
                    Category labels, service labels, supplier identities and assignments are
                    distinct.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {integrityIssues.map((issue) => (
                  <p
                    key={issue}
                    className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"
                  >
                    {issue}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Where settings belong"
            description="Clear ownership prevents the same rule being configured twice."
          />
          <div className="space-y-3 p-4 text-xs text-slate-600">
            <p>
              <b className="text-slate-900">POS configuration:</b> labels, order, activation,
              transaction requirements, payment methods, suppliers and logos.
            </p>
            <p>
              <b className="text-slate-900">Loyalty module:</b> eligibility, earning rates,
              campaigns, balances and reversals. They are intentionally not editable here.
            </p>
            <p>
              <b className="text-slate-900">Historical ledger:</b> never renamed by configuration
              changes because posting stores label snapshots.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
          Recommended setup order
        </p>
        <div className="mt-3 flex flex-col gap-2 text-xs font-bold sm:flex-row sm:items-center">
          {['Categories', 'Services', 'Suppliers', 'Assignments', 'Test in POS'].map(
            (step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px]">
                  {index + 1}
                </span>
                <span>{step}</span>
                {index < 4 && <ArrowRight className="hidden h-3.5 w-3.5 text-slate-500 sm:block" />}
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  )
}
