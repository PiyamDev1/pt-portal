'use client'

import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgePoundSterling,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
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
  RefreshCcw,
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
import type { ApiResponse } from '@/lib/api/http'
import type {
  PosLedgerPayload,
  PosLedgerPaymentMethod,
  PosLedgerSummary,
  PosLedgerTransaction,
  PosBootstrapPayload,
  PosLoyaltyMember,
  PosMutationResult,
} from '@/lib/pos/contracts'
import PosOperationsPanel, { type PosWorkspaceView } from './PosOperationsPanel'

type IconComponent = ComponentType<{ className?: string }>
type PaymentMethod = 'Cash' | 'Card' | 'Bank' | 'Split'
type OutgoingType = 'Refund' | 'Expense' | 'Supplier payment'
type LedgerPeriod = 'day' | 'month'

const DEMO_TODAY = '2026-09-08'
const DEFAULT_LEDGER_HEIGHT = 240
const MIN_LEDGER_HEIGHT = 160
const MAX_LEDGER_HEIGHT = 720
const LEDGER_HEIGHT_STORAGE_KEY = 'pt-portal:pos-preview:ledger-height'
const POS_DRAFT_STORAGE_KEY = 'pt-portal:pos:draft:v1'
const POS_RETRY_STORAGE_KEY = 'pt-portal:pos:retry:v1'
const SCAN_ARM_TIMEOUT_MS = 30_000

type CategoryPreset = {
  id: string
  label: string
  caption: string
  icon: IconComponent
  tone: string
  direction: 'IN' | 'OUT' | 'TRANSFER'
  loyalty: boolean
}

type PreviewTransaction = Omit<
  PosLedgerTransaction,
  'reference' | 'entryAgent' | 'sourceLinkId' | 'tenders'
> &
  Partial<Pick<PosLedgerTransaction, 'reference' | 'entryAgent' | 'sourceLinkId' | 'tenders'>>

const CATEGORIES: CategoryPreset[] = [
  {
    id: 'nicop-cnic',
    label: 'NICOP / CNIC',
    caption: 'Price identifies service speed',
    icon: FileText,
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'poc',
    label: 'POC',
    caption: 'Pakistan Origin Card',
    icon: FileText,
    tone: 'border-violet-200 bg-violet-50 text-violet-800',
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
    id: 'crc',
    label: 'CRC',
    caption: 'Child registration',
    icon: FileText,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    direction: 'IN',
    loyalty: false,
  },
  {
    id: 'poa',
    label: 'POA',
    caption: 'Power of attorney',
    icon: FileText,
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
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
    id: 'cargo-delivery',
    label: 'Cargo / delivery',
    caption: 'Loyalty eligible',
    icon: Plane,
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    direction: 'IN',
    loyalty: true,
  },
  {
    id: 'printing-copying',
    label: 'Printing / copying',
    caption: 'Loyalty eligible',
    icon: FileText,
    tone: 'border-lime-200 bg-lime-50 text-lime-800',
    direction: 'IN',
    loyalty: true,
  },
  {
    id: 'other-service',
    label: 'Other service',
    caption: 'Note required',
    icon: Sparkles,
    tone: 'border-slate-200 bg-slate-50 text-slate-800',
    direction: 'IN',
    loyalty: false,
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

const CATEGORY_MENU: Array<
  | { id: string; label: string; caption: string; icon: IconComponent; children: string[] }
  | { id: string; categoryId: string }
> = [
  {
    id: 'nadra-services',
    label: 'NADRA',
    caption: 'Applications and certificates',
    icon: FileText,
    children: ['nicop-cnic', 'poc', 'frc', 'crc', 'poa'],
  },
  { id: 'pk-passport-menu', categoryId: 'pk-passport' },
  { id: 'gb-passport-menu', categoryId: 'gb-passport' },
  { id: 'visa-menu', categoryId: 'visa' },
  { id: 'ticket-package-menu', categoryId: 'ticket-package' },
  { id: 'remittance-menu', categoryId: 'remittance' },
  { id: 'document-help-menu', categoryId: 'document-help' },
  { id: 'cargo-menu', categoryId: 'cargo-delivery' },
  { id: 'printing-menu', categoryId: 'printing-copying' },
  { id: 'other-menu', categoryId: 'other-service' },
  { id: 'supplier-menu', categoryId: 'supplier' },
  { id: 'expense-menu', categoryId: 'expense' },
  { id: 'refund-menu', categoryId: 'refund' },
  { id: 'extra-coins-menu', categoryId: 'extra-coins' },
]

const TRANSACTIONS: PreviewTransaction[] = [
  {
    id: 'POS-0908-014',
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
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
    date: '2026-09-08',
    time: '08:51',
    name: 'Walk-in',
    category: 'Remittance',
    method: 'Cash',
    amount: 150,
    points: 0,
    status: 'Posted',
    note: 'Remittance counter payment',
  },
  {
    id: 'POS-0907-018',
    date: '2026-09-07',
    time: '16:10',
    name: 'Ayesha Travel',
    category: 'Ticket & Package · Supplier',
    method: 'Bank',
    amount: -500,
    points: 0,
    status: 'Supplier payment',
    note: 'Package supplier deposit',
    supplier: 'Ayesha Travel',
  },
  {
    id: 'POS-0907-017',
    date: '2026-09-07',
    time: '13:35',
    name: 'Sara Ali',
    category: 'NICOP / CNIC',
    method: 'Cash',
    amount: 50,
    points: 0,
    status: 'Posted',
    note: 'NADRA application payment',
  },
  {
    id: 'POS-0906-012',
    date: '2026-09-06',
    time: '12:20',
    name: 'Walk-in',
    category: 'Document help',
    method: 'Cash',
    amount: 18,
    points: 18,
    status: 'Posted',
    note: 'Printing and document assistance',
  },
  {
    id: 'POS-0901-004',
    date: '2026-09-01',
    time: '10:05',
    name: 'Office supplies',
    category: 'Expense',
    method: 'Cash',
    amount: -24.5,
    points: 0,
    status: 'Posted',
    note: 'Printer paper',
  },
]

const SUPPLIERS = [
  { name: 'British Airways', area: 'Ticketing', balance: 1240 },
  { name: 'Emirates', area: 'Ticketing', balance: 860 },
  { name: 'Al Haram Travel', area: 'Packages', balance: 2150 },
]

const NAV_ITEMS: Array<{ label: PosWorkspaceView; icon: IconComponent; managerOnly?: boolean }> = [
  { label: 'Daily transactions', icon: LayoutDashboard },
  { label: 'Open till', icon: Store },
  { label: 'Closeout', icon: ShieldCheck },
  { label: 'Cash management', icon: Coins },
  { label: 'Supplier balances', icon: Building2 },
  { label: 'Refunds & corrections', icon: RotateCcw },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Unreconciled', icon: RefreshCcw },
  { label: 'Import history', icon: FileText, managerOnly: true },
]

const FILTERS = ['All', 'Cash', 'Card', 'Bank', 'Outgoing'] as const
const SORTS = ['Supplier', 'Newest'] as const
const NADRA_SERVICE_IDS = ['nicop-cnic', 'poc', 'frc', 'crc', 'poa']
const EMPTY_LEDGER_SUMMARY: PosLedgerSummary = {
  moneyIn: 0,
  moneyOut: 0,
  netMovement: 0,
  cashNet: 0,
  cardNet: 0,
  bankNet: 0,
  unreconciledCount: 0,
}

function isNadraCategory(categoryId: string) {
  return NADRA_SERVICE_IDS.includes(categoryId)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Math.abs(value))
}

function formatSignedMoney(value: number) {
  return `${value < 0 ? '−' : '+'}${formatMoney(value)}`
}

function formatLedgerDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: includeYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function formatLedgerMonth(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date.slice(0, 7)}-01T12:00:00Z`))
}

function formatLoadedAt(value: string | null) {
  if (!value) return 'Not loaded'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Not loaded'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function shiftLedgerDate(date: string, period: LedgerPeriod, offset: number) {
  const value = new Date(`${date}T12:00:00Z`)
  if (period === 'month') {
    value.setUTCDate(1)
    value.setUTCMonth(value.getUTCMonth() + offset)
  } else {
    value.setUTCDate(value.getUTCDate() + offset)
  }
  return value.toISOString().slice(0, 10)
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

export default function PosPreviewClient({
  branchName,
  initialLedger,
  initialBootstrap,
  initialLoadError = null,
}: {
  branchName: string
  initialLedger?: PosLedgerPayload
  initialBootstrap?: PosBootstrapPayload
  initialLoadError?: string | null
}) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const quickEntryInputRef = useRef<HTMLInputElement>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const loadedLedgerKeyRef = useRef(
    initialLedger ? `${initialLedger.context.period}:${initialLedger.context.date}` : null,
  )
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activeView, setActiveView] = useState<PosWorkspaceView>('Daily transactions')
  const [bootstrap, setBootstrap] = useState<PosBootstrapPayload>(
    initialBootstrap || {
      schemaReady: false,
      capabilityVersion: 0,
      branch: {
        id: initialLedger?.context.branchId || '',
        name: branchName,
        timezone: initialLedger?.context.timezone || 'Europe/London',
      },
      catalogue: [],
      tills: [],
      activeShift: null,
      balances: { openingFloat: 0, drawer: 0, reserve: 0 },
      suppliers: [],
      employees: [],
      closeouts: [],
      permissions: {
        canPost: true,
        canManage: false,
        canApprove: false,
        canImport: false,
        canViewCrossBranch: false,
      },
      loadedAt: new Date().toISOString(),
    },
  )
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [outgoingFilter, setOutgoingFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [tillFilter, setTillFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [loyaltyFilter, setLoyaltyFilter] = useState('')
  const [minAmountFilter, setMinAmountFilter] = useState('')
  const [maxAmountFilter, setMaxAmountFilter] = useState('')
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]>('Supplier')
  const [ledgerPeriod, setLedgerPeriod] = useState<LedgerPeriod>(
    initialLedger?.context.period || 'day',
  )
  const [ledgerDate, setLedgerDate] = useState(initialLedger?.context.date || DEMO_TODAY)
  const [transactions, setTransactions] = useState<PreviewTransaction[]>(
    initialLedger?.items || TRANSACTIONS,
  )
  const [ledgerSummary, setLedgerSummary] = useState<PosLedgerSummary>(
    initialLedger?.summary || EMPTY_LEDGER_SUMMARY,
  )
  const [ledgerLoadedAt, setLedgerLoadedAt] = useState(initialLedger?.context.loadedAt || null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(initialLoadError)
  const [ledgerRefresh, setLedgerRefresh] = useState(0)
  const [selectedTransactionId, setSelectedTransactionId] = useState(
    (initialLedger?.items || TRANSACTIONS)[0]?.id || '',
  )
  const [categoryId, setCategoryId] = useState('document-help')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('25.00')
  const [amountPaid, setAmountPaid] = useState('20.00')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [splitCash, setSplitCash] = useState('0.00')
  const [splitCard, setSplitCard] = useState('0.00')
  const [splitBank, setSplitBank] = useState('0.00')
  const [externalReference, setExternalReference] = useState('')
  const [transactionNote, setTransactionNote] = useState('')
  const [sourceRecordId, setSourceRecordId] = useState('')
  const [selectedPricingId, setSelectedPricingId] = useState('')
  const [manualPriceConfirmed, setManualPriceConfirmed] = useState(false)
  const [outgoingType, setOutgoingType] = useState<OutgoingType | null>(null)
  const [supplierConfirmed, setSupplierConfirmed] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [supplierMovementType, setSupplierMovementType] = useState<
    'DEPOSIT' | 'USE_BALANCE' | 'REFUND'
  >('DEPOSIT')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanValue, setScanValue] = useState('')
  const [member, setMember] = useState<PosLoyaltyMember | null>(null)
  const [posting, setPosting] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [expandedCategoryGroups, setExpandedCategoryGroups] = useState<string[]>([])
  const [ledgerHeight, setLedgerHeight] = useState(DEFAULT_LEDGER_HEIGHT)
  const todayDate = initialLedger?.context.date || DEMO_TODAY

  const selectedCategory = CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0]
  const catalogueKey =
    categoryId === 'remittance'
      ? 'remittance-fee'
      : categoryId === 'supplier'
        ? 'supplier-payment'
        : categoryId === 'refund'
          ? 'general-refund'
          : categoryId
  const liveCatalogueItem = bootstrap.catalogue.find((item) => item.key === catalogueKey) || null
  const numericAmount = Number.parseFloat(amount.replace(/,/g, '')) || 0
  const numericAmountPaid = Number.parseFloat(amountPaid.replace(/,/g, '')) || 0
  const isTransfer = selectedCategory.direction === 'TRANSFER'
  const isOutgoing = !isTransfer && (numericAmount < 0 || selectedCategory.direction === 'OUT')
  const remainingBalance = Math.max(Math.abs(numericAmount) - Math.abs(numericAmountPaid), 0)
  const changeDue = Math.max(Math.abs(numericAmountPaid) - Math.abs(numericAmount), 0)
  const matchingPricingOptions = (liveCatalogueItem?.pricingOptions || []).filter(
    (option) => Math.abs(option.price - Math.abs(numericAmount)) < 0.005,
  )

  const supplierMatches = useMemo(() => {
    if (!isOutgoing || outgoingType !== 'Supplier payment') return null
    const needle = name.trim().toLowerCase()
    const suppliers = bootstrap.schemaReady ? bootstrap.suppliers : SUPPLIERS
    if (!needle) return suppliers.slice(0, 8)
    return suppliers
      .filter(
        (supplier) =>
          supplier.name.toLowerCase().includes(needle) ||
          needle.includes(supplier.name.toLowerCase()) ||
          ('alternateNames' in supplier &&
            supplier.alternateNames.some((alias) => alias.toLowerCase().includes(needle))),
      )
      .slice(0, 8)
  }, [bootstrap.schemaReady, bootstrap.suppliers, isOutgoing, name, outgoingType])

  const supplierMatch = useMemo(() => {
    if (!supplierMatches?.length) return null
    return (
      supplierMatches.find((supplier) => 'id' in supplier && supplier.id === selectedSupplierId) ||
      supplierMatches[0]
    )
  }, [selectedSupplierId, supplierMatches])

  const filteredTransactions = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const matches = transactions.filter((transaction) => {
      const matchesPeriod =
        ledgerPeriod === 'month'
          ? transaction.date.startsWith(ledgerDate.slice(0, 7))
          : transaction.date === ledgerDate
      const matchesSearch =
        !needle ||
        [
          transaction.id,
          transaction.reference,
          transaction.name,
          transaction.category,
          transaction.note,
          transaction.supplier,
          transaction.entryAgent,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      const matchesFilter =
        activeFilter === 'All' ||
        transaction.method === activeFilter ||
        (activeFilter === 'Outgoing' && transaction.amount < 0)
      return matchesPeriod && matchesSearch && matchesFilter
    })

    return matches.sort((left, right) => {
      if (ledgerPeriod === 'month' && left.date !== right.date) {
        return right.date.localeCompare(left.date)
      }
      if (sortBy === 'Newest') return right.time.localeCompare(left.time)

      if (left.supplier && !right.supplier) return -1
      if (!left.supplier && right.supplier) return 1
      if (left.supplier && right.supplier) {
        const supplierOrder = left.supplier.localeCompare(right.supplier)
        if (supplierOrder !== 0) return supplierOrder
      }
      return right.time.localeCompare(left.time)
    })
  }, [activeFilter, ledgerDate, ledgerPeriod, search, sortBy, transactions])

  const monthlySummary = useMemo(() => {
    const moneyIn = filteredTransactions.reduce(
      (total, transaction) => total + Math.max(transaction.amount, 0),
      0,
    )
    const moneyOut = filteredTransactions.reduce(
      (total, transaction) => total + Math.abs(Math.min(transaction.amount, 0)),
      0,
    )

    return {
      days: new Set(filteredTransactions.map((transaction) => transaction.date)).size,
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
    }
  }, [filteredTransactions])

  const selectedTransaction =
    transactions.find((transaction) => transaction.id === selectedTransactionId) || null

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const target = event.target as HTMLElement | null
      const isTyping =
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'SELECT' ||
        target?.tagName === 'TEXTAREA'
      if (isTyping) return

      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        quickEntryInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!initialLedger) return
    const requestKey = [
      ledgerPeriod,
      ledgerDate,
      deferredSearch,
      activeFilter,
      categoryFilter,
      statusFilter,
      outgoingFilter,
      supplierFilter,
      tillFilter,
      agentFilter,
      sourceFilter,
      loyaltyFilter,
      minAmountFilter,
      maxAmountFilter,
    ].join(':')
    if (loadedLedgerKeyRef.current === requestKey && ledgerRefresh === 0) return

    const controller = new AbortController()
    let active = true
    window.queueMicrotask(() => {
      if (active) {
        setLedgerLoading(true)
        setLedgerError(null)
      }
    })

    async function loadLedger() {
      try {
        const params = new URLSearchParams({ period: ledgerPeriod, date: ledgerDate })
        if (deferredSearch.trim()) params.set('search', deferredSearch.trim())
        if (activeFilter === 'Cash') params.set('paymentMethod', 'CASH')
        if (activeFilter === 'Card') params.set('paymentMethod', 'CARD')
        if (activeFilter === 'Bank') params.set('paymentMethod', 'BANK')
        if (activeFilter === 'Outgoing') params.set('direction', 'OUT')
        if (categoryFilter) params.set('categoryKey', categoryFilter)
        if (statusFilter) params.set('status', statusFilter)
        if (outgoingFilter) params.set('outgoingType', outgoingFilter)
        if (supplierFilter) params.set('supplierId', supplierFilter)
        if (tillFilter) params.set('tillId', tillFilter)
        if (agentFilter) params.set('agentId', agentFilter)
        if (sourceFilter) params.set('sourceType', sourceFilter)
        if (loyaltyFilter) params.set('loyalty', loyaltyFilter)
        if (minAmountFilter) params.set('minAmount', minAmountFilter)
        if (maxAmountFilter) params.set('maxAmount', maxAmountFilter)
        const response = await fetch(`/api/pos/ledger?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        })
        const payload = (await response.json()) as ApiResponse<PosLedgerPayload>
        if (!response.ok || 'error' in payload) {
          throw new Error('error' in payload ? payload.error : 'Unable to load the POS ledger.')
        }
        if (!active) return

        loadedLedgerKeyRef.current = requestKey
        setTransactions(payload.items)
        setLedgerSummary(payload.summary)
        setLedgerLoadedAt(payload.context.loadedAt)
        setSelectedTransactionId(payload.items[0]?.id || '')
        setLedgerError(
          payload.context.truncated
            ? 'Only the newest 500 entries are shown for this period. Narrow the date range.'
            : null,
        )
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return
        setTransactions([])
        setLedgerSummary(EMPTY_LEDGER_SUMMARY)
        setSelectedTransactionId('')
        setLedgerError(error instanceof Error ? error.message : 'Unable to load the POS ledger.')
      } finally {
        if (active) setLedgerLoading(false)
      }
    }

    void loadLedger()
    return () => {
      active = false
      controller.abort()
    }
  }, [
    activeFilter,
    agentFilter,
    categoryFilter,
    deferredSearch,
    initialLedger,
    ledgerDate,
    ledgerPeriod,
    ledgerRefresh,
    loyaltyFilter,
    maxAmountFilter,
    minAmountFilter,
    outgoingFilter,
    sourceFilter,
    statusFilter,
    supplierFilter,
    tillFilter,
  ])

  useEffect(() => {
    const savedHeight = Number.parseInt(
      window.localStorage.getItem(LEDGER_HEIGHT_STORAGE_KEY) || '',
      10,
    )
    if (!Number.isFinite(savedHeight)) return

    const frame = window.requestAnimationFrame(() => {
      setLedgerHeight(Math.min(Math.max(savedHeight, MIN_LEDGER_HEIGHT), MAX_LEDGER_HEIGHT))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!scanOpen) return

    scanInputRef.current?.focus()
    const timeout = window.setTimeout(() => {
      setScanOpen(false)
      setScanValue('')
      toast.info('Scanner disarmed', { description: 'The 30-second scan window expired.' })
    }, SCAN_ARM_TIMEOUT_MS)

    return () => window.clearTimeout(timeout)
  }, [scanOpen])

  const draftRestoredRef = useRef(false)
  useEffect(() => {
    try {
      const savedDraft = JSON.parse(
        window.localStorage.getItem(POS_DRAFT_STORAGE_KEY) || 'null',
      ) as Record<string, string> | null
      if (savedDraft) {
        setCategoryId(savedDraft.categoryId || 'document-help')
        setName(savedDraft.name || '')
        setAmount(savedDraft.amount || '25.00')
        setAmountPaid(savedDraft.amountPaid || '25.00')
        setPaymentMethod((savedDraft.paymentMethod as PaymentMethod) || 'Cash')
        setTransactionNote(savedDraft.transactionNote || '')
        setSourceRecordId(savedDraft.sourceRecordId || '')
        setExternalReference(savedDraft.externalReference || '')
      }
      const queued = JSON.parse(
        window.localStorage.getItem(POS_RETRY_STORAGE_KEY) || '[]',
      ) as unknown[]
      setRetryCount(Array.isArray(queued) ? queued.length : 0)
    } catch {
      window.localStorage.removeItem(POS_DRAFT_STORAGE_KEY)
      window.localStorage.removeItem(POS_RETRY_STORAGE_KEY)
    } finally {
      draftRestoredRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!draftRestoredRef.current) return
    window.localStorage.setItem(
      POS_DRAFT_STORAGE_KEY,
      JSON.stringify({
        categoryId,
        name,
        amount,
        amountPaid,
        paymentMethod,
        transactionNote,
        sourceRecordId,
        externalReference,
      }),
    )
  }, [
    amount,
    amountPaid,
    categoryId,
    externalReference,
    name,
    paymentMethod,
    sourceRecordId,
    transactionNote,
  ])

  const refreshWorkspace = useCallback(async () => {
    const response = await fetch('/api/pos/bootstrap', {
      cache: 'no-store',
      credentials: 'include',
    })
    const payload = (await response.json()) as ApiResponse<PosBootstrapPayload>
    if (!response.ok || 'error' in payload) {
      throw new Error('error' in payload ? payload.error : 'Unable to refresh POS status.')
    }
    setBootstrap(payload)
    setLedgerRefresh((current) => current + 1)
  }, [])

  function buildTransactionPayload(confirmDuplicate = false) {
    const absoluteAmount = Math.abs(numericAmount)
    const supplierBalanceOnly =
      outgoingType === 'Supplier payment' && supplierMovementType === 'USE_BALANCE'
    const supplierRefund = outgoingType === 'Supplier payment' && supplierMovementType === 'REFUND'
    const directionIsOut = isOutgoing && !supplierRefund
    const paidAmount = supplierBalanceOnly
      ? 0
      : directionIsOut || supplierRefund
        ? absoluteAmount
        : Math.abs(numericAmountPaid)
    const tenders = supplierBalanceOnly
      ? []
      : paymentMethod === 'Split'
        ? [
            { method: 'CASH', amount: Number(splitCash) },
            { method: 'CARD', amount: Number(splitCard) },
            { method: 'BANK', amount: Number(splitBank) },
          ].filter((tender) => tender.amount > 0)
        : [
            {
              method: paymentMethod.toUpperCase(),
              amount: paidAmount,
              ...(paymentMethod !== 'Cash' && externalReference
                ? { externalReference, reconciliationStatus: 'RECORDED' }
                : {}),
            },
          ]
    return {
      shiftId: bootstrap.activeShift?.id,
      catalogueKey,
      direction: directionIsOut ? 'OUT' : 'IN',
      ...(directionIsOut
        ? {
            outgoingType:
              outgoingType === 'Supplier payment'
                ? 'SUPPLIER_PAYMENT'
                : outgoingType?.toUpperCase(),
          }
        : {}),
      totalAmount: absoluteAmount,
      customerName: name.trim() || 'Walk-in',
      ...(transactionNote.trim() ? { note: transactionNote.trim() } : {}),
      tenders,
      ...(liveCatalogueItem?.trackedSourceType && sourceRecordId.trim()
        ? {
            source: {
              type: liveCatalogueItem.trackedSourceType,
              recordId: sourceRecordId.trim(),
              displayReference: sourceRecordId.trim(),
            },
          }
        : {}),
      ...(selectedPricingId || matchingPricingOptions.length === 1
        ? { pricingId: selectedPricingId || matchingPricingOptions[0].id }
        : {}),
      pricingConfirmed: manualPriceConfirmed,
      ...(outgoingType === 'Supplier payment' && supplierMatch && 'id' in supplierMatch
        ? { supplierId: supplierMatch.id, supplierMovementType }
        : {}),
      ...(member && liveCatalogueItem?.loyaltyEligible ? { loyaltyCode: member.customerCode } : {}),
      confirmDuplicate,
    }
  }

  async function sendTransaction(payload: ReturnType<typeof buildTransactionPayload>, key: string) {
    const response = await fetch('/api/pos/transactions', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    })
    const result = (await response.json()) as ApiResponse<PosMutationResult> & {
      duplicateWarning?: boolean
    }
    if (!response.ok || 'error' in result) {
      if (result.duplicateWarning) {
        const confirmed = window.confirm(
          'A similar transaction was posted recently. Post this transaction anyway?',
        )
        if (confirmed) return sendTransaction(buildTransactionPayload(true), key)
      }
      throw new Error('error' in result ? result.error : 'Unable to save the transaction.')
    }
    return result
  }

  async function submitTransaction() {
    if (!bootstrap.schemaReady) {
      toast.error('The POS database upgrade is not installed yet.')
      return
    }
    if (!bootstrap.activeShift) {
      setActiveView('Open till')
      toast.error('Open a till before posting.')
      return
    }
    if (isTransfer) {
      setActiveView('Cash management')
      toast.info('Use Cash management to count the coin denominations.')
      return
    }
    if (categoryId === 'refund') {
      setActiveView('Refunds & corrections')
      return
    }
    if (outgoingType === 'Refund') {
      setActiveView('Refunds & corrections')
      toast.info('Use the controlled linked or general refund form.')
      return
    }
    if (isOutgoing && !outgoingType) {
      toast.error('Choose the outgoing type first')
      return
    }
    if (outgoingType === 'Supplier payment' && !supplierConfirmed) {
      toast.error('Confirm the supplier first')
      return
    }
    if (liveCatalogueItem?.sourceRequired && !sourceRecordId.trim()) {
      toast.error('Enter the tracked service reference first.')
      return
    }
    if (
      liveCatalogueItem?.trackedSourceType === 'APPLICATIONS' &&
      !selectedPricingId &&
      matchingPricingOptions.length !== 1 &&
      !manualPriceConfirmed
    ) {
      toast.error('Select a matching price option or confirm the manual total.')
      return
    }
    if (liveCatalogueItem?.noteRequired && transactionNote.trim().length < 3) {
      toast.error('Add a note for this category.')
      return
    }
    const payload = buildTransactionPayload()
    const key = crypto.randomUUID()
    setPosting(true)
    try {
      const result = await sendTransaction(payload, key)
      window.localStorage.removeItem(POS_DRAFT_STORAGE_KEY)
      setName('')
      setTransactionNote('')
      setSourceRecordId('')
      setExternalReference('')
      setMember(null)
      toast.success(`Transaction ${result.reference || ''} posted`, {
        description: result.loyaltyPointsAwarded
          ? `${result.loyaltyPointsAwarded} loyalty points awarded.`
          : 'The branch ledger and till totals were updated.',
      })
      await refreshWorkspace()
      quickEntryInputRef.current?.focus()
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        const queue = JSON.parse(
          window.localStorage.getItem(POS_RETRY_STORAGE_KEY) || '[]',
        ) as Array<{
          key: string
          payload: ReturnType<typeof buildTransactionPayload>
        }>
        queue.push({ key, payload })
        window.localStorage.setItem(POS_RETRY_STORAGE_KEY, JSON.stringify(queue.slice(-20)))
        setRetryCount(queue.slice(-20).length)
        toast.warning('Saved to the retry queue', {
          description: 'The draft is preserved and has not been confirmed by the server.',
        })
      } else {
        toast.error(error instanceof Error ? error.message : 'Unable to save the transaction.')
      }
    } finally {
      setPosting(false)
    }
  }

  async function retryPendingTransactions() {
    const queue = JSON.parse(window.localStorage.getItem(POS_RETRY_STORAGE_KEY) || '[]') as Array<{
      key: string
      payload: ReturnType<typeof buildTransactionPayload>
    }>
    if (!queue.length) return
    setPosting(true)
    const remaining = [...queue]
    try {
      while (remaining.length) {
        const item = remaining[0]
        await sendTransaction(item.payload, item.key)
        remaining.shift()
        window.localStorage.setItem(POS_RETRY_STORAGE_KEY, JSON.stringify(remaining))
        setRetryCount(remaining.length)
      }
      toast.success('Retry queue posted')
      await refreshWorkspace()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Retry stopped.')
    } finally {
      setPosting(false)
    }
  }

  const saveLedgerHeight = useCallback((height: number) => {
    const nextHeight = Math.min(Math.max(Math.round(height), MIN_LEDGER_HEIGHT), MAX_LEDGER_HEIGHT)
    setLedgerHeight(nextHeight)
    window.localStorage.setItem(LEDGER_HEIGHT_STORAGE_KEY, String(nextHeight))
  }, [])

  function startLedgerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    const startY = event.clientY
    const startHeight = ledgerHeight
    const handle = event.currentTarget
    let latestHeight = startHeight
    handle.setPointerCapture(event.pointerId)

    function handlePointerMove(moveEvent: PointerEvent) {
      latestHeight = Math.min(
        Math.max(startHeight + moveEvent.clientY - startY, MIN_LEDGER_HEIGHT),
        MAX_LEDGER_HEIGHT,
      )
      setLedgerHeight(Math.round(latestHeight))
    }

    function finishResize() {
      handle.removeEventListener('pointermove', handlePointerMove)
      handle.removeEventListener('pointerup', finishResize)
      handle.removeEventListener('pointercancel', finishResize)
      saveLedgerHeight(latestHeight)
    }

    handle.addEventListener('pointermove', handlePointerMove)
    handle.addEventListener('pointerup', finishResize)
    handle.addEventListener('pointercancel', finishResize)
  }

  function resetLedgerHeight() {
    saveLedgerHeight(DEFAULT_LEDGER_HEIGHT)
    toast.success('Ledger height reset')
  }

  function chooseCategory(category: CategoryPreset, categoryGroupId?: string) {
    setCategoryId(category.id)
    setExpandedCategoryGroups(categoryGroupId ? [categoryGroupId] : [])
    setSupplierConfirmed(false)
    setSelectedSupplierId('')
    setSelectedPricingId('')
    setManualPriceConfirmed(false)
    setScanOpen(false)
    setScanValue('')

    if (category.id === 'supplier') {
      setName('British Airways')
      setAmount('-300.00')
      setAmountPaid('0.00')
      setPaymentMethod('Cash')
      setOutgoingType('Supplier payment')
      setSupplierMovementType('DEPOSIT')
      return
    }
    if (category.id === 'expense') {
      setName('Office supplies')
      setAmount('-18.40')
      setAmountPaid('0.00')
      setPaymentMethod('Cash')
      setOutgoingType('Expense')
      return
    }
    if (category.id === 'refund') {
      setName('Aisha Khan')
      setAmount('-45.00')
      setAmountPaid('0.00')
      setPaymentMethod('Card')
      setOutgoingType('Refund')
      return
    }
    if (category.id === 'extra-coins') {
      setName('Coin reserve')
      setAmount('20.00')
      setAmountPaid('0.00')
      setPaymentMethod('Cash')
      setOutgoingType(null)
      return
    }

    setName('')
    const nextAmount =
      category.id === 'ticket-package' ? '420.00' : isNadraCategory(category.id) ? '50.00' : '25.00'
    setAmount(nextAmount)
    setAmountPaid(nextAmount)
    setPaymentMethod(category.id === 'ticket-package' ? 'Card' : 'Cash')
    setOutgoingType(null)
  }

  function toggleCategoryGroup(groupId: string) {
    setExpandedCategoryGroups((current) =>
      current.includes(groupId)
        ? current.filter((expandedId) => expandedId !== groupId)
        : [groupId],
    )
  }

  async function attachDemoMember(scannedValue = scanValue) {
    if (!scannedValue.trim()) {
      toast.error('Scan or enter a loyalty code first')
      scanInputRef.current?.focus()
      return
    }
    setScanOpen(false)
    setScanValue('')
    try {
      const response = await fetch('/api/pos/loyalty/lookup', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: scannedValue.trim() }),
      })
      const payload = (await response.json()) as ApiResponse<PosLoyaltyMember>
      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error : 'Loyalty member not found.')
      }
      setMember(payload)
      toast.success('Loyalty card recognised', {
        description: `${payload.name} · ${payload.maskedCode}`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Loyalty member not found.')
    }
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
                <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-950">
                  {bootstrap.schemaReady
                    ? 'Live POS'
                    : initialLedger
                      ? 'Live ledger'
                      : 'Design preview'}
                </span>
                {initialLedger && !bootstrap.schemaReady && (
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

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="rounded-xl bg-black/15 px-3 py-2 ring-1 ring-white/15">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-100">
                Branch
              </p>
              <p className="text-xs font-black">{branchName}</p>
            </div>
            <div className="rounded-xl bg-emerald-400/15 px-3 py-2 ring-1 ring-emerald-200/25">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" /> Live data
              </p>
              <p className="text-xs font-black">
                {ledgerLoading ? 'Refreshing…' : `Synced ${formatLoadedAt(ledgerLoadedAt)}`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={`${ledgerPeriod === 'month' ? 'Month' : 'Day'} cash net`}
          value={formatSignedMoney(ledgerSummary.cashNet)}
          detail="Posted cash tenders"
          icon={Banknote}
          tone="bg-emerald-50 text-emerald-700"
        />
        <SummaryCard
          label={`${ledgerPeriod === 'month' ? 'Month' : 'Day'} card net`}
          value={formatSignedMoney(ledgerSummary.cardNet)}
          detail={`${ledgerSummary.unreconciledCount} unreconciled tender${ledgerSummary.unreconciledCount === 1 ? '' : 's'}`}
          icon={CreditCard}
          tone="bg-blue-50 text-blue-700"
        />
        <SummaryCard
          label={`${ledgerPeriod === 'month' ? 'Month' : 'Day'} bank net`}
          value={formatSignedMoney(ledgerSummary.bankNet)}
          detail="Recorded bank tenders"
          icon={Landmark}
          tone="bg-violet-50 text-violet-700"
        />
        <SummaryCard
          label="Net movement"
          value={formatSignedMoney(ledgerSummary.netMovement)}
          detail={`${formatMoney(ledgerSummary.moneyIn)} in · ${formatMoney(ledgerSummary.moneyOut)} out`}
          icon={Coins}
          tone="bg-amber-50 text-amber-700"
        />
      </section>

      <label className="block xl:hidden">
        <span className="sr-only">POS workspace section</span>
        <select
          aria-label="POS workspace section"
          value={activeView}
          onChange={(event) => setActiveView(event.target.value as PosWorkspaceView)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-sm"
        >
          {NAV_ITEMS.filter((item) => !item.managerOnly || bootstrap.permissions.canManage).map(
            (item) => (
              <option key={item.label}>{item.label}</option>
            ),
          )}
        </select>
      </label>

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
          <nav className="space-y-1 p-2" aria-label="POS navigation">
            {NAV_ITEMS.filter((item) => !item.managerOnly || bootstrap.permissions.canManage).map(
              (item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setActiveView(item.label)}
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
              },
            )}
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
          <div className="grid max-h-[31rem] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {CATEGORY_MENU.map((menuItem) => {
              if ('children' in menuItem) {
                const Icon = menuItem.icon
                const expanded = expandedCategoryGroups.includes(menuItem.id)
                const childSelected = menuItem.children.includes(categoryId)

                return (
                  <div
                    key={menuItem.id}
                    className={`grid gap-1.5 ${expanded ? 'col-span-2 grid-cols-2' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategoryGroup(menuItem.id)}
                      aria-label={`${menuItem.label} ${menuItem.caption}`}
                      aria-expanded={expanded}
                      aria-controls={`${menuItem.id}-subcategories`}
                      className={`flex aspect-square w-full flex-col justify-between rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                        expanded || childSelected
                          ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
                          : 'border-sky-200 bg-sky-50 text-sky-800'
                      }`}
                    >
                      <span className="flex w-full items-start justify-between">
                        <Icon className="h-4 w-4" />
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </span>
                      <span>
                        <span className="block text-[11px] font-black leading-tight">
                          {menuItem.label}
                        </span>
                        <span className="mt-0.5 block text-[9px] font-medium leading-tight opacity-65">
                          {menuItem.caption}
                        </span>
                      </span>
                    </button>

                    {expanded && (
                      <div
                        id={`${menuItem.id}-subcategories`}
                        className="col-span-2 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2"
                      >
                        {menuItem.children.map((childId) => {
                          const category = CATEGORIES.find((item) => item.id === childId)
                          if (!category) return null
                          const selected = category.id === categoryId

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => chooseCategory(category, menuItem.id)}
                              aria-label={category.label}
                              aria-pressed={selected}
                              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-[11px] font-black shadow-sm transition hover:translate-x-0.5 ${
                                selected
                                  ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white'
                                  : category.tone
                              }`}
                            >
                              <span>
                                <span className="block">{category.label}</span>
                                <span
                                  className={`mt-0.5 block text-[9px] font-medium ${selected ? 'text-red-100' : 'opacity-65'}`}
                                >
                                  {category.caption}
                                </span>
                              </span>
                              {selected && <Check className="h-3.5 w-3.5" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              const category = CATEGORIES.find((item) => item.id === menuItem.categoryId)
              if (!category) return null
              const Icon = category.icon
              const selected = category.id === categoryId

              return (
                <button
                  key={menuItem.id}
                  type="button"
                  onClick={() => chooseCategory(category)}
                  aria-label={`${category.label} ${category.caption}`}
                  aria-pressed={selected}
                  className={`flex aspect-square w-full flex-col justify-between rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    selected
                      ? 'border-[#8b1e2d] bg-[#8b1e2d] text-white shadow-sm'
                      : `${category.tone} hover:border-slate-300`
                  }`}
                >
                  <span className="flex w-full items-start justify-between">
                    <Icon className="h-4 w-4 shrink-0" />
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </span>
                  <span>
                    <span className="block text-[11px] font-black leading-tight">
                      {category.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-[9px] leading-tight ${selected ? 'text-red-100' : 'opacity-65'}`}
                    >
                      {category.caption}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="order-3 min-w-0 space-y-3 xl:order-2">
          <PosOperationsPanel
            view={activeView}
            bootstrap={bootstrap}
            transactions={transactions.filter((transaction): transaction is PosLedgerTransaction =>
              Boolean(transaction.reference && transaction.entryAgent && transaction.tenders),
            )}
            period={ledgerPeriod}
            date={ledgerDate}
            selectedTransactionId={selectedTransactionId}
            onSelectedTransaction={setSelectedTransactionId}
            onRefresh={refreshWorkspace}
          />
          <section className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950">
                    {ledgerPeriod === 'month'
                      ? 'Monthly ledger'
                      : ledgerDate === todayDate
                        ? "Today's ledger"
                        : 'Daily ledger'}
                  </h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600">
                    {filteredTransactions.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  {ledgerPeriod === 'month'
                    ? `${formatLedgerMonth(ledgerDate)} · grouped by day · `
                    : `${formatLedgerDate(ledgerDate, true)} · `}
                  {sortBy === 'Supplier' ? 'suppliers first' : 'newest first'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex h-9 rounded-xl border border-slate-200 bg-white p-1">
                  {(['day', 'month'] as LedgerPeriod[]).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setLedgerPeriod(period)}
                      aria-pressed={ledgerPeriod === period}
                      className={`rounded-lg px-2 text-[10px] font-black capitalize transition ${
                        ledgerPeriod === period
                          ? 'bg-slate-950 text-white'
                          : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
                <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() =>
                      setLedgerDate((current) => shiftLedgerDate(current, ledgerPeriod, -1))
                    }
                    aria-label={ledgerPeriod === 'month' ? 'Previous month' : 'Previous day'}
                    className="flex h-full w-8 items-center justify-center rounded-l-xl text-slate-500 hover:bg-slate-100"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <label className="relative h-full">
                    <span className="sr-only">
                      {ledgerPeriod === 'month' ? 'Ledger month' : 'Ledger date'}
                    </span>
                    <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type={ledgerPeriod === 'month' ? 'month' : 'date'}
                      value={ledgerPeriod === 'month' ? ledgerDate.slice(0, 7) : ledgerDate}
                      onChange={(event) =>
                        setLedgerDate(
                          ledgerPeriod === 'month'
                            ? `${event.target.value}-01`
                            : event.target.value,
                        )
                      }
                      className="h-full w-[8.5rem] border-x border-slate-200 bg-white pl-7 pr-1 text-[10px] font-bold text-slate-700 outline-none focus:bg-red-50/40"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setLedgerDate((current) => shiftLedgerDate(current, ledgerPeriod, 1))
                    }
                    aria-label={ledgerPeriod === 'month' ? 'Next month' : 'Next day'}
                    className="flex h-full w-8 items-center justify-center rounded-r-xl text-slate-500 hover:bg-slate-100"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerPeriod('day')
                    setLedgerDate(todayDate)
                  }}
                  className={`h-9 rounded-xl border px-3 text-[10px] font-black transition ${
                    ledgerPeriod === 'day' && ledgerDate === todayDate
                      ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Today
                </button>
                <label className="relative min-w-0 flex-1 lg:w-56">
                  <span className="sr-only">Search transactions</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    aria-label="Search transactions"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search reference or name"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-xs font-semibold text-slate-900 outline-none transition placeholder:font-normal focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  />
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black text-slate-400">
                    /
                  </kbd>
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

            {ledgerPeriod === 'month' && (
              <div className="grid grid-cols-2 border-b border-slate-200 bg-white sm:grid-cols-4">
                {[
                  { label: 'Active days', value: String(monthlySummary.days) },
                  { label: 'Money in', value: formatMoney(monthlySummary.moneyIn) },
                  { label: 'Money out', value: formatMoney(monthlySummary.moneyOut) },
                  { label: 'Net movement', value: formatSignedMoney(monthlySummary.net) },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="border-r border-t border-slate-100 px-3 py-1.5 last:border-r-0 sm:border-t-0"
                  >
                    <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      {item.label}
                    </span>
                    <span className="ml-2 text-xs font-black text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
            )}

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
                <select
                  aria-label="Category filter"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All categories</option>
                  {bootstrap.catalogue.map((item) => (
                    <option key={item.id} value={item.key}>
                      {item.label}
                      {item.optionLabel ? ` · ${item.optionLabel}` : ''}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Status filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All statuses</option>
                  <option value="POSTED">Posted</option>
                  <option value="PARTIALLY_REFUNDED">Partially refunded</option>
                  <option value="REFUNDED">Refunded</option>
                  <option value="CORRECTED">Corrected</option>
                  <option value="UNRECONCILED">Unreconciled</option>
                </select>
                <select
                  aria-label="Outgoing type filter"
                  value={outgoingFilter}
                  onChange={(event) => setOutgoingFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All outgoing types</option>
                  <option value="REFUND">Refund</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="SUPPLIER_PAYMENT">Supplier payment</option>
                </select>
                <select
                  aria-label="Supplier filter"
                  value={supplierFilter}
                  onChange={(event) => setSupplierFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All suppliers</option>
                  {bootstrap.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Till filter"
                  value={tillFilter}
                  onChange={(event) => setTillFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All tills</option>
                  {bootstrap.tills.map((till) => (
                    <option key={till.id} value={till.id}>
                      {till.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Agent filter"
                  value={agentFilter}
                  onChange={(event) => setAgentFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All agents</option>
                  {bootstrap.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Source filter"
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All source states</option>
                  <option value="LMS">LMS</option>
                  <option value="TICKETING">Ticketing</option>
                  <option value="APPLICATIONS">Applications</option>
                  <option value="PACKAGES">Packages</option>
                  <option value="POS">POS</option>
                  <option value="LEGACY">Legacy</option>
                </select>
                <select
                  aria-label="Loyalty filter"
                  value={loyaltyFilter}
                  onChange={(event) => setLoyaltyFilter(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                >
                  <option value="">All loyalty states</option>
                  <option value="ATTACHED">Attached</option>
                  <option value="AWARDED">Awarded</option>
                  <option value="REVERSED">Reversed</option>
                  <option value="NONE">No loyalty</option>
                </select>
                <input
                  aria-label="Minimum amount filter"
                  value={minAmountFilter}
                  onChange={(event) => setMinAmountFilter(event.target.value)}
                  inputMode="decimal"
                  placeholder="Min £"
                  className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-[11px]"
                />
                <input
                  aria-label="Maximum amount filter"
                  value={maxAmountFilter}
                  onChange={(event) => setMaxAmountFilter(event.target.value)}
                  inputMode="decimal"
                  placeholder="Max £"
                  className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setActiveFilter('All')
                    setCategoryFilter('')
                    setStatusFilter('')
                    setOutgoingFilter('')
                    setSupplierFilter('')
                    setTillFilter('')
                    setAgentFilter('')
                    setSourceFilter('')
                    setLoyaltyFilter('')
                    setMinAmountFilter('')
                    setMaxAmountFilter('')
                  }}
                  className="rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700"
                >
                  Clear filters
                </button>
                <span className="ml-auto self-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Branch scoped
                </span>
              </div>
            )}

            {ledgerError && (
              <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-900">
                <span>{ledgerError}</span>
                <button
                  type="button"
                  onClick={() => setLedgerRefresh((current) => current + 1)}
                  className="shrink-0 rounded-lg bg-amber-900 px-2.5 py-1.5 font-black text-white"
                >
                  Retry
                </button>
              </div>
            )}

            {ledgerLoading && (
              <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-[11px] font-semibold text-blue-800">
                Loading live branch ledger…
              </div>
            )}

            <div className="hidden overflow-auto md:block" style={{ height: ledgerHeight }}>
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
                  {filteredTransactions.map((transaction, index) => (
                    <Fragment key={transaction.id}>
                      {ledgerPeriod === 'month' &&
                        (index === 0 ||
                          filteredTransactions[index - 1].date !== transaction.date) && (
                          <tr>
                            <td
                              colSpan={8}
                              className="border-y-4 border-white bg-slate-100 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-black text-slate-800">
                                  {formatLedgerDate(transaction.date)}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500">
                                  {
                                    filteredTransactions.filter(
                                      (item) => item.date === transaction.date,
                                    ).length
                                  }{' '}
                                  entries · net{' '}
                                  {formatSignedMoney(
                                    filteredTransactions
                                      .filter((item) => item.date === transaction.date)
                                      .reduce((total, item) => total + item.amount, 0),
                                  )}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      <tr
                        onClick={() => setSelectedTransactionId(transaction.id)}
                        className={`cursor-pointer transition hover:bg-slate-50 ${
                          selectedTransactionId === transaction.id ? 'bg-red-50/50' : 'bg-white'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <p className="text-xs font-black text-slate-900">{transaction.time}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                            {transaction.reference || transaction.id}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs font-bold text-slate-900">{transaction.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {transaction.category}
                          </p>
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
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="divide-y divide-slate-100 overflow-y-auto md:hidden"
              style={{ height: ledgerHeight }}
            >
              {filteredTransactions.map((transaction, index) => (
                <Fragment key={transaction.id}>
                  {ledgerPeriod === 'month' &&
                    (index === 0 || filteredTransactions[index - 1].date !== transaction.date) && (
                      <div className="border-y-4 border-white bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-800">
                        {formatLedgerDate(transaction.date)}
                      </div>
                    )}
                  <button
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
                </Fragment>
              ))}
            </div>

            <div
              role="separator"
              aria-label="Resize ledger"
              aria-orientation="horizontal"
              aria-valuemin={MIN_LEDGER_HEIGHT}
              aria-valuemax={MAX_LEDGER_HEIGHT}
              aria-valuenow={ledgerHeight}
              tabIndex={0}
              title="Drag to resize ledger · double-click to reset"
              onPointerDown={startLedgerResize}
              onDoubleClick={resetLedgerHeight}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  saveLedgerHeight(ledgerHeight - 24)
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  saveLedgerHeight(ledgerHeight + 24)
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  resetLedgerHeight()
                }
              }}
              className="group flex h-4 touch-none cursor-ns-resize select-none items-center justify-center border-t border-slate-200 bg-slate-50 outline-none transition hover:bg-red-50 focus-visible:bg-red-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b1e2d]"
            >
              <span className="h-1 w-14 rounded-full bg-slate-300 transition group-hover:bg-[#8b1e2d] group-focus-visible:bg-[#8b1e2d]" />
              <span className="sr-only">
                Drag up or down to resize. Use arrow keys to adjust or Home to reset.
              </span>
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
                    <h2 className="text-xs font-black text-slate-950">
                      {selectedTransaction.reference || selectedTransaction.id}
                    </h2>
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
                  {selectedTransaction.outgoingType === 'EXPENSE' &&
                    bootstrap.permissions.canManage && (
                      <button
                        type="button"
                        onClick={() => setActiveView('Refunds & corrections')}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Correct
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setActiveView('Refunds & corrections')}
                    className="h-8 rounded-lg bg-[#8b1e2d] px-2.5 text-[11px] font-black text-white hover:bg-[#6f1422]"
                  >
                    Refund
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      selectedTransaction.isLegacy
                        ? toast.info('Imported legacy rows retain their original reference only.')
                        : window.open(
                            `/api/pos/transactions/${selectedTransaction.id}/receipt`,
                            '_blank',
                            'noopener,noreferrer',
                          )
                    }
                    className="hidden h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 sm:block"
                  >
                    Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTransactionId('')
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                    aria-label="Close transaction details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-600 sm:grid-cols-4">
                <div>
                  <b className="text-slate-900">Tenders</b>
                  {(selectedTransaction.tenders || []).map((tender) => (
                    <p key={tender.id || `${tender.method}:${tender.amount}`}>
                      {tender.method} {formatMoney(tender.amount)} · {tender.reconciliationStatus}
                    </p>
                  ))}
                </div>
                <div>
                  <b className="text-slate-900">Source links</b>
                  {(selectedTransaction.sourceLinks || []).map((source) => (
                    <p key={source.id}>
                      {source.sourceType} · {source.displayReference || source.recordId}
                    </p>
                  ))}
                  {!selectedTransaction.sourceLinks?.length && <p>None</p>}
                </div>
                <div>
                  <b className="text-slate-900">Refunds</b>
                  <p>{formatMoney(selectedTransaction.refundableRemaining || 0)} refundable</p>
                  {(selectedTransaction.refunds || []).map((refund) => (
                    <p key={refund.id}>
                      {refund.reference} · {formatMoney(refund.amount)}
                    </p>
                  ))}
                </div>
                <div>
                  <b className="text-slate-900">Audit</b>
                  {(selectedTransaction.auditEvents || []).slice(0, 3).map((event) => (
                    <p key={event.id}>
                      {event.eventType} · {event.actor}
                    </p>
                  ))}
                  {!selectedTransaction.auditEvents?.length && <p>Immutable source row</p>}
                </div>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-[0_20px_55px_-38px_rgba(15,23,42,0.55)]">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-2.5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Quick transaction
                  <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[9px] tracking-normal text-slate-300">
                    N
                  </kbd>
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

            <div className="space-y-2 p-2.5">
              {!isTransfer && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
                  {member ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          <UserRound className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-900">
                            {member.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {member.maskedCode} · {member.availablePoints} points
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMember(null)}
                        className="text-xs font-black text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : scanOpen ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                          Scanner armed for 30 seconds
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setScanOpen(false)
                            setScanValue('')
                          }}
                          className="text-[11px] font-black text-slate-600 hover:text-slate-950"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="relative min-w-0 flex-1">
                          <span className="sr-only">Scan or enter loyalty code</span>
                          <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            ref={scanInputRef}
                            autoFocus
                            value={scanValue}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Scan now or type loyalty code"
                            onChange={(event) => setScanValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                attachDemoMember()
                              }
                              if (event.key === 'Escape') {
                                setScanOpen(false)
                                setScanValue('')
                              }
                            }}
                            className="h-10 w-full rounded-xl border border-emerald-300 bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void attachDemoMember()}
                          className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
                        >
                          Look up code
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        One scan is accepted, then scanning disarms automatically. Press Esc to
                        cancel.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setScanValue('')
                        setScanOpen(true)
                      }}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#8b1e2d] shadow-sm ring-1 ring-slate-200">
                          <ScanBarcode className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-xs font-black text-slate-900">
                            Scan loyalty card
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            Disarmed · click to allow one scan
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

              <div
                className={`grid gap-2 ${!isOutgoing && !isTransfer ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
              >
                <label>
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                    {isTransfer
                      ? 'Movement note'
                      : isOutgoing
                        ? 'Name / payee'
                        : 'Customer or name'}
                  </span>
                  <input
                    ref={quickEntryInputRef}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setSupplierConfirmed(false)
                      setSelectedSupplierId('')
                    }}
                    placeholder={isTransfer ? 'Coin reserve' : 'Walk-in or type a name'}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                    {!isOutgoing && !isTransfer ? 'Total price' : 'Amount'}
                  </span>
                  <span className="relative block">
                    <BadgePoundSterling className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value)
                        setSupplierConfirmed(false)
                        setSelectedPricingId('')
                        setManualPriceConfirmed(false)
                      }}
                      inputMode="decimal"
                      aria-label="Transaction amount"
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                    />
                  </span>
                </label>
                {!isOutgoing && !isTransfer && (
                  <label>
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                      Amount paid now
                    </span>
                    <span className="relative block">
                      <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={amountPaid}
                        onChange={(event) => setAmountPaid(event.target.value)}
                        inputMode="decimal"
                        aria-label="Amount paid now"
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-black text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                      />
                    </span>
                  </label>
                )}
              </div>

              {!isTransfer && (
                <div
                  className={`grid gap-2 ${liveCatalogueItem?.sourceRequired ? 'sm:grid-cols-2' : ''}`}
                >
                  {liveCatalogueItem?.sourceRequired && (
                    <label>
                      <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                        {liveCatalogueItem.trackedSourceType} source reference
                      </span>
                      <input
                        value={sourceRecordId}
                        onChange={(event) => setSourceRecordId(event.target.value)}
                        placeholder="Required tracked-service record ID/reference"
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                      />
                    </label>
                  )}
                  <label>
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                      Note {liveCatalogueItem?.noteRequired ? '(required)' : '(optional)'}
                    </span>
                    <input
                      value={transactionNote}
                      onChange={(event) => setTransactionNote(event.target.value)}
                      placeholder="Receipt reference or operational note"
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                    />
                  </label>
                </div>
              )}

              {!isOutgoing && !isTransfer && (
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      remainingBalance > 0
                        ? 'bg-amber-100 text-amber-800'
                        : changeDue > 0
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {remainingBalance > 0
                      ? `Balance remaining ${formatMoney(remainingBalance)}`
                      : changeDue > 0
                        ? `Change due ${formatMoney(changeDue)}`
                        : 'Paid in full'}
                  </span>
                  {remainingBalance > 0 && (
                    <span className="text-slate-500">Linked service or LMS keeps the balance</span>
                  )}
                  {liveCatalogueItem?.trackedSourceType === 'APPLICATIONS' &&
                    matchingPricingOptions.length === 1 && (
                      <span className="ml-auto rounded-full bg-sky-50 px-2.5 py-1 text-sky-700 ring-1 ring-inset ring-sky-200">
                        Matched {matchingPricingOptions[0].label}
                      </span>
                    )}
                </div>
              )}

              {liveCatalogueItem?.trackedSourceType === 'APPLICATIONS' &&
                matchingPricingOptions.length > 1 && (
                  <label className="block">
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                      Confirm pricing option
                    </span>
                    <select
                      value={selectedPricingId}
                      onChange={(event) => setSelectedPricingId(event.target.value)}
                      className="h-9 w-full rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-900"
                    >
                      <option value="">Choose the matching option</option>
                      {matchingPricingOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} · {formatMoney(option.price)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

              {liveCatalogueItem?.trackedSourceType === 'APPLICATIONS' &&
                matchingPricingOptions.length === 0 && (
                  <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={manualPriceConfirmed}
                      onChange={(event) => setManualPriceConfirmed(event.target.checked)}
                      className="mt-0.5"
                    />
                    No unique active pricing row matches this total. Confirm the manually entered
                    price.
                  </label>
                )}

              {isOutgoing && (
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
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
                          setSelectedSupplierId('')
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
                        {bootstrap.schemaReady && supplierMatches && supplierMatches.length > 1 && (
                          <label className="mt-2 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                            Matching suppliers
                            <select
                              value={
                                selectedSupplierId ||
                                ('id' in supplierMatches[0] ? supplierMatches[0].id : '')
                              }
                              onChange={(event) => {
                                setSelectedSupplierId(event.target.value)
                                setSupplierConfirmed(false)
                              }}
                              className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] normal-case text-slate-800"
                            >
                              {supplierMatches.map((supplier) =>
                                'id' in supplier ? (
                                  <option key={supplier.id} value={supplier.id}>
                                    {supplier.name} · {formatMoney(supplier.balance)}
                                  </option>
                                ) : null,
                              )}
                            </select>
                          </label>
                        )}
                        {supplierMatch && (
                          <p className="mt-1 text-[11px] text-slate-600">
                            {'sourceArea' in supplierMatch
                              ? supplierMatch.sourceArea || 'LMS supplier'
                              : supplierMatch.area}{' '}
                            · balance {formatMoney(supplierMatch.balance)}
                          </p>
                        )}
                        <label className="mt-2 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                          Supplier action
                          <select
                            value={supplierMovementType}
                            onChange={(event) => {
                              setSupplierMovementType(
                                event.target.value as typeof supplierMovementType,
                              )
                              setSupplierConfirmed(false)
                            }}
                            className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] normal-case text-slate-800"
                          >
                            <option value="DEPOSIT">Pay / deposit funds</option>
                            <option value="USE_BALANCE">Use supplier balance</option>
                            <option value="REFUND">Supplier refund / credit</option>
                          </select>
                        </label>
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
                    onClick={() => setActiveView('Refunds & corrections')}
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
                  <div className="grid grid-cols-4 gap-2">
                    {(['Cash', 'Card', 'Bank', 'Split'] as PaymentMethod[]).map((method) => {
                      const Icon =
                        method === 'Cash'
                          ? Banknote
                          : method === 'Card'
                            ? CreditCard
                            : method === 'Bank'
                              ? Landmark
                              : WalletCards
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-black transition ${
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
                  {paymentMethod === 'Split' && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <label className="text-[9px] font-black uppercase text-slate-500">
                        Cash
                        <input
                          value={splitCash}
                          onChange={(event) => setSplitCash(event.target.value)}
                          inputMode="decimal"
                          className="mt-1 h-8 w-full rounded-lg border px-2 text-xs"
                        />
                      </label>
                      <label className="text-[9px] font-black uppercase text-slate-500">
                        Card
                        <input
                          value={splitCard}
                          onChange={(event) => setSplitCard(event.target.value)}
                          inputMode="decimal"
                          className="mt-1 h-8 w-full rounded-lg border px-2 text-xs"
                        />
                      </label>
                      <label className="text-[9px] font-black uppercase text-slate-500">
                        Bank
                        <input
                          value={splitBank}
                          onChange={(event) => setSplitBank(event.target.value)}
                          inputMode="decimal"
                          className="mt-1 h-8 w-full rounded-lg border px-2 text-xs"
                        />
                      </label>
                    </div>
                  )}
                  {(paymentMethod === 'Card' || paymentMethod === 'Bank') && (
                    <input
                      value={externalReference}
                      onChange={(event) => setExternalReference(event.target.value)}
                      placeholder="External payment reference (optional)"
                      className="mt-2 h-8 w-full rounded-lg border border-slate-200 px-3 text-xs"
                    />
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between">
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
                      : `${paymentMethod} impact ${isOutgoing ? '−' : '+'}${formatMoney(
                          isOutgoing ? numericAmount : numericAmountPaid,
                        )}`}
                  </span>
                  {liveCatalogueItem?.loyaltyEligible && member && !isOutgoing && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">
                      +{Math.floor(Math.abs(numericAmountPaid))} pts
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void submitTransaction()}
                  disabled={posting || (bootstrap.schemaReady && !bootstrap.activeShift)}
                  className="flex min-h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7f1d2d] to-[#a52338] px-4 py-2 text-xs font-black text-white shadow-md shadow-red-950/15 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isTransfer ? <Coins className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
                  {posting
                    ? 'Posting…'
                    : isTransfer
                      ? 'Open cash management'
                      : bootstrap.schemaReady
                        ? 'Post transaction'
                        : 'POS upgrade pending'}
                </button>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-slate-400">
            <Clock3 className="h-3.5 w-3.5" />
            <span>Live branch POS · immutable transactions and branch-scoped controls</span>
            {retryCount > 0 && (
              <button
                type="button"
                onClick={() => void retryPendingTransactions()}
                disabled={posting}
                className="font-black text-amber-700 underline"
              >
                Retry {retryCount} unconfirmed {retryCount === 1 ? 'transaction' : 'transactions'}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
