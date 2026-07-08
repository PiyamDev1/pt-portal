'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Bus,
  Calculator,
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  PackageCheck,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  PackageComponentOption,
  PackageQuotePayload,
  PackageStayGroup,
  TravelPackageQuote,
  TravelPackageType,
} from '@/app/types/packages'
import {
  buildPackageCombinations,
  formatMoney,
  formatPackageCombinationForCopy,
  getDefaultPackageExpiry,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'

type PackagesClientProps = {
  currentUserId: string
}

type PackagesResponse = {
  packages: TravelPackageQuote[]
  setupRequired?: boolean
  message?: string
}

type SaveResponse = {
  quote: TravelPackageQuote | null
  setupRequired?: boolean
  message?: string
  error?: string
}

const PACKAGE_TYPES: Array<{ value: TravelPackageType; label: string }> = [
  { value: 'umrah', label: 'Umrah' },
  { value: 'ziyarat', label: 'Ziyarat' },
  { value: 'holiday', label: 'Holiday' },
]

type QuoteFilter = 'all' | 'live' | 'draft' | 'selected' | 'expired'

const QUOTE_FILTERS: Array<{ value: QuoteFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live Links' },
  { value: 'draft', label: 'Drafts' },
  { value: 'selected', label: 'Selected' },
  { value: 'expired', label: 'Expired' },
]

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function newOption(prefix: string): PackageComponentOption {
  return {
    id: makeId(prefix),
    title: '',
    summary: '',
    price: 0,
  }
}

function createInitialPayload(): PackageQuotePayload {
  return {
    title: 'New Umrah package quote',
    packageType: 'umrah',
    currency: 'GBP',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    adults: 2,
    childrenPaying: 0,
    childrenFree: 0,
    itineraryOrder: ['makkah', 'madinah'],
    departureDate: '',
    returnDate: '',
    stayGroups: [
      {
        id: 'makkah',
        label: 'Makkah',
        options: [newOption('makkah-hotel')],
      },
      {
        id: 'madinah',
        label: 'Madinah',
        options: [newOption('madinah-hotel')],
      },
    ],
    flightOptions: [newOption('flight')],
    transportOptions: [newOption('transport')],
    notes: '',
  }
}

function buildShareUrl(token?: string) {
  if (!token || typeof window === 'undefined') return ''
  return `${window.location.origin}/packages/${token}`
}

function getQuoteStartingPrice(quote: TravelPackageQuote) {
  return buildPackageCombinations(quote.payload, 1)[0] || null
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return getDefaultPackageExpiry()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return getDefaultPackageExpiry()
  return date.toISOString()
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

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Building2
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-black text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function OptionEditor({
  option,
  onChange,
  onRemove,
  titlePlaceholder,
  summaryPlaceholder,
  canRemove,
}: {
  option: PackageComponentOption
  onChange: (next: PackageComponentOption) => void
  onRemove: () => void
  titlePlaceholder: string
  summaryPlaceholder: string
  canRemove: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={option.title}
          onChange={(event) => onChange({ ...option, title: event.target.value })}
          placeholder={titlePlaceholder}
          className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
          title="Remove option"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={option.summary}
        onChange={(event) => onChange({ ...option, summary: event.target.value })}
        placeholder={summaryPlaceholder}
        rows={3}
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
      />
      <label className="mt-2 block text-xs font-bold text-slate-500">Total price</label>
      <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
        <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
        <input
          value={option.price || ''}
          onChange={(event) => onChange({ ...option, price: Number(event.target.value || 0) })}
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          className="w-full bg-transparent text-sm font-bold outline-none"
        />
      </div>
    </div>
  )
}

export default function PackagesClient({ currentUserId }: PackagesClientProps) {
  const [payload, setPayload] = useState<PackageQuotePayload>(() => createInitialPayload())
  const [expiresAtInput, setExpiresAtInput] = useState(() =>
    toDateTimeLocalValue(getDefaultPackageExpiry()),
  )
  const [quotes, setQuotes] = useState<TravelPackageQuote[]>([])
  const [activeQuote, setActiveQuote] = useState<TravelPackageQuote | null>(null)
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)

  const combinations = useMemo(() => buildPackageCombinations(payload, 80), [payload])
  const shareUrl = buildShareUrl(activeQuote?.share_token)
  const filteredQuotes = useMemo(() => {
    if (quoteFilter === 'live') {
      return quotes.filter(
        (quote) =>
          quote.share_enabled && quote.status === 'shared' && !isPackageQuoteExpired(quote.expires_at),
      )
    }
    if (quoteFilter === 'draft') {
      return quotes.filter((quote) => quote.status === 'draft' || !quote.share_enabled)
    }
    if (quoteFilter === 'selected') {
      return quotes.filter((quote) => Boolean(quote.selected_at))
    }
    if (quoteFilter === 'expired') {
      return quotes.filter((quote) => isPackageQuoteExpired(quote.expires_at))
    }
    return quotes
  }, [quoteFilter, quotes])

  const updatePayload = (changes: Partial<PackageQuotePayload>) => {
    setPayload((current) => normalizePackageQuotePayload({ ...current, ...changes }))
  }

  const loadQuotes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/packages')
      const data = (await response.json()) as PackagesResponse
      if (!response.ok) throw new Error((data as { error?: string }).error || 'Failed to load packages')
      setQuotes(data.packages || [])
      setSetupMessage(data.setupRequired ? data.message || 'Package quote schema is required.' : null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQuotes()
  }, [])

  const updateStayGroup = (groupIndex: number, nextGroup: PackageStayGroup) => {
    const nextGroups = payload.stayGroups.map((group, index) =>
      index === groupIndex ? nextGroup : group,
    )
    updatePayload({
      stayGroups: nextGroups,
      itineraryOrder: nextGroups.map((group) => group.id),
    })
  }

  const updateComponentOption = (
    key: 'flightOptions' | 'transportOptions',
    optionIndex: number,
    nextOption: PackageComponentOption,
  ) => {
    updatePayload({
      [key]: payload[key].map((option, index) => (index === optionIndex ? nextOption : option)),
    } as Partial<PackageQuotePayload>)
  }

  const removeComponentOption = (key: 'flightOptions' | 'transportOptions', optionIndex: number) => {
    const current = payload[key]
    updatePayload({
      [key]: current.length > 1 ? current.filter((_, index) => index !== optionIndex) : current,
    } as Partial<PackageQuotePayload>)
  }

  const addComponentOption = (key: 'flightOptions' | 'transportOptions', prefix: string) => {
    updatePayload({ [key]: [...payload[key], newOption(prefix)] } as Partial<PackageQuotePayload>)
  }

  const saveQuote = async (shareEnabled: boolean) => {
    setSaving(true)
    try {
      const response = await fetch(activeQuote ? `/api/packages/${activeQuote.id}` : '/api/packages', {
        method: activeQuote ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          expiresAt: fromDateTimeLocalValue(expiresAtInput),
          shareEnabled,
        }),
      })
      const data = (await response.json()) as SaveResponse

      if (data.setupRequired) {
        setSetupMessage(data.message || 'Package quote schema is required.')
        toast.error('Package schema is not installed yet')
        return
      }

      if (!response.ok || !data.quote) {
        throw new Error(data.error || 'Failed to save package quote')
      }

      setActiveQuote(data.quote)
      setPayload(normalizePackageQuotePayload(data.quote.payload))
      setExpiresAtInput(toDateTimeLocalValue(data.quote.expires_at))
      setQuotes((current) => {
        const next = current.filter((quote) => quote.id !== data.quote!.id)
        return [data.quote!, ...next]
      })
      toast.success(shareEnabled ? 'Package saved and share link enabled' : 'Package draft saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save package quote')
    } finally {
      setSaving(false)
    }
  }

  const archiveQuote = async () => {
    if (!activeQuote) return
    setSaving(true)
    try {
      const response = await fetch(`/api/packages/${activeQuote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived', shareEnabled: false }),
      })
      const data = (await response.json()) as SaveResponse
      if (!response.ok) throw new Error(data.error || 'Failed to archive quote')
      setQuotes((current) => current.filter((quote) => quote.id !== activeQuote.id))
      setActiveQuote(null)
      setPayload(createInitialPayload())
      setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
      toast.success('Package quote archived')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive quote')
    } finally {
      setSaving(false)
    }
  }

  const copyAllOptions = async () => {
    if (combinations.length === 0) return
    const text = combinations
      .slice(0, 20)
      .map((combination, index) => formatPackageCombinationForCopy(payload, combination, index + 1))
      .join('\n----------------------------\n\n')
    await navigator.clipboard.writeText(text)
    toast.success('Package options copied')
  }

  const copyShareLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    toast.success('Customer link copied')
  }

  const copyQuoteShareLink = async (quote: TravelPackageQuote) => {
    const url = buildShareUrl(quote.share_token)
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success('Customer link copied')
  }

  const openQuoteForEdit = (quote: TravelPackageQuote) => {
    setActiveQuote(quote)
    setPayload(normalizePackageQuotePayload(quote.payload))
    setExpiresAtInput(toDateTimeLocalValue(quote.expires_at))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startNew = () => {
    setActiveQuote(null)
    setPayload(createInitialPayload())
    setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500">Package creator</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Holidays, ziyarat and umrah</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Build hotel, flight and transport options, save the quote, then share a customer link
            where they can choose their preferred mix and see the live total.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startNew}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            New
          </button>
          <button
            type="button"
            onClick={() => void saveQuote(false)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void saveQuote(true)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-bold text-white transition hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Save & Share
          </button>
        </div>
      </div>

      {setupMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {setupMessage}
        </div>
      )}

      {shareUrl && activeQuote?.share_enabled && (
        <div
          className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
            isPackageQuoteExpired(activeQuote.expires_at)
              ? 'border-red-200 bg-red-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-sm font-black ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-900' : 'text-emerald-900'
              }`}
            >
              {isPackageQuoteExpired(activeQuote.expires_at)
                ? 'Customer link has expired'
                : 'Customer link is active'}
            </p>
            <p
              className={`truncate text-sm ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-800' : 'text-emerald-800'
              }`}
            >
              {shareUrl}
            </p>
            <p
              className={`mt-1 text-xs font-bold ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              Expires {formatExpiry(activeQuote.expires_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            disabled={isPackageQuoteExpired(activeQuote.expires_at)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Link2 className="h-4 w-4" />
            Copy Link
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={PackageCheck} title="Quote details" />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-500">Title</span>
                <input
                  value={payload.title}
                  onChange={(event) => updatePayload({ title: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Type</span>
                <select
                  value={payload.packageType}
                  onChange={(event) =>
                    updatePayload({ packageType: event.target.value as TravelPackageType })
                  }
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                >
                  {PACKAGE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Customer name</span>
                <input
                  value={payload.customerName}
                  onChange={(event) => updatePayload({ customerName: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Phone</span>
                <input
                  value={payload.customerPhone}
                  onChange={(event) => updatePayload({ customerPhone: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Email</span>
                <input
                  value={payload.customerEmail}
                  onChange={(event) => updatePayload({ customerEmail: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  Quote expires
                </span>
                <input
                  type="datetime-local"
                  value={expiresAtInput}
                  min={toDateTimeLocalValue(new Date().toISOString())}
                  onChange={(event) => setExpiresAtInput(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">Default is 72 hours from quote creation.</p>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              {[
                ['Adults', 'adults'],
                ['Children 5-12', 'childrenPaying'],
                ['Children under 5', 'childrenFree'],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
                  <input
                    type="number"
                    min="0"
                    value={payload[key as 'adults' | 'childrenPaying' | 'childrenFree']}
                    onChange={(event) =>
                      updatePayload({ [key]: Number(event.target.value || 0) } as Partial<PackageQuotePayload>)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Departure</span>
                <input
                  type="date"
                  value={payload.departureDate}
                  onChange={(event) => updatePayload({ departureDate: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Return</span>
                <input
                  type="date"
                  value={payload.returnDate}
                  onChange={(event) => updatePayload({ returnDate: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={Building2} title="Hotel and stay options" />
            <div className="grid gap-4 lg:grid-cols-2">
              {payload.stayGroups.map((group, groupIndex) => (
                <div key={group.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      value={group.label}
                      onChange={(event) =>
                        updateStayGroup(groupIndex, { ...group, label: event.target.value })
                      }
                      className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-black outline-none focus:border-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateStayGroup(groupIndex, {
                          ...group,
                          options: [...group.options, newOption(`${group.id}-hotel`)],
                        })
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                      title="Add hotel"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {group.options.map((option, optionIndex) => (
                      <OptionEditor
                        key={option.id}
                        option={option}
                        titlePlaceholder={`${group.label} hotel`}
                        summaryPlaceholder={`${group.label} hotel summary, nights, board basis, distance`}
                        canRemove={group.options.length > 1}
                        onChange={(next) =>
                          updateStayGroup(groupIndex, {
                            ...group,
                            options: group.options.map((candidate, index) =>
                              index === optionIndex ? next : candidate,
                            ),
                          })
                        }
                        onRemove={() =>
                          updateStayGroup(groupIndex, {
                            ...group,
                            options: group.options.filter((_, index) => index !== optionIndex),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader
                icon={Plane}
                title="Flight options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('flightOptions', 'flight')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add flight"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.flightOptions.map((option, index) => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    titlePlaceholder="Flight option"
                    summaryPlaceholder="Airline, route, dates, baggage, PNR notes"
                    canRemove={payload.flightOptions.length > 1}
                    onChange={(next) => updateComponentOption('flightOptions', index, next)}
                    onRemove={() => removeComponentOption('flightOptions', index)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader
                icon={Bus}
                title="Transport options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('transportOptions', 'transport')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add transport"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.transportOptions.map((option, index) => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    titlePlaceholder="Transport option"
                    summaryPlaceholder="Private car, coach, ziyarah tour, airport transfers"
                    canRemove={payload.transportOptions.length > 1}
                    onChange={(next) => updateComponentOption('transportOptions', index, next)}
                    onRemove={() => removeComponentOption('transportOptions', index)}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader
              icon={Calculator}
              title="Generated options"
              action={
                <button
                  type="button"
                  onClick={() => void copyAllOptions()}
                  disabled={combinations.length === 0}
                  className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              }
            />
            {combinations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Add at least one priced hotel option in each stay group and one paying guest to
                generate totals.
              </div>
            ) : (
              <div className="max-h-[44rem] space-y-3 overflow-y-auto pr-1">
                {combinations.slice(0, 30).map((combination, index) => (
                  <div key={combination.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">Option {index + 1}</p>
                        <p className="text-xs text-slate-500">
                          {combination.payingGuests} paying guest
                          {combination.payingGuests === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-black text-slate-950">
                          {formatMoney(combination.totalPrice, combination.currency)}
                        </p>
                        <p className="text-xs font-bold text-[#8b1e2d]">
                          {formatMoney(combination.perPersonPrice, combination.currency)} pp
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600">
                      {combination.staySelections.map((stay) => (
                        <p key={`${combination.id}-${stay.groupId}`}>
                          <span className="font-bold text-slate-800">{stay.groupLabel}:</span>{' '}
                          {stay.option.title || 'Hotel option'}
                        </p>
                      ))}
                      {combination.flightOption && (
                        <p>
                          <span className="font-bold text-slate-800">Flight:</span>{' '}
                          {combination.flightOption.title}
                        </p>
                      )}
                      {combination.transportOption && (
                        <p>
                          <span className="font-bold text-slate-800">Transport:</span>{' '}
                          {combination.transportOption.title}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={PackageCheck} title="Recent quotes" />
            {loading ? (
              <p className="text-sm text-slate-500">Loading quotes...</p>
            ) : quotes.length === 0 ? (
              <p className="text-sm text-slate-500">No saved package quotes yet.</p>
            ) : (
              <div className="space-y-2">
                {quotes.slice(0, 12).map((quote) => (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => openQuoteForEdit(quote)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      activeQuote?.id === quote.id
                        ? 'border-[#8b1e2d] bg-red-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{quote.title}</p>
                        <p className="text-xs text-slate-500">
                          {quote.package_type} · {new Date(quote.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        {quote.status}
                      </span>
                    </div>
                    {quote.selected_at && (
                      <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        Customer selected an option
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
            {activeQuote && (
              <button
                type="button"
                onClick={() => void archiveQuote()}
                disabled={saving}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Archive Current Quote
              </button>
            )}
            <p className="mt-3 text-xs text-slate-400">Current user: {currentUserId.slice(0, 8)}</p>
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeader icon={PackageCheck} title="Package quote table" />
          <div className="flex flex-wrap gap-2">
            {QUOTE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setQuoteFilter(filter.value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                  quoteFilter === filter.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading package quotes...</p>
        ) : filteredQuotes.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No package quotes match this view.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[900px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-black uppercase text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2">Quote</th>
                  <th className="border-b border-slate-200 px-3 py-2">Customer</th>
                  <th className="border-b border-slate-200 px-3 py-2">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2">Expires</th>
                  <th className="border-b border-slate-200 px-3 py-2">From</th>
                  <th className="border-b border-slate-200 px-3 py-2">Selection</th>
                  <th className="border-b border-slate-200 px-3 py-2">Live Link</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((quote) => {
                  const startingPrice = getQuoteStartingPrice(quote)
                  const expired = isPackageQuoteExpired(quote.expires_at)
                  const live = quote.share_enabled && quote.status === 'shared' && !expired
                  const quoteShareUrl = buildShareUrl(quote.share_token)

                  return (
                    <tr
                      key={quote.id}
                      className={`align-top ${
                        activeQuote?.id === quote.id ? 'bg-red-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="max-w-[16rem] truncate font-black text-slate-950">
                          {quote.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {quote.package_type} ·{' '}
                          {new Date(quote.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-bold text-slate-800">
                          {quote.customer_name || 'No customer'}
                        </p>
                        <p className="text-xs text-slate-500">{quote.customer_phone || quote.customer_email || ''}</p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                            expired
                              ? 'bg-red-50 text-red-700'
                              : live
                              ? 'bg-emerald-50 text-emerald-700'
                              : quote.status === 'draft'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {expired ? 'Expired' : live ? 'Live' : quote.status}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className={`text-xs font-bold ${expired ? 'text-red-700' : 'text-slate-700'}`}>
                          {formatExpiry(quote.expires_at)}
                        </p>
                        {quote.share_enabled && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {expired ? 'Link closed' : 'Link open'}
                          </p>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {startingPrice ? (
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(startingPrice.totalPrice, startingPrice.currency)}
                            </p>
                            <p className="text-xs font-bold text-[#8b1e2d]">
                              {formatMoney(startingPrice.perPersonPrice, startingPrice.currency)} pp
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Incomplete</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {quote.selected_at ? (
                          <div>
                            <p className="text-xs font-black text-emerald-700">Selected</p>
                            <p className="text-xs text-slate-500">
                              {new Date(quote.selected_at).toLocaleString('en-GB')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">No reply yet</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {live ? (
                          <p className="max-w-[16rem] truncate text-xs font-semibold text-slate-600">
                            {quoteShareUrl}
                          </p>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Not shared</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openQuoteForEdit(quote)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100"
                            title="Open quote for editing"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
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
      </section>
    </div>
  )
}
