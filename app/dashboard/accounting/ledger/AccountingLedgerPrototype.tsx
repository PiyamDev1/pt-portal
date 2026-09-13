'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgePoundSterling,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileCheck2,
  FileClock,
  Filter,
  Landmark,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'

type LedgerStatus = 'posted' | 'draft' | 'attention'
type LedgerSource = 'POS' | 'Ticketing' | 'Packages' | 'Applications' | 'Manual journal'

type LedgerLine = {
  id: string
  date: string
  reference: string
  source: LedgerSource
  description: string
  account: string
  branch: string
  debit: number
  credit: number
  status: LedgerStatus
  counterAccount: string
  detail: string
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

const MOCK_LINES: LedgerLine[] = [
  {
    id: 'line-1',
    date: '13 Sep',
    reference: 'POS-10482',
    source: 'POS',
    description: 'Walk-in visa application - Standard service',
    account: '1100 · Cash at Manchester',
    branch: 'Manchester',
    debit: 185,
    credit: 0,
    status: 'posted',
    counterAccount: '4100 · Application service income',
    detail: 'Posted automatically from till session MAN-240913-A.',
  },
  {
    id: 'line-2',
    date: '13 Sep',
    reference: 'POS-10482',
    source: 'POS',
    description: 'Walk-in visa application - Standard service',
    account: '4100 · Application service income',
    branch: 'Manchester',
    debit: 0,
    credit: 185,
    status: 'posted',
    counterAccount: '1100 · Cash at Manchester',
    detail: 'Income line paired with the cash receipt above.',
  },
  {
    id: 'line-3',
    date: '12 Sep',
    reference: 'TK-84391',
    source: 'Ticketing',
    description: 'Emirates ticket sale - Akhtar family',
    account: '1200 · Card clearing',
    branch: 'Manchester',
    debit: 2470,
    credit: 0,
    status: 'posted',
    counterAccount: '4200 · Ticket sales',
    detail: 'Customer card payment. Supplier cost is recorded on the linked journal.',
  },
  {
    id: 'line-4',
    date: '12 Sep',
    reference: 'TK-84391',
    source: 'Ticketing',
    description: 'Emirates ticket sale - Akhtar family',
    account: '4200 · Ticket sales',
    branch: 'Manchester',
    debit: 0,
    credit: 2470,
    status: 'posted',
    counterAccount: '1200 · Card clearing',
    detail: 'Revenue recognised from the issued-ticket source event.',
  },
  {
    id: 'line-5',
    date: '11 Sep',
    reference: 'PKG-00614',
    source: 'Packages',
    description: 'Umrah package deposit - Hussain group',
    account: '1010 · Business bank',
    branch: 'Bradford',
    debit: 3600,
    credit: 0,
    status: 'draft',
    counterAccount: '2200 · Customer deposits',
    detail: 'Draft preview awaiting confirmation of the receiving bank account.',
  },
  {
    id: 'line-6',
    date: '11 Sep',
    reference: 'PKG-00614',
    source: 'Packages',
    description: 'Umrah package deposit - Hussain group',
    account: '2200 · Customer deposits',
    branch: 'Bradford',
    debit: 0,
    credit: 3600,
    status: 'draft',
    counterAccount: '1010 · Business bank',
    detail: 'Customer deposit liability paired with the bank receipt.',
  },
  {
    id: 'line-7',
    date: '10 Sep',
    reference: 'APP-22918',
    source: 'Applications',
    description: 'NADRA application supplier charge',
    account: '5100 · Direct application costs',
    branch: 'Manchester',
    debit: 72.5,
    credit: 0,
    status: 'attention',
    counterAccount: 'Supplier account not mapped',
    detail: 'The supplier needs an account mapping before this journal can be posted.',
  },
]

const SOURCE_STYLES: Record<LedgerSource, string> = {
  POS: 'bg-violet-50 text-violet-700 ring-violet-200',
  Ticketing: 'bg-sky-50 text-sky-700 ring-sky-200',
  Packages: 'bg-amber-50 text-amber-800 ring-amber-200',
  Applications: 'bg-rose-50 text-rose-700 ring-rose-200',
  'Manual journal': 'bg-slate-100 text-slate-700 ring-slate-200',
}

const STATUS_LABELS: Record<LedgerStatus, string> = {
  posted: 'Posted',
  draft: 'Draft',
  attention: 'Needs attention',
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: typeof WalletCards
  tone: string
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  )
}

function StatusBadge({ status }: { status: LedgerStatus }) {
  const style =
    status === 'posted'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'draft'
        ? 'bg-slate-100 text-slate-700 ring-slate-200'
        : 'bg-amber-50 text-amber-800 ring-amber-200'

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${style}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'posted'
            ? 'bg-emerald-500'
            : status === 'draft'
              ? 'bg-slate-400'
              : 'bg-amber-500'
        }`}
      />
      {STATUS_LABELS[status]}
    </span>
  )
}

function EmptyDraftRow({ onRemove }: { onRemove: () => void }) {
  const inputClass =
    'h-9 w-full min-w-24 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 px-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100'

  return (
    <tr className="border-t border-emerald-200 bg-emerald-50/20">
      <td className="w-10 px-3 py-2 text-center">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Plus className="h-3.5 w-3.5" />
        </span>
      </td>
      <td className="px-2 py-2">
        <input aria-label="Draft date" className={inputClass} type="date" />
      </td>
      <td className="px-2 py-2">
        <input aria-label="Draft reference" className={inputClass} placeholder="Reference" />
      </td>
      <td className="px-2 py-2">
        <select aria-label="Draft source" className={inputClass} defaultValue="Manual journal">
          <option>Manual journal</option>
          <option>POS</option>
          <option>Ticketing</option>
          <option>Packages</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <input
          aria-label="Draft description"
          className={inputClass}
          placeholder="What is this for?"
        />
      </td>
      <td className="px-2 py-2">
        <input aria-label="Draft account" className={inputClass} placeholder="Choose account" />
      </td>
      <td className="px-2 py-2">
        <select aria-label="Draft branch" className={inputClass} defaultValue="Manchester">
          <option>Manchester</option>
          <option>Bradford</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <input aria-label="Draft debit" className={`${inputClass} text-right`} placeholder="0.00" />
      </td>
      <td className="px-2 py-2">
        <input
          aria-label="Draft credit"
          className={`${inputClass} text-right`}
          placeholder="0.00"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-red-600"
          aria-label="Remove draft row"
        >
          <X className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

export default function AccountingLedgerPrototype() {
  const [status, setStatus] = useState<'all' | LedgerStatus>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(MOCK_LINES[2].id)
  const [showDraftRow, setShowDraftRow] = useState(false)

  const filteredLines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return MOCK_LINES.filter((line) => {
      if (status !== 'all' && line.status !== status) return false
      if (!normalizedQuery) return true
      return [line.reference, line.description, line.account, line.source, line.branch].some(
        (value) => value.toLowerCase().includes(normalizedQuery),
      )
    })
  }, [query, status])

  const selected = MOCK_LINES.find((line) => line.id === selectedId) ?? null
  const draftDebit = MOCK_LINES.filter((line) => line.status === 'draft').reduce(
    (total, line) => total + line.debit,
    0,
  )
  const draftCredit = MOCK_LINES.filter((line) => line.status === 'draft').reduce(
    (total, line) => total + line.credit,
    0,
  )

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 px-4 py-3 text-white shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <Sparkles className="h-4 w-4 text-emerald-200" />
            </span>
            <div>
              <p className="text-sm font-black">Interactive ledger preview</p>
              <p className="text-xs text-emerald-100/80">
                Sample figures only · Nothing on this screen is connected to the database
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider ring-1 ring-white/15">
            UI concept
          </span>
        </div>
      </div>

      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/dashboard/accounting"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Accounting home
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
              <BadgePoundSterling className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                General ledger
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Review, prepare and trace every financial movement
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => setShowDraftRow(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            New journal
          </button>
        </div>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        aria-label="Accounting workspace"
      >
        {[
          'Overview',
          'Ledger',
          'Profit & loss',
          'Service performance',
          'Balances',
          'Setup & cutover',
        ].map((item) => (
          <button
            key={item}
            type="button"
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 ${
              item === 'Ledger'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ledger summary">
        <MetricCard
          label="Bank & cash"
          value="£128,430.54"
          detail="Across 4 active accounts"
          icon={Landmark}
          tone="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          label="September income"
          value="£84,216.00"
          detail="11.8% ahead of August"
          icon={TrendingUp}
          tone="bg-sky-50 text-sky-700"
        />
        <MetricCard
          label="Draft journals"
          value="6"
          detail="£8,142.50 awaiting posting"
          icon={FileClock}
          tone="bg-slate-100 text-slate-700"
        />
        <MetricCard
          label="Needs attention"
          value="3"
          detail="2 mappings · 1 missing cost"
          icon={AlertCircle}
          tone="bg-amber-50 text-amber-700"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <CalendarDays className="h-4 w-4 text-slate-500" />
                September 2026
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-xs font-bold text-slate-600">
                <LockKeyhole className="h-3.5 w-3.5" />
                Period open
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reference, account or customer"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto">
            {(
              [
                ['all', 'All entries', MOCK_LINES.length],
                ['posted', 'Posted', 4],
                ['draft', 'Drafts', 2],
                ['attention', 'Needs attention', 1],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStatus(value)
                  const firstVisible =
                    value === 'all' ? MOCK_LINES[0] : MOCK_LINES.find((line) => line.status === value)
                  if (firstVisible) setSelectedId(firstVisible.id)
                }}
                aria-label={`${label} ${count}`}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${
                  status === value
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {label}
                <span className={`ml-2 ${status === value ? 'text-slate-300' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-2 py-3">Date</th>
                <th className="px-2 py-3">Reference</th>
                <th className="px-2 py-3">Source</th>
                <th className="px-2 py-3">Description</th>
                <th className="px-2 py-3">Account</th>
                <th className="px-2 py-3">Branch</th>
                <th className="px-2 py-3 text-right">Debit</th>
                <th className="px-2 py-3 text-right">Credit</th>
                <th className="px-3 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {filteredLines.map((line) => {
                const isSelected = line.id === selectedId
                return (
                  <tr
                    key={line.id}
                    onClick={() => setSelectedId(line.id)}
                    className={`cursor-pointer border-t border-slate-100 transition ${
                      isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 font-bold text-slate-700">
                      {line.date}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 font-black text-slate-950">
                      {line.reference}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${SOURCE_STYLES[line.source]}`}
                      >
                        {line.source}
                      </span>
                    </td>
                    <td className="max-w-64 px-2 py-3 text-slate-700">{line.description}</td>
                    <td className="max-w-56 px-2 py-3 font-semibold text-slate-700">
                      {line.account}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-slate-500">{line.branch}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-mono font-bold text-slate-900">
                      {line.debit ? GBP.format(line.debit) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-mono font-bold text-slate-900">
                      {line.credit ? GBP.format(line.credit) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <StatusBadge status={line.status} />
                    </td>
                  </tr>
                )
              })}
              {showDraftRow && <EmptyDraftRow onRemove={() => setShowDraftRow(false)} />}
            </tbody>
          </table>
          {filteredLines.length === 0 && !showDraftRow && (
            <div className="px-6 py-14 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-black text-slate-800">No ledger lines found</p>
              <p className="mt-1 text-xs text-slate-500">
                Try a different search or status filter.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:px-5">
          <p className="font-semibold text-slate-500">
            Showing {filteredLines.length} sample ledger lines
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-500">
              Draft debit{' '}
              <strong className="ml-1 font-mono text-slate-900">{GBP.format(draftDebit)}</strong>
            </span>
            <span className="text-slate-500">
              Draft credit{' '}
              <strong className="ml-1 font-mono text-slate-900">{GBP.format(draftCredit)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 font-black text-emerald-800">
              <Check className="h-3.5 w-3.5" /> Balanced
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                Selected line
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                {selected?.reference ?? 'Select an entry'}
              </h2>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="More ledger line actions"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
          {selected && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase text-slate-400">Posting detail</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{selected.detail}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase text-slate-400">Counter account</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{selected.counterAccount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-slate-900">Source record retained</p>
                      <p className="text-xs text-slate-500">
                        Open the original transaction and its audit history.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900"
                  >
                    View source <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                September health
              </p>
              <p className="mt-1 text-lg font-black">Books are on track</p>
            </div>
            <CircleDollarSign className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-300">Source mappings</span>
                <span>96%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-[96%] rounded-full bg-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-300">Costs captured</span>
                <span>91%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-[91%] rounded-full bg-sky-400" />
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs font-black text-amber-300">
              <Filter className="h-3.5 w-3.5" /> 3 items need review
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-300">
              Finish two supplier mappings and add one missing package cost before soft-locking the
              month.
            </p>
          </div>
        </aside>
      </div>

      <p className="flex items-center justify-center gap-2 pb-2 text-center text-xs text-slate-400">
        <Building2 className="h-3.5 w-3.5" /> Company totals with branch-level drill-down · GBP
        accounting book
      </p>
    </div>
  )
}
