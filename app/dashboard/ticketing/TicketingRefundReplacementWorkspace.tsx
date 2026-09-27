'use client'

import { Calculator, Link2 } from 'lucide-react'
import { useState } from 'react'
import { TicketCancellationCalculator } from './refund-calculator/TicketCancellationCalculator'
import { RefundRegister } from './refund-calculator/RefundRegister'
import { ReplacementCasesClient } from './replacement-cases/ReplacementCasesClient'

type WorkspaceTab = 'refund' | 'replacement'

export function TicketingRefundReplacementWorkspace({
  isSuperAdmin,
  initialTab = 'refund',
  initialPnr = '',
}: {
  isSuperAdmin: boolean
  initialTab?: WorkspaceTab
  initialPnr?: string
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1e2d] to-slate-900 p-5 text-white shadow-xl shadow-red-950/15 md:p-7">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
          Ticketing adjustments
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Refunds & replacements</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-red-50/85 md:text-base">
          Start with a refund or cancellation. Switch to Replacement Cases when new tickets,
          responsibility or later exchanges need to be tracked separately.
        </p>
      </section>

      <nav
        aria-label="Refund and replacement workflows"
        className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab('refund')}
          aria-current={activeTab === 'refund' ? 'page' : undefined}
          className={`flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
            activeTab === 'refund'
              ? 'bg-[#8b1e2d] text-white shadow-md shadow-red-950/15'
              : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Calculator className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-black">Refund</span>
            <span
              className={`block text-xs ${activeTab === 'refund' ? 'text-red-100' : 'text-slate-500'}`}
            >
              Cancellation, refund or exchange
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('replacement')}
          aria-current={activeTab === 'replacement' ? 'page' : undefined}
          className={`flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
            activeTab === 'replacement'
              ? 'bg-[#8b1e2d] text-white shadow-md shadow-red-950/15'
              : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Link2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-black">Replacement Cases</span>
            <span
              className={`block text-xs ${activeTab === 'replacement' ? 'text-red-100' : 'text-slate-500'}`}
            >
              Multi-ticket loss and later changes
            </span>
          </span>
        </button>
      </nav>

      {activeTab === 'refund' ? (
        <div className="space-y-8">
          <TicketCancellationCalculator isSuperAdmin={isSuperAdmin} />
          <RefundRegister initialPnr={initialPnr} />
        </div>
      ) : (
        <ReplacementCasesClient />
      )}
    </div>
  )
}
