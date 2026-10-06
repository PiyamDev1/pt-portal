'use client'

import { useState } from 'react'
import { ChevronDown, Clock3, CreditCard, PackageCheck } from 'lucide-react'
import type { PackageQuotePayload, TravelPackageType } from '@/app/types/packages'
import { PACKAGE_TYPE_OPTIONS } from './packageQuoteEditorModel'
import { PackageSectionHeader as SectionHeader } from './PackageSectionHeader'

export type PackageQuoteDetailsModel = {
  payload: PackageQuotePayload
  systematicQuoteTitle: string
  expiresAtInput: string
  minimumExpiryInput: string
  updatePayload: (changes: Partial<PackageQuotePayload>) => void
  applyPackageType: (packageType: TravelPackageType) => void
  setExpiresAtInput: (value: string) => void
}

export function PackageQuoteDetails({ model }: { model: PackageQuoteDetailsModel }) {
  const {
    payload,
    systematicQuoteTitle,
    expiresAtInput,
    minimumExpiryInput,
    updatePayload,
    applyPackageType,
    setExpiresAtInput,
  } = model
  const [cardProcessingExpanded, setCardProcessingExpanded] = useState(false)

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
      <SectionHeader icon={PackageCheck} title="Quote details" />
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-bold text-blue-800">System quote name</span>
          <input
            value={systematicQuoteTitle}
            readOnly
            className="min-h-11 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
          />
          <p className="mt-1 text-xs font-semibold text-blue-700">
            Generated from package type, quote date, and a unique six-character reference.
          </p>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">Type</span>
          <select
            value={payload.packageType}
            onChange={(event) => applyPackageType(event.target.value as TravelPackageType)}
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
          >
            {PACKAGE_TYPE_OPTIONS.map((type) => (
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
            min={minimumExpiryInput}
            onChange={(event) => setExpiresAtInput(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
          />
          <p className="mt-1 text-xs text-slate-500">Default is 72 hours from quote creation.</p>
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        {[
          ['Adults 12+', 'adults'],
          ['Children 5+', 'childrenPaying'],
          ['Children 2-5', 'childrenFree'],
          ['Infants under 2', 'infants'],
        ].map(([label, key]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
            <input
              type="number"
              min="0"
              value={payload[key as 'adults' | 'childrenPaying' | 'childrenFree' | 'infants']}
              onChange={(event) =>
                updatePayload({
                  [key]: Number(event.target.value || 0),
                } as Partial<PackageQuotePayload>)
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
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <button
          type="button"
          onClick={() => setCardProcessingExpanded((current) => !current)}
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:bg-slate-50"
          aria-expanded={cardProcessingExpanded}
        >
          <span className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-700">
            <CreditCard className="h-3.5 w-3.5" />
            <span>Credit Card processing fee</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-500">
            {(payload.cardProcessingFeePercent || 0).toFixed(2)}%
            <ChevronDown
              className={`h-4 w-4 transition ${cardProcessingExpanded ? 'rotate-180' : ''}`}
            />
          </span>
        </button>
        {cardProcessingExpanded && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Processing fee percentage
            </span>
            <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
              <input
                type="number"
                min="0"
                step="0.01"
                value={payload.cardProcessingFeePercent || ''}
                onChange={(event) =>
                  updatePayload({
                    cardProcessingFeePercent: Number(event.target.value || 0),
                  })
                }
                className="w-full bg-transparent text-sm font-bold outline-none"
                placeholder="0.00"
              />
              <span className="ml-2 text-sm font-black text-slate-500">%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Applied only to the Credit Card amount. Processing fees are non-refundable.
            </p>
          </label>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <button
            type="button"
            onClick={() => updatePayload({ depositRequired: !payload.depositRequired })}
            className={`min-h-11 rounded-lg px-3 text-sm font-black transition ${
              payload.depositRequired
                ? 'bg-emerald-100 text-emerald-800'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {payload.depositRequired ? 'Deposit required to secure' : 'No deposit required'}
          </button>
          <label className="block">
            <span className="sr-only">Deposit amount</span>
            <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
              <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payload.depositAmount || ''}
                onChange={(event) =>
                  updatePayload({ depositAmount: Number(event.target.value || 0) })
                }
                disabled={!payload.depositRequired}
                className="w-full bg-transparent text-sm font-bold outline-none disabled:text-slate-400"
                placeholder="Deposit"
              />
            </div>
          </label>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        {payload.packageType === 'holiday' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="block text-xs font-bold text-slate-500">Holiday starting point</span>
              <p className="mt-1 text-sm font-black text-slate-900">
                {payload.stayGroups[0]?.label || 'Location 1'}
              </p>
            </div>
            <span className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800">
              Location 1 is automatically first
            </span>
          </div>
        ) : (
          <>
            <span className="mb-2 block text-xs font-bold text-slate-500">Itinerary order</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  label: 'Makkah first',
                  order: ['makkah', 'madinah'],
                },
                {
                  label: 'Madinah first',
                  order: ['madinah', 'makkah'],
                },
              ].map((item) => {
                const active = item.order.join('|') === payload.itineraryOrder.slice(0, 2).join('|')
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => updatePayload({ itineraryOrder: item.order })}
                    className={`min-h-10 rounded-lg px-3 text-sm font-black transition ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
