'use client'

import { useEffect, useState } from 'react'
import { BadgePoundSterling, Loader2, Plane, RefreshCw, TicketX } from 'lucide-react'

type PackageTicketingItem = {
  bookingId: string
  pnr: string
  customerName: string
  airline: { id: string; iataCode: string; name: string } | null
  owner: { id: string; fullName: string } | null
  operationalStatus: string
  paymentStatus: string
  departureDate: string | null
  returnDate: string | null
  issuedAt: string | null
  commissionScope: string
  match: {
    packageId: string | null
    reservationId: string | null
    groupId: string | null
    packageType: string | null
    resolutionMethod: string
  }
  passengers: Array<{
    allocationId: string
    ticketNumber: string | null
    fullName: string | null
    passengerType: string | null
  }>
  latestFareVariance: {
    difference_gbp: string | number | null
    effective_on: string | null
  } | null
  refunds: Array<{
    id: string
    passenger_name: string | null
    passenger_type: string
    status: string
    proposed_customer_refund_gbp: string | number
    customer_settled_gbp: string | number
    airline_recovery_final: boolean
    actual_company_result_gbp: string | number | null
  }>
  vouchers: Array<{
    id: string
    passenger_name: string | null
    passenger_type: string
    status: string
    claim_by_date: string
    confirmed_value_gbp: string | number | null
    remaining_value_gbp: string | number | null
  }>
}

type PackageTicketingResponse = {
  items?: PackageTicketingItem[]
  summary?: { ticketCount: number; openRefunds: number; openVouchers: number }
  error?: string
}

function gbp(value: string | number | null) {
  if (value === null) return 'Pending'
  const amount = Number(value)
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : 'Unavailable'
}

export default function PackageTicketingPanel({
  packageId,
  reservationLabels = {},
}: {
  packageId: string
  reservationLabels?: Record<string, string>
}) {
  const [data, setData] = useState<PackageTicketingResponse>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/travel-packages/${encodeURIComponent(packageId)}/ticketing`,
        { cache: 'no-store' },
      )
      const payload = (await response.json().catch(() => ({}))) as PackageTicketingResponse
      if (!response.ok) throw new Error(payload.error || 'Unable to load linked tickets.')
      setData(payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load linked tickets.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const refreshVisiblePackage = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', refreshVisiblePackage)
    document.addEventListener('visibilitychange', refreshVisiblePackage)

    return () => {
      window.removeEventListener('focus', refreshVisiblePackage)
      document.removeEventListener('visibilitychange', refreshVisiblePackage)
    }
    // The package route controls the stable identifier for this panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId])

  const items = data.items || []
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-800">
            <Plane className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-violet-800">
              Exact PNR matches
            </p>
            <h2 className="text-lg font-black text-slate-950">Linked package tickets</h2>
            <p className="mt-1 text-sm text-slate-600">
              Ticketing classifies an exact matching flight PNR against the reservation below.
              Returning to this page refreshes new links automatically.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {data.summary && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <p className="text-slate-500">Tickets</p>
            <p className="text-lg font-black text-slate-900">{data.summary.ticketCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <p className="text-slate-500">Open refunds</p>
            <p className="text-lg font-black text-slate-900">{data.summary.openRefunds}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <p className="text-slate-500">Open vouchers</p>
            <p className="text-lg font-black text-slate-900">{data.summary.openVouchers}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
      )}
      {isLoading && items.length === 0 ? (
        <p className="mt-4 flex items-center text-sm font-semibold text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading linked tickets…
        </p>
      ) : items.length === 0 && !error ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No Ticketing record currently matches this package&apos;s flight PNR.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article
              key={item.bookingId}
              className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-black text-slate-950">{item.pnr}</p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    {item.airline?.iataCode || 'Airline'} · {item.customerName} ·{' '}
                    {item.owner?.fullName || 'Owner unavailable'}
                  </p>
                  <p className="mt-1 text-xs font-black text-violet-800">
                    Matched to:{' '}
                    {item.match.reservationId
                      ? reservationLabels[item.match.reservationId] || 'Flight reservation'
                      : 'Linked package group'}
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black uppercase text-violet-800">
                  Package item
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                <span className="rounded bg-white px-2 py-1 ring-1 ring-slate-200">
                  {item.operationalStatus} · {item.paymentStatus}
                </span>
                {item.passengers.map((passenger) => (
                  <span
                    key={passenger.allocationId}
                    className="rounded bg-white px-2 py-1 ring-1 ring-slate-200"
                  >
                    {passenger.passengerType} · {passenger.fullName || 'Passenger'} ·{' '}
                    {passenger.ticketNumber || 'Ticket pending'}
                  </span>
                ))}
              </div>
              {item.latestFareVariance && (
                <p className="mt-3 flex items-center gap-1 text-xs font-bold text-emerald-800">
                  <BadgePoundSterling className="h-4 w-4" /> Latest supplier-fare variance:{' '}
                  {gbp(item.latestFareVariance.difference_gbp)}
                </p>
              )}
              {item.refunds.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
                  <p className="font-black">Refunds</p>
                  {item.refunds.map((refund) => (
                    <p key={refund.id} className="mt-1">
                      {refund.passenger_name || refund.passenger_type} · {refund.status} · customer
                      due {gbp(refund.proposed_customer_refund_gbp)} · settled{' '}
                      {gbp(refund.customer_settled_gbp)}
                    </p>
                  ))}
                </div>
              )}
              {item.vouchers.length > 0 && (
                <div className="mt-3 rounded-lg bg-violet-50 p-2 text-xs text-violet-900 ring-1 ring-violet-200">
                  <p className="flex items-center gap-1 font-black">
                    <TicketX className="h-4 w-4" /> Ticket Vouchers
                  </p>
                  {item.vouchers.map((voucher) => (
                    <p key={voucher.id} className="mt-1">
                      {voucher.passenger_name || voucher.passenger_type} · {voucher.status} ·
                      remaining {gbp(voucher.remaining_value_gbp)} · claim by{' '}
                      {voucher.claim_by_date}
                    </p>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
