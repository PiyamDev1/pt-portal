import type { CommissionSourceModuleStatus } from '@/lib/commissions/server'
import { moneyFormatter } from './CommissionProfileSummary'

type CommissionSourceCoveragePanelProps = {
  modules: CommissionSourceModuleStatus[]
  packageIntegrationReady: boolean
  applicationIntegrationReady: boolean
}

export default function CommissionSourceCoveragePanel({
  modules,
  packageIntegrationReady,
  applicationIntegrationReady,
}: CommissionSourceCoveragePanelProps) {
  const money = moneyFormatter()

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
            Source coverage
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            Commission across operational modules
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Ticketing, closed Packages, and completed Applications feed the same correction-safe
            preview ledger. Payroll remains disconnected until shadow reconciliation is signed off.
          </p>
        </div>
        {(!packageIntegrationReady || !applicationIntegrationReady) && (
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
            Commission database upgrade required
          </span>
        )}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {modules.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 md:col-span-3">
            Source-module health becomes available after the Commission integration migrations.
          </p>
        ) : (
          modules.map((module) => (
            <article key={module.sourceModule} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{module.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {module.processedEvents} processed · {module.pendingEvents} waiting ·{' '}
                    {module.heldEvents} held
                  </p>
                </div>
                <span className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">
                  {money.format(module.totalGbp)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  {module.activeEntries} active entries
                </span>
                {module.closedRecordsMissingEvent > 0 && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                    {module.closedRecordsMissingEvent}{' '}
                    {module.sourceModule === 'applications'
                      ? 'completed applications need capture'
                      : 'closed records need capture'}
                  </span>
                )}
                {module.closedRecordsMissingOwner > 0 && (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800">
                    {module.closedRecordsMissingOwner}{' '}
                    {module.sourceModule === 'applications'
                      ? 'missing responsible staff'
                      : 'missing sales owner'}
                  </span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
