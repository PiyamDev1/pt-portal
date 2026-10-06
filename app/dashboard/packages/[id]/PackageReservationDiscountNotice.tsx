'use client'

import { BadgePercent, Pencil } from 'lucide-react'

type PackageReservationDiscountNoticeProps = {
  onOpenReservations?: () => void
}

export function PackageReservationDiscountNotice({
  onOpenReservations,
}: PackageReservationDiscountNoticeProps) {
  return (
    <section className="flex flex-col gap-3 border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BadgePercent className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" />
        <div>
          <h3 className="text-sm font-black text-emerald-950">Discounts come from Reservations</h3>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            Edit the reservation financials to change the amount due. Payments, profit, and
            Commission all use those values; an optional customer invoice does not change them.
          </p>
        </div>
      </div>
      {onOpenReservations && (
        <button
          type="button"
          onClick={onOpenReservations}
          className="inline-flex shrink-0 items-center justify-center gap-2 bg-emerald-800 px-4 py-2 text-xs font-black text-white"
        >
          <Pencil className="h-4 w-4" />
          Open Reservations
        </button>
      )}
    </section>
  )
}
