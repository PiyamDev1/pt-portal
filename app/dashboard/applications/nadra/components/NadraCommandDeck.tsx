/**
 * NADRA Command Deck
 * Summary and action shell for NADRA list filters, stats, and auxiliary controls.
 *
 * @module app/dashboard/applications/nadra/components/NadraCommandDeck
 */

import type { ReactNode } from 'react'
import type { NadraApplication } from '@/app/types/nadra'
import StatsOverview from './StatsOverview'

type NadraCommandDeckProps = {
  applications: NadraApplication[]
  visibleCount: number
  familyCount: number
  complaintsCount: number
  activeFilterCount: number
  children: ReactNode
}

export default function NadraCommandDeck({
  applications,
  visibleCount,
  familyCount,
  complaintsCount,
  activeFilterCount,
  children,
}: NadraCommandDeckProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-600/30 bg-gradient-to-br from-[#1a4a2e] via-[#1f5c38] to-[#162e20] px-4 py-3 shadow-xl shadow-[#1f5c38]/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(74,222,128,0.08),transparent_36%),radial-gradient(circle_at_88%_14%,rgba(34,197,94,0.05),transparent_40%)]" />

      <div className="relative space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-900/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur-sm">
            NADRA Command Deck
          </span>

          <div className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">
                Visible
              </span>
              <span className="font-black text-sm">{visibleCount}</span>
            </div>
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">
                Families
              </span>
              <span className="font-black text-sm">{familyCount}</span>
            </div>
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">
                Complaints
              </span>
              <span className="font-black text-sm">{complaintsCount}</span>
            </div>
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">
                Filters
              </span>
              <span className="font-black text-sm">{activeFilterCount}</span>
            </div>
          </div>
        </div>

        <StatsOverview applications={applications} />
        {children}
      </div>
    </section>
  )
}
