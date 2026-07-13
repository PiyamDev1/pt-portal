'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  PackageCheck,
  Plane,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { TravelPackageQuote } from '@/app/types/packages'
import type { TravelPackageFolder } from '@/app/types/packages'
import {
  buildCustomerPackageOptions,
  formatMoney,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'

type PackagesDashboardClientProps = {
  currentUserId: string
  currentUserRole?: string
}

type PackagesResponse = {
  packages: TravelPackageQuote[]
  setupRequired?: boolean
  message?: string
}

type TravelPackagesResponse = {
  packages: TravelPackageFolder[]
  setupRequired?: boolean
  message?: string
}

type ConvertResponse = {
  package?: TravelPackageFolder
  alreadyConverted?: boolean
  error?: string
}

type MainTab =
  | 'upcoming'
  | 'in_progress'
  | 'awaiting_deposit'
  | 'travelling'
  | 'returned'
  | 'archived'
  | 'quotations'

type QuoteView = 'all' | 'live' | 'draft' | 'selected' | 'expired'

const MAIN_TABS: Array<{ value: MainTab; label: string; icon: typeof PackageCheck }> = [
  { value: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { value: 'in_progress', label: 'In Progress', icon: PackageCheck },
  { value: 'awaiting_deposit', label: 'Awaiting Deposit', icon: Clock3 },
  { value: 'travelling', label: 'Travelling', icon: Plane },
  { value: 'returned', label: 'Returned', icon: CheckCircle2 },
  { value: 'archived', label: 'Archived', icon: Archive },
  { value: 'quotations', label: 'Quotations', icon: FileText },
]

const QUOTE_VIEWS: Array<{ value: QuoteView; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Drafts' },
  { value: 'selected', label: 'Selected' },
  { value: 'expired', label: 'Expired' },
]

function buildShareUrl(token?: string) {
  if (!token || typeof window === 'undefined') return ''
  return `${window.location.origin}/packages/${token}`
}

function formatExpiry(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid expiry'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getQuoteStartingPrice(quote: TravelPackageQuote) {
  return buildCustomerPackageOptions(quote.payload, 1)[0]?.combination || null
}

function getPassengerLabel(quote: TravelPackageQuote) {
  const payload = normalizePackageQuotePayload(quote.payload)
  const total = payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
  if (total === 0) return 'No passengers'
  const parts = [
    payload.adults ? `${payload.adults} adult${payload.adults === 1 ? '' : 's'}` : '',
    payload.childrenPaying
      ? `${payload.childrenPaying} child${payload.childrenPaying === 1 ? '' : 'ren'} 5-12`
      : '',
    payload.childrenFree
      ? `${payload.childrenFree} child${payload.childrenFree === 1 ? '' : 'ren'} 2-4`
      : '',
    payload.infants ? `${payload.infants} infant${payload.infants === 1 ? '' : 's'} 0-<2` : '',
  ].filter(Boolean)
  return parts.join(', ')
}

function getQuoteNextAction(quote: TravelPackageQuote) {
  const expired = isPackageQuoteExpired(quote.expires_at)
  if (quote.converted_package_id) return 'Package folder created'
  if (quote.selected_at) return 'Convert to package'
  if (expired) return 'Renew or archive quote'
  if (quote.share_enabled && quote.status === 'shared') return 'Await customer selection'
  if (quote.status === 'archived') return 'Archived'
  return 'Finish and share quote'
}

function getQuoteRisk(quote: TravelPackageQuote) {
  if (quote.converted_package_id) {
    return { label: 'Converted', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
  }
  if (isPackageQuoteExpired(quote.expires_at)) {
    return { label: 'Expired', className: 'bg-red-50 text-red-700 border-red-100' }
  }
  if (quote.selected_at) {
    return { label: 'Action needed', className: 'bg-amber-50 text-amber-700 border-amber-100' }
  }
  if (!quote.share_enabled) {
    return { label: 'Internal only', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
  return { label: 'On track', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
}

function getPackageDateRange(packageFolder: TravelPackageFolder) {
  const dates = [packageFolder.departure_date, packageFolder.return_date]
    .filter(Boolean)
    .map((value) => formatDate(String(value)))
  return dates.length > 0 ? dates.join(' to ') : 'Dates not set'
}

function getPackageStatusClass(status: string) {
  if (['returned', 'closed'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['cancelled', 'archived'].includes(status)) return 'bg-slate-100 text-slate-600'
  if (['awaiting_deposit', 'awaiting_passports'].includes(status))
    return 'bg-amber-50 text-amber-700'
  if (['travelling', 'travelling_soon'].includes(status)) return 'bg-blue-50 text-blue-700'
  return 'bg-red-50 text-[#8b1e2d]'
}

function getPackageRiskClass(level: TravelPackageFolder['risk_level']) {
  if (level === 'critical') return 'border-red-200 bg-red-50 text-red-700'
  if (level === 'high') return 'border-orange-200 bg-orange-50 text-orange-700'
  if (level === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (level === 'low') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

function getPackageOperationalSortValue(packageFolder: TravelPackageFolder) {
  const riskRank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 }[packageFolder.risk_level]
  const dueAt = packageFolder.next_action_due_at
    ? Date.parse(packageFolder.next_action_due_at)
    : Number.NaN
  const overdueRank = Number.isFinite(dueAt) && dueAt < Date.now() ? 1 : 0
  const departure = packageFolder.departure_date
    ? Date.parse(packageFolder.departure_date)
    : Number.MAX_SAFE_INTEGER
  const updated = packageFolder.updated_at
    ? Date.parse(packageFolder.updated_at)
    : Date.parse(packageFolder.created_at)
  return { riskRank, overdueRank, departure, updated }
}

function tabMatchesPackage(activeTab: MainTab, packageFolder: TravelPackageFolder) {
  if (activeTab === 'quotations') return false
  if (activeTab === 'archived') return ['archived', 'cancelled'].includes(packageFolder.status)
  if (activeTab === 'returned') return ['returned', 'closed'].includes(packageFolder.status)
  if (activeTab === 'travelling') {
    return ['travelling_soon', 'travelling'].includes(packageFolder.status)
  }
  if (activeTab === 'awaiting_deposit') return packageFolder.status === 'awaiting_deposit'
  if (activeTab === 'in_progress') {
    return [
      'selected',
      'awaiting_passports',
      'reservation_pending',
      'partially_booked',
      'documents_pending',
    ].includes(packageFolder.status)
  }
  return !['archived', 'cancelled', 'returned', 'closed'].includes(packageFolder.status)
}

export default function PackagesDashboardClient({
  currentUserId,
  currentUserRole,
}: PackagesDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('quotations')
  const [quoteView, setQuoteView] = useState<QuoteView>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [quotes, setQuotes] = useState<TravelPackageQuote[]>([])
  const [packages, setPackages] = useState<TravelPackageFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(null)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [packageSetupMessage, setPackageSetupMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setLoadingPackages(true)
      try {
        const [quoteResponse, packageResponse] = await Promise.all([
          fetch('/api/packages'),
          fetch('/api/travel-packages'),
        ])
        const quoteData = (await quoteResponse.json()) as PackagesResponse
        const packageData = (await packageResponse.json()) as TravelPackagesResponse

        if (!quoteResponse.ok) {
          throw new Error(
            (quoteData as { error?: string }).error || 'Failed to load package quotes',
          )
        }
        if (!packageResponse.ok) {
          throw new Error(
            (packageData as { error?: string }).error || 'Failed to load travel packages',
          )
        }

        setQuotes(quoteData.packages || [])
        setPackages(packageData.packages || [])
        setSetupMessage(
          quoteData.setupRequired ? quoteData.message || 'Package quote schema is required.' : null,
        )
        setPackageSetupMessage(
          packageData.setupRequired
            ? packageData.message || 'Travel package folder schema is required.'
            : null,
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load package data')
      } finally {
        setLoading(false)
        setLoadingPackages(false)
      }
    }

    void loadData()
  }, [])

  const quoteStats = useMemo(() => {
    const live = quotes.filter(
      (quote) =>
        quote.share_enabled &&
        quote.status === 'shared' &&
        !isPackageQuoteExpired(quote.expires_at),
    ).length
    return {
      total: quotes.length,
      live,
      selected: quotes.filter((quote) => Boolean(quote.selected_at)).length,
      expired: quotes.filter((quote) => isPackageQuoteExpired(quote.expires_at)).length,
    }
  }, [quotes])

  const filteredQuotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return quotes.filter((quote) => {
      const expired = isPackageQuoteExpired(quote.expires_at)
      const live = quote.share_enabled && quote.status === 'shared' && !expired
      const matchesView =
        quoteView === 'all' ||
        (quoteView === 'live' && live) ||
        (quoteView === 'draft' && (quote.status === 'draft' || !quote.share_enabled)) ||
        (quoteView === 'selected' && Boolean(quote.selected_at)) ||
        (quoteView === 'expired' && expired)

      if (!matchesView) return false
      if (!query) return true

      return [
        quote.title,
        quote.customer_name,
        quote.customer_phone,
        quote.customer_email,
        quote.package_type,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [quoteView, quotes, searchTerm])

  const filteredPackages = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return packages
      .filter((packageFolder) => {
        if (!tabMatchesPackage(activeTab, packageFolder)) return false
        if (!query) return true
        return [
          packageFolder.package_reference,
          packageFolder.customer_name,
          packageFolder.customer_phone,
          packageFolder.customer_email,
          packageFolder.package_type,
          packageFolder.destination,
          packageFolder.next_action,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      })
      .sort((left, right) => {
        const leftValue = getPackageOperationalSortValue(left)
        const rightValue = getPackageOperationalSortValue(right)
        if (leftValue.riskRank !== rightValue.riskRank)
          return rightValue.riskRank - leftValue.riskRank
        if (leftValue.overdueRank !== rightValue.overdueRank)
          return rightValue.overdueRank - leftValue.overdueRank
        if (leftValue.departure !== rightValue.departure)
          return leftValue.departure - rightValue.departure
        return rightValue.updated - leftValue.updated
      })
  }, [activeTab, packages, searchTerm])

  const copyQuoteShareLink = async (quote: TravelPackageQuote) => {
    const url = buildShareUrl(quote.share_token)
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success('Customer link copied')
  }

  const convertQuoteToPackage = async (quote: TravelPackageQuote) => {
    setConvertingQuoteId(quote.id)
    try {
      const response = await fetch(`/api/packages/${encodeURIComponent(quote.id)}/convert`, {
        method: 'POST',
      })
      const data = (await response.json()) as ConvertResponse
      if (!response.ok || !data.package) {
        throw new Error(data.error || 'Failed to convert quote to package')
      }
      setPackages((current) => {
        const withoutExisting = current.filter(
          (packageFolder) => packageFolder.id !== data.package!.id,
        )
        return [data.package!, ...withoutExisting]
      })
      setQuotes((current) =>
        current.map((candidate) =>
          candidate.id === quote.id
            ? {
                ...candidate,
                converted_package_id: data.package!.id,
                converted_at: new Date().toISOString(),
              }
            : candidate,
        ),
      )
      toast.success(
        data.alreadyConverted ? 'Package folder already exists' : 'Package folder created',
      )
      setActiveTab('upcoming')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to convert quote to package')
    } finally {
      setConvertingQuoteId(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Packages</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Package operations</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Manage quotations and package folders through reservations, payments, customer
              releases, travel, return, and earned closure.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentUserRole?.trim().toLowerCase() === 'super admin' && (
              <Link
                href="/dashboard/packages/migration"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
              >
                <Database className="h-4 w-4" />
                Legacy Migration
              </Link>
            )}
            <Link
              href="/dashboard/packages/quotations/new"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1422]"
            >
              <Plus className="h-4 w-4" />
              Add New Package Quote
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Active packages',
              value: packages.filter(
                (item) => !['closed', 'cancelled', 'archived'].includes(item.status),
              ).length,
              icon: PackageCheck,
            },
            { label: 'Live links', value: quoteStats.live, icon: Link2 },
            { label: 'Selected', value: quoteStats.selected, icon: CheckCircle2 },
            { label: 'Expired', value: quoteStats.expired, icon: AlertTriangle },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-500">{stat.label}</p>
                  <Icon className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-950">{stat.value}</p>
              </div>
            )
          })}
        </div>
      </section>

      {setupMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {setupMessage}
        </div>
      )}
      {packageSetupMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {packageSetupMessage}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-black transition ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </section>

      {activeTab !== 'quotations' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-[#8b1e2d]" />
                <h2 className="text-lg font-black text-slate-950">
                  {MAIN_TABS.find((tab) => tab.value === activeTab)?.label || 'Packages'}
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Converted package folders with next actions, risk level, and operational status.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search packages"
                className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-900 sm:w-72"
              />
            </div>
          </div>

          {loadingPackages ? (
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading package folders...
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-bold text-slate-700">
                No package folders match this view.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Finalise a quotation, then use Convert to package from the Quotations tab.
              </p>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase text-slate-500">
                    <th className="border-b border-slate-200 px-3 py-2">Package</th>
                    <th className="border-b border-slate-200 px-3 py-2">Customer</th>
                    <th className="border-b border-slate-200 px-3 py-2">Dates</th>
                    <th className="border-b border-slate-200 px-3 py-2">Status</th>
                    <th className="border-b border-slate-200 px-3 py-2">Next Action</th>
                    <th className="border-b border-slate-200 px-3 py-2">Risk</th>
                    <th className="border-b border-slate-200 px-3 py-2">Invoice</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map((packageFolder) => (
                    <tr key={packageFolder.id} className="align-top hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-black text-slate-950">
                          {packageFolder.package_reference}
                        </p>
                        <p className="text-xs text-slate-500">
                          {packageFolder.package_type} ·{' '}
                          {packageFolder.destination || 'No destination'}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-bold text-slate-800">
                          {packageFolder.customer_name || 'No customer'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {packageFolder.customer_phone || packageFolder.customer_email || ''}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="text-xs font-bold text-slate-700">
                          {getPackageDateRange(packageFolder)}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${getPackageStatusClass(
                            packageFolder.status,
                          )}`}
                        >
                          {packageFolder.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="text-xs font-black text-slate-800">
                          {packageFolder.next_action || 'No next action'}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${getPackageRiskClass(
                            packageFolder.risk_level,
                          )}`}
                        >
                          {packageFolder.risk_level}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="text-xs font-bold text-slate-700">
                          {packageFolder.invoice_status.replace(/_/g, ' ')}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex justify-end">
                          <Link
                            href={`/dashboard/packages/${packageFolder.id}`}
                            className="flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-black"
                          >
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#8b1e2d]" />
                <h2 className="text-lg font-black text-slate-950">Quotations</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Live quote links, customer selections, and quotes ready to convert into packages.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search quotes"
                  className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-900 sm:w-72"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {QUOTE_VIEWS.map((view) => (
                  <button
                    key={view.value}
                    type="button"
                    onClick={() => setQuoteView(view.value)}
                    className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                      quoteView === view.value
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading package quotes...
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-bold text-slate-700">No quotations match this view.</p>
              <Link
                href="/dashboard/packages/quotations/new"
                className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-black"
              >
                <Plus className="h-4 w-4" />
                Create Quote
              </Link>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase text-slate-500">
                    <th className="border-b border-slate-200 px-3 py-2">Quote</th>
                    <th className="border-b border-slate-200 px-3 py-2">Customer</th>
                    <th className="border-b border-slate-200 px-3 py-2">Passengers</th>
                    <th className="border-b border-slate-200 px-3 py-2">Status</th>
                    <th className="border-b border-slate-200 px-3 py-2">Next Action</th>
                    <th className="border-b border-slate-200 px-3 py-2">Risk</th>
                    <th className="border-b border-slate-200 px-3 py-2">From</th>
                    <th className="border-b border-slate-200 px-3 py-2">Expires</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => {
                    const expired = isPackageQuoteExpired(quote.expires_at)
                    const live = quote.share_enabled && quote.status === 'shared' && !expired
                    const selected = Boolean(quote.selected_at)
                    const startingPrice = getQuoteStartingPrice(quote)
                    const risk = getQuoteRisk(quote)
                    const quoteShareUrl = buildShareUrl(quote.share_token)

                    return (
                      <tr key={quote.id} className="align-top hover:bg-slate-50">
                        <td className="border-b border-slate-100 px-3 py-3">
                          <p className="max-w-[16rem] truncate font-black text-slate-950">
                            {quote.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {quote.package_type} · created {formatDate(quote.created_at)}
                          </p>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <p className="font-bold text-slate-800">
                            {quote.customer_name || 'No customer'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {quote.customer_phone || quote.customer_email || ''}
                          </p>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <div className="flex items-start gap-2 text-xs font-bold text-slate-600">
                            <Users className="mt-0.5 h-4 w-4 text-slate-400" />
                            <span>{getPassengerLabel(quote)}</span>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <span
                            className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                              expired
                                ? 'bg-red-50 text-red-700'
                                : live
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : selected
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {expired
                              ? 'Expired'
                              : live
                                ? 'Live'
                                : selected
                                  ? 'Selected'
                                  : quote.status}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <p className="text-xs font-black text-slate-800">
                            {getQuoteNextAction(quote)}
                          </p>
                          {selected && quote.selected_at && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              Selected {formatDate(quote.selected_at)}
                            </p>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <span
                            className={`inline-flex rounded-lg border px-2 py-1 text-xs font-black ${risk.className}`}
                          >
                            {risk.label}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          {startingPrice ? (
                            <div>
                              <p className="font-black text-slate-950">
                                {formatMoney(startingPrice.totalPrice, startingPrice.currency)}
                              </p>
                              <p className="text-xs font-bold text-[#8b1e2d]">
                                {formatMoney(startingPrice.perPersonPrice, startingPrice.currency)}{' '}
                                avg hotel payer
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">Incomplete</span>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <p
                            className={`text-xs font-bold ${expired ? 'text-red-700' : 'text-slate-700'}`}
                          >
                            {formatExpiry(quote.expires_at)}
                          </p>
                          {quote.share_enabled && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              {expired ? 'Link closed' : 'Link open'}
                            </p>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/dashboard/packages/quotations/${quote.id}/edit`}
                              className="flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                            >
                              Edit
                            </Link>
                            <Link
                              href={`/dashboard/packages/quotations/${quote.id}/sales`}
                              className="flex h-9 items-center justify-center rounded-lg border border-[#8b1e2d]/20 px-3 text-xs font-black text-[#8b1e2d] transition hover:bg-red-50"
                            >
                              Sales
                            </Link>
                            {quote.converted_package_id ? (
                              <Link
                                href={`/dashboard/packages/${quote.converted_package_id}`}
                                className="flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-black text-white transition hover:bg-emerald-800"
                              >
                                Package
                              </Link>
                            ) : selected ? (
                              <button
                                type="button"
                                onClick={() => void convertQuoteToPackage(quote)}
                                disabled={convertingQuoteId === quote.id}
                                className="flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-50"
                              >
                                {convertingQuoteId === quote.id ? 'Converting' : 'Convert'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void copyQuoteShareLink(quote)}
                              disabled={!live}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                              title="Copy customer link"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            {live ? (
                              <a
                                href={quoteShareUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                                title="Open customer link"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                                <ExternalLink className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">Current user: {currentUserId.slice(0, 8)}</p>
        </section>
      )}
    </div>
  )
}
