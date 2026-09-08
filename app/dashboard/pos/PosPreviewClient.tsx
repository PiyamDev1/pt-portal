'use client'

import { useMemo, useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgePoundSterling,
  Banknote,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coins,
  CreditCard,
  FileText,
  Filter,
  Landmark,
  LayoutDashboard,
  Package,
  Plane,
  ReceiptText,
  RotateCcw,
  ScanBarcode,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { PosRegisterIcon } from '@/app/components/icons/PosRegisterIcon'

type IconComponent = ComponentType<{ className?: string }>
type PaymentMethod = 'Cash' | 'Card' | 'Bank'
type OutgoingType = 'Refund' | 'Expense' | 'Supplier payment'

type CategoryPreset = {
  id: string
  label: string
  caption: string
  icon: IconComponent
  tone: string
  direction: 'IN' | 'OUT' | 'TRANSFER'
  loyalty: boolean
}

type PreviewTransaction = {
  id: string
  time: string
  name: string
  category: string
  method: PaymentMethod
  amount: number
  points: number
  status: string
  note: string
}

const CATEGORIES: CategoryPreset[] = [
  {
    id: 'ticketing',
    label: 'Ticketing',
    caption: 'Tracked service',
    icon: Plane,
    tone: 'border-sky-200 bg-sky-50 text-sky-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'packages',
    label: 'Packages',
    caption: 'Tracked service',
    icon: Package,
    tone: 'border-violet-200 bg-violet-50 text-violet-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'applications',
    label: 'Applications',
    caption: 'NADRA · Visa · Passport',
    icon: FileText,
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'document-help',
    label: 'Document help',
    caption: 'Earns loyalty points',
    icon: Sparkles,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    direction: 'IN',
    loyalty: true,
  },
  {
    id: 'supplier',
    label: 'Supplier payment',
    caption: 'Match a supplier',
    icon: Building2,
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    direction: 'OUT',
    loyalty: false,
  },
  {
    id: 'expense',
    label: 'Expense',
    caption: 'General business cost',
    icon: ReceiptText,
    tone: 'border-orange-200 bg-orange-50 text-orange-900',
    direction: 'OUT',
    loyalty: false,
  },
  {
    id: 'refund',
    label: 'Refunds',
    caption: 'Linked or general',
    icon: RotateCcw,
    tone: 'border-rose-200 bg-rose-50 text-rose-800',
    direction: 'OUT',
    loyalty: false,
  },
  {
    id: 'extra-coins',
    label: 'Extra coins',
    caption: 'Drawer ↔ reserve',
    icon: Coins,
    tone: 'border-yellow-200 bg-yellow-50 text-yellow-900',
    direction: 'TRANSFER',
    loyalty: false,
  },
]

const TRANSACTIONS: PreviewTransaction[] = [
  {
    id: 'POS-0908-014',
    time: '14:18',
    name: 'Walk-in',
    category: 'Document help',
    method: 'Cash',
    amount: 25,
    points: 25,
    status: 'Posted',
    note: 'Document print and assistance',
  },
  {
    id: 'POS-0908-013',
    time: '13:52',
    name: 'Aisha Khan',
    category: 'Ticketing',
    method: 'Card',
    amount: 420,
    points: 0,
    status: 'Posted',
    note: 'Ticket payment · tracked service',
  },
  {
    id: 'POS-0908-012',
    time: '13:21',
    name: 'British Airways',
    category: 'Ticketing · Supplier',
    method: 'Cash',
    amount: -300,
    points: 0,
    status: 'Supplier payment',
    note: 'Filed to supplier balance',
  },
  {
    id: 'POS-0908-011',
    time: '12:46',
    name: 'Aisha Khan',
    category: 'Partial refund',
    method: 'Card',
    amount: -45,
    points: -5,
    status: 'Pending',
    note: 'External card refund recorded',
  },
  {
    id: 'POS-0908-010',
    time: '11:40',
    name: 'Coin reserve',
    category: 'Extra coins',
    method: 'Cash',
    amount: -20,
    points: 0,
    status: 'Transfer',
    note: 'Drawer to coin reserve',
  },
  {
    id: 'POS-0908-009',
    time: '10:15',
    name: 'Office supplies',
    category: 'Expense',
    method: 'Cash',
    amount: -18.4,
    points: 0,
    status: 'Posted',
    note: 'Stationery',
  },
]

const SUPPLIERS = [
  { name: 'British Airways', area: 'Ticketing', balance: 1240 },
  { name: 'Emirates', area: 'Ticketing', balance: 860 },
  { name: 'Al Haram Travel', area: 'Packages', balance: 2150 },
]

const NAV_ITEMS = [
  { label: 'Daily transactions', icon: LayoutDashboard, active: true },
  { label: 'Open till', icon: Store },
  { label: 'Closeout', icon: ShieldCheck },
  { label: 'Supplier balances', icon: Building2 },
  { label: 'Refunds', icon: RotateCcw },
]

const FILTERS = ['All', 'Cash', 'Card', 'Bank', 'Outgoing'] as const

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Math.abs(value))
}

function statusTone(status: string) {
  if (status === 'Posted') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
  if (status === 'Pending') return 'bg-amber-50 text-amber-700 ring-amber-600/10'
  if (status === 'Supplier payment') return 'bg-blue-50 text-blue-700 ring-blue-600/10'
  if (status === 'Transfer') return 'bg-yellow-50 text-yellow-800 ring-yellow-600/10'
  return 'bg-slate-100 text-slate-700 ring-slate-600/10'
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  )
}

export default function PosPreviewClient({ branchName }: { branchName: string }) {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedTransactionId, setSelectedTransactionId] = useState(TRANSACTIONS[0].id)
  const [categoryId, setCategoryId] = useState('document-help')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('25.00')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [outgoingType, setOutgoingType] = useState<OutgoingType | null>(null)
  const [supplierConfirmed, setSupplierConfirmed] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [memberAttached, setMemberAttached] = useState(false)

  const selectedCategory = CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0]
  const numericAmount = Number.parseFloat(amount.replace(/,/g, '')) || 0
  const isTransfer = selectedCategory.direction === 'TRANSFER'
  const isOutgoing = !isTransfer && (numericAmount < 0 || selectedCategory.direction === 'OUT')

  const supplierMatch = useMemo(() => {
    if (!isOutgoing || outgoingType !== 'Supplier payment') return null
    const needle = name.trim().toLowerCase()
    if (!needle) return SUPPLIERS[0]
    return (
      SUPPLIERS.find(
        (supplier) =>
          supplier.name.toLowerCase().includes(needle) ||
          needle.includes(supplier.name.toLowerCase()),
      ) || null
    )
  }, [isOutgoing, name, outgoingType])

  const filteredTransactions = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return TRANSACTIONS.filter((transaction) => {
      const matchesSearch =
        !needle ||
        [transaction.id, transaction.name, transaction.category, transaction.note]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      const matchesFilter =
        activeFilter === 'All' ||
        transaction.method === activeFilter ||
        (activeFilter === 'Outgoing' && transaction.amount < 0)
      return matchesSearch && matchesFilter
    })
  }, [activeFilter, search])

  const selectedTransaction =
    TRANSACTIONS.find((transaction) => transaction.id === selectedTransactionId) || null

  function chooseCategory(category: CategoryPreset) {
    setCategoryId(category.id)
    setSupplierConfirmed(false)
    setScanOpen(false)

    if (category.id === 'supplier') {
      setName('British Airways')
      setAmount('-300.00')
      setPaymentMethod('Cash')
      setOutgoingType('Supplier payment')
      return
    }
    if (category.id === 'expense') {
      setName('Office supplies')
      setAmount('-18.40')
      setPaymentMethod('Cash')
      setOutgoingType('Expense')
      return
    }
    if (category.id === 'refund') {
      setName('Aisha Khan')
      setAmount('-45.00')
      setPaymentMethod('Card')
      setOutgoingType('Refund')
      return
    }
    if (category.id === 'extra-coins') {
      setName('Coin reserve')
      setAmount('20.00')
      setPaymentMethod('Cash')
      setOutgoingType(null)
      return
    }

    setName('')
    setAmount(category.id === 'ticketing' ? '420.00' : '25.00')
    setPaymentMethod(category.id === 'ticketing' ? 'Card' : 'Cash')
    setOutgoingType(null)
  }

  function previewSave() {
    if (isOutgoing && !outgoingType) {
      toast.error('Choose the outgoing type first')
      return
    }
    if (outgoingType === 'Supplier payment' && !supplierConfirmed) {
      toast.error('Confirm the supplier first')
      return
    }

    toast.success('Preview complete', {
      description: 'This is a frontend design only. No transaction was saved.',
    })
  }

  function attachDemoMember() {
    setMemberAttached(true)
    setScanOpen(false)
    toast.success('Loyalty card recognised', { description: 'Aisha Khan · PT-1842' })
  }

  return (
    <div className="space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#351017] via-[#7f1d2d] to-slate-900 px-5 py-5 text-white shadow-xl shadow-red-950/15 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-red-300/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/12 shadow-inner ring-1 ring-white/20">
              <PosRegisterIcon className="h-9 w-9" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-red-100">
                  Point of sale
                </p>
                <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-950">
                  Design preview
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Daily transactions
              </h1>
              <p className="mt-1 text-sm text-red-50/80">
                Quick entry, till balance and today&apos;s branch activity
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="rounded-2xl bg-black/15 px-4 py-3 ring-1 ring-white/15">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-100">
                Branch
              </p>
              <p className="mt-1 text-sm font-black">{branchName}</p>
            </div>
            <div className="rounded-2xl bg-emerald-400/15 px-4 py-3 ring-1 ring-emerald-200/25">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" /> Till open
              </p>
              <p className="mt-1 text-sm font-black">Shift 08:42–now</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Cash drawer"
          value="£1,248.60"
          detail="£806.20 opening + net cash"
          icon={Banknote}
          tone="bg-emerald-50 text-emerald-700"
        />
        <SummaryCard
          label="Extra coins"
          value="£82.00"
          detail="Separate branch reserve"
          icon={Coins}
          tone="bg-amber-50 text-amber-700"
        />
        <SummaryCard
          label="Card today"
          value="£980.00"
          detail="1 refund pending"
          icon={CreditCard}
          tone="bg-blue-50 text-blue-700"
        />
        <SummaryCard
          label="Bank today"
          value="£420.00"
          detail="All items recorded"
          icon={Landmark}
          tone="bg-violet-50 text-violet-700"
        />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[12rem_minmax(0,1fr)_16rem]">
        <aside className="order-1 hidden overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm xl:block">
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              POS menu
            </p>
            <p className="mt-1 text-sm font-black">Workspace</p>
          </div>
          <nav className="space-y-1 p-2" aria-label="POS preview navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() =>
                    toast('Design preview', { description: `${item.label} is not connected yet.` })
                  }
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-xs font-bold transition ${
                    item.active
                      ? 'bg-red-50 text-[#8b1e2d]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <aside className="order-2 rounded-[1.4rem] border border-slate-200 bg-white p-3 shadow-sm xl:order-3">
          <div className="flex items-center justify-between px-1 pb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Quick entry
              </p>
              <h2 className="text-sm font-black text-slate-950">Categories</h2>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 xl:hidden" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              const selected = category.id === categoryId
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => chooseCategory(category)}
                  aria-pressed={selected}
                  className={`group min-h-24 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    selected
                      ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white shadow-md shadow-red-950/10'
                      : category.tone
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon className="h-5 w-5" />
                    {selected && <Check className="h-4 w-4" />}
                  </div>
                  <p className="mt-3 text-xs font-black leading-tight">{category.label}</p>
                  <p
                    className={`mt-1 text-[10px] leading-tight ${selected ? 'text-red-100' : 'opacity-70'}`}
                  >
                    {category.caption}
                  </p>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="order-3 min-w-0 space-y-4 xl:order-2">
          <section className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950">Today&apos;s ledger</h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600">
                    {filteredTransactions.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Tuesday, 8 September · newest first</p>
              </div>
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1 lg:w-64">
                  <span className="sr-only">Search transactions</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search reference or name"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none transition placeholder:font-normal focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((current) => !current)}
                  aria-expanded={filtersOpen}
                  className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                    filtersOpen
                      ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                </button>
              </div>
            </div>

            {filtersOpen && (
              <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-3">
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                      activeFilter === filter
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
                <span className="ml-auto self-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Branch scoped
                </span>
              </div>
            )}

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    <th className="px-4 py-3">Time / reference</th>
                    <th className="px-4 py-3">Name / category</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">In</th>
                    <th className="px-4 py-3 text-right">Out</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="w-10 px-2 py-3">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      onClick={() => setSelectedTransactionId(transaction.id)}
                      className={`cursor-pointer transition hover:bg-slate-50 ${
                        selectedTransactionId === transaction.id ? 'bg-red-50/50' : 'bg-white'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-xs font-black text-slate-900">{transaction.time}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                          {transaction.id}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-bold text-slate-900">{transaction.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{transaction.category}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          {transaction.method === 'Cash' ? (
                            <Banknote className="h-3.5 w-3.5" />
                          ) : transaction.method === 'Card' ? (
                            <CreditCard className="h-3.5 w-3.5" />
                          ) : (
                            <Landmark className="h-3.5 w-3.5" />
                          )}
                          {transaction.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">
                        {transaction.amount > 0 ? formatMoney(transaction.amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-rose-700">
                        {transaction.amount < 0 ? formatMoney(transaction.amount) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusTone(transaction.status)}`}
                        >
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filteredTransactions.map((transaction) => (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => setSelectedTransactionId(transaction.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black text-slate-900">
                        {transaction.name}
                      </p>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {transaction.time}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{transaction.category}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-black ${transaction.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}
                    >
                      {transaction.amount < 0 ? '−' : '+'}
                      {formatMoney(transaction.amount)}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      {transaction.method}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {filteredTransactions.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-black text-slate-800">No matching transactions</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setActiveFilter('All')
                  }}
                  className="mt-2 text-xs font-bold text-[#8b1e2d]"
                >
                  Clear search and filters
                </button>
              </div>
            )}
          </section>

          {selectedTransaction && (
            <section className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                    Expanded transaction
                  </p>
                  <h2 className="mt-0.5 text-sm font-black text-slate-950">
                    {selectedTransaction.id}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTransactionId('')}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
                  aria-label="Close transaction details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Tender
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {selectedTransaction.method} · {formatMoney(selectedTransaction.amount)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Cash impact {selectedTransaction.method === 'Cash' ? 'included' : '£0.00'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Loyalty
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {selectedTransaction.points === 0
                      ? 'Not eligible'
                      : `${selectedTransaction.points > 0 ? '+' : ''}${selectedTransaction.points} points`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Calculated from original entry</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Audit
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-900">Entered by Sarah</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedTransaction.note}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => chooseCategory(CATEGORIES.find((item) => item.id === 'refund')!)}
                  className="rounded-xl bg-[#8b1e2d] px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-[#6f1422]"
                >
                  Refund transaction
                </button>
                <button
                  type="button"
                  onClick={() => toast('Receipt preview', { description: selectedTransaction.id })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  View receipt
                </button>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_20px_55px_-38px_rgba(15,23,42,0.55)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Quick transaction
                </p>
                <h2 className="mt-1 text-base font-black">{selectedCategory.label}</h2>
              </div>
              <span
                className={`w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                  isTransfer
                    ? 'bg-amber-300 text-amber-950'
                    : isOutgoing
                      ? 'bg-rose-200 text-rose-900'
                      : 'bg-emerald-200 text-emerald-900'
                }`}
              >
                {isTransfer ? 'Internal transfer' : isOutgoing ? 'Money out' : 'Money in'}
              </span>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {!isTransfer && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
                  {memberAttached ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          <UserRound className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-900">Aisha Khan</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">PT-1842 · 640 points</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMemberAttached(false)}
                        className="text-xs font-black text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : scanOpen ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Scan or enter loyalty code</span>
                        <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          autoFocus
                          placeholder="Scan or type loyalty code"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') attachDemoMember()
                          }}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={attachDemoMember}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
                      >
                        Use demo card
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setScanOpen(true)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#8b1e2d] shadow-sm ring-1 ring-slate-200">
                          <ScanBarcode className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-xs font-black text-slate-900">
                            Scan loyalty card
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            Optional · USB scanner ready
                          </span>
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  )}
                </div>
              )}

              {isTransfer ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      From
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-900">Cash drawer</p>
                    <p className="mt-1 text-xs text-slate-500">Available £1,248.60</p>
                  </div>
                  <ArrowUpRight className="mx-auto h-5 w-5 rotate-45 text-amber-600" />
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                      To
                    </p>
                    <p className="mt-1 text-sm font-black text-amber-950">Extra-coin reserve</p>
                    <p className="mt-1 text-xs text-amber-700">Current £82.00</p>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {isTransfer
                      ? 'Movement note'
                      : isOutgoing
                        ? 'Name / payee'
                        : 'Customer or name'}
                  </span>
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setSupplierConfirmed(false)
                    }}
                    placeholder={isTransfer ? 'Coin reserve' : 'Walk-in or type a name'}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Amount
                  </span>
                  <span className="relative block">
                    <BadgePoundSterling className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value)
                        setSupplierConfirmed(false)
                      }}
                      inputMode="decimal"
                      aria-label="Transaction amount"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-lg font-black text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                    />
                  </span>
                </label>
              </div>

              {isOutgoing && (
                <div>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    What type of outgoing is this?
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Refund', 'Expense', 'Supplier payment'] as OutgoingType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setOutgoingType(type)
                          setSupplierConfirmed(false)
                        }}
                        className={`rounded-xl border px-2 py-3 text-[11px] font-black transition sm:text-xs ${
                          outgoingType === type
                            ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d] ring-1 ring-[#8b1e2d]'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {outgoingType === 'Supplier payment' && (
                <div
                  className={`rounded-2xl border p-4 ${
                    supplierConfirmed
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          supplierConfirmed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {supplierConfirmed ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <Building2 className="h-5 w-5" />
                        )}
                      </span>
                      <div>
                        <p className="text-xs font-black text-slate-900">
                          {supplierConfirmed ? 'Supplier confirmed' : 'Possible supplier match'}
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {supplierMatch?.name || 'No configured supplier found'}
                        </p>
                        {supplierMatch && (
                          <p className="mt-1 text-[11px] text-slate-600">
                            {supplierMatch.area} · balance {formatMoney(supplierMatch.balance)}
                          </p>
                        )}
                      </div>
                    </div>
                    {supplierMatch && !supplierConfirmed && (
                      <button
                        type="button"
                        onClick={() => setSupplierConfirmed(true)}
                        className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white"
                      >
                        Use this supplier
                      </button>
                    )}
                  </div>
                </div>
              )}

              {outgoingType === 'Refund' && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div>
                    <p className="text-xs font-black text-rose-900">Refund route</p>
                    <p className="mt-1 text-[11px] text-rose-700">
                      Search for the original transaction or continue as a general refund.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      toast('Refund lookup preview', { description: 'No data will change.' })
                    }
                    className="shrink-0 rounded-xl bg-rose-800 px-3 py-2 text-[11px] font-black text-white"
                  >
                    Find original
                  </button>
                </div>
              )}

              {!isTransfer && (
                <div>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Payment method
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Cash', 'Card', 'Bank'] as PaymentMethod[]).map((method) => {
                      const Icon =
                        method === 'Cash' ? Banknote : method === 'Card' ? CreditCard : Landmark
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-black transition ${
                            paymentMethod === method
                              ? 'border-slate-950 bg-slate-950 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {method}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  {isTransfer ? (
                    <Coins className="h-4 w-4 text-amber-600" />
                  ) : isOutgoing ? (
                    <ArrowDownLeft className="h-4 w-4 text-rose-600" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  )}
                  <span>
                    {isTransfer
                      ? `${formatMoney(numericAmount)} moves between cash locations`
                      : `${paymentMethod} impact ${isOutgoing ? '−' : '+'}${formatMoney(numericAmount)}`}
                  </span>
                  {selectedCategory.loyalty && memberAttached && !isOutgoing && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">
                      +{Math.floor(Math.abs(numericAmount))} pts
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={previewSave}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7f1d2d] to-[#a52338] px-5 py-3 text-sm font-black text-white shadow-md shadow-red-950/15 transition hover:brightness-105 active:scale-[0.99]"
                >
                  {isTransfer ? <Coins className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
                  {isTransfer ? 'Preview coin transfer' : 'Preview transaction'}
                </button>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-slate-400">
            <Clock3 className="h-3.5 w-3.5" />
            Mock balances and transactions · frontend preview only
          </div>
        </main>
      </div>
    </div>
  )
}
