'use client'

import type { Dispatch, SetStateAction } from 'react'
import type { PackagePaymentSummary } from '@/lib/packageWorkflow'
import { formatMoney } from '@/lib/packageQuote'
import type { PackageFamilyOption } from './packageOperationsModel'

type PackagePaymentOverviewProps = {
  groupFamilies: PackageFamilyOption[]
  selectedFamilyQuoteId: string
  setSelectedFamilyQuoteId: Dispatch<SetStateAction<string>>
  paymentTotalDue: number
  paymentCurrency: string
  paymentSummary: PackagePaymentSummary
  reservationDiscountTotal: number
  paymentBalance: number
  unrequestedPaymentBalance: number
}

export function PackagePaymentOverview({
  groupFamilies,
  selectedFamilyQuoteId,
  setSelectedFamilyQuoteId,
  paymentTotalDue,
  paymentCurrency,
  paymentSummary,
  reservationDiscountTotal,
  paymentBalance,
  unrequestedPaymentBalance,
}: PackagePaymentOverviewProps) {
  return (
    <>
      {groupFamilies.length > 0 && (
        <div className="border-y-4 border-cyan-900 bg-cyan-50 p-4 sm:border-x">
          <p className="text-xs font-black uppercase text-cyan-900">Family payment ledger</p>
          <p className="mt-1 text-sm text-slate-600">
            Payments remain inside this shared customer file but belong to one family account.
            Select a family before recording or editing its money movements.
          </p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {groupFamilies.map((family) => (
              <button
                key={family.quoteId}
                type="button"
                onClick={() => setSelectedFamilyQuoteId(family.quoteId)}
                className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-black transition ${
                  selectedFamilyQuoteId === family.quoteId
                    ? 'bg-cyan-900 text-white'
                    : 'border border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-100'
                }`}
              >
                {family.familyLabel}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedFamilyQuoteId('all')}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-black transition ${
                selectedFamilyQuoteId === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              All families
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Full amount</p>
          <p className="mt-1 text-lg font-black">{formatMoney(paymentTotalDue, paymentCurrency)}</p>
        </div>
        <div className="border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Net received</p>
          <p className="mt-1 text-lg font-black">
            {formatMoney(paymentSummary.netPaid, paymentCurrency)}
          </p>
          {paymentSummary.accountCredits > 0 && (
            <p className="mt-1 text-xs font-bold text-sky-700">
              Includes {formatMoney(paymentSummary.accountCredits, paymentSummary.currency)} prior
              credit
            </p>
          )}
        </div>
        <div className="border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Pending to pay</p>
          <p className="mt-1 text-lg font-black">
            {formatMoney(paymentSummary.pending, paymentCurrency)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">Requested but not received</p>
        </div>
        <div className="border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Refunds</p>
          <p className="mt-1 text-lg font-black">
            {formatMoney(paymentSummary.refunds, paymentCurrency)}
          </p>
        </div>
        <div className="border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Reservation discounts</p>
          <p className="mt-1 text-lg font-black text-emerald-700">
            {formatMoney(reservationDiscountTotal, paymentCurrency)}
          </p>
        </div>
        <div className="border border-slate-200 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Outstanding balance</p>
          <p className="mt-1 text-lg font-black text-[#8b1e2d]">
            {formatMoney(paymentBalance, paymentCurrency)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Still to request: {formatMoney(unrequestedPaymentBalance, paymentCurrency)}
          </p>
        </div>
      </div>
    </>
  )
}
