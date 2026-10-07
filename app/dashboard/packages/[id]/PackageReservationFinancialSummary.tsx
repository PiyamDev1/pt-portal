import { formatMoney } from '@/lib/packageQuote'

type DisplayTotals = {
  booked: number
  supplierRefund: number
  sold: number
  customerRefund: number
  discount: number
  paidAmount: number
  balance: number
  commission: number
  receivedCommission: number
  netSold: number
}

export default function PackageReservationFinancialSummary({
  totals,
  currency,
  showPayment,
  provisionalStaffCost,
  profitBeforeStaffCost,
  estimatedMargin,
}: {
  totals: DisplayTotals
  currency: string
  showPayment: boolean
  provisionalStaffCost: number
  profitBeforeStaffCost: number
  estimatedMargin: number
}) {
  return (
    <section
      aria-label="Reservation financial summary"
      className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Net booked cost</p>
        <p className="mt-1 text-sm font-black text-slate-950">
          {formatMoney(totals.booked, currency)}
        </p>
        {totals.supplierRefund > 0 && (
          <p className="mt-1 text-xs font-bold text-emerald-700">
            Supplier credits: -{formatMoney(totals.supplierRefund, currency)}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Net sold price</p>
        <p className="mt-1 text-sm font-black text-slate-950">
          {formatMoney(totals.sold, currency)}
        </p>
        {totals.customerRefund > 0 && (
          <p className="mt-1 text-xs font-bold text-rose-700">
            Customer refunds: -{formatMoney(totals.customerRefund, currency)}
          </p>
        )}
        {totals.discount > 0 && (
          <p className="mt-1 text-xs font-bold text-slate-500">
            Net after discount: {formatMoney(totals.netSold, currency)}
          </p>
        )}
        {showPayment && (
          <p className="mt-1 text-xs font-bold text-slate-500">
            Paid {formatMoney(totals.paidAmount, currency)} · Balance{' '}
            {formatMoney(totals.balance, currency)}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Discounts</p>
        <p className="mt-1 text-sm font-black text-slate-950">
          {formatMoney(totals.discount, currency)}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Expected supplier commission</p>
        <p className="mt-1 text-sm font-black text-slate-950">
          {formatMoney(totals.commission, currency)}
        </p>
        {totals.receivedCommission > 0 && (
          <p className="mt-1 text-xs font-bold text-emerald-700">
            Received {formatMoney(totals.receivedCommission, currency)}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-bold uppercase text-amber-800">Provisional staff cost</p>
        <p className="mt-1 text-sm font-black text-amber-950">
          -{formatMoney(provisionalStaffCost, currency)}
        </p>
        <p className="mt-1 text-xs font-bold text-amber-800">
          Before deduction: {formatMoney(profitBeforeStaffCost, currency)}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Profit estimate</p>
        <p className="mt-1 text-sm font-black text-[#8b1e2d]">
          {formatMoney(estimatedMargin, currency)}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Sold - discounts - booked + supplier commission - provisional staff cost
        </p>
      </div>
    </section>
  )
}
