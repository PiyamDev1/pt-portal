'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  FileSpreadsheet,
  Landmark,
  LockKeyhole,
  Plus,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'

type ViewMode = 'manager' | 'hq'
type EntryKind = 'income' | 'expense'

type BranchEntry = {
  id: string
  branch: string
  date: string
  title: string
  category: string
  method: string
  amount: number
  kind: EntryKind
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

const BRANCHES = ['Manchester', 'Bradford', 'Birmingham']

const ENTRIES: BranchEntry[] = [
  {
    id: 'income-1',
    branch: 'Manchester',
    date: '13 Sep',
    title: 'Application & document services',
    category: 'Applications',
    method: 'Card & cash',
    amount: 1840,
    kind: 'income',
  },
  {
    id: 'income-2',
    branch: 'Manchester',
    date: '12 Sep',
    title: 'Ticketing sales received',
    category: 'Ticketing',
    method: 'Card clearing',
    amount: 2470,
    kind: 'income',
  },
  {
    id: 'income-3',
    branch: 'Manchester',
    date: '11 Sep',
    title: 'Umrah package deposits',
    category: 'Packages',
    method: 'Bank transfer',
    amount: 3600,
    kind: 'income',
  },
  {
    id: 'income-4',
    branch: 'Manchester',
    date: '09 Sep',
    title: 'LMS instalment payments',
    category: 'Customer payments',
    method: 'Bank transfer',
    amount: 920,
    kind: 'income',
  },
  {
    id: 'expense-1',
    branch: 'Manchester',
    date: '13 Sep',
    title: 'Gas & electricity',
    category: 'Utilities',
    method: 'Direct debit',
    amount: 318.42,
    kind: 'expense',
  },
  {
    id: 'expense-2',
    branch: 'Manchester',
    date: '12 Sep',
    title: 'Staff commission provision',
    category: 'Commissions',
    method: 'Accrual',
    amount: 486,
    kind: 'expense',
  },
  {
    id: 'expense-3',
    branch: 'Manchester',
    date: '10 Sep',
    title: 'Monthly payroll allocation',
    category: 'Wages',
    method: 'Bank transfer',
    amount: 2840,
    kind: 'expense',
  },
  {
    id: 'expense-4',
    branch: 'Manchester',
    date: '09 Sep',
    title: 'NADRA processing fees',
    category: 'Supplier costs',
    method: 'Bank transfer',
    amount: 720,
    kind: 'expense',
  },
  {
    id: 'income-5',
    branch: 'Bradford',
    date: '13 Sep',
    title: 'Application & document services',
    category: 'Applications',
    method: 'Card & cash',
    amount: 1260,
    kind: 'income',
  },
  {
    id: 'income-6',
    branch: 'Bradford',
    date: '12 Sep',
    title: 'Ticketing sales received',
    category: 'Ticketing',
    method: 'Card clearing',
    amount: 1880,
    kind: 'income',
  },
  {
    id: 'income-7',
    branch: 'Bradford',
    date: '10 Sep',
    title: 'Walk-in service income',
    category: 'POS services',
    method: 'Cash',
    amount: 540,
    kind: 'income',
  },
  {
    id: 'expense-5',
    branch: 'Bradford',
    date: '13 Sep',
    title: 'Premises rent',
    category: 'Rent',
    method: 'Bank transfer',
    amount: 1320,
    kind: 'expense',
  },
  {
    id: 'expense-6',
    branch: 'Bradford',
    date: '11 Sep',
    title: 'Monthly payroll allocation',
    category: 'Wages',
    method: 'Bank transfer',
    amount: 1840,
    kind: 'expense',
  },
  {
    id: 'expense-7',
    branch: 'Bradford',
    date: '09 Sep',
    title: 'Broadband & phone',
    category: 'Utilities',
    method: 'Direct debit',
    amount: 185,
    kind: 'expense',
  },
  {
    id: 'income-8',
    branch: 'Birmingham',
    date: '13 Sep',
    title: 'Application & document services',
    category: 'Applications',
    method: 'Card & cash',
    amount: 1640,
    kind: 'income',
  },
  {
    id: 'income-9',
    branch: 'Birmingham',
    date: '11 Sep',
    title: 'Package deposits',
    category: 'Packages',
    method: 'Bank transfer',
    amount: 2100,
    kind: 'income',
  },
  {
    id: 'expense-8',
    branch: 'Birmingham',
    date: '12 Sep',
    title: 'Staff commission provision',
    category: 'Commissions',
    method: 'Accrual',
    amount: 310,
    kind: 'expense',
  },
  {
    id: 'expense-9',
    branch: 'Birmingham',
    date: '10 Sep',
    title: 'Monthly payroll allocation',
    category: 'Wages',
    method: 'Bank transfer',
    amount: 2140,
    kind: 'expense',
  },
]

function total(entries: BranchEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0)
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: typeof CircleDollarSign
  tone: string
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </section>
  )
}

function LedgerSheet({
  kind,
  entries,
  onAdd,
  onRemoveDraft,
  showDraft,
}: {
  kind: EntryKind
  entries: BranchEntry[]
  onAdd: () => void
  onRemoveDraft: () => void
  showDraft: boolean
}) {
  const isIncome = kind === 'income'
  const label = isIncome ? 'Income' : 'Expenses'
  const Icon = isIncome ? TrendingUp : TrendingDown
  const accent = isIncome
    ? {
        container: 'border-emerald-200',
        header: 'bg-emerald-700',
        total: 'text-emerald-700',
        button: 'border-emerald-200 text-emerald-800 hover:bg-emerald-50',
      }
    : {
        container: 'border-rose-200',
        header: 'bg-rose-700',
        total: 'text-rose-700',
        button: 'border-rose-200 text-rose-800 hover:bg-rose-50',
      }

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${accent.container}`}
    >
      <header className={`${accent.header} px-4 py-4 text-white sm:px-5`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black">{label}</h2>
              <p className="text-xs text-white/75">September 2026 · this branch</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-black text-slate-900 shadow-sm hover:bg-slate-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {isIncome ? 'income' : 'expense'}
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
        <span className="text-xs font-bold text-slate-500">Month to date</span>
        <span className={`text-xl font-black ${accent.total}`}>{GBP.format(total(entries))}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            <tr>
              <th className="px-4 py-3 sm:px-5">Date</th>
              <th className="px-2 py-3">Description</th>
              <th className="px-2 py-3">Category</th>
              <th className="px-2 py-3">Paid via</th>
              <th className="px-4 py-3 text-right sm:px-5">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600 sm:px-5">
                  {entry.date}
                </td>
                <td className="px-2 py-3 font-bold text-slate-900">{entry.title}</td>
                <td className="px-2 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                    {entry.category}
                  </span>
                </td>
                <td className="px-2 py-3 text-slate-500">{entry.method}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-black text-slate-900 sm:px-5">
                  {GBP.format(entry.amount)}
                </td>
              </tr>
            ))}
            {showDraft && (
              <tr className="border-b border-dashed border-slate-200 bg-amber-50/50">
                <td className="px-4 py-2 sm:px-5">
                  <input
                    aria-label={`${label} draft date`}
                    type="date"
                    className="h-8 rounded-md border border-amber-200 bg-white px-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-100"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`${label} draft description`}
                    className="h-8 w-full rounded-md border border-amber-200 bg-white px-2 text-xs outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-amber-100"
                    placeholder="Description"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`${label} draft category`}
                    className="h-8 w-full rounded-md border border-amber-200 bg-white px-2 text-xs outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-amber-100"
                    placeholder="Category"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`${label} draft method`}
                    className="h-8 w-full rounded-md border border-amber-200 bg-white px-2 text-xs outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-amber-100"
                    placeholder="Method"
                  />
                </td>
                <td className="px-4 py-2 sm:px-5">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      aria-label={`${label} draft amount`}
                      className="h-8 w-20 rounded-md border border-amber-200 bg-white px-2 text-right text-xs outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-amber-100"
                      placeholder="0.00"
                    />
                    <button
                      type="button"
                      onClick={onRemoveDraft}
                      aria-label={`Remove ${label.toLowerCase()} draft`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-rose-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs sm:px-5">
        <span className="text-slate-500">{entries.length} recorded entries</span>
        <button
          type="button"
          className={`inline-flex items-center gap-1 font-black ${accent.button}`}
        >
          View all <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </footer>
    </section>
  )
}

export default function BranchLedgerPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('hq')
  const [selectedBranch, setSelectedBranch] = useState('Manchester')
  const [draftKind, setDraftKind] = useState<EntryKind | null>(null)

  const branchEntries = useMemo(
    () => ENTRIES.filter((entry) => entry.branch === selectedBranch),
    [selectedBranch],
  )
  const income = branchEntries.filter((entry) => entry.kind === 'income')
  const expenses = branchEntries.filter((entry) => entry.kind === 'expense')
  const incomeTotal = total(income)
  const expenseTotal = total(expenses)
  const net = incomeTotal - expenseTotal

  function setMode(mode: ViewMode) {
    setViewMode(mode)
    if (mode === 'manager') setSelectedBranch('Manchester')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-black">Branch Ledger UI preview</p>
              <p className="text-xs text-amber-800">
                Sample figures only · access controls and data are not live yet
              </p>
            </div>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-900">
            Prototype
          </span>
        </div>
      </div>

      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Link
            href="/dashboard/accounting"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Accounting home
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Branch Ledger
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                A simple view of what came in and what went out
              </p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
          aria-label="Access view preview"
        >
          <button
            type="button"
            onClick={() => setMode('manager')}
            className={`rounded-lg px-3 py-2 text-xs font-black ${viewMode === 'manager' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Branch manager
          </button>
          <button
            type="button"
            onClick={() => setMode('hq')}
            className={`rounded-lg px-3 py-2 text-xs font-black ${viewMode === 'hq' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            HQ staff
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${viewMode === 'hq' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}
          >
            {viewMode === 'hq' ? (
              <Landmark className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>
          <div>
            <p className="text-sm font-black text-slate-900">
              {viewMode === 'hq' ? 'HQ staff view' : 'Branch manager view'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {viewMode === 'hq'
                ? 'Select a branch to view its ledger. HQ can see all branches one at a time.'
                : 'This view is locked to the manager’s assigned branch.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Branch</span>
          {viewMode === 'hq' ? (
            <select
              aria-label="Select branch"
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              {BRANCHES.map((branch) => (
                <option key={branch}>{branch}</option>
              ))}
            </select>
          ) : (
            <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-black text-sky-900">
              <LockKeyhole className="h-3.5 w-3.5" /> Manchester
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Branch summary">
        <SummaryMetric
          label="Income"
          value={GBP.format(incomeTotal)}
          detail="Month to date"
          icon={TrendingUp}
          tone="bg-emerald-50 text-emerald-700"
        />
        <SummaryMetric
          label="Expenses"
          value={GBP.format(expenseTotal)}
          detail="Month to date"
          icon={TrendingDown}
          tone="bg-rose-50 text-rose-700"
        />
        <SummaryMetric
          label="Net result"
          value={GBP.format(net)}
          detail={net >= 0 ? 'Income after branch costs' : 'Costs exceed income'}
          icon={CircleDollarSign}
          tone={net >= 0 ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}
        />
        <SummaryMetric
          label="Staff & commission"
          value={GBP.format(
            total(expenses.filter((entry) => ['Wages', 'Commissions'].includes(entry.category))),
          )}
          detail="Included in branch expenses"
          icon={UsersRound}
          tone="bg-violet-50 text-violet-700"
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-2">
        <LedgerSheet
          kind="income"
          entries={income}
          showDraft={draftKind === 'income'}
          onAdd={() => setDraftKind('income')}
          onRemoveDraft={() => setDraftKind(null)}
        />
        <LedgerSheet
          kind="expense"
          entries={expenses}
          showDraft={draftKind === 'expense'}
          onAdd={() => setDraftKind('expense')}
          onRemoveDraft={() => setDraftKind(null)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                What is included
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Clear branch categories</h2>
            </div>
            <ReceiptText className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs font-black text-emerald-900">Income</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Applications, POS services, ticketing, package payments, instalments and other
                branch income.
              </p>
            </div>
            <div className="rounded-xl bg-rose-50 p-3">
              <p className="text-xs font-black text-rose-900">Expenses</p>
              <p className="mt-1 text-xs leading-5 text-rose-800">
                Wages, commissions, rent, utility bills, supplier costs, refunds and other branch
                costs.
              </p>
            </div>
          </div>
        </div>
        <aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-emerald-400" />
            <p className="font-black">Implementation safeguard</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-300">
            When connected, the branch is determined on the server from the employee record. HQ may
            choose a branch; a branch manager never receives another branch’s rows from the API.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-black text-emerald-300">
            <CalendarDays className="h-3.5 w-3.5" /> September 2026
          </div>
        </aside>
      </section>
    </div>
  )
}
