'use client'

import type {
  PackagePaymentBreakdown,
  PackagePassengerPriceBreakdown,
  PackageQuotePayload,
  PackageResolvedSelection,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'

export type SalesLinkedFamilyPricing = {
  quoteId: string
  familyLabel: string
  quoteTitle: string
  grossPrice: number
  discountTotal: number
  refundAdjustmentTotal: number
  totalPrice: number
  currency: string
}

export type PackageSalesCombinedGroupPricing =
  | { currencyMismatch: true; families: SalesLinkedFamilyPricing[] }
  | {
      currencyMismatch: false
      currency: string
      grossPrice: number
      discountTotal: number
      refundAdjustmentTotal: number
      totalPrice: number
      families: SalesLinkedFamilyPricing[]
    }

const PAYMENT_BREAKDOWN_FIELDS: Array<{
  key: keyof PackagePaymentBreakdown
  label: string
}> = [
  { key: 'cash', label: 'Cash' },
  { key: 'bankTransfer', label: 'Bank Transfer' },
  { key: 'card', label: 'Credit Card' },
]

export default function PackageSalesPriceSummaryPanel({
  payload,
  resolved,
  priceBreakdown,
  combinedGroupPricing,
  promoCode,
  onPromoCodeChange,
  paymentBreakdown,
  paymentBreakdownBalanced,
  paymentBreakdownRemaining,
  onPaymentBreakdownChange,
}: {
  payload: PackageQuotePayload
  resolved: PackageResolvedSelection | null
  priceBreakdown: PackagePassengerPriceBreakdown | null
  combinedGroupPricing: PackageSalesCombinedGroupPricing | null
  promoCode: string
  onPromoCodeChange: (value: string) => void
  paymentBreakdown: PackagePaymentBreakdown | null
  paymentBreakdownBalanced: boolean
  paymentBreakdownRemaining: number
  onPaymentBreakdownChange: (value: PackagePaymentBreakdown) => void
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-slate-950">Price summary</p>
      {resolved ? (
        <>
          {priceBreakdown && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-black uppercase text-slate-500">Passenger pricing</p>
              <div className="space-y-2 text-sm">
                {(priceBreakdown.passengerLines || []).map((line, index) => (
                  <div
                    key={`${line.category}-${line.quantity}-${line.unitPrice}-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="font-bold text-slate-600">
                      {line.label} x {line.quantity}
                    </span>
                    <span className="text-right font-black text-slate-950">
                      {formatMoney(line.unitPrice, priceBreakdown.currency)} pp
                      <span className="block text-[11px] text-slate-500">
                        {formatMoney(line.total, priceBreakdown.currency)}
                      </span>
                    </span>
                  </div>
                ))}
                <div className="border-t border-slate-200 pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-slate-950">Passenger line total</span>
                    <span className="font-black text-slate-950">
                      {formatMoney(priceBreakdown.total, priceBreakdown.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-600">Package subtotal</span>
              <span className="font-black text-slate-950">
                {formatMoney(resolved.combination.grossPrice, resolved.combination.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-emerald-700">
              <span className="font-bold">Discounts applied</span>
              <span className="font-black">
                {resolved.combination.offerDiscountTotal -
                  Number(resolved.combination.refundAdjustmentTotal || 0) >
                0
                  ? `-${formatMoney(
                      resolved.combination.offerDiscountTotal -
                        Number(resolved.combination.refundAdjustmentTotal || 0),
                      resolved.combination.currency,
                    )}`
                  : 'None'}
              </span>
            </div>
            {Number(resolved.combination.refundAdjustmentTotal || 0) > 0 && (
              <div className="flex items-center justify-between gap-3 text-sky-700">
                <span className="font-bold">Previous refund adjustment</span>
                <span className="font-black">
                  -
                  {formatMoney(
                    Number(resolved.combination.refundAdjustmentTotal || 0),
                    resolved.combination.currency,
                  )}
                </span>
              </div>
            )}
            {resolved.combination.paymentSurchargeTotal > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Credit Card processing fee</span>
                <span className="font-black text-slate-950">
                  {formatMoney(
                    resolved.combination.paymentSurchargeTotal,
                    resolved.combination.currency,
                  )}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Additional charges</span>
                <span className="font-black text-slate-950">None</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-black text-slate-950">Total package price</span>
                <span className="font-black text-slate-950">
                  {formatMoney(resolved.combination.totalPrice, resolved.combination.currency)}
                </span>
              </div>
            </div>
          </div>

          {combinedGroupPricing && (
            <div className="mt-4 rounded-lg border-2 border-[#8b1e2d]/40 bg-red-50 p-3 text-sm">
              <p className="text-xs font-black uppercase text-[#8b1e2d]">
                All linked groups combined
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-700">
                    {payload.linkedPackageGroup?.currentFamilyLabel || 'Current group'}
                  </span>
                  <span className="font-black text-slate-950">
                    {formatMoney(resolved.combination.totalPrice, resolved.combination.currency)}
                  </span>
                </div>
                {combinedGroupPricing.families.map((family) => (
                  <div key={family.quoteId} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 font-bold text-slate-700">
                      <span className="block truncate">{family.familyLabel}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {family.quoteTitle}
                      </span>
                    </span>
                    <span className="shrink-0 font-black text-slate-950">
                      {formatMoney(family.totalPrice, family.currency)}
                    </span>
                  </div>
                ))}
              </div>
              {combinedGroupPricing.currencyMismatch ? (
                <p className="mt-3 border-t border-red-200 pt-3 text-xs font-bold text-amber-800">
                  These linked quotes use different currencies, so one combined amount cannot be
                  calculated safely.
                </p>
              ) : (
                <div className="mt-3 space-y-2 border-t-2 border-[#8b1e2d]/30 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-700">Before discounts</span>
                    <span className="font-black text-slate-950">
                      {formatMoney(combinedGroupPricing.grossPrice, combinedGroupPricing.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-emerald-700">
                    <span className="font-bold">Combined discounts</span>
                    <span className="font-black">
                      {combinedGroupPricing.discountTotal -
                        combinedGroupPricing.refundAdjustmentTotal >
                      0
                        ? `-${formatMoney(
                            combinedGroupPricing.discountTotal -
                              combinedGroupPricing.refundAdjustmentTotal,
                            combinedGroupPricing.currency,
                          )}`
                        : 'None'}
                    </span>
                  </div>
                  {combinedGroupPricing.refundAdjustmentTotal > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sky-700">
                      <span className="font-bold">Previous refund adjustments</span>
                      <span className="font-black">
                        -
                        {formatMoney(
                          combinedGroupPricing.refundAdjustmentTotal,
                          combinedGroupPricing.currency,
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-red-200 pt-2">
                    <span className="font-black text-slate-950">Combined total</span>
                    <span className="text-lg font-black text-[#8b1e2d]">
                      {formatMoney(combinedGroupPricing.totalPrice, combinedGroupPricing.currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">
              Promo code
            </span>
            <input
              value={promoCode}
              onChange={(event) => onPromoCodeChange(event.target.value)}
              placeholder="Ask customer if they have a promo code"
              className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
            />
          </label>
          {resolved.combination.paymentSurchargeTotal > 0 && (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Credit Card processing fees are non-refundable.
            </p>
          )}
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="mb-2 text-xs font-black uppercase text-slate-500">Payment breakdown</p>
            <div className="grid gap-2">
              {PAYMENT_BREAKDOWN_FIELDS.map((field) => {
                const value = paymentBreakdown?.[field.key] || ''
                return (
                  <label htmlFor={`package-payment-${field.key}`} key={field.key} className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">
                      {field.label}
                      {field.key === 'card' && payload.cardProcessingFeePercent > 0
                        ? ` +${payload.cardProcessingFeePercent}%`
                        : ''}
                    </span>
                    <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
                      <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                      <input
                        id={`package-payment-${field.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={value}
                        onChange={(event) => {
                          const nextBreakdown = {
                            ...(paymentBreakdown || { cash: 0, bankTransfer: 0, card: 0 }),
                            [field.key]: Number(event.target.value || 0),
                          }
                          onPaymentBreakdownChange(nextBreakdown)
                        }}
                        className="w-full bg-transparent text-sm font-bold outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </label>
                )
              })}
            </div>
            <div
              className={`mt-3 rounded-lg p-2 text-xs font-bold ${
                paymentBreakdownBalanced
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              {paymentBreakdownBalanced
                ? 'Payment split matches the package subtotal.'
                : `Remaining to allocate: ${formatMoney(paymentBreakdownRemaining, resolved.combination.currency)}`}
            </div>
            {payload.depositRequired && (payload.depositAmount || 0) > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
                Deposit required to secure:{' '}
                {formatMoney(payload.depositAmount || 0, payload.currency)}. This should be paid
                first before availability or reservations are secured.
              </p>
            )}
            {payload.cardProcessingFeePercent > 0 && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Credit Card processing fees are non-refundable.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-red-600">Selection is incomplete.</p>
      )}
    </section>
  )
}
