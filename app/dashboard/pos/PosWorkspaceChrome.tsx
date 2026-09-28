'use client'

import type { ComponentType } from 'react'
import {
  Banknote,
  BarChart3,
  Coins,
  CreditCard,
  FileText,
  Landmark,
  LayoutDashboard,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Store,
} from 'lucide-react'

import { PosRegisterIcon } from '@/app/components/icons/PosRegisterIcon'
import type { PosLedgerSummary } from '@/lib/pos/contracts'
import { formatMoney, formatSignedMoney } from '@/lib/pos/format'
import type { PosWorkspaceView } from './PosOperationsPanel'

type IconComponent = ComponentType<{ className?: string }>

const NAV_ITEMS: Array<{
  label: PosWorkspaceView
  icon: IconComponent
  managerOnly?: boolean
  tourTarget: string
}> = [
  {
    label: 'Daily transactions',
    icon: LayoutDashboard,
    tourTarget: 'nav-daily-transactions',
  },
  { label: 'Open till', icon: Store, tourTarget: 'nav-open-till' },
  { label: 'Closeout', icon: ShieldCheck, tourTarget: 'nav-closeout' },
  { label: 'Cash management', icon: Coins, tourTarget: 'nav-cash-management' },
  {
    label: 'Refunds & corrections',
    icon: RotateCcw,
    tourTarget: 'nav-refunds-corrections',
  },
  { label: 'Reports', icon: BarChart3, tourTarget: 'nav-reports' },
  { label: 'Unreconciled', icon: RefreshCcw, tourTarget: 'nav-unreconciled' },
  {
    label: 'Import history',
    icon: FileText,
    managerOnly: true,
    tourTarget: 'nav-import-history',
  },
]

function availableNavItems(canManage: boolean) {
  return NAV_ITEMS.filter((item) => !item.managerOnly || canManage)
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: IconComponent
  tone: string
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <p className="text-lg font-black tracking-tight text-slate-950">{value}</p>
            <p className="text-[10px] text-slate-500">{detail}</p>
          </div>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </article>
  )
}

export function PosSummaryStrip({
  period,
  summary,
}: {
  period: 'day' | 'month'
  summary: PosLedgerSummary
}) {
  const periodLabel = period === 'month' ? 'Month' : 'Day'

  return (
    <section data-pos-tour="summaries" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label={`${periodLabel} cash net`}
        value={formatSignedMoney(summary.cashNet)}
        detail="Posted cash tenders"
        icon={Banknote}
        tone="bg-emerald-50 text-emerald-700"
      />
      <SummaryCard
        label={`${periodLabel} card net`}
        value={formatSignedMoney(summary.cardNet)}
        detail={`${summary.unreconciledCount} unreconciled tender${summary.unreconciledCount === 1 ? '' : 's'}`}
        icon={CreditCard}
        tone="bg-blue-50 text-blue-700"
      />
      <SummaryCard
        label={`${periodLabel} bank net`}
        value={formatSignedMoney(summary.bankNet)}
        detail="Recorded bank tenders"
        icon={Landmark}
        tone="bg-violet-50 text-violet-700"
      />
      <SummaryCard
        label="Net movement"
        value={formatSignedMoney(summary.netMovement)}
        detail={`${formatMoney(summary.moneyIn)} in · ${formatMoney(summary.moneyOut)} out`}
        icon={Coins}
        tone="bg-amber-50 text-amber-700"
      />
    </section>
  )
}

export function PosWorkspaceMobileNavigation({
  activeView,
  canManage,
  onChange,
}: {
  activeView: PosWorkspaceView
  canManage: boolean
  onChange: (view: PosWorkspaceView) => void
}) {
  return (
    <label className="block xl:hidden">
      <span className="sr-only">POS workspace section</span>
      <select
        aria-label="POS workspace section"
        value={activeView}
        onChange={(event) => onChange(event.target.value as PosWorkspaceView)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-sm"
      >
        {availableNavItems(canManage).map((item) => (
          <option key={item.label}>{item.label}</option>
        ))}
      </select>
    </label>
  )
}

export function PosWorkspaceNavigation({
  activeView,
  canManage,
  onChange,
}: {
  activeView: PosWorkspaceView
  canManage: boolean
  onChange: (view: PosWorkspaceView) => void
}) {
  return (
    <aside
      data-pos-tour="workspace-nav"
      className="group/posnav order-1 z-20 hidden w-16 overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm transition-[width,box-shadow] duration-200 hover:w-52 hover:shadow-xl focus-within:w-52 xl:block"
    >
      <div className="flex h-12 items-center border-b border-slate-200 bg-slate-950 px-4 text-white">
        <PosRegisterIcon className="h-5 w-5 shrink-0" />
        <div className="ml-3 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/posnav:opacity-100 group-focus-within/posnav:opacity-100">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            POS menu
          </p>
          <p className="text-xs font-black">Workspace</p>
        </div>
      </div>
      <nav className="space-y-1 p-2" aria-label="POS navigation">
        {availableNavItems(canManage).map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              data-pos-tour={item.tourTarget}
              onClick={() => onChange(item.label)}
              title={item.label}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${
                activeView === item.label
                  ? 'bg-red-50 text-[#8b1e2d]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/posnav:opacity-100 group-focus-within/posnav:opacity-100">
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
