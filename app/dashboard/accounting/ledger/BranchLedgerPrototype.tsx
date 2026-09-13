'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  FileSpreadsheet,
  Landmark,
  LockKeyhole,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'

type ViewMode = 'manager' | 'hq'
type LedgerView = 'branch' | 'company'
type LedgerKind = 'income' | 'expense'
type LedgerItem = {
  id: string
  label: string
  group: string
  amount: number
  kind: LedgerKind
  carriedFrom?: string
}
type NamedBalance = {
  id: string
  name: string
  start: number
  end: number
  carriedFrom?: string
}
type FinancialPosition = {
  suppliers: NamedBalance[]
  banks: NamedBalance[]
  lmsStart: number
  lmsEnd: number
  cashStart: number
  cashEnd: number
  netStart: number
  carriedFrom?: string
}
type CompanyBranchPosition = {
  cashStart: number
  cashEnd: number
  profitStart: number
  profitEnd: number
}
type LedgerMonth = {
  label: string
  finalized: boolean
  items: LedgerItem[]
  position: FinancialPosition
}
type Categories = Record<LedgerKind, string[]>

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
const SUPPLIER_SUGGESTIONS = [
  'Ria',
  'Dex',
  'Intercity',
  'Speedy Cargo',
  'Polani',
  'Mi-Travel',
  'TTBOX',
  'TBO',
  'Bedsonline',
  'Expedia Taap',
]
const BANK_SUGGESTIONS = ['Revolut', 'HSBC', 'TSB']
const EMPTY_POSITION: FinancialPosition = {
  suppliers: [],
  banks: [],
  lmsStart: 0,
  lmsEnd: 0,
  cashStart: 0,
  cashEnd: 0,
  netStart: 0,
}

function nextMonthLabel(label: string) {
  const date = new Date(label.slice(0, -5) + ' 1, ' + label.slice(-4))
  date.setMonth(date.getMonth() + 1)
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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

function InlineText({
  value,
  label,
  disabled,
  onSave,
  className,
}: {
  value: string
  label: string
  disabled: boolean
  onSave: (value: string) => boolean | void
  className: string
}) {
  const [draft, setDraft] = useState(value)
  function save() {
    const nextValue = draft.trim()
    if (!nextValue || nextValue === value) {
      setDraft(value)
      return
    }
    if (onSave(nextValue) === false) setDraft(value)
  }
  return (
    <input
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
      className={className}
    />
  )
}

function InlineAmount({
  item,
  disabled,
  onSave,
}: {
  item: LedgerItem
  disabled: boolean
  onSave: (amount: number) => void
}) {
  const [draft, setDraft] = useState(item.amount ? String(item.amount) : '')
  function save() {
    const amount = Number(draft)
    if (!Number.isFinite(amount) || amount < 0) {
      setDraft(item.amount ? String(item.amount) : '')
      return
    }
    onSave(amount)
  }
  return (
    <input
      aria-label={'Edit ' + item.label + ' amount'}
      value={draft}
      disabled={disabled}
      inputMode="decimal"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(item.amount ? String(item.amount) : '')
          event.currentTarget.blur()
        }
      }}
      className="h-8 min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-right font-mono text-xs font-black text-slate-900 outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-amber-300 focus:bg-amber-50 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:text-slate-400"
    />
  )
}

function InlineBalance({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string
  value: number
  disabled: boolean
  onSave: (value: number) => void
}) {
  const [draft, setDraft] = useState(value ? String(value) : '')
  function save() {
    const amount = Number(draft)
    if (!Number.isFinite(amount)) {
      setDraft(value ? String(value) : '')
      return
    }
    onSave(amount)
  }
  return (
    <input
      aria-label={label}
      value={draft}
      disabled={disabled}
      inputMode="decimal"
      placeholder="£ 0.00"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value ? String(value) : '')
          event.currentTarget.blur()
        }
      }}
      className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-right font-mono text-sm font-black text-slate-900 outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-amber-300 focus:bg-amber-50 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:text-slate-400"
    />
  )
}

function NamedBalanceEntry({
  balance,
  kind,
  finalized,
  onUpdate,
}: {
  balance: NamedBalance
  kind: 'supplier' | 'bank'
  finalized: boolean
  onUpdate: (updates: Partial<NamedBalance>) => void
}) {
  const descriptor = kind === 'supplier' ? 'supplier' : 'bank'
  return (
    <div className="contents">
      <div className="border-t border-slate-100 px-3 py-2 sm:px-4">
        <InlineText
          label={'Edit ' + balance.name + ' ' + descriptor + ' name'}
          value={balance.name}
          disabled={finalized}
          onSave={(name) => onUpdate({ name })}
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xs font-bold text-slate-900 outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-amber-300 focus:bg-amber-50 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
        />
        {balance.carriedFrom && (
          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
            Carried forward · not yet edited
          </span>
        )}
      </div>
      <div className="border-t border-slate-100 px-2 py-1">
        <InlineBalance
          label={'Start of month ' + balance.name + ' ' + descriptor + ' balance'}
          value={balance.start}
          disabled={finalized}
          onSave={(start) => onUpdate({ start })}
        />
      </div>
      <div className="border-t border-slate-100 px-2 py-1">
        <InlineBalance
          label={'End of month ' + balance.name + ' ' + descriptor + ' balance'}
          value={balance.end}
          disabled={finalized}
          onSave={(end) => onUpdate({ end })}
        />
      </div>
    </div>
  )
}

function NewNamedBalance({
  kind,
  disabled,
  onAdd,
}: {
  kind: 'supplier' | 'bank'
  disabled: boolean
  onAdd: (name: string, start: number, end: number) => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const label = kind === 'supplier' ? 'supplier' : 'bank'
  function add() {
    const opening = Number(start || 0)
    const closing = Number(end || 0)
    if (!name.trim() || !Number.isFinite(opening) || !Number.isFinite(closing)) return
    onAdd(name.trim(), opening, closing)
    setName('')
    setStart('')
    setEnd('')
  }
  return (
    <div className="contents">
      <div className="border-t border-dashed border-slate-200 bg-amber-50/40 px-3 py-2 sm:px-4">
        <input
          aria-label={'New ' + label + ' name'}
          list={label + '-suggestions'}
          value={name}
          disabled={disabled}
          placeholder={'Add ' + label}
          onChange={(event) => setName(event.target.value)}
          className="h-8 w-full rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
        />
      </div>
      <div className="border-t border-dashed border-slate-200 bg-amber-50/40 px-2 py-2">
        <input
          aria-label={'New ' + label + ' opening balance'}
          value={start}
          disabled={disabled}
          inputMode="decimal"
          placeholder="£ 0.00"
          onChange={(event) => setStart(event.target.value)}
          className="h-8 w-full rounded-lg border border-amber-200 bg-white px-2 text-right font-mono text-xs font-black text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex items-center gap-1 border-t border-dashed border-slate-200 bg-amber-50/40 px-2 py-2">
        <input
          aria-label={'New ' + label + ' closing balance'}
          value={end}
          disabled={disabled}
          inputMode="decimal"
          placeholder="£ 0.00"
          onChange={(event) => setEnd(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2 text-right font-mono text-xs font-black text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          aria-label={'Add ' + label}
          disabled={disabled}
          onClick={add}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-200"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function BranchPosition({
  branch,
  position,
  netResult,
  finalized,
  onUpdate,
}: {
  branch: string
  position: FinancialPosition
  netResult: number
  finalized: boolean
  onUpdate: (field: 'cashStart' | 'cashEnd' | 'netStart', value: number) => void
}) {
  const endingProfit = position.netStart + netResult
  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <header className="border-b border-sky-100 bg-sky-50 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">
          Branch position
        </p>
        <h2 className="mt-1 text-lg font-black text-slate-950">{branch} cash & trading result</h2>
        <p className="mt-1 text-xs text-slate-500">
          Company-wide LMS, supplier and bank balances are kept in Company Ledger.
        </p>
      </header>
      <div className="grid grid-cols-[minmax(140px,1fr)_minmax(104px,0.7fr)_minmax(104px,0.7fr)] divide-x divide-slate-100 text-xs">
        <div className="bg-slate-50 px-4 py-3 font-black uppercase tracking-[0.1em] text-slate-500">
          Branch item
        </div>
        <div className="bg-slate-50 px-4 py-3 text-right font-black uppercase tracking-[0.1em] text-slate-500">
          Start of month
        </div>
        <div className="bg-slate-50 px-4 py-3 text-right font-black uppercase tracking-[0.1em] text-slate-500">
          End of month
        </div>
        <div className="border-t border-slate-100 bg-slate-950 px-4 py-3 font-black text-white">
          <p>{branch} net profit / loss</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">
            From income and expenses: {GBP.format(netResult)}
          </p>
        </div>
        <div className="border-t border-slate-100 bg-slate-950 px-2 py-1">
          <InlineBalance
            label={'Start of month ' + branch + ' net profit or loss'}
            value={position.netStart}
            disabled={finalized}
            onSave={(value) => onUpdate('netStart', value)}
          />
        </div>
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-950 px-4 py-3 font-mono text-sm font-black text-emerald-300">
          {GBP.format(endingProfit)}
        </div>
        <div className="border-t border-slate-100 px-4 py-3 font-bold text-slate-900">
          Cash in hand — {branch}
        </div>
        <div className="border-t border-slate-100 px-2 py-1">
          <InlineBalance
            label={'Start of month cash in hand ' + branch}
            value={position.cashStart}
            disabled={finalized}
            onSave={(value) => onUpdate('cashStart', value)}
          />
        </div>
        <div className="border-t border-slate-100 px-2 py-1">
          <InlineBalance
            label={'End of month cash in hand ' + branch}
            value={position.cashEnd}
            disabled={finalized}
            onSave={(value) => onUpdate('cashEnd', value)}
          />
        </div>
      </div>
    </section>
  )
}

function CompanyBranchLines({
  positions,
  finalized,
  onUpdate,
}: {
  positions: Record<string, CompanyBranchPosition>
  finalized: boolean
  onUpdate: (branch: string, field: keyof CompanyBranchPosition, value: number) => void
}) {
  return (
    <>
      <div className="col-span-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
        Branch positions
      </div>
      {BRANCHES.flatMap((branch) => {
        const values = positions[branch]
        return [
          <div key={branch + '-profit'} className="contents">
            <div className="border-t border-slate-100 px-4 py-3 font-bold text-slate-900">
              {branch} net profit / loss
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <InlineBalance
                label={'Company start ' + branch + ' net profit or loss'}
                value={values.profitStart}
                disabled={finalized}
                onSave={(value) => onUpdate(branch, 'profitStart', value)}
              />
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <InlineBalance
                label={'Company end ' + branch + ' net profit or loss'}
                value={values.profitEnd}
                disabled={finalized}
                onSave={(value) => onUpdate(branch, 'profitEnd', value)}
              />
            </div>
          </div>,
          <div key={branch + '-cash'} className="contents">
            <div className="border-t border-slate-100 px-4 py-3 font-bold text-slate-900">
              Cash in hand — {branch}
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <InlineBalance
                label={'Company start cash in hand ' + branch}
                value={values.cashStart}
                disabled={finalized}
                onSave={(value) => onUpdate(branch, 'cashStart', value)}
              />
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <InlineBalance
                label={'Company end cash in hand ' + branch}
                value={values.cashEnd}
                disabled={finalized}
                onSave={(value) => onUpdate(branch, 'cashEnd', value)}
              />
            </div>
          </div>,
        ]
      })}
    </>
  )
}

function MonthlyPosition({
  position,
  finalized,
  onUpdate,
  onAddNamedBalance,
  onUpdateNamedBalance,
  branchPositions,
  onUpdateBranchPosition,
}: {
  position: FinancialPosition
  finalized: boolean
  onUpdate: (field: 'lmsStart' | 'lmsEnd', value: number) => void
  onAddNamedBalance: (kind: 'supplier' | 'bank', name: string, start: number, end: number) => void
  onUpdateNamedBalance: (
    kind: 'supplier' | 'bank',
    id: string,
    updates: Partial<NamedBalance>,
  ) => void
  branchPositions: Record<string, CompanyBranchPosition>
  onUpdateBranchPosition: (
    branch: string,
    field: keyof CompanyBranchPosition,
    value: number,
  ) => void
}) {
  const suggestions = (id: string, names: string[]) => (
    <datalist id={id}>
      {names.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  )
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Company financial position
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Company Ledger</h2>
          <p className="mt-1 text-xs text-slate-500">
            Company-wide LMS, suppliers and banks, plus each branch’s cash and profit / loss.
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
            Inline autosave
          </span>
          {position.carriedFrom && (
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
              Carried forward · not yet edited
            </p>
          )}
        </div>
      </header>
      {suggestions('supplier-suggestions', SUPPLIER_SUGGESTIONS)}
      {suggestions('bank-suggestions', BANK_SUGGESTIONS)}
      <div className="grid grid-cols-[minmax(120px,1fr)_minmax(104px,0.7fr)_minmax(104px,0.7fr)] divide-x divide-slate-100 text-xs">
        <div className="bg-slate-50 px-4 py-3 font-black uppercase tracking-[0.1em] text-slate-500">
          Balance
        </div>
        <div className="bg-slate-50 px-4 py-3 text-right font-black uppercase tracking-[0.1em] text-slate-500">
          Start of month
        </div>
        <div className="bg-slate-50 px-4 py-3 text-right font-black uppercase tracking-[0.1em] text-slate-500">
          End of month
        </div>
        <div className="col-span-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
          Supplier balances
        </div>
        {position.suppliers.length === 0 && (
          <div className="col-span-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            No supplier balances added for this branch.
          </div>
        )}
        {position.suppliers.map((balance) => (
          <NamedBalanceEntry
            key={balance.id}
            balance={balance}
            kind="supplier"
            finalized={finalized}
            onUpdate={(updates) => onUpdateNamedBalance('supplier', balance.id, updates)}
          />
        ))}
        <NewNamedBalance
          kind="supplier"
          disabled={finalized}
          onAdd={(name, start, end) => onAddNamedBalance('supplier', name, start, end)}
        />
        <div className="col-span-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
          Bank balances
        </div>
        {position.banks.length === 0 && (
          <div className="col-span-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            No bank balances added for this branch.
          </div>
        )}
        {position.banks.map((balance) => (
          <NamedBalanceEntry
            key={balance.id}
            balance={balance}
            kind="bank"
            finalized={finalized}
            onUpdate={(updates) => onUpdateNamedBalance('bank', balance.id, updates)}
          />
        ))}
        <NewNamedBalance
          kind="bank"
          disabled={finalized}
          onAdd={(name, start, end) => onAddNamedBalance('bank', name, start, end)}
        />
        <div className="col-span-3 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
          <span>LMS balance</span>
          <Link href="/dashboard/lms" className="text-emerald-700 hover:text-emerald-800">
            View LMS
          </Link>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 font-bold text-slate-900">
          <p>LMS — customer / company balance</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
            + customer owes us · − we owe customer
          </p>
        </div>
        <div className="border-t border-slate-100 px-2 py-1">
          <InlineBalance
            label="Start of month LMS balance"
            value={position.lmsStart}
            disabled={finalized}
            onSave={(value) => onUpdate('lmsStart', value)}
          />
        </div>
        <div className="border-t border-slate-100 px-2 py-1">
          <InlineBalance
            label="End of month LMS balance"
            value={position.lmsEnd}
            disabled={finalized}
            onSave={(value) => onUpdate('lmsEnd', value)}
          />
        </div>
        <CompanyBranchLines
          positions={branchPositions}
          finalized={finalized}
          onUpdate={onUpdateBranchPosition}
        />
      </div>
    </section>
  )
}

function CategorySheet({
  kind,
  groups,
  items,
  finalized,
  onUpdateItem,
  onRenameCategory,
  onAdd,
  onAddCategory,
}: {
  kind: LedgerKind
  groups: string[]
  items: LedgerItem[]
  finalized: boolean
  onUpdateItem: (id: string, updates: Partial<Pick<LedgerItem, 'label' | 'amount'>>) => void
  onRenameCategory: (oldName: string, newName: string) => boolean
  onAdd: (group: string, label: string, amount: number) => void
  onAddCategory: () => void
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
      <div className="divide-y divide-slate-100">
        {groups.map((group) => {
          const categoryItems = items.filter((item) => item.group === group)
          return (
            <div key={group}>
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 sm:px-5">
                <InlineText
                  label={'Rename ' + group + ' category'}
                  value={group}
                  disabled={finalized}
                  onSave={(name) => onRenameCategory(group, name)}
                  className="min-w-0 flex-1 border border-transparent bg-transparent p-0 text-[10px] font-black uppercase tracking-[0.11em] text-slate-500 outline-none hover:border-slate-200 hover:bg-white focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
                />
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
                    <InlineText
                      label={'Edit ' + item.label + ' name'}
                      value={item.label}
                      disabled={finalized}
                      onSave={(label) => onUpdateItem(item.id, { label })}
                      className="w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-bold text-slate-900 outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-amber-300 focus:bg-amber-50 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:text-slate-400"
                    />
                    {item.carriedFrom && (
                      <span className="mt-1 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
                        Carried forward · not yet edited
                      </span>
                    )}
                  </div>
                  <InlineAmount
                    item={item}
                    disabled={finalized}
                    onSave={(amount) => onUpdateItem(item.id, { amount })}
                  />
                  <span className={'text-right text-[10px] font-black ' + actionTone}>Auto</span>
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
        <button
          type="button"
          onClick={onAddCategory}
          disabled={finalized}
          className="flex w-full items-center gap-2 border-t border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-black text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 sm:px-5"
        >
          <Plus className="h-3.5 w-3.5" /> Add {sheetLabel.toLowerCase()} category
        </button>
      </div>
      <footer className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <span className="text-sm font-black text-slate-700">Total {sheetLabel.toLowerCase()}</span>
        <span className={'text-2xl font-black ' + totalTone}>{GBP.format(total)}</span>
      </footer>
    </section>
  )
}

export default function BranchLedgerPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('hq')
  const [ledgerView, setLedgerView] = useState<LedgerView>('branch')
  const [selectedBranch, setSelectedBranch] = useState('Manchester')
  const [months, setMonths] = useState<LedgerMonth[]>([
    { label: 'September 2026', finalized: false, items: [], position: EMPTY_POSITION },
  ])
  const [categories, setCategories] = useState<Categories>({
    income: INCOME_GROUPS,
    expense: EXPENSE_GROUPS,
  })
  const [companyPosition, setCompanyPosition] = useState<FinancialPosition>(EMPTY_POSITION)
  const [companyBranchPositions, setCompanyBranchPositions] = useState<
    Record<string, CompanyBranchPosition>
  >(() =>
    Object.fromEntries(
      BRANCHES.map((branch) => [
        branch,
        { cashStart: 0, cashEnd: 0, profitStart: 0, profitEnd: 0 },
      ]),
    ),
  )
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0)
  const currentMonth = months[currentMonthIndex]
  const incomeItems = currentMonth.items.filter((item) => item.kind === 'income')
  const expenseItems = currentMonth.items.filter((item) => item.kind === 'expense')
  const incomeTotal = incomeItems.reduce((sum, item) => sum + item.amount, 0)
  const expenseTotal = expenseItems.reduce((sum, item) => sum + item.amount, 0)

  function switchMode(mode: ViewMode) {
    setViewMode(mode)
    if (mode === 'manager') {
      setSelectedBranch('Manchester')
      setLedgerView('branch')
    }
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
  function updateItem(id: string, updates: Partial<Pick<LedgerItem, 'label' | 'amount'>>) {
    setMonths((current) =>
      current.map((month, index) =>
        index === currentMonthIndex
          ? {
              ...month,
              items: month.items.map((item) =>
                item.id === id ? { ...item, ...updates, carriedFrom: undefined } : item,
              ),
            }
          : month,
      ),
    )
  }
  function updatePosition(field: 'cashStart' | 'cashEnd' | 'netStart', value: number) {
    setMonths((current) =>
      current.map((month, index) =>
        index === currentMonthIndex
          ? { ...month, position: { ...month.position, [field]: value, carriedFrom: undefined } }
          : month,
      ),
    )
  }
  function updateCompanyPosition(field: 'lmsStart' | 'lmsEnd', value: number) {
    setCompanyPosition((current) => ({ ...current, [field]: value, carriedFrom: undefined }))
  }
  function addCompanyNamedBalance(
    kind: 'supplier' | 'bank',
    name: string,
    start: number,
    end: number,
  ) {
    const collection = kind === 'supplier' ? 'suppliers' : 'banks'
    setCompanyPosition((current) => ({
      ...current,
      [collection]: [...current[collection], { id: kind + '-' + Date.now(), name, start, end }],
    }))
  }
  function updateCompanyNamedBalance(
    kind: 'supplier' | 'bank',
    id: string,
    updates: Partial<NamedBalance>,
  ) {
    const collection = kind === 'supplier' ? 'suppliers' : 'banks'
    setCompanyPosition((current) => ({
      ...current,
      [collection]: current[collection].map((balance) =>
        balance.id === id ? { ...balance, ...updates, carriedFrom: undefined } : balance,
      ),
    }))
  }
  function updateCompanyBranchPosition(
    branch: string,
    field: keyof CompanyBranchPosition,
    value: number,
  ) {
    setCompanyBranchPositions((current) => ({
      ...current,
      [branch]: { ...current[branch], [field]: value },
    }))
  }
  function renameCategory(kind: LedgerKind, oldName: string, newName: string) {
    const name = newName.trim()
    if (!name || categories[kind].some((category) => category === name && category !== oldName)) {
      return false
    }
    setCategories((current) => ({
      ...current,
      [kind]: current[kind].map((category) => (category === oldName ? name : category)),
    }))
    setMonths((current) =>
      current.map((month) => ({
        ...month,
        items: month.items.map((item) =>
          item.kind === kind && item.group === oldName ? { ...item, group: name } : item,
        ),
      })),
    )
    return true
  }
  function addCategory(kind: LedgerKind) {
    const prefix = kind === 'income' ? 'New income category' : 'New expense category'
    let name = prefix
    let number = 2
    while (categories[kind].includes(name)) {
      name = prefix + ' ' + number
      number += 1
    }
    setCategories((current) => ({ ...current, [kind]: [...current[kind], name] }))
  }
  function finalizeMonth() {
    if (currentMonth.finalized) return
    const carried = currentMonth.items.map((item, index) => ({
      ...item,
      id: item.kind + '-carry-' + (currentMonthIndex + 1) + '-' + index,
      carriedFrom: currentMonth.label,
    }))
    setMonths((current) => [
      ...current.map((month, index) =>
        index === currentMonthIndex ? { ...month, finalized: true } : month,
      ),
      {
        label: nextMonthLabel(currentMonth.label),
        finalized: false,
        items: carried,
        position: {
          suppliers: currentMonth.position.suppliers.map((balance) => ({
            ...balance,
            start: balance.end,
            end: balance.end,
            carriedFrom: currentMonth.label,
          })),
          banks: currentMonth.position.banks.map((balance) => ({
            ...balance,
            start: balance.end,
            end: balance.end,
            carriedFrom: currentMonth.label,
          })),
          lmsStart: currentMonth.position.lmsEnd,
          lmsEnd: currentMonth.position.lmsEnd,
          cashStart: currentMonth.position.cashEnd,
          cashEnd: currentMonth.position.cashEnd,
          netStart: currentMonth.position.netStart + incomeTotal - expenseTotal,
          carriedFrom: currentMonth.label,
        },
      },
    ])
    setCompanyPosition((current) => ({
      ...current,
      suppliers: current.suppliers.map((balance) => ({
        ...balance,
        start: balance.end,
        end: balance.end,
        carriedFrom: currentMonth.label,
      })),
      banks: current.banks.map((balance) => ({
        ...balance,
        start: balance.end,
        end: balance.end,
        carriedFrom: currentMonth.label,
      })),
      lmsStart: current.lmsEnd,
      lmsEnd: current.lmsEnd,
      carriedFrom: currentMonth.label,
    }))
    setCompanyBranchPositions((current) =>
      Object.fromEntries(
        Object.entries(current).map(([branch, values]) => [
          branch,
          {
            cashStart: values.cashEnd,
            cashEnd: values.cashEnd,
            profitStart: values.profitEnd,
            profitEnd: values.profitEnd,
          },
        ]),
      ),
    )
    setCurrentMonthIndex(months.length)
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
                {ledgerView === 'company' ? 'Company Ledger' : 'Branch Ledger'}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {ledgerView === 'company'
                  ? 'Company-wide balances with branch cash and profit / loss'
                  : 'A flexible monthly sheet that grows with your branch'}
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
      <nav
        aria-label="Ledger view"
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        <button
          type="button"
          onClick={() => setLedgerView('branch')}
          className={
            'rounded-lg px-3 py-2 text-xs font-black ' +
            (ledgerView === 'branch'
              ? 'bg-slate-950 text-white'
              : 'text-slate-500 hover:bg-slate-50')
          }
        >
          Branch Ledger
        </button>
        {viewMode === 'hq' && (
          <button
            type="button"
            onClick={() => setLedgerView('company')}
            className={
              'rounded-lg px-3 py-2 text-xs font-black ' +
              (ledgerView === 'company'
                ? 'bg-slate-950 text-white'
                : 'text-slate-500 hover:bg-slate-50')
            }
          >
            Company Ledger
          </button>
        )}
      </nav>
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
              {ledgerView === 'company'
                ? 'HQ company view'
                : viewMode === 'hq'
                  ? 'HQ staff view'
                  : 'Branch manager view'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {ledgerView === 'company'
                ? 'Company-wide LMS, supplier and bank balances; no branch manager access.'
                : viewMode === 'hq'
                  ? 'Select a branch to view its monthly sheet.'
                  : 'This view is locked to the manager’s assigned branch.'}
            </p>
          </div>
        </div>
        {ledgerView === 'branch' && (
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
        )}
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
                onClick={() => setCurrentMonthIndex(index)}
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
      {ledgerView === 'branch' ? (
        <>
          <section className="grid gap-4 2xl:grid-cols-2">
            <CategorySheet
              kind="income"
              groups={categories.income}
              items={incomeItems}
              finalized={currentMonth.finalized}
              onUpdateItem={updateItem}
              onRenameCategory={(oldName, newName) => renameCategory('income', oldName, newName)}
              onAdd={(group, label, amount) => addItem('income', group, label, amount)}
              onAddCategory={() => addCategory('income')}
            />
            <CategorySheet
              kind="expense"
              groups={categories.expense}
              items={expenseItems}
              finalized={currentMonth.finalized}
              onUpdateItem={updateItem}
              onRenameCategory={(oldName, newName) => renameCategory('expense', oldName, newName)}
              onAdd={(group, label, amount) => addItem('expense', group, label, amount)}
              onAddCategory={() => addCategory('expense')}
            />
          </section>
          <section className="flex flex-col items-start justify-between gap-3 rounded-2xl border-2 border-slate-950 bg-slate-950 px-5 py-4 text-white shadow-sm sm:flex-row sm:items-center sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">
                Monthly result
              </p>
              <p className="mt-1 text-sm font-bold text-slate-300">
                Total income minus total expenses
              </p>
            </div>
            <p className="text-3xl font-black tracking-tight">
              Net result: {GBP.format(incomeTotal - expenseTotal)}
            </p>
          </section>
          <BranchPosition
            key={currentMonth.label + selectedBranch}
            branch={selectedBranch}
            position={currentMonth.position}
            netResult={incomeTotal - expenseTotal}
            finalized={currentMonth.finalized}
            onUpdate={updatePosition}
          />
        </>
      ) : (
        <MonthlyPosition
          key={currentMonth.label + '-company'}
          position={companyPosition}
          finalized={currentMonth.finalized}
          onUpdate={updateCompanyPosition}
          onAddNamedBalance={addCompanyNamedBalance}
          onUpdateNamedBalance={updateCompanyNamedBalance}
          branchPositions={companyBranchPositions}
          onUpdateBranchPosition={updateCompanyBranchPosition}
        />
      )}
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
            are locked and carried into the following month with their values. A small marker stays
            visible until you edit the carried entry, but no change is required when the amount is
            still correct.
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
