'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Bus, CheckCircle2, Loader2, Plane, Send } from 'lucide-react'
import type {
  PackageQuotePayload,
  PackageResolvedSelection,
  TravelPackageQuote,
} from '@/app/types/packages'
import {
  formatMoney,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'

type PackageShareClientProps = {
  token: string
}

type QuoteResponse = {
  quote?: TravelPackageQuote
  error?: string
}

type SelectionResponse = {
  selected?: PackageResolvedSelection
  error?: string
}

type CustomerFields = {
  customerName: string
  customerPhone: string
  customerEmail: string
  note: string
}

function firstSelections(payload: PackageQuotePayload) {
  return {
    stayOptionIds: Object.fromEntries(
      payload.stayGroups.map((group) => [group.id, group.options[0]?.id || '']),
    ),
    flightOptionId: payload.flightOptions[0]?.id || null,
    transportOptionId: payload.transportOptions[0]?.id || null,
  }
}

function formatExpiry(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'expiry unavailable'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function OptionButton({
  selected,
  title,
  summary,
  price,
  currency,
  onClick,
}: {
  selected: boolean
  title: string
  summary: string
  price: number
  currency: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-[#8b1e2d] bg-red-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{title || 'Option'}</p>
          {summary && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{summary}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-slate-950">{formatMoney(price, currency)}</p>
          {selected && <CheckCircle2 className="ml-auto mt-2 h-5 w-5 text-[#8b1e2d]" />}
        </div>
      </div>
    </button>
  )
}

export default function PackageShareClient({ token }: PackageShareClientProps) {
  const [quote, setQuote] = useState<TravelPackageQuote | null>(null)
  const [payload, setPayload] = useState<PackageQuotePayload | null>(null)
  const [selection, setSelection] = useState<ReturnType<typeof firstSelections> | null>(null)
  const [customer, setCustomer] = useState<CustomerFields>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    note: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSelection, setSavedSelection] = useState<PackageResolvedSelection | null>(null)

  useEffect(() => {
    const loadQuote = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/packages/share/${encodeURIComponent(token)}`)
        const data = (await response.json()) as QuoteResponse
        if (!response.ok || !data.quote) throw new Error(data.error || 'Package quote not found')

        const normalized = normalizePackageQuotePayload(data.quote.payload)
        setQuote(data.quote)
        setPayload(normalized)
        setSelection(firstSelections(normalized))
        setCustomer({
          customerName: data.quote.customer_name || normalized.customerName,
          customerPhone: data.quote.customer_phone || normalized.customerPhone,
          customerEmail: data.quote.customer_email || normalized.customerEmail,
          note: '',
        })
        setSavedSelection(data.quote.selected_option)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load package quote')
      } finally {
        setLoading(false)
      }
    }

    void loadQuote()
  }, [token])

  const resolved = useMemo(() => {
    if (!payload || !selection) return null
    try {
      return resolvePackageSelection(payload, selection)
    } catch {
      return null
    }
  }, [payload, selection])

  const updateCustomer = (changes: Partial<CustomerFields>) => {
    setCustomer((current) => ({ ...current, ...changes }))
  }

  const submitSelection = async () => {
    if (!payload || !selection) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/packages/share/${encodeURIComponent(token)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selection, ...customer }),
      })
      const data = (await response.json()) as SelectionResponse
      if (!response.ok || !data.selected) throw new Error(data.error || 'Unable to save selection')
      setSavedSelection(data.selected)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save selection')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-bold">Loading package quote</span>
        </div>
      </main>
    )
  }

  if (error && !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-black text-slate-950">Package quote unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </main>
    )
  }

  if (!quote || !payload || !selection) return null

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-[#4b0f16] px-4 py-6 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-bold text-red-100">Piyam Travel package quote</p>
          <h1 className="mt-2 text-3xl font-black">{payload.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">{payload.packageType}</span>
            <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
              Valid until {formatExpiry(quote.expires_at)}
            </span>
            {payload.departureDate && (
              <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
                Depart {new Date(payload.departureDate).toLocaleDateString('en-GB')}
              </span>
            )}
            {payload.returnDate && (
              <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
                Return {new Date(payload.returnDate).toLocaleDateString('en-GB')}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {payload.stayGroups.map((group) => (
            <section key={group.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Building2 className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">{group.label}</h2>
              </div>
              <div className="space-y-3">
                {group.options.map((option) => (
                  <OptionButton
                    key={option.id}
                    selected={selection.stayOptionIds[group.id] === option.id}
                    title={option.title}
                    summary={option.summary}
                    price={option.price}
                    currency={payload.currency}
                    onClick={() =>
                      setSelection((current) =>
                        current
                          ? {
                              ...current,
                              stayOptionIds: { ...current.stayOptionIds, [group.id]: option.id },
                            }
                          : current,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))}

          {payload.flightOptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Plane className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">Flights</h2>
              </div>
              <div className="space-y-3">
                {payload.flightOptions.map((option) => (
                  <OptionButton
                    key={option.id}
                    selected={selection.flightOptionId === option.id}
                    title={option.title}
                    summary={option.summary}
                    price={option.price}
                    currency={payload.currency}
                    onClick={() =>
                      setSelection((current) =>
                        current ? { ...current, flightOptionId: option.id } : current,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {payload.transportOptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Bus className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">Transport</h2>
              </div>
              <div className="space-y-3">
                {payload.transportOptions.map((option) => (
                  <OptionButton
                    key={option.id}
                    selected={selection.transportOptionId === option.id}
                    title={option.title}
                    summary={option.summary}
                    price={option.price}
                    currency={payload.currency}
                    onClick={() =>
                      setSelection((current) =>
                        current ? { ...current, transportOptionId: option.id } : current,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-950">Total</p>
            {resolved ? (
              <>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {formatMoney(resolved.combination.totalPrice, resolved.combination.currency)}
                </p>
                <p className="text-sm font-bold text-[#8b1e2d]">
                  {formatMoney(
                    resolved.combination.perPersonPrice,
                    resolved.combination.currency,
                  )}{' '}
                  per paying guest
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-red-600">Selection is incomplete.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <input
                value={customer.customerName}
                onChange={(event) => updateCustomer({ customerName: event.target.value })}
                placeholder="Name"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={customer.customerPhone}
                onChange={(event) => updateCustomer({ customerPhone: event.target.value })}
                placeholder="Phone"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={customer.customerEmail}
                onChange={(event) => updateCustomer({ customerEmail: event.target.value })}
                placeholder="Email"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <textarea
                value={customer.note}
                onChange={(event) => updateCustomer({ note: event.target.value })}
                placeholder="Notes"
                rows={3}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => void submitSelection()}
                disabled={!resolved || saving}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-black text-white transition hover:bg-[#6f1422] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Preference
              </button>
            </div>
            {savedSelection && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                Preference saved: {formatMoney(savedSelection.combination.totalPrice, savedSelection.combination.currency)}
              </div>
            )}
            {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
          </section>
        </aside>
      </div>
    </main>
  )
}
