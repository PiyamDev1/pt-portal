'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileSpreadsheet,
  Landmark,
  LockKeyhole,
  Pencil,
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
type LedgerKind = 'income' | 'expense'

type LedgerItem = {
  id: string
  label: string
  group: string
  amount: number
  kind: LedgerKind
  recurring?: boolean
  branch?: string
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

const BRANCHES = ['Manchester', 'Bradford', 'Birmingham']
const BRANCH_MULTIPLIERS: Record<string, number> = {
  Manchester: 1,
  Bradford: 0.68,
  Birmingham: 0.82,
}

const incomeSeed: Array<[string, string, number, boolean?]> = [
  ['TC', 'Commissions & transfers', 0],
  ['WU commission', 'Commissions & transfers', 0],
  ['RIA commission', 'Commissions & transfers', 2652],
  ['DEX commission', 'Commissions & transfers', 140],
  ['Intercity commission', 'Commissions & transfers', 36],
  ['Cargo', 'Commissions & transfers', 57.87],
  ['NADRA++', 'Document & travel services', 1322],
  ['GB passport', 'Document & travel services', 199],
  ['BRP', 'Document & travel services', 0],
  ['Visa', 'Document & travel services', 456],
  ['Rent flat', 'Other income', 1300, true],
  ['Grant', 'Other income', 0],
  ['Extra income', 'Other income', 480],
]

const expenseSeed: Array<[string, string, number, boolean?]> = [
  ['Postage', 'Operating costs', 0],
  ['Transport', 'Operating costs', 146.83],
  ['Office repair & equipment', 'Operating costs', 118.33],
  ['Supplier & service costs', 'Operating costs', 1562.5],
  ['Rent', 'Premises & finance', 0, true],
  ['Loan', 'Premises & finance', 0, true],
  ['Water', 'Premises & finance', 0, true],
  ['So Energy', 'Bills & subscriptions', 162.06, true],
  ['Verisure', 'Bills & subscriptions', 0, true],
  ['Virgin', 'Bills & subscriptions', 54.2, true],
  ['O2 mobile', 'Bills & subscriptions', 73.07, true],
  ['Lyca Mobile', 'Bills & subscriptions', 6, true],
  ['Microsoft 365 & Yahoo', 'Bills & subscriptions', 16.58, true],
  ['Direct Line insurance', 'Bills & subscriptions', 37.19, true],
  ['Bank charges', 'Professional & statutory', 10],
  ['Accountant', 'Professional & statutory', 0, true],
  ['Nest Pension', 'Professional & statutory', 0, true],
  ['HMRC taxes', 'Professional & statutory', 190],
  ['Developer fees', 'Professional & statutory', 109.72],
  ['Solicitor & court fees', 'Professional & statutory', 1050],
  ['IATA & Amadeus', 'Professional & statutory', 20, true],
  ['Wages & payees', 'People', 6105.03, true],
  ['Staff commissions', 'People', 206.76],
  ['MEA', 'Donations & other', 0],
  ['Sadqa', 'Donations & other', 0],
  ['Other donation', 'Donations & other', 0],
  ['Currency & misc', 'Donations & other', 0],
]

const FIXED_ITEMS: LedgerItem[] = [
  ...incomeSeed.map(([label, group, amount, recurring]) => ({
    id: `income-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    group,
    amount,
    kind: 'income' as const,
    recurring,
  })),
  ...expenseSeed.map(([label, group, amount, recurring]) => ({
    id: `expense-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    group,
    amount,
    kind: 'expense' as const,
    recurring,
  })),
]

function groupItems(items: LedgerItem[]) {
  return items.reduce<Record<string, LedgerItem[]>>((groups, item) => {
    groups[item.group] ||= []
    groups[item.group].push(item)
    return groups
  }, {})
}

function Metric({
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

function MonthlySheet({
  kind,
  items,
  amountFor,
  editingId,
  editValue,
  onEdit,
  onEditValue,
  onSave,
  onCancel,
}: {
  kind: LedgerKind
  items: LedgerItem[]
  amountFor: (item: LedgerItem) => number
  editingId: string | null
  editValue: string
  onEdit: (item: LedgerItem) => void
  onEditValue: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isIncome = kind === 'income'
  const label = isIncome ? 'Income' : 'Expenses'
  const groups = groupItems(items)
  const total = items.reduce((sum, item) => sum + amountFor(item), 0)
  const accent = isIncome
    ? {
        border: 'border-emerald-200',
        header: 'bg-emerald-700',
        total: 'text-emerald-700',
        action: 'text-emerald-700 hover:bg-emerald-50',
      }
    : {
        border: 'border-rose-200',
        header: 'bg-rose-700',
        total: 'text-rose-700',
        action: 'text-rose-700 hover:bg-rose-50',
      }

  return (
    <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${accent.border}`}>
      <header
        className={`${accent.header} flex items-center justify-between px-4 py-4 text-white sm:px-5`}
      >
        <div>
          <h2 className="text-lg font-black">{label}</h2>
          <p className="mt-0.5 text-xs text-white/75">Fixed monthly categories · no daily dates</p>
        </div>
        <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]">
          Monthly sheet
        </span>
      </header>
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
        <span className="text-xs font-bold text-slate-500">September total</span>
        <span className={`text-xl font-black ${accent.total}`}>{GBP.format(total)}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {Object.entries(groups).map(([group, groupEntries]) => (
          <div key={group}>
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 sm:px-5">
              <p className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-500">
                {group}
              </p>
              <span className="text-[10px] font-bold text-slate-400">
                {groupEntries.some((item) => item.recurring)
                  ? 'Includes recurring items'
                  : 'Variable items'}
              </span>
            </div>
            {groupEntries.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_116px_42px] items-center gap-2 px-4 py-2.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900">{item.label}</p>
                  {item.recurring && (
                    <span className="mt-1 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
                      Repeats monthly
                    </span>
                  )}
                </div>
                {editingId === item.id ? (
                  <input
                    aria-label={`Edit ${item.label} amount`}
                    autoFocus
                    value={editValue}
                    onChange={(event) => onEditValue(event.target.value)}
                    className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-2 text-right font-mono text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-100"
                  />
                ) : (
                  <p className="text-right font-mono text-xs font-black text-slate-900">
                    {amountFor(item) ? GBP.format(amountFor(item)) : '—'}
                  </p>
                )}
                <div className="flex justify-end">
                  {editingId === item.id ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Save ${item.label} amount`}
                        onClick={onSave}
                        className="rounded-md bg-emerald-700 p-1.5 text-white hover:bg-emerald-800"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancel ${item.label} edit`}
                        onClick={onCancel}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Quick edit ${item.label}`}
                      onClick={() => onEdit(item)}
                      className={`rounded-md p-1.5 ${accent.action}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function BranchLedgerPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('hq')
  const [selectedBranch, setSelectedBranch] = useState('Manchester')
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [quickKind, setQuickKind] = useState<LedgerKind>('expense')
  const [quickCategory, setQuickCategory] = useState('Postage')
  const [quickAmount, setQuickAmount] = useState('')
  const [quickNote, setQuickNote] = useState('')
  const [quickEntries, setQuickEntries] = useState<LedgerItem[]>([])

  const multiplier = BRANCH_MULTIPLIERS[selectedBranch] || 1
  const scopedQuickEntries = quickEntries.filter((entry) => entry.branch === selectedBranch)
  const incomeItems = [
    ...FIXED_ITEMS.filter((item) => item.kind === 'income'),
    ...scopedQuickEntries.filter((item) => item.kind === 'income'),
  ]
  const expenseItems = [
    ...FIXED_ITEMS.filter((item) => item.kind === 'expense'),
    ...scopedQuickEntries.filter((item) => item.kind === 'expense'),
  ]
  const amountFor = (item: LedgerItem) =>
    editedAmounts[item.id] ??
    (item.branch ? item.amount : Math.round(item.amount * multiplier * 100) / 100)
  const incomeTotal = incomeItems.reduce((sum, item) => sum + amountFor(item), 0)
  const expenseTotal = expenseItems.reduce((sum, item) => sum + amountFor(item), 0)
  const categoryOptions = (quickKind === 'income' ? incomeItems : expenseItems)
    .map((item) => item.label)
    .filter((label, index, all) => all.indexOf(label) === index)

  function switchMode(mode: ViewMode) {
    setViewMode(mode)
    if (mode === 'manager') setSelectedBranch('Manchester')
  }
  function startEdit(item: LedgerItem) {
    setEditingId(item.id)
    setEditValue(String(amountFor(item)))
  }
  function saveEdit() {
    if (!editingId) return
    const amount = Number(editValue)
    if (Number.isFinite(amount) && amount >= 0)
      setEditedAmounts((current) => ({ ...current, [editingId]: amount }))
    setEditingId(null)
  }
  function addQuickEntry() {
    const amount = Number(quickAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    setQuickEntries((current) => [
      ...current,
      {
        id: `quick-${Date.now()}`,
        label: quickNote.trim() || quickCategory,
        group: 'Quick entries',
        amount,
        kind: quickKind,
        branch: selectedBranch,
      },
    ])
    setQuickAmount('')
    setQuickNote('')
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
                Built from your recurring monthly worksheet · sample figures only
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
                Recurring monthly income and expenses, kept in one simple sheet
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
            onClick={() => switchMode('manager')}
            className={`rounded-lg px-3 py-2 text-xs font-black ${viewMode === 'manager' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Branch manager
          </button>
          <button
            type="button"
            onClick={() => switchMode('hq')}
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
                ? 'Select a branch to view its monthly sheet.'
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
        <Metric
          label="Income"
          value={GBP.format(incomeTotal)}
          detail="Monthly sheet total"
          icon={TrendingUp}
          tone="bg-emerald-50 text-emerald-700"
        />
        <Metric
          label="Expenses"
          value={GBP.format(expenseTotal)}
          detail="Monthly sheet total"
          icon={TrendingDown}
          tone="bg-rose-50 text-rose-700"
        />
        <Metric
          label="Net result"
          value={GBP.format(incomeTotal - expenseTotal)}
          detail="Income after branch costs"
          icon={CircleDollarSign}
          tone="bg-sky-50 text-sky-700"
        />
        <Metric
          label="People costs"
          value={GBP.format(
            expenseItems
              .filter((item) => item.group === 'People')
              .reduce((sum, item) => sum + amountFor(item), 0),
          )}
          detail="Wages and commissions"
          icon={UsersRound}
          tone="bg-violet-50 text-violet-700"
        />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-black">
              <Plus className="h-4 w-4 text-emerald-400" /> Quick entry
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Use this for a new or exceptional item. Regular lines stay fixed below.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[120px_minmax(150px,1fr)_110px_minmax(160px,1fr)_auto]">
            <select
              aria-label="Quick entry type"
              value={quickKind}
              onChange={(event) => {
                const nextKind = event.target.value as LedgerKind
                setQuickKind(nextKind)
                setQuickCategory(nextKind === 'income' ? 'TC' : 'Postage')
              }}
              className="h-10 rounded-lg border border-white/15 bg-white/10 px-2 text-sm font-bold text-white outline-none"
            >
              <option value="income" className="text-slate-900">
                Income
              </option>
              <option value="expense" className="text-slate-900">
                Expense
              </option>
            </select>
            <select
              aria-label="Quick entry category"
              value={quickCategory}
              onChange={(event) => setQuickCategory(event.target.value)}
              className="h-10 rounded-lg border border-white/15 bg-white/10 px-2 text-sm font-bold text-white outline-none"
            >
              {categoryOptions.map((category) => (
                <option key={category} className="text-slate-900">
                  {category}
                </option>
              ))}
            </select>
            <input
              aria-label="Quick entry amount"
              value={quickAmount}
              onChange={(event) => setQuickAmount(event.target.value)}
              inputMode="decimal"
              placeholder="Amount"
              className="h-10 rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-400"
            />
            <input
              aria-label="Quick entry note"
              value={quickNote}
              onChange={(event) => setQuickNote(event.target.value)}
              placeholder="Optional note"
              className="h-10 rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={addQuickEntry}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-xs font-black text-emerald-950 hover:bg-emerald-300"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
      </section>
      <section className="grid gap-4 2xl:grid-cols-2">
        <MonthlySheet
          kind="income"
          items={incomeItems}
          amountFor={amountFor}
          editingId={editingId}
          editValue={editValue}
          onEdit={startEdit}
          onEditValue={setEditValue}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
        />
        <MonthlySheet
          kind="expense"
          items={expenseItems}
          amountFor={amountFor}
          editingId={editingId}
          editValue={editValue}
          onEdit={startEdit}
          onEditValue={setEditValue}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Designed for the year
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Fixed lines first, exceptions second
              </h2>
            </div>
            <ReceiptText className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Recurring bills, wages, commissions and regular income sources stay in the same place
            every month. Quick edit changes a line amount; Quick entry adds an unusual item without
            changing the standard template.
          </p>
        </div>
        <aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-emerald-400" />
            <p className="font-black">Access safeguard</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-300">
            When implemented, branch scope is resolved on the server. HQ chooses a branch; a branch
            manager’s request never returns another branch’s sheet.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-black text-emerald-300">
            <CalendarDays className="h-3.5 w-3.5" /> September 2026
          </div>
        </aside>
      </section>
    </div>
  )
}
