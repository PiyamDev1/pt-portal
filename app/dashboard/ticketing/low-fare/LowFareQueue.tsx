'use client'

import { CalendarDays, PackageCheck, PencilLine, Plane, Users } from 'lucide-react'
import { LowFareAdjustmentForm } from './LowFareAdjustmentForm'
import type { LowFareMoney, LowFareQueueItem, LowFareSaveResult } from './types'

function formatGbp(value: LowFareMoney) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Unavailable'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return 'Not set'
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(isDateOnly ? `${value}T12:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: isDateOnly ? 'UTC' : undefined,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date)
}

function Difference({ value }: { value: LowFareMoney }) {
  const difference = Number(value)
  if (!Number.isFinite(difference)) return null
  const isLower = difference > 0
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${
        isLower
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-amber-50 text-amber-800 ring-amber-200'
      }`}
    >
      {isLower ? '+' : '-'}
      {formatGbp(Math.abs(difference))} {isLower ? 'lower fare' : 'increase'}
    </span>
  )
}

export function LowFareQueue({
  items,
  selectedBookingId,
  onSelect,
  onSaved,
}: {
  items: LowFareQueueItem[]
  selectedBookingId: string | null
  onSelect: (bookingId: string | null) => void
  onSaved: (result: LowFareSaveResult) => Promise<void>
}) {
  if (items.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <Plane className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="mt-3 text-base font-black text-slate-900">No matching issued tickets</h3>
        <p className="mt-1 max-w-lg text-sm text-slate-500">
          Clear the filters, or complete the supplier fare on an issued TK in the Sales Ledger.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[0.8fr_1.1fr_1fr_0.55fr_1.2fr_1.2fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 lg:grid">
        <span>PNR / airline</span>
        <span>Owner</span>
        <span>Travel dates</span>
        <span>Passengers</span>
        <span>Supplier fares</span>
        <span>Latest adjustment</span>
        <span>Action</span>
      </div>

      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const selected = selectedBookingId === item.bookingId
          const latest = item.latestAdjustment
          return (
            <article key={item.bookingId} className="px-4 py-4 transition hover:bg-slate-50/60">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.1fr_1fr_0.55fr_1.2fr_1.2fr_0.8fr] lg:items-center">
                <div>
                  <p className="font-mono text-base font-black tracking-wide text-slate-950">
                    {item.pnr}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-slate-500">
                    {item.airline.iataCode} · {item.airline.name}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">
                    Issued {formatDate(item.issuedDate)}
                  </p>
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {item.owner.fullName}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">Ticket owner</p>
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {formatDate(item.departureDate)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Return {formatDate(item.returnDate)}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-black text-slate-900">{item.passengerCount}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {item.passengerCount === 1 ? 'passenger' : 'passengers'}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-2 lg:block">
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Current
                    </dt>
                    <dd className="mt-0.5 text-sm font-black text-slate-950">
                      {formatGbp(item.currentSupplierFareGbp)}
                    </dd>
                  </div>
                  <div className="lg:mt-1">
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Initial
                    </dt>
                    <dd className="mt-0.5 text-xs font-semibold text-slate-600">
                      {formatGbp(item.initialSupplierFareGbp)}
                    </dd>
                  </div>
                </dl>

                <div>
                  {latest ? (
                    <>
                      <Difference value={latest.differenceGbp} />
                      <p className="mt-1.5 text-xs font-semibold text-slate-600">
                        Effective {formatDate(latest.effectiveDate)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Last adjusted {formatDate(latest.createdAt, true)}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">Never adjusted</span>
                  )}
                  {item.latestCheck && (
                    <p className="mt-1.5 text-[11px] font-bold text-emerald-700">
                      No change checked {formatDate(item.latestCheck.effectiveDate)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {(item.packageMatchStatus === 'matched' ||
                    item.packageMatchStatus === 'manually_resolved') && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200">
                      <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Package linked
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(selected ? null : item.bookingId)}
                    aria-label={`${selected ? 'Close fare entry' : 'Record fare'} for ${item.pnr}`}
                    aria-expanded={selected}
                    aria-controls={`low-fare-form-${item.bookingId}`}
                    className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-900 hover:bg-sky-100"
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                    {selected ? 'Close entry' : 'Record fare'}
                  </button>
                </div>
              </div>

              {selected && (
                <div id={`low-fare-form-${item.bookingId}`} className="mt-4">
                  <LowFareAdjustmentForm
                    item={item}
                    onCancel={() => onSelect(null)}
                    onSaved={onSaved}
                  />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
