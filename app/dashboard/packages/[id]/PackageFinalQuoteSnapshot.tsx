import { FileText, FolderOpen } from 'lucide-react'
import type {
  PackageCombination,
  PackageQuotePayload,
  TravelPackageFolder,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import {
  formatPaymentMethod,
  getVisaPassengerCategoryLabel,
  getVisaQuantity,
} from './packageOverviewModel'
import type { VisaPassengerCounts } from './packageOverviewModel'

type PackageFinalQuoteSnapshotProps = {
  selectedCombination: PackageCombination | null
  selectedPayload: PackageQuotePayload | undefined
  selectedVisaPassengerCounts: VisaPassengerCounts
  passengerSummary: TravelPackageFolder['passenger_summary'] | undefined
  quoteTitle: string
  quoteCustomerName: string
  quoteCustomerPhone: string
  quoteCustomerEmail: string
  quoteDateRange: string
  quoteSelectionNote: string
  groupFamilies?: Array<{ quoteId: string; familyLabel: string; customerName: string }>
  selectedGroupQuoteId?: string
  onSelectGroupQuote?: (quoteId: string) => void
  onOpenSnapshot: (quoteId?: string) => void
}

export default function PackageFinalQuoteSnapshot({
  selectedCombination,
  selectedPayload,
  selectedVisaPassengerCounts,
  passengerSummary,
  quoteTitle,
  quoteCustomerName,
  quoteCustomerPhone,
  quoteCustomerEmail,
  quoteDateRange,
  quoteSelectionNote,
  groupFamilies = [],
  selectedGroupQuoteId,
  onSelectGroupQuote,
  onOpenSnapshot,
}: PackageFinalQuoteSnapshotProps) {
  return (
    <>
      <div className="my-6 h-2 rounded-full bg-[#8b1e2d]" aria-hidden="true" />
      <div
        id="final-quote"
        className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <FolderOpen className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-black text-slate-950">Final quote snapshot</h2>
        </div>
        {groupFamilies.length > 0 && (
          <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
            <p className="text-xs font-black uppercase text-cyan-900">Linked family quotations</p>
            <p className="mt-1 text-sm text-slate-600">
              Select a family to inspect the exact quotation saved for that group member.
            </p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {groupFamilies.map((family) => (
                <button
                  key={family.quoteId}
                  type="button"
                  onClick={() => onSelectGroupQuote?.(family.quoteId)}
                  className={`min-h-11 shrink-0 rounded-lg px-4 text-left text-sm font-black transition ${
                    selectedGroupQuoteId === family.quoteId
                      ? 'bg-cyan-900 text-white'
                      : 'border border-cyan-200 bg-white text-cyan-950 hover:bg-cyan-100'
                  }`}
                >
                  <span className="block">{family.familyLabel}</span>
                  <span
                    className={`mt-0.5 block text-xs font-semibold ${
                      selectedGroupQuoteId === family.quoteId ? 'text-cyan-100' : 'text-slate-500'
                    }`}
                  >
                    {family.customerName || 'Customer details pending'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedCombination ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Selected quote</p>
                <p className="mt-1 text-base font-black text-slate-950">{quoteTitle}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {quoteCustomerName} · {quoteDateRange}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenSnapshot(selectedGroupQuoteId)}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
              >
                <FileText className="h-4 w-4" />
                Open Snapshot
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Customer</p>
                <p className="mt-1 text-sm font-black text-slate-950">{quoteCustomerName}</p>
                <p className="mt-1 text-xs text-slate-500">{quoteCustomerPhone}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{quoteCustomerEmail}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Passengers</p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {passengerSummary?.totalPassengers ?? selectedCombination.servicePassengers} total
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {passengerSummary?.adults ?? selectedPayload?.adults ?? 0} adults ·{' '}
                  {passengerSummary?.childrenPaying ?? selectedPayload?.childrenPaying ?? 0}{' '}
                  children 5+ ·{' '}
                  {passengerSummary?.childrenFree ?? selectedPayload?.childrenFree ?? 0} children
                  2-5 · {passengerSummary?.infants ?? selectedPayload?.infants ?? 0} infants under 2
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Sold total</p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {formatMoney(selectedCombination.totalPrice, selectedCombination.currency)}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatPaymentMethod(selectedCombination.paymentMethod)}
                  {selectedCombination.paymentSurchargeTotal > 0
                    ? ` · ${formatMoney(
                        selectedCombination.paymentSurchargeTotal,
                        selectedCombination.currency,
                      )} processing fee`
                    : ''}
                </p>
                <p className="mt-1 text-xs font-bold text-[#8b1e2d]">
                  {formatMoney(selectedCombination.perPersonPrice, selectedCombination.currency)}{' '}
                  avg hotel payer
                </p>
              </div>
            </div>

            {selectedCombination.offerDiscountTotal > 0 && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                Discount applied:{' '}
                {formatMoney(selectedCombination.offerDiscountTotal, selectedCombination.currency)}
              </p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {selectedCombination.flightOption && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Flight</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {selectedCombination.flightOption.title}
                  </p>
                  {selectedCombination.flightOption.summary && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {selectedCombination.flightOption.summary}
                    </p>
                  )}
                </div>
              )}
              {selectedCombination.visaOptions.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Visa</p>
                  <div className="mt-1 space-y-2">
                    {selectedCombination.visaOptions.map((option) => (
                      <div key={option.id}>
                        <p className="text-sm font-black text-slate-950">
                          {getVisaQuantity(option, selectedVisaPassengerCounts)} x{' '}
                          {getVisaPassengerCategoryLabel(option.visaPassengerCategory)}{' '}
                          {option.title}
                        </p>
                        {option.summary && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                            {option.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedCombination.transportOption && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Transport</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {selectedCombination.transportOption.title}
                  </p>
                  {selectedCombination.transportOption.summary && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {selectedCombination.transportOption.summary}
                    </p>
                  )}
                </div>
              )}
              {selectedCombination.staySelections.map((stay) => (
                <div key={stay.groupId} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">{stay.groupLabel}</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{stay.option.title}</p>
                  {stay.option.summary && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {stay.option.summary}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {quoteSelectionNote && (
              <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                <span className="font-black text-slate-800">Selection note:</span>{' '}
                {quoteSelectionNote}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No selected quote snapshot found.</p>
        )}
      </div>
    </>
  )
}
