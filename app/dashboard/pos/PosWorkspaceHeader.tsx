import { HelpCircle } from 'lucide-react'
import { PosRegisterIcon } from '@/app/components/icons/PosRegisterIcon'

type PosWorkspaceHeaderProps = {
  modeLabel: string
  upgradePending: boolean
  branchName: string
  tutorialOpen: boolean
  syncTitle: string
  syncModeLabel: string
  syncStatusLabel: string
  onOpenTutorial: () => void
}

export default function PosWorkspaceHeader({
  modeLabel,
  upgradePending,
  branchName,
  tutorialOpen,
  syncTitle,
  syncModeLabel,
  syncStatusLabel,
  onOpenTutorial,
}: PosWorkspaceHeaderProps) {
  return (
    <section
      data-pos-tour="header"
      className="relative overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-[#351017] via-[#7f1d2d] to-slate-900 px-4 py-3 text-white shadow-xl shadow-red-950/15 sm:px-5"
    >
      <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-red-300/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/12 shadow-inner ring-1 ring-white/20">
            <PosRegisterIcon className="h-7 w-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-100">
                Point of sale
              </p>
              <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-950">
                {modeLabel}
              </span>
              {upgradePending && (
                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-950">
                  Upgrade pending
                </span>
              )}
            </div>
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">Daily transactions</h1>
            <p className="text-xs text-red-50/80">
              Branch-scoped ledger, till, payments, loyalty and closeout
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:flex">
          <div
            data-pos-tour="branch"
            className="rounded-xl bg-black/15 px-3 py-2 ring-1 ring-white/15"
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-100">Branch</p>
            <p className="text-xs font-black">{branchName}</p>
          </div>
          <div
            data-pos-tour="sync"
            title={syncTitle}
            aria-live="polite"
            className={`rounded-xl px-3 py-2 ring-1 ${
              tutorialOpen
                ? 'bg-amber-300/15 ring-amber-200/25'
                : 'bg-emerald-400/15 ring-emerald-200/25'
            }`}
          >
            <p
              className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
                tutorialOpen ? 'text-amber-100' : 'text-emerald-100'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${tutorialOpen ? 'bg-amber-300' : 'bg-emerald-300'}`}
              />{' '}
              {syncModeLabel}
            </p>
            <p className="text-xs font-black">{syncStatusLabel}</p>
          </div>
          <button
            type="button"
            onClick={onOpenTutorial}
            data-pos-tour="tutorial-button"
            aria-label="Open POS tutorial"
            title="Open the step-by-step POS tutorial"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 text-red-50 ring-1 ring-white/20 transition hover:bg-white/20"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  )
}
