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
  carriedFrom?: string
}
type LedgerMonth = { label: string; finalized: boolean; items: LedgerItem[] }

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})
const BRANCHES = ['Manchester', 'Bradford', 'Birmingham']
const INCOME_GROUPS = ['Commissions & transfers', 'Document & travel services', 'Other income']
const EXPENSE_GROUPS = [
  'Operating costs',
  'Premises & finance',
  'Bills & subscriptions',
  'Professional & statutory',
  'People',
  'Donations & other',
]

function nextMonthLabel(label: string) {
  const date = new Date(label.slice(0, -5) + ' 1, ' + label.slice(-4))
  date.setMonth(date.getMonth() + 1)
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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
        <span className={'flex h-10 w-10 items-center justify-center rounded-xl ' + tone}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </section>
  )
}

function BlankEntry({
  group,
  kind,
  disabled,
  onAdd,
}: {
  group: string
  kind: LedgerKind
  disabled: boolean
  onAdd: (label: string, amount: number) => void
}) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const prefix = kind === 'income' ? 'Income ' : 'Expenses '
  function add() {
    const parsed = Number(amount)
    if (!label.trim() || !Number.isFinite(parsed) || parsed < 0) return
    onAdd(label.trim(), parsed)
    setLabel('')
    setAmount('')
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_104px_42px] items-center gap-2 border-t border-dashed border-slate-200 bg-amber-50/40 px-4 py-2.5 sm:px-5">
      <input
        aria-label={prefix + group + ' new item'}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        disabled={disabled}
        placeholder="New item"
        className="h-8 min-w-0 rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      <input
        aria-label={prefix + group + ' new amount'}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        disabled={disabled}
        inputMode="decimal"
        placeholder="£ 0.00"
        className="h-8 min-w-0 rounded-lg border border-amber-200 bg-white px-2 text-right font-mono text-xs font-black text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        aria-label={'Add item to ' + group}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

function CategorySheet({
  kind,
  groups,
  items,
  finalized,
  editingId,
  editValue,
  onEdit,
  onEditValue,
  onSave,
  onCancel,
  onAdd,
}: {
  kind: LedgerKind
  groups: string[]
  items: LedgerItem[]
  finalized: boolean
  editingId: string | null
  editValue: string
  onEdit: (item: LedgerItem) => void
  onEditValue: (value: string) => void
  onSave: () => void
  onCancel: () => void
  onAdd: (group: string, label: string, amount: number) => void
}) {
  const income = kind === 'income'
  const total = items.reduce((sum, item) => sum + item.amount, 0)
  const border = income ? 'border-emerald-200' : 'border-rose-200'
  const header = income ? 'bg-emerald-700' : 'bg-rose-700'
  const totalTone = income ? 'text-emerald-700' : 'text-rose-700'
  const actionTone = income
    ? 'text-emerald-700 hover:bg-emerald-50'
    : 'text-rose-700 hover:bg-rose-50'
  const sheetLabel = income ? 'Income' : 'Expenses'
  return (
    <section className={'overflow-hidden rounded-2xl border bg-white shadow-sm ' + border}>
      <header
        className={header + ' flex items-center justify-between px-4 py-4 text-white sm:px-5'}
      >
        <div>
          <h2 className="text-lg font-black">{sheetLabel}</h2>
          <p className="mt-0.5 text-xs text-white/75">
            Category-led monthly sheet · no fixed items
          </p>
        </div>
        <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]">
          {finalized ? 'Finalised' : 'Open month'}
        </span>
      </header>
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
        <span className="text-xs font-bold text-slate-500">Month total</span>
        <span className={'text-xl font-black ' + totalTone}>{GBP.format(total)}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {groups.map((group) => {
          const categoryItems = items.filter((item) => item.group === group)
          return (
            <div key={group}>
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 sm:px-5">
                <p className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-500">
                  {group}
                </p>
                <span className="text-[10px] font-bold text-slate-400">
                  {categoryItems.length
                    ? String(categoryItems.length) +
                      ' item' +
                      (categoryItems.length === 1 ? '' : 's')
                    : 'Add first item'}
                </span>
              </div>
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_104px_42px] items-center gap-2 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">{item.label}</p>
                    {item.carriedFrom && (
                      <span className="mt-1 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
                        Carried from {item.carriedFrom}
                      </span>
                    )}
                  </div>
                  {editingId === item.id ? (
                    <input
                      aria-label={'Edit ' + item.label + ' amount'}
                      autoFocus
                      value={editValue}
                      onChange={(event) => onEditValue(event.target.value)}
                      className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-2 text-right font-mono text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-100"
                    />
                  ) : (
                    <p className="text-right font-mono text-xs font-black text-slate-900">
                      {item.amount ? GBP.format(item.amount) : '—'}
                    </p>
                  )}
                  <div className="flex justify-end">
                    {editingId === item.id ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label={'Save ' + item.label + ' amount'}
                          onClick={onSave}
                          className="rounded-md bg-emerald-700 p-1.5 text-white hover:bg-emerald-800"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={'Cancel ' + item.label + ' edit'}
                          onClick={onCancel}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={'Quick edit ' + item.label}
                        disabled={finalized}
                        onClick={() => onEdit(item)}
                        className={
                          'rounded-md p-1.5 disabled:cursor-not-allowed disabled:text-slate-300 ' +
                          actionTone
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <BlankEntry
                group={group}
                kind={kind}
                disabled={finalized}
                onAdd={(label, amount) => onAdd(group, label, amount)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function BranchLedgerPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('hq')
  const [selectedBranch, setSelectedBranch] = useState('Manchester')
  const [months, setMonths] = useState<LedgerMonth[]>([
    { label: 'September 2026', finalized: false, items: [] },
  ])
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const currentMonth = months[currentMonthIndex]
  const incomeItems = currentMonth.items.filter((item) => item.kind === 'income')
  const expenseItems = currentMonth.items.filter((item) => item.kind === 'expense')
  const incomeTotal = incomeItems.reduce((sum, item) => sum + item.amount, 0)
  const expenseTotal = expenseItems.reduce((sum, item) => sum + item.amount, 0)

  function switchMode(mode: ViewMode) {
    setViewMode(mode)
    if (mode === 'manager') setSelectedBranch('Manchester')
  }
  function addItem(kind: LedgerKind, group: string, label: string, amount: number) {
    setMonths((current) =>
      current.map((month, index) =>
        index === currentMonthIndex
          ? {
              ...month,
              items: [
                ...month.items,
                {
                  id: kind + '-' + Date.now() + '-' + month.items.length,
                  kind,
                  group,
                  label,
                  amount,
                },
              ],
            }
          : month,
      ),
    )
  }
  function startEdit(item: LedgerItem) {
    setEditingId(item.id)
    setEditValue(String(item.amount))
  }
  function saveEdit() {
    if (!editingId) return
    const amount = Number(editValue)
    if (Number.isFinite(amount) && amount >= 0)
      setMonths((current) =>
        current.map((month, index) =>
          index === currentMonthIndex
            ? {
                ...month,
                items: month.items.map((item) =>
                  item.id === editingId ? { ...item, amount } : item,
                ),
              }
            : month,
        ),
      )
    setEditingId(null)
  }
  function finalizeMonth() {
    if (currentMonth.finalized) return
    const carried = currentMonth.items.map((item, index) => ({
      ...item,
      id: item.kind + '-carry-' + (currentMonthIndex + 1) + '-' + index,
      amount: 0,
      carriedFrom: currentMonth.label,
    }))
    setMonths((current) => [
      ...current.map((month, index) =>
        index === currentMonthIndex ? { ...month, finalized: true } : month,
      ),
      { label: nextMonthLabel(currentMonth.label), finalized: false, items: carried },
    ])
    setCurrentMonthIndex(months.length)
    setEditingId(null)
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
                Add items under your own categories, then carry the finished sheet into the next
                month
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
                A flexible monthly sheet that grows with your branch
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
            className={
              'rounded-lg px-3 py-2 text-xs font-black ' +
              (viewMode === 'manager'
                ? 'bg-slate-950 text-white'
                : 'text-slate-500 hover:bg-slate-50')
            }
          >
            Branch manager
          </button>
          <button
            type="button"
            onClick={() => switchMode('hq')}
            className={
              'rounded-lg px-3 py-2 text-xs font-black ' +
              (viewMode === 'hq' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50')
            }
          >
            HQ staff
          </button>
        </div>
      </header>
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className={
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
              (viewMode === 'hq' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700')
            }
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
      <section className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Monthly sheet
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {months.map((month, index) => (
              <button
                key={month.label}
                type="button"
                onClick={() => {
                  setCurrentMonthIndex(index)
                  setEditingId(null)
                }}
                className={
                  'rounded-lg px-3 py-1.5 text-xs font-black ' +
                  (index === currentMonthIndex
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }
              >
                {month.label + (month.finalized ? ' · finalised' : '')}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={finalizeMonth}
          disabled={currentMonth.finalized}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Check className="h-4 w-4" /> Finalise {currentMonth.label}
        </button>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Branch summary">
        <Metric
          label="Income"
          value={GBP.format(incomeTotal)}
          detail="Current month"
          icon={TrendingUp}
          tone="bg-emerald-50 text-emerald-700"
        />
        <Metric
          label="Expenses"
          value={GBP.format(expenseTotal)}
          detail="Current month"
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
              .reduce((sum, item) => sum + item.amount, 0),
          )}
          detail="Wages and commissions"
          icon={UsersRound}
          tone="bg-violet-50 text-violet-700"
        />
      </section>
      <section className="grid gap-4 2xl:grid-cols-2">
        <CategorySheet
          kind="income"
          groups={INCOME_GROUPS}
          items={incomeItems}
          finalized={currentMonth.finalized}
          editingId={editingId}
          editValue={editValue}
          onEdit={startEdit}
          onEditValue={setEditValue}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
          onAdd={(group, label, amount) => addItem('income', group, label, amount)}
        />
        <CategorySheet
          kind="expense"
          groups={EXPENSE_GROUPS}
          items={expenseItems}
          finalized={currentMonth.finalized}
          editingId={editingId}
          editValue={editValue}
          onEdit={startEdit}
          onEditValue={setEditValue}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
          onAdd={(group, label, amount) => addItem('expense', group, label, amount)}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                How the months work
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Your categories stay stable; your items do not have to
              </h2>
            </div>
            <ReceiptText className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Enter an item underneath the relevant category. When you finalise a month, its entries
            are locked and their names are carried into the following month with blank amounts—so
            recurring items are ready to update, while no value is copied accidentally.
          </p>
        </div>
        <aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-emerald-400" />
            <p className="font-black">Access safeguard</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-300">
            The future API will resolve branch scope server-side. HQ can select a branch; a
            manager’s request never returns another branch’s ledger.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-black text-emerald-300">
            <CalendarDays className="h-3.5 w-3.5" /> {currentMonth.label}
          </div>
        </aside>
      </section>
    </div>
  )
}
