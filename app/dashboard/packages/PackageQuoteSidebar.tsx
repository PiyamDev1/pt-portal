'use client'

import { Calculator, Copy, PackageCheck, Trash2 } from 'lucide-react'
import type {
  PackageCombination,
  PackageQuotePayload,
  PackageResolvedSelection,
  TravelPackageQuote,
} from '@/app/types/packages'
import { formatMoney, getOrderedStaySelections } from '@/lib/packageQuote'
import { PackageSectionHeader as SectionHeader } from './PackageSectionHeader'

export type PackageQuoteSidebarModel = {
  customerOptions: PackageResolvedSelection[]
  baseCustomerOption: PackageCombination | null
  payingGuestCount: number
  payload: PackageQuotePayload
  activeQuotes: TravelPackageQuote[]
  activeQuote: TravelPackageQuote | null
  loading: boolean
  saving: boolean
  currentUserId: string
  onCopyAllOptions: () => void | Promise<void>
  onOpenQuote: (quote: TravelPackageQuote) => void
  onArchiveQuote: () => void | Promise<void>
}

export function PackageQuoteSidebar({ model }: { model: PackageQuoteSidebarModel }) {
  const {
    customerOptions,
    baseCustomerOption,
    payingGuestCount,
    payload,
    activeQuotes,
    activeQuote,
    loading,
    saving,
    currentUserId,
    onCopyAllOptions,
    onOpenQuote,
    onArchiveQuote,
  } = model

  return (
    <aside className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionHeader
          icon={Calculator}
          title="Generated options"
          action={
            <button
              type="button"
              onClick={() => void onCopyAllOptions()}
              disabled={customerOptions.length === 0}
              className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          }
        />
        {customerOptions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Add at least one priced hotel option in each stay group and one paying guest to generate
            totals.
          </div>
        ) : (
          <div className="max-h-[44rem] space-y-3 overflow-y-auto pr-1">
            {baseCustomerOption && (
              <div className="rounded-lg border border-[#8b1e2d]/20 bg-red-50 p-3 text-xs text-slate-700">
                <p className="text-sm font-black text-slate-950">Base package</p>
                <p className="mt-1">
                  {baseCustomerOption.flightOption?.title || 'No flight'} ·{' '}
                  {baseCustomerOption.transportOption?.title || 'No transport'} ·{' '}
                  {baseCustomerOption.visaOptions.length > 0 ? 'Visa included' : 'No visa'}
                </p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  {formatMoney(baseCustomerOption.totalPrice, baseCustomerOption.currency)}
                </p>
              </div>
            )}
            {customerOptions.slice(0, 30).map(({ combination }, index) => {
              const delta = baseCustomerOption
                ? combination.totalPrice - baseCustomerOption.totalPrice
                : 0
              const perPersonDelta = payingGuestCount > 0 ? delta / payingGuestCount : delta
              return (
                <div key={combination.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">Option {index + 1}</p>
                      <p className="text-xs text-slate-500">
                        {index === 0
                          ? 'Included base hotel combination'
                          : `${perPersonDelta >= 0 ? '+' : '-'}${formatMoney(
                              Math.abs(perPersonDelta),
                              combination.currency,
                            )} pp`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-slate-950">
                        {formatMoney(combination.totalPrice, combination.currency)}
                      </p>
                      {combination.offerDiscountTotal > 0 && (
                        <p className="text-[11px] font-bold text-emerald-700">
                          {formatMoney(combination.offerDiscountTotal, combination.currency)} off
                        </p>
                      )}
                      <p className="text-xs font-bold text-[#8b1e2d]">
                        {formatMoney(combination.perPersonPrice, combination.currency)} avg hotel
                        payer
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    {getOrderedStaySelections(payload, combination).map((stay) => (
                      <p key={`${combination.id}-${stay.groupId}`}>
                        <span className="font-bold text-slate-800">{stay.groupLabel}:</span>{' '}
                        {stay.option.title || 'Hotel option'}
                      </p>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionHeader icon={PackageCheck} title="Recent quotes" />
        {loading ? (
          <p className="text-sm text-slate-500">Loading quotes...</p>
        ) : activeQuotes.length === 0 ? (
          <p className="text-sm text-slate-500">No saved package quotes yet.</p>
        ) : (
          <div className="space-y-2">
            {activeQuotes.slice(0, 12).map((quote) => (
              <button
                key={quote.id}
                type="button"
                onClick={() => onOpenQuote(quote)}
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
                      {quote.package_type} ·{' '}
                      {new Date(quote.created_at).toLocaleDateString('en-GB')}
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
            onClick={() => void onArchiveQuote()}
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
  )
}
