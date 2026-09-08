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
  Pencil,
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
  supplier?: string
}

const CATEGORIES: CategoryPreset[] = [
  {
    id: 'nadra',
    label: 'NADRA',
    caption: 'Application payment',
    icon: FileText,
    tone: 'border-sky-200 bg-sky-50 text-sky-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'nicop-normal',
    label: 'NICOP · Normal',
    caption: 'NADRA service',
    icon: FileText,
    tone: 'border-violet-200 bg-violet-50 text-violet-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'nicop-urgent',
    label: 'NICOP · Urgent',
    caption: 'NADRA service',
    icon: FileText,
    tone: 'border-rose-200 bg-rose-50 text-rose-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'frc',
    label: 'FRC',
    caption: 'NADRA certificate',
    icon: FileText,
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'pk-passport',
    label: 'PK Passport',
    caption: 'Application payment',
    icon: FileText,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'gb-passport',
    label: 'GB Passport',
    caption: 'Application payment',
    icon: FileText,
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'visa',
    label: 'Visa',
    caption: 'Application payment',
    icon: FileText,
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'ticket-package',
    label: 'Ticket & Package',
    caption: 'Tracked booking',
    icon: Plane,
    tone: 'border-purple-200 bg-purple-50 text-purple-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'remittance',
    label: 'Remittance',
    caption: 'Fee · loyalty eligible',
    icon: Landmark,
    tone: 'border-teal-200 bg-teal-50 text-teal-800',
    direction: 'IN',
    loyalty: true,
  },
  {
    id: 'document-help',
    label: 'Document help',
    caption: 'Loyalty eligible',
    icon: Sparkles,
    tone: 'border-lime-200 bg-lime-50 text-lime-800',
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
    supplier: 'British Airways',
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
  {
    id: 'POS-0908-008',
    time: '09:48',
    name: 'Emirates',
    category: 'Ticket & Package · Supplier',
    method: 'Bank',
    amount: -240,
    points: 0,
    status: 'Supplier payment',
    note: 'Supplier account deposit',
    supplier: 'Emirates',
  },
  {
    id: 'POS-0908-007',
    time: '09:22',
    name: 'Bilal Ahmed',
    category: 'NICOP · Normal',
    method: 'Cash',
    amount: 75,
    points: 0,
    status: 'Posted',
    note: 'Normal NICOP application payment',
  },
  {
    id: 'POS-0908-006',
    time: '09:05',
    name: 'Walk-in',
    category: 'GB Passport',
    method: 'Card',
    amount: 88.5,
    points: 0,
    status: 'Posted',
    note: 'Passport application payment',
  },
  {
    id: 'POS-0908-005',
    time: '08:51',
    name: 'Walk-in',
    category: 'Remittance',
    method: 'Cash',
    amount: 150,
    points: 0,
    status: 'Posted',
    note: 'Remittance counter payment',
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
const SORTS = ['Supplier', 'Newest'] as const

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

export default function PosPreviewClient({ branchName }: { branchName: string }) {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]>('Supplier')
  const [selectedTransactionId, setSelectedTransactionId] = useState(TRANSACTIONS[0].id)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
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
    const matches = TRANSACTIONS.filter((transaction) => {
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

    return matches.sort((left, right) => {
      if (sortBy === 'Newest') return right.time.localeCompare(left.time)

      if (left.supplier && !right.supplier) return -1
      if (!left.supplier && right.supplier) return 1
      if (left.supplier && right.supplier) {
        const supplierOrder = left.supplier.localeCompare(right.supplier)
        if (supplierOrder !== 0) return supplierOrder
      }
      return right.time.localeCompare(left.time)
    })
  }, [activeFilter, search, sortBy])

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
    setAmount(category.id === 'ticket-package' ? '420.00' : '25.00')
    setPaymentMethod(category.id === 'ticket-package' ? 'Card' : 'Cash')
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
    <div className="space-y-3 pb-6">
      <section className="relative overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-[#351017] via-[#7f1d2d] to-slate-900 px-4 py-3 text-white shadow-xl shadow-red-950/15 sm:px-5">
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
                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-950">
                  Design preview
                </span>
              </div>
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">Daily transactions</h1>
              <p className="text-xs text-red-50/80">
                Quick entry, till balance and today&apos;s branch activity
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="rounded-xl bg-black/15 px-3 py-2 ring-1 ring-white/15">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-100">
                Branch
              </p>
              <p className="text-xs font-black">{branchName}</p>
            </div>
            <div className="rounded-xl bg-emerald-400/15 px-3 py-2 ring-1 ring-emerald-200/25">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" /> Till open
              </p>
              <p className="text-xs font-black">Shift 08:42–now</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid items-start gap-3 xl:grid-cols-[4rem_minmax(0,1fr)_15rem]">
        <aside className="group/posnav order-1 z-20 hidden w-16 overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm transition-[width,box-shadow] duration-200 hover:w-52 hover:shadow-xl focus-within:w-52 xl:block">
          <div className="flex h-12 items-center border-b border-slate-200 bg-slate-950 px-4 text-white">
            <PosRegisterIcon className="h-5 w-5 shrink-0" />
            <div className="ml-3 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/posnav:opacity-100 group-focus-within/posnav:opacity-100">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                POS menu
              </p>
              <p className="text-xs font-black">Workspace</p>
            </div>
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
                  title={item.label}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${
                    item.active
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

        <aside className="order-2 rounded-[1.15rem] border border-slate-200 bg-white p-2.5 shadow-sm xl:order-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Quick entry
              </p>
              <h2 className="text-sm font-black text-slate-950">Categories</h2>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 xl:hidden" />
          </div>
          <div className="grid max-h-[31rem] grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-2">
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              const selected = category.id === categoryId
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => chooseCategory(category)}
                  aria-pressed={selected}
                  className={`group min-h-[4.4rem] rounded-xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    selected
                      ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white shadow-md shadow-red-950/10'
                      : category.tone
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon className="h-4 w-4" />
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <p className="mt-1.5 text-[11px] font-black leading-tight">{category.label}</p>
                  <p
                    className={`mt-0.5 text-[9px] leading-tight ${selected ? 'text-red-100' : 'opacity-70'}`}
                  >
                    {category.caption}
                  </p>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="order-3 min-w-0 space-y-3 xl:order-2">
          <section className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950">Today&apos;s ledger</h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600">
                    {filteredTransactions.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Tuesday, 8 September ·{' '}
                  {sortBy === 'Supplier' ? 'suppliers first' : 'newest first'}
                </p>
              </div>
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1 lg:w-56">
                  <span className="sr-only">Search transactions</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search reference or name"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none transition placeholder:font-normal focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  />
                </label>
                <label className="sr-only" htmlFor="ledger-sort">
                  Sort ledger
                </label>
                <select
                  id="ledger-sort"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as (typeof SORTS)[number])}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 outline-none focus:border-[#8b1e2d]"
                >
                  <option value="Supplier">Supplier sort</option>
                  <option value="Newest">Newest first</option>
                </select>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((current) => !current)}
                  aria-expanded={filtersOpen}
                  className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
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

            <div className="hidden max-h-60 overflow-auto md:block">
              <table className="w-full min-w-[780px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="border-b border-slate-200 bg-white text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    <th className="px-3 py-2">Time / reference</th>
                    <th className="px-3 py-2">Name / category</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2 text-right">In</th>
                    <th className="px-3 py-2 text-right">Out</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="w-9 px-2 py-2">
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
                      <td className="px-3 py-2">
                        <p className="text-xs font-black text-slate-900">{transaction.time}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                          {transaction.id}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-xs font-bold text-slate-900">{transaction.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{transaction.category}</p>
                      </td>
                      <td className="px-3 py-2">
                        {transaction.supplier ? (
                          <span className="inline-flex rounded-md bg-blue-50 px-1.5 py-1 text-[10px] font-bold text-blue-700">
                            {transaction.supplier}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
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
                      <td className="px-3 py-2 text-right text-xs font-black text-emerald-700">
                        {transaction.amount > 0 ? formatMoney(transaction.amount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-black text-rose-700">
                        {transaction.amount < 0 ? formatMoney(transaction.amount) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusTone(transaction.status)}`}
                        >
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto md:hidden">
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
            <section className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                      Expanded transaction
                    </p>
                    <h2 className="text-xs font-black text-slate-950">{selectedTransaction.id}</h2>
                  </div>
                  <span className="hidden h-7 w-px bg-slate-200 sm:block" />
                  <p className="truncate text-xs text-slate-600">
                    <span className="font-black text-slate-900">{selectedTransaction.name}</span>
                    {' · '}
                    {selectedTransaction.category}
                    {' · '}
                    {selectedTransaction.method} {formatMoney(selectedTransaction.amount)}
                    {' · '}
                    {selectedTransaction.points === 0
                      ? 'No loyalty'
                      : `${selectedTransaction.points > 0 ? '+' : ''}${selectedTransaction.points} pts`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingTransactionId((current) =>
                        current === selectedTransaction.id ? null : selectedTransaction.id,
                      )
                    }
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {editingTransactionId === selectedTransaction.id ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseCategory(CATEGORIES.find((item) => item.id === 'refund')!)}
                    className="h-8 rounded-lg bg-[#8b1e2d] px-2.5 text-[11px] font-black text-white hover:bg-[#6f1422]"
                  >
                    Refund
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      toast('Receipt preview', { description: selectedTransaction.id })
                    }
                    className="hidden h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 sm:block"
                  >
                    Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTransactionId('')
                      setEditingTransactionId(null)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                    aria-label="Close transaction details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {editingTransactionId === selectedTransaction.id && (
                <div className="grid gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
                  <input
                    aria-label="Edit transaction name"
                    defaultValue={selectedTransaction.name}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#8b1e2d]"
                  />
                  <input
                    aria-label="Edit transaction amount"
                    defaultValue={Math.abs(selectedTransaction.amount).toFixed(2)}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#8b1e2d]"
                  />
                  <input
                    aria-label="Edit transaction note"
                    defaultValue={selectedTransaction.note}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#8b1e2d]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTransactionId(null)
                      toast.success('Edit previewed', {
                        description: 'No transaction was changed.',
                      })
                    }}
                    className="h-8 rounded-lg bg-slate-950 px-3 text-[11px] font-black text-white"
                  >
                    Save edit
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-[0_20px_55px_-38px_rgba(15,23,42,0.55)]">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-2.5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Quick transaction
                </p>
                <h2 className="text-sm font-black">{selectedCategory.label}</h2>
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

            <div className="space-y-3 p-3">
              {!isTransfer && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2.5">
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
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
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
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-base font-black text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
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
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition ${
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

              <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-2.5 sm:flex-row sm:items-center sm:justify-between">
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
                  className="flex min-h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7f1d2d] to-[#a52338] px-4 py-2 text-xs font-black text-white shadow-md shadow-red-950/15 transition hover:brightness-105 active:scale-[0.99]"
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
