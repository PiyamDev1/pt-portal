'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BadgePoundSterling,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  calculateReplacementChange,
  calculateReplacementRecovery,
  type TicketingReplacementCase,
  type TicketingReplacementCasePage,
  type TicketingReplacementLookupItem,
} from '@/lib/ticketing/replacementCaseContracts'

type Tab = 'entry' | 'cases' | 'guidelines'

const REASON_LABELS = {
  fare_expired_staff_error: 'Fare expired / staff error',
  supplier_failure: 'Supplier or issue failure',
  schedule_disruption: 'Airline schedule disruption',
  customer_requested_change: 'Customer requested change',
  other: 'Other replacement reason',
} as const

const POLICY_LABELS = {
  above_customer_sale: 'Employee covers only the amount above the customer sale',
  full_cost_increase: 'Employee covers the full increase from the original supplier cost',
  business_absorbs: 'Business absorbs the replacement difference',
} as const

type ScenarioGuide = {
  id: string
  title: string
  summary: string
  action: string
  tone: string
  steps: readonly string[]
  example?: readonly string[]
}

const SCENARIOS: readonly ScenarioGuide[] = [
  {
    id: 'expired-fare',
    title: 'Fare expired after the customer paid',
    summary:
      'Use a Replacement Case when the original price can no longer be honoured and one or more new tickets must be bought.',
    action: 'Replacement Case',
    tone: 'border-rose-200 bg-rose-50/70',
    steps: [
      'Enter every newly issued ticket in the Ticketing Ledger under the agent who actually found and issued it.',
      'Open Replacement Cases and find the original PNR.',
      'Link all replacement PNRs. Do not enter an unused quoted fare.',
      'If the customer paid nothing extra for a replacement ticket, record its customer sale as £0.00. Do not repeat the original sale.',
      'Select who was responsible and the agreed recovery rule.',
      'Check the preview, then save one case. Do not also use Low Fare for the same replacement.',
    ],
    example: [
      'Original: customer sale £940.00; supplier cost £832.99.',
      'Replacement tickets: £478.59 + £574.00 = £1,052.59 supplier cost.',
      'Using “amount above customer sale”: employee recovery £112.59; business absorbs £107.01 of lost original margin.',
    ],
  },
  {
    id: 'later-change',
    title: 'A replacement ticket is later cancelled and rebooked',
    summary:
      'Keep this separate from the original staff-error recovery so a later customer request does not rewrite responsibility.',
    action: 'Add later change',
    tone: 'border-violet-200 bg-violet-50/70',
    steps: [
      'Enter the newly issued ticket in the Ticketing Ledger first.',
      'Open the saved Replacement Case and choose the ticket being replaced.',
      'Enter the actual supplier refund, supplier admin fee and customer charge.',
      'Link the new PNR. The system derives the new ticket cost and incremental result.',
      'Do not reduce the original employee recovery unless management decides the later event is related.',
    ],
    example: [
      'Old ticket cost £574.00; supplier admin £10.00; net refund received £564.00.',
      'New ticket cost £665.90; customer charge £480.00.',
      'Separate later-event result: £480.00 + £564.00 − £665.90 = £378.10.',
    ],
  },
  {
    id: 'ordinary-date-change',
    title: 'Ordinary date change on the same ticket',
    summary:
      'Use Date change when the existing booking is changed normally and there is no separate replacement-loss case.',
    action: 'Date change (DC)',
    tone: 'border-sky-200 bg-sky-50/70',
    steps: [
      'Open Ticketing Ledger and select Date change.',
      'Find the original PNR and affected passengers.',
      'Enter the supplier change cost and the total customer charge.',
      'Use Replacement Cases only when a separate ticket was bought or responsibility must be tracked.',
    ],
  },
  {
    id: 'reissue',
    title: 'Airline reissues the existing ticket',
    summary:
      'Use Reissue when the airline replaces the ticket within the same booking chain, rather than creating unrelated PNRs.',
    action: 'Reissue (R-ER)',
    tone: 'border-emerald-200 bg-emerald-50/70',
    steps: [
      'Open Ticketing Ledger and select Reissue.',
      'Find the original PNR and select the affected passengers.',
      'Enter the full supplier and customer reissue amounts shown on the transaction.',
      'Use Replacement Cases when there are multiple new PNRs, a staff loss, or a supplier recovery to track separately.',
    ],
  },
  {
    id: 'lower-higher-fare',
    title: 'Supplier fare changes but the same booking remains',
    summary:
      'Use Low Fare only for a real whole-PNR supplier fare change on the existing ticket—not a quote that was never bought.',
    action: 'Low Fare',
    tone: 'border-amber-200 bg-amber-50/70',
    steps: [
      'Open Low Fare and find the issued PNR.',
      'Enter the supplier fare actually paid and its effective date.',
      'Do not use Low Fare if separate replacement tickets were issued; use a Replacement Case instead.',
    ],
  },
]

function gbp(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)
}

function newKey(prefix: string) {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function responseJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(String(payload.error || 'The request could not be completed.'))
  return payload
}

function TicketSummary({ ticket }: { ticket: TicketingReplacementLookupItem }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-black text-slate-950">
            {ticket.pnr} · {ticket.airline.iataCode}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {ticket.customerName} · {ticket.owner.fullName}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
          {ticket.passengerCount} ticket{ticket.passengerCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-slate-500">Supplier cost</p>
          <p className="mt-0.5 font-black text-slate-900">{gbp(ticket.supplierCostGbp)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-slate-500">Recorded sale</p>
          <p className="mt-0.5 font-black text-slate-900">{gbp(ticket.salePriceGbp)}</p>
        </div>
      </div>
    </div>
  )
}

function PnrLookup({
  label,
  onSelect,
  disabled,
}: {
  label: string
  onSelect: (ticket: TicketingReplacementLookupItem) => void
  disabled?: boolean
}) {
  const [pnr, setPnr] = useState('')
  const [results, setResults] = useState<TicketingReplacementLookupItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup() {
    const normalized = pnr.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (normalized.length < 3) {
      setError('Enter the exact PNR.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = await responseJson(
        await fetch(
          `/api/ticketing/replacement-cases/lookup?pnr=${encodeURIComponent(normalized)}`,
        ),
      )
      const items = Array.isArray(payload.items)
        ? (payload.items as TicketingReplacementLookupItem[])
        : []
      setResults(items)
      if (items.length === 0) setError('No issued ticket was found for that PNR.')
      if (items.length === 1) {
        onSelect(items[0]!)
        setPnr('')
        setResults([])
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Unable to look up the PNR.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 text-xs font-bold text-slate-700">
          {label}
          <input
            value={pnr}
            onChange={(event) => {
              setPnr(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 12),
              )
              setError('')
              setResults([])
            }}
            disabled={disabled || busy}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void lookup()
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100 disabled:opacity-60"
            placeholder="Enter exact PNR"
            aria-label={label}
          />
        </label>
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={disabled || busy}
          className="ui-tap ui-focus mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Find ticket
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
      {results.length > 1 && (
        <div className="mt-2 grid gap-2">
          <p className="text-xs font-bold text-amber-800">Select the correct airline record.</p>
          {results.map((ticket) => (
            <button
              type="button"
              key={ticket.bookingId}
              onClick={() => {
                onSelect(ticket)
                setPnr('')
                setResults([])
              }}
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm font-bold text-slate-900 hover:bg-amber-100"
            >
              {ticket.pnr} · {ticket.airline.iataCode} · {ticket.customerName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: string }) {
  const classes =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-950'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : tone === 'amber'
          ? 'border-amber-200 bg-amber-50 text-amber-950'
          : 'border-slate-200 bg-slate-50 text-slate-950'
  return (
    <div className={`rounded-xl border p-3 ${classes}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  )
}

export function ReplacementCasesClient() {
  const [tab, setTab] = useState<Tab>('entry')
  const [page, setPage] = useState<TicketingReplacementCasePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [original, setOriginal] = useState<TicketingReplacementLookupItem | null>(null)
  const [replacements, setReplacements] = useState<TicketingReplacementLookupItem[]>([])
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState('')
  const [reason, setReason] = useState<keyof typeof REASON_LABELS>('fare_expired_staff_error')
  const [policy, setPolicy] = useState<keyof typeof POLICY_LABELS>('above_customer_sale')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [guideSearch, setGuideSearch] = useState('')
  const [openGuide, setOpenGuide] = useState<string>('expired-fare')
  const saveKey = useRef(newKey('replacement-case'))

  const load = useCallback(async () => {
    try {
      const payload = (await responseJson(
        await fetch('/api/ticketing/replacement-cases'),
      )) as unknown as TicketingReplacementCasePage
      setPage(payload)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load replacement cases.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const replacementCost = replacements.reduce((sum, ticket) => sum + ticket.supplierCostGbp, 0)
  const replacementRecordedSale = replacements.reduce((sum, ticket) => sum + ticket.salePriceGbp, 0)
  const preview = useMemo(
    () =>
      original && replacements.length
        ? calculateReplacementRecovery({
            originalSaleGbp: original.salePriceGbp,
            originalSupplierCostGbp: original.supplierCostGbp,
            replacementSupplierCostGbp: replacementCost,
            recoveryPolicy: policy,
          })
        : null,
    [original, policy, replacementCost, replacements.length],
  )

  function clearDraft() {
    setOriginal(null)
    setReplacements([])
    setResponsibleEmployeeId('')
    setReason('fare_expired_staff_error')
    setPolicy('above_customer_sale')
    setNotes('')
    saveKey.current = newKey('replacement-case')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!original || replacements.length === 0 || !responsibleEmployeeId) {
      setError('Select the original ticket, at least one replacement and the responsible employee.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await responseJson(
        await fetch('/api/ticketing/replacement-cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': saveKey.current },
          body: JSON.stringify({
            original: {
              bookingId: original.bookingId,
              transactionId: original.transactionId,
              expectedBookingVersion: original.bookingVersion,
            },
            responsibleEmployeeId,
            reason,
            recoveryPolicy: policy,
            replacements: replacements.map((ticket) => ({
              bookingId: ticket.bookingId,
              transactionId: ticket.transactionId,
            })),
            notes: notes.trim() || null,
          }),
        }),
      )
      toast.success('Replacement case recorded')
      clearDraft()
      await load()
      setTab('cases')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the case.')
    } finally {
      setSaving(false)
    }
  }

  const filteredScenarios = SCENARIOS.filter((scenario) => {
    const query = guideSearch.trim().toLowerCase()
    return (
      !query ||
      `${scenario.title} ${scenario.summary} ${scenario.action}`.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1e2d] to-slate-900 p-5 text-white shadow-xl shadow-red-950/15 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
              Guided ticket recovery
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Replacement Cases</h1>
            <p className="mt-2 text-sm leading-6 text-red-50/85 md:text-base">
              Link every real ticket, separate later customer changes, and let the system explain
              the loss and recovery.
            </p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Link2 className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
      </section>

      <nav
        aria-label="Replacement case sections"
        className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1 sm:grid-cols-3"
      >
        {(
          [
            ['entry', 'New replacement case', Sparkles],
            ['cases', `Saved cases${page ? ` (${page.items.length})` : ''}`, TicketCheck],
            ['guidelines', 'Guidelines & scenarios', BookOpenCheck],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`ui-tap ui-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition ${
              tab === value
                ? 'bg-white text-[#8b1e2d] shadow-sm ring-1 ring-slate-200'
                : 'text-slate-600 hover:bg-white/60 hover:text-slate-950'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </div>
      )}

      {tab === 'entry' && (
        <form
          onSubmit={save}
          className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.8fr)]"
        >
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8b1e2d] text-sm font-black text-white">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-950">Find the original ticket</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Use the ticket connected to the customer’s original payment.
                  </p>
                  <div className="mt-4">
                    {original ? (
                      <div className="space-y-2">
                        <TicketSummary ticket={original} />
                        <button
                          type="button"
                          onClick={() => setOriginal(null)}
                          className="text-xs font-black text-[#8b1e2d]"
                        >
                          Choose a different original
                        </button>
                      </div>
                    ) : (
                      <PnrLookup
                        label="Original PNR"
                        onSelect={(ticket) => {
                          setOriginal(ticket)
                          setResponsibleEmployeeId(ticket.owner.id)
                          saveKey.current = newKey('replacement-case')
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8b1e2d] text-sm font-black text-white">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-950">
                    Link every replacement ticket
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Enter these tickets in the Ledger first. Add only tickets actually purchased.
                  </p>
                  <div className="mt-4">
                    <PnrLookup
                      label="Replacement PNR"
                      disabled={!original}
                      onSelect={(ticket) => {
                        if (ticket.bookingId === original?.bookingId) {
                          setError('The original ticket cannot also be a replacement.')
                          return
                        }
                        if (replacements.some((item) => item.bookingId === ticket.bookingId)) {
                          setError('That replacement is already selected.')
                          return
                        }
                        setReplacements((current) => [...current, ticket])
                        saveKey.current = newKey('replacement-case')
                      }}
                    />
                  </div>
                  {replacements.length > 0 && (
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {replacements.map((ticket) => (
                        <div key={ticket.bookingId} className="relative">
                          <TicketSummary ticket={ticket} />
                          <button
                            type="button"
                            aria-label={`Remove ${ticket.pnr}`}
                            onClick={() =>
                              setReplacements((current) =>
                                current.filter((item) => item.bookingId !== ticket.bookingId),
                              )
                            }
                            className="absolute right-2 top-2 rounded-lg bg-white p-2 text-red-700 shadow-sm ring-1 ring-slate-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8b1e2d] text-sm font-black text-white">
                  3
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-950">
                    Responsibility and treatment
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Choose the business rule. The figures are calculated automatically.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">
                      What happened?
                      <select
                        value={reason}
                        onChange={(event) => setReason(event.target.value as typeof reason)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"
                      >
                        {Object.entries(REASON_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Responsible employee
                      <select
                        value={responsibleEmployeeId}
                        onChange={(event) => setResponsibleEmployeeId(event.target.value)}
                        disabled={!page?.context.canManageTeam}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold disabled:bg-slate-100"
                      >
                        <option value="">Select employee</option>
                        {(page?.context.employees || []).map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 md:col-span-2">
                      Who covers the fare difference?
                      <select
                        value={policy}
                        onChange={(event) => setPolicy(event.target.value as typeof policy)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"
                      >
                        {Object.entries(POLICY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700 md:col-span-2">
                      Notes (optional)
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        maxLength={2000}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                        placeholder="Supplier reference or concise context"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="h-fit space-y-4 xl:sticky xl:top-4">
            <section className="rounded-2xl border border-[#8b1e2d]/20 bg-white p-5 shadow-lg shadow-red-950/5">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-[#8b1e2d]" />
                <h2 className="text-lg font-black text-slate-950">Live case preview</h2>
              </div>
              {!preview || !original ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                  Link the original and replacement tickets to see the result.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Stat label="Original customer sale" value={gbp(original.salePriceGbp)} />
                    <Stat label="Original supplier cost" value={gbp(original.supplierCostGbp)} />
                    <Stat label="Replacement cost" value={gbp(replacementCost)} />
                    <Stat
                      label="Supplier-cost increase"
                      value={gbp(preview.supplierCostIncreaseGbp)}
                      tone="amber"
                    />
                    <Stat label="Business absorbs" value={gbp(preview.companyMarginAbsorbedGbp)} />
                    <Stat
                      label="Employee recovery"
                      value={gbp(preview.employeeRecoveryGbp)}
                      tone="rose"
                    />
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                    <p className="font-black">Commission instruction recorded</p>
                    <p className="mt-1">
                      Original agent commission: reverse at review. Replacement ticket agents:
                      standard commission.
                    </p>
                  </div>
                  {replacementRecordedSale > 0 ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <p className="font-black">Check the replacement sale before saving</p>
                      <p className="mt-1">
                        These replacement tickets contain {gbp(replacementRecordedSale)} of recorded
                        sale. Keep it only if the customer paid this in addition to the original
                        sale. Otherwise, correct the replacement ticket sale to £0.00 first so
                        revenue is not counted twice.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
              <button
                type="submit"
                disabled={saving || !preview || !responsibleEmployeeId}
                className="ui-tap ui-focus mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1724] disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {saving ? 'Saving case…' : 'Record replacement case'}
              </button>
            </section>
            <button
              type="button"
              onClick={() => setTab('guidelines')}
              className="ui-tap ui-focus inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 shadow-sm"
            >
              Not sure which workflow to use?
              <ArrowRight className="h-4 w-4" />
            </button>
          </aside>
        </form>
      )}

      {tab === 'cases' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Case register
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Saved replacement cases</h2>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="ui-tap ui-focus inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {loading ? (
            <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <LoaderCircle className="h-7 w-7 animate-spin text-[#8b1e2d]" />
            </div>
          ) : page?.items.length ? (
            <div className="grid gap-4">
              {page.items.map((replacementCase) => (
                <ReplacementCaseCard
                  key={replacementCase.id}
                  item={replacementCase}
                  onSaved={load}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <TicketCheck className="mx-auto h-9 w-9 text-slate-400" />
              <p className="mt-3 font-black text-slate-800">No replacement cases yet</p>
              <button
                type="button"
                onClick={() => setTab('entry')}
                className="mt-3 text-sm font-black text-[#8b1e2d]"
              >
                Record the first case
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'guidelines' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                  Agent help
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">What should I enter?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Find the situation that matches the work. Each guide tells you which Ticketing
                  action to use.
                </p>
              </div>
              <label className="relative block w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  value={guideSearch}
                  onChange={(event) => setGuideSearch(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-3 pl-9 pr-3 text-sm"
                  placeholder="Search a scenario…"
                  aria-label="Search scenarios"
                />
              </label>
            </div>
          </div>
          <div className="grid gap-3">
            {filteredScenarios.map((scenario) => {
              const open = openGuide === scenario.id
              return (
                <article
                  key={scenario.id}
                  className={`overflow-hidden rounded-2xl border ${scenario.tone}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenGuide(open ? '' : scenario.id)}
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-4 p-5 text-left"
                  >
                    <div>
                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#8b1e2d] ring-1 ring-black/5">
                        Use: {scenario.action}
                      </span>
                      <h3 className="mt-3 text-lg font-black text-slate-950">{scenario.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{scenario.summary}</p>
                    </div>
                    <ChevronDown
                      className={`mt-1 h-5 w-5 shrink-0 text-slate-600 transition ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="border-t border-black/5 bg-white/70 px-5 py-4">
                      <ol className="space-y-3">
                        {scenario.steps.map((step, index) => (
                          <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      {scenario.example ? (
                        <div className="mt-4 rounded-xl border border-[#8b1e2d]/15 bg-[#8b1e2d]/5 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-[#8b1e2d]">
                            Worked example
                          </p>
                          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700">
                            {scenario.example.map((line) => (
                              <li key={line}>• {line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {scenario.id === 'expired-fare' && (
                        <button
                          type="button"
                          onClick={() => {
                            setReason('fare_expired_staff_error')
                            setPolicy('above_customer_sale')
                            setTab('entry')
                          }}
                          className="ui-tap ui-focus mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8b1e2d] px-4 text-sm font-black text-white"
                        >
                          Start this replacement case <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          {filteredScenarios.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No matching scenario. Try “refund”, “date change”, “reissue” or “fare”.
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <ShieldCheck className="h-5 w-5" />
              <p className="mt-2 font-black">Enter facts, not estimates</p>
              <p className="mt-1 text-xs leading-5">
                Use the supplier cost actually paid and the refund actually confirmed.
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <Link2 className="h-5 w-5" />
              <p className="mt-2 font-black">Link every real PNR</p>
              <p className="mt-1 text-xs leading-5">
                One case can contain several one-way replacement tickets.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <CircleAlert className="h-5 w-5" />
              <p className="mt-2 font-black">Keep later events separate</p>
              <p className="mt-1 text-xs leading-5">
                A later customer request must not rewrite the original responsibility calculation.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function ReplacementCaseCard({
  item,
  onSaved,
}: {
  item: TicketingReplacementCase
  onSaved: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [replacedItemId, setReplacedItemId] = useState(item.items[0]?.id || '')
  const [newTicket, setNewTicket] = useState<TicketingReplacementLookupItem | null>(null)
  const [supplierRefund, setSupplierRefund] = useState('')
  const [supplierAdmin, setSupplierAdmin] = useState('')
  const [customerCharge, setCustomerCharge] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const changeKey = useRef(newKey('replacement-change'))
  const selectedItem = item.items.find((candidate) => candidate.id === replacedItemId)
  const refund = Number(supplierRefund)
  const admin = Number(supplierAdmin)
  const charge = Number(customerCharge)
  const validMoney = [refund, admin, charge].every((value) => Number.isFinite(value) && value >= 0)
  const changeResult =
    newTicket && validMoney
      ? calculateReplacementChange({
          supplierRefundGbp: refund,
          newSupplierCostGbp: newTicket.supplierCostGbp,
          customerChargeGbp: charge,
        })
      : null

  async function saveChange(event: FormEvent) {
    event.preventDefault()
    if (!selectedItem || !newTicket || !validMoney) return
    setSaving(true)
    try {
      await responseJson(
        await fetch(`/api/ticketing/replacement-cases/${item.id}/changes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': changeKey.current },
          body: JSON.stringify({
            expectedVersion: item.version,
            replacedItemId: selectedItem.id,
            replacement: { bookingId: newTicket.bookingId, transactionId: newTicket.transactionId },
            supplierRefundGbp: refund,
            supplierAdminFeeGbp: admin,
            customerChargeGbp: charge,
            notes: notes.trim() || null,
          }),
        }),
      )
      toast.success('Later change added separately')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save the later change.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-slate-950">{item.original.pnr}</h3>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
              {REASON_LABELS[item.reason]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Responsible: {item.responsibleEmployee.fullName} · {item.items.length} replacement
            ticket{item.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Employee recovery
            </p>
            <p className="font-black text-rose-800">{gbp(item.employeeRecoveryGbp)}</p>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-200 p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Original sale" value={gbp(item.original.salePriceGbp)} />
            <Stat label="Original cost" value={gbp(item.original.supplierCostGbp)} />
            <Stat label="Replacement cost" value={gbp(item.replacementSupplierCostGbp)} />
            <Stat label="Cost increase" value={gbp(item.supplierCostIncreaseGbp)} tone="amber" />
            <Stat label="Business absorbs" value={gbp(item.companyMarginAbsorbedGbp)} />
            <Stat label="Employee recovery" value={gbp(item.employeeRecoveryGbp)} tone="rose" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {item.items.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex justify-between gap-2">
                  <p className="font-black text-slate-900">{ticket.pnr}</p>
                  <p className="font-black text-slate-900">{gbp(ticket.supplierCostGbp)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Issued by {ticket.owner.fullName} · Standard commission
                </p>
              </div>
            ))}
          </div>
          {item.changes.map((change) => (
            <div key={change.id} className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-violet-700">
                Separate later change
              </p>
              <p className="mt-1 text-sm font-black text-slate-950">
                New PNR {change.newPnr} · {change.servicingEmployee.fullName}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-700">
                Supplier refund {gbp(change.supplierRefundGbp)} · admin{' '}
                {gbp(change.supplierAdminFeeGbp)} · new cost {gbp(change.newSupplierCostGbp)} ·
                customer charge {gbp(change.customerChargeGbp)}
              </p>
              <p className="mt-1 text-sm font-black text-violet-900">
                Incremental result {gbp(change.incrementalResultGbp)}
              </p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setChangeOpen((value) => !value)}
            className="ui-tap ui-focus inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white"
          >
            <Plus className="h-4 w-4" /> Add a later change
          </button>
          {changeOpen && (
            <form
              onSubmit={saveChange}
              className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4"
            >
              <h4 className="font-black text-slate-950">Record the later event separately</h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Use this when a linked replacement ticket is later cancelled and another ticket is
                bought.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Ticket being replaced
                  <select
                    value={replacedItemId}
                    onChange={(event) => setReplacedItemId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    {item.items.map((ticket) => (
                      <option key={ticket.id} value={ticket.id}>
                        {ticket.pnr} · {gbp(ticket.supplierCostGbp)}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <PnrLookup label="New ticket PNR" onSelect={setNewTicket} />
                  {newTicket && (
                    <div className="mt-2">
                      <TicketSummary ticket={newTicket} />
                    </div>
                  )}
                </div>
                <label className="text-xs font-bold text-slate-700">
                  Supplier refund (£)
                  <input
                    value={supplierRefund}
                    onChange={(event) => setSupplierRefund(event.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    placeholder="0.00"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Supplier admin fee (£)
                  <input
                    value={supplierAdmin}
                    onChange={(event) => setSupplierAdmin(event.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    placeholder="0.00"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Additional customer charge (£)
                  <input
                    value={customerCharge}
                    onChange={(event) => setCustomerCharge(event.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    placeholder="0.00"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Notes (optional)
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={2000}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
              </div>
              {selectedItem &&
                Number.isFinite(refund) &&
                Number.isFinite(admin) &&
                refund + admin > selectedItem.supplierCostGbp && (
                  <p className="mt-3 text-xs font-bold text-red-700">
                    Refund plus admin fee cannot exceed the replaced ticket cost.
                  </p>
                )}
              {changeResult !== null && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Stat
                    label="Net new supplier outlay"
                    value={gbp(newTicket!.supplierCostGbp - refund)}
                  />
                  <Stat
                    label="Incremental result"
                    value={gbp(changeResult)}
                    tone={changeResult >= 0 ? 'emerald' : 'rose'}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={
                  saving ||
                  !newTicket ||
                  !validMoney ||
                  !selectedItem ||
                  refund + admin > selectedItem.supplierCostGbp
                }
                className="ui-tap ui-focus mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8b1e2d] px-4 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <BadgePoundSterling className="h-4 w-4" />
                )}{' '}
                Save later change
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  )
}
